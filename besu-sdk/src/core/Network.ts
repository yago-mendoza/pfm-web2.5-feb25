/**
 * Network - Main orchestrator for Hyperledger Besu networks
 * 
 * This class manages the lifecycle of a complete Besu network, coordinating
 * multiple nodes, Docker resources, and configuration. It provides the primary
 * API for network operations while ensuring state consistency and robust error handling.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import Docker from 'dockerode';
import { ethers } from 'ethers';
import {
  NetworkConfig,
  NodeConfig,
  NetworkStatus,
  NodeOptions,
  NetworkStatusChangeEvent,
  NodeAddedEvent,
  NewBlockEvent,
  NetworkMetadata,
  NodeIdentity
} from '../types';
import {
  InvalidNetworkStateError,
  LastValidatorRemovalError,
  NodeNotFoundError,
  DuplicateNodeNameError,
  IPAddressConflictError,
  ConfigurationValidationError,
  ChainIdConflictError
} from '../errors';
import { BesuNode } from './BesuNode';
import { DockerManager } from '../services/DockerManager';
import { FileManager } from '../services/FileManager';
import { logger } from '../utils/logger';
import { generateNodeIdentity, generateDeterministicIdentity, formatPrivateKeyForBesu } from '../utils/key-generator';
import { validateNodeOptions, validateNodeIp } from '../validators/config';

/**
 * 💡 Network lifecycle events
 * 
 * These represent status notifications for the network.
 * They allow you to react to changes in the network's state,
 * such as when the network is ready, stopped, or when nodes are added/removed.
 */
export interface NetworkEvents {
  'network-ready': () => void;
  'network-stopped': () => void;
  'status-change': (event: NetworkStatusChangeEvent) => void;
  'node-added': (event: NodeAddedEvent) => void;
  'node-removed': (event: { nodeName: string }) => void;
  'new-block': (event: NewBlockEvent) => void;
}

/**
 * Network class manages a complete Besu blockchain network
 * 
 * 💡 A Network instance represents a SINGLE, isolated blockchain.
 * Its dedicated data directory ensures total state separation.
 * Running different blockchains on the same Docker network is an anti-pattern.
 * 
 * Key responsibilities:
 * - Network lifecycle management (setup, teardown)
 * - Node orchestration and dynamic management
 * - State consistency and validation
 * - Event emission for monitoring
 * - Resource cleanup
 */
export class Network extends EventEmitter {
  private status: NetworkStatus = NetworkStatus.UNINITIALIZED;
  private nodes: Map<string, BesuNode> = new Map();
  private validators: Set<string> = new Set();
  private dockerNetwork: Docker.Network | null = null;
  private dataDir: string;
  private readonly log = logger.child('Network');
  
  /**
   * Private constructor - use NetworkBuilder to create instances
   * This ensures proper validation and dependency injection
   */
  constructor(
    private readonly config: NetworkConfig,
    private readonly dockerManager: DockerManager,
    private readonly fileManager: FileManager,
    private readonly baseDataDir: string = './besu-networks'
  ) {
    super();
    this.dataDir = path.join(baseDataDir, this.config.network.name);
  }
  
  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return this.status;
  }
  
  /**
   * Get network configuration
   */
  getConfig(): Readonly<NetworkConfig> {
    return this.config;
  }
  
  /**
   * Get Docker network name
   */
  getDockerNetworkName(): string {
    return this.config.network.name;
  }
  
  /**
   * Get data directory path
   */
  getDataDirectory(): string {
    return this.dataDir;
  }
  
  /**
   * Get all nodes in the network
   */
  getNodes(): Map<string, BesuNode> {
    return new Map(this.nodes);
  }
  
  /**
   * Get a specific node by name
   */
  getNode(name: string): BesuNode {
    const node = this.nodes.get(name);
    if (!node) {
      throw new NodeNotFoundError(name);
    }
    return node;
  }
  
  /**
   * Get all validator nodes
   */
  getValidators(): BesuNode[] {
    return Array.from(this.nodes.values()).filter(node => node.isValidator());
  }
  
  /**
   * Get the first available RPC node
   */
  getRpcNode(): BesuNode | null {
    for (const node of this.nodes.values()) {
      if (node.getRpcUrl()) {
        return node;
      }
    }
    return null;
  }
  
  /**
   * Get an ethers.js provider connected to the network
   * Uses the first available RPC node
   */
  getProvider(): ethers.JsonRpcProvider | null {
    const rpcNode = this.getRpcNode();
    return rpcNode ? rpcNode.getRpcProvider() : null;
  }
  
  /**
   * Initialize and start the network
   * 
   * This method:
   * 1. Validates prerequisites
   * 2. Creates Docker network
   * 3. Generates genesis configuration
   * 4. Creates and starts all nodes
   * 5. Begins block monitoring
   */
  async setup(): Promise<void> {
    this.validateState(NetworkStatus.UNINITIALIZED);
    this.setStatus(NetworkStatus.INITIALIZING);
    
    try {
      this.log.divider('Network Setup');
      this.log.info(`Setting up Besu network: ${this.config.network.name}`);
      
      // 💡 Create data directory structure
      await this.fileManager.createNetworkStructure(
        this.dataDir,
        this.config.nodes.map(n => n.name)
      );
      
      // Validate chainId uniqueness as a secondary check
      await this.validateChainIdUnique();
      
      // Create Docker network
      this.dockerNetwork = await this.dockerManager.createNetwork(
        this.config.network.name,
        this.config.network.subnet
      );
      
      // Generate genesis configuration
      await this.generateGenesis();
      
      // --- INICIO DE LA SOLUCIÓN DE PARALELIZACIÓN ---
      this.log.info('Creating and starting network nodes...');

      // Separamos el nodo ancla (el primer validador) del resto.
      const anchorValidatorConfig = this.config.nodes.find(n => n.validator);
      if (!anchorValidatorConfig) {
        throw new Error("Configuration requires at least one validator to act as a bootnode.");
      }
      const otherNodeConfigs = this.config.nodes.filter(n => n.name !== anchorValidatorConfig.name);

      // 1. Arrancamos el nodo ancla de forma secuencial.
      this.log.info(`Starting anchor node '${anchorValidatorConfig.name}' sequentially...`);
      const anchorNode = await this.createAndStartNode(anchorValidatorConfig);
      
      // Safely get bootnode enode with validation
      let bootnodeEnode: string | null = null;
      try {
        bootnodeEnode = await anchorNode.getEnodeUrl();
        if (!bootnodeEnode || !bootnodeEnode.startsWith('enode://')) {
          this.log.warn(`Anchor node returned invalid enode: ${bootnodeEnode}`);
          bootnodeEnode = null;
        }
      } catch (error) {
        this.log.error(`Failed to get enode from anchor node '${anchorNode.getName()}'`, error);
        bootnodeEnode = null;
      }
      
      this.log.success(`Anchor node '${anchorNode.getName()}' is running. Enode: ${bootnodeEnode || 'N/A'}`);
      
      // 2. Arrancamos todos los demás nodos en paralelo.
      if (otherNodeConfigs.length > 0) {
        this.log.info(`Starting remaining ${otherNodeConfigs.length} nodes in parallel...`);

        // Only pass valid bootnode to other nodes
        const validBootnodes = bootnodeEnode ? [bootnodeEnode] : [];
        
        const startPromises = otherNodeConfigs.map(config => 
          this.createAndStartNode(config, undefined, validBootnodes)
        );

        // Promise.all espera a que todos los nodos terminen de arrancar.
        await Promise.all(startPromises);
      }
      // --- FIN DE LA SOLUCIÓN DE PARALELIZACIÓN ---
      
      // Save network metadata
      await this.saveNetworkMetadata();
      
      // Start monitoring
      await this.startBlockMonitoring();
      
      this.setStatus(NetworkStatus.RUNNING);
      this.emit('network-ready');
      
      this.log.success(`Network setup complete with ${this.nodes.size} nodes`);
      this.logNetworkInfo();
    } catch (error) {
      this.setStatus(NetworkStatus.ERROR);
      this.log.error('Network setup failed', error);
      
      // Attempt cleanup on failure
      // 💡 Attempting automatic cleanup to prevent orphan resources.
      // If setup fails midway, this teardown() call removes any partially created
      // assets (like the Docker network or data directories), ensuring the user
      // can safely retry the operation without manual intervention.
      try {
        await this.teardown();
      } catch (cleanupError) {
        this.log.error('Cleanup after setup failure also failed', cleanupError);
      }
      
      throw error;
    }
  }
  
  /**
   * Add a new node to the running network
   * 
   * 💡 A 2-validator setup is inherently unstable and can lead to consensus stalls.
   * 💡 Recommended: Use 1 validator for simple tests, or 3+ for reliable networks.
   * 
   * @param options Node configuration options
   * @returns The created node instance
   */
  async addNode(options: NodeOptions): Promise<BesuNode> {
    // 💡 This method uses `NodeOptions` because we are performing a DYNAMIC action
    // on a live network. The logic here must account for the current state,
    // like funding the node via a transaction instead of a genesis allocation.
    // Validate network state
    if (this.status !== NetworkStatus.RUNNING) {
      throw new InvalidNetworkStateError(
        'addNode',
        this.status,
        [NetworkStatus.RUNNING]
      );
    }
    
    // Validate node options (from validators/config.ts)
    validateNodeOptions(options);
    
    // Check for duplicate name
    if (this.nodes.has(options.name)) {
      throw new DuplicateNodeNameError(options.name);
    }
    
    // Check IP availability
    for (const node of this.nodes.values()) {
      if (node.getConfig().ip === options.ip) {
        throw new IPAddressConflictError(options.ip, node.getName());
      }
    }
    
    // Validate IP is within subnet (from validators/config.ts)
    validateNodeIp(options.ip, this.config.network.subnet);
    
    this.log.info(`Adding new node to network: ${options.name}`);
    
    try {
      // Generate identity for new node
      const identity = await generateNodeIdentity();
      
      // Create node configuration
      const nodeConfig = {
        ...options,
        validator: options.validator || false,
        rpc: options.rpc || false
      };
      
      // --- ROBUST BOOTNODE DISCOVERY SOLUTION ---
      this.log.info('Attempting to retrieve bootnode URLs from existing validators...');
      
      const validators = this.getValidators().filter(v => v.getStatus() === 'RUNNING');
      if (validators.length === 0) {
        throw new Error("Cannot add a new node: No running validators available to act as bootnodes.");
      }

      // Use Promise.allSettled to attempt getting all enodes in parallel
      const enodePromises = validators.map(v => v.getEnodeUrl());
      const enodeResults = await Promise.allSettled(enodePromises);

      const bootnodes: string[] = [];
      enodeResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          this.log.debug(`Successfully retrieved enode from validator '${validators[index].getName()}'`);
          bootnodes.push(result.value);
        } else {
          this.log.warn(`Failed to retrieve enode from validator '${validators[index].getName()}'. Reason: ${result.reason}`);
        }
      });

      // CRITICAL VALIDATION!
      if (bootnodes.length === 0) {
        throw new Error(
          "Failed to add node: Could not retrieve an enode URL from any of the running validators. " +
          "The network may be unstable or nodes may be unresponsive. Please check validator logs."
        );
      }
      
      this.log.success(`Successfully retrieved ${bootnodes.length} bootnode URL(s).`);
      // --- END OF SOLUTION ---

      // Create and start the node with explicit bootnodes
      const node = await this.createAndStartNode(nodeConfig, identity, bootnodes);
      
      // --- RUNTIME FUNDING LOGIC ---
      if (options.initialBalance) {
        this.log.info(`Funding new node '${options.name}' with ${options.initialBalance} ETH...`);
        
        // 💡 We use an existing account (a validator) to send the funds.
        const provider = this.getProvider();
        const funderNode = this.getValidators()[0]; // The first validator acts as the "bank".
        
        if (provider && funderNode) {
          try {
            const funderWallet = funderNode.getWallet(provider);
            const amountToSend = ethers.parseEther(options.initialBalance);

            const tx = await funderWallet.sendTransaction({
              to: node.getAddress(),
              value: amountToSend,
            });

            await tx.wait(); // Wait for the transaction to be mined.
            this.log.success(`Successfully funded node '${options.name}' with ${options.initialBalance} ETH. Tx: ${tx.hash}`);
          } catch (fundingError) {
            // 💡 If funding fails, we do not stop the node addition.
            // We simply warn the user.
            this.log.error(`Failed to fund new node '${options.name}'. The node was added but has no funds.`, fundingError);
          }
        } else {
          this.log.warn(`Cannot fund new node '${options.name}'. No provider or funder node available.`);
        }
      }
      
      // Update metadata
      await this.saveNetworkMetadata();
      
      // Emit event
      this.emit('node-added', {
        node: {
          name: node.getName(),
          address: node.getAddress(),
          isValidator: node.isValidator()
        },
        timestamp: new Date()
      });
      
      this.log.success(`Successfully added node: ${options.name}`);
      return node;
    } catch (error) {
      this.log.error(`Failed to add node: ${options.name}`, error);
      throw error;
    }
  }
  
  /**
   * Remove a node from the network
   * 
   * @param nodeName Name of the node to remove
   */
  async removeNode(nodeName: string): Promise<void> {
    if (this.status !== NetworkStatus.RUNNING) {
      throw new InvalidNetworkStateError(
        'removeNode',
        this.status,
        [NetworkStatus.RUNNING]
      );
    }
    
    const node = this.getNode(nodeName);
    
    // Prevent removing last validator
    if (node.isValidator() && this.getValidators().length === 1) {
      throw new LastValidatorRemovalError(nodeName);
    }
    
    this.log.info(`Removing node from network: ${nodeName}`);
    
    try {
      // Stop and remove the node
      if (node.getStatus() === 'RUNNING') {
        await node.stop();
      }
      await node.remove();
      
      // Remove from tracking
      this.nodes.delete(nodeName);
      this.validators.delete(nodeName);
      
      // Update metadata
      await this.saveNetworkMetadata();
      
      // Emit event
      this.emit('node-removed', { nodeName });
      
      this.log.success(`Successfully removed node: ${nodeName}`);
    } catch (error) {
      this.log.error(`Failed to remove node: ${nodeName}`, error);
      throw error;
    }
  }
  
  /**
   * Stop and clean up the entire network
   * 
   * This method:
   * 1. Stops block monitoring
   * 2. Stops all nodes
   * 3. Removes all containers
   * 4. Removes Docker network
   * 5. Cleans up data files (optional)
   */
  async teardown(removeData = false): Promise<void> {
    this.validateState(NetworkStatus.RUNNING, NetworkStatus.ERROR);
    this.setStatus(NetworkStatus.STOPPING);
    
    this.log.divider('Network Teardown');
    this.log.info(`Tearing down network: ${this.config.network.name}`);
    
    try {
      // Stop monitoring first
      this.stopBlockMonitoring();
      
      // Stop all nodes in parallel
      const stopPromises = Array.from(this.nodes.values())
        .filter(node => node.getStatus() === 'RUNNING')
        .map(node => node.stop().catch(err => {
          this.log.error(`Failed to stop node ${node.getName()}`, err);
        }));
      
      await Promise.all(stopPromises);
      
      // Remove all containers in parallel
      const removePromises = Array.from(this.nodes.values())
        .map(node => node.remove().catch(err => {
          this.log.error(`Failed to remove node ${node.getName()}`, err);
        }));
      
      await Promise.all(removePromises);
      
      // Remove Docker network
      if (this.dockerNetwork) {
        await this.dockerManager.removeNetwork(this.dockerNetwork);
        this.dockerNetwork = null;
      }
      
      // Clean up data directory if requested
      if (removeData) {
        await this.fileManager.removeDirectory(this.dataDir);
        this.log.info('Removed network data directory');
      }
      
      // Clear internal state
      this.nodes.clear();
      this.validators.clear();
      
      this.setStatus(NetworkStatus.STOPPED);
      this.emit('network-stopped');
      
      this.log.success('Network teardown complete');
    } catch (error) {
      this.setStatus(NetworkStatus.ERROR);
      this.log.error('Network teardown failed', error);
      throw error;
    }
  }
  
  /**
   * Generate genesis.json for Clique consensus
   */
  private async generateGenesis(): Promise<void> {
    this.log.info('Generating genesis configuration...');
    
    // Collect validator addresses
    const validatorAddresses: string[] = [];
    const alloc: { [address: string]: { balance: string } } = {};
    
    // Pre-generate identities for all nodes
    const nodeIdentities = new Map<string, NodeIdentity>();
    
    for (const nodeConfig of this.config.nodes) {
      let identity: NodeIdentity;
      
      // Use deterministic or random identity generation based on configuration
      if (nodeConfig.identitySeed) {
        // Generate deterministic identity from seed
        this.log.info(`Generating deterministic identity for node '${nodeConfig.name}' using provided seed`);
        identity = await generateDeterministicIdentity(nodeConfig.identitySeed);
      } else {
        // Generate random identity (standard behavior)
        identity = await generateNodeIdentity();
      }
      
      nodeIdentities.set(nodeConfig.name, identity);
      
      // Add to validators if applicable
      if (nodeConfig.validator) {
        validatorAddresses.push(identity.address.substring(2)); // Remove 0x prefix
      }
      
      // --- LÓGICA DE BALANCE MEJORADA ---
      const defaultBalanceHex = '0x200000000000000000000000000000000000000000000000000000000000000';
      let balanceHex: string;

      if (nodeConfig.initialBalance) {
        try {
          // 💡 Convertimos el string amigable ("1.5") a Wei y luego a hexadecimal.
          const balanceInWei = ethers.parseEther(nodeConfig.initialBalance);
          balanceHex = '0x' + balanceInWei.toString(16);
          this.log.info(`Node '${nodeConfig.name}' will be pre-funded with ${nodeConfig.initialBalance} ETH.`);
        } catch (e) {
          this.log.warn(`Invalid initialBalance format for node '${nodeConfig.name}': "${nodeConfig.initialBalance}". Using default.`);
          balanceHex = defaultBalanceHex;
        }
      } else {
        // 💡 Si no se especifica, se mantiene el comportamiento anterior.
        balanceHex = defaultBalanceHex;
      }
      
      alloc[identity.address.substring(2)] = {
        balance: balanceHex
      };
    }
    
    // Store identities for later use
    for (const [name, identity] of nodeIdentities) {
      const nodePath = path.join(this.dataDir, 'nodes', name);
      await this.fileManager.writeNodeKeys(
        nodePath,
        identity.privateKey,
        identity.publicKey,
        identity.address
      );
    }
    
    // Build extradata for Clique
    // Format: 0x + 64 zeros + validator addresses + 130 zeros
    const extradata = '0x' + '0'.repeat(64) + validatorAddresses.join('') + '0'.repeat(130);
    
    const genesis = {
      config: {
        chainId: this.config.chainId,
        homesteadBlock: 0,
        eip150Block: 0,
        eip155Block: 0,
        eip158Block: 0,
        byzantiumBlock: 0,
        constantinopleBlock: 0,
        petersburgBlock: 0,
        istanbulBlock: 0,
        berlinBlock: 0,
        londonBlock: 0,
        clique: {
          period: this.config.blockPeriodSeconds,
          epoch: 30000
        }
      },
      nonce: '0x0',
      timestamp: '0x0',
      extraData: extradata,
      gasLimit: '0x47b760',
      difficulty: '0x1',
      mixHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      coinbase: '0x0000000000000000000000000000000000000000',
      alloc: alloc,
      number: '0x0',
      gasUsed: '0x0',
      parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
    };
    
    const genesisPath = path.join(this.dataDir, 'genesis.json');
    await this.fileManager.writeJSON(genesisPath, genesis);
    
    this.log.success(`Generated genesis with ${validatorAddresses.length} validators`);
  }
  
  /**
   * Create and start a node
   */
  private async createAndStartNode(
    nodeConfig: NodeConfig,
    identity?: NodeIdentity,
    // Añadimos un parámetro opcional para los bootnodes
    explicitBootnodes?: string[]
  ): Promise<BesuNode> {
    const nodePath = path.join(this.dataDir, 'nodes', nodeConfig.name);
    
    // Use provided identity or read from disk
    if (!identity) {
      identity = {
        address: '0x' + await this.fileManager.readFile(path.join(nodePath, 'address')),
        publicKey: '0x' + await this.fileManager.readFile(path.join(nodePath, 'key.pub')),
        privateKey: '0x' + await this.fileManager.readFile(path.join(nodePath, 'key'))
      };
    } else {
      // Write keys for new node
      await this.fileManager.writeNodeKeys(
        nodePath,
        identity.privateKey,
        identity.publicKey,
        identity.address
      );
    }
    
    // --- LÓGICA DE BOOTNODES MEJORADA ---
    let bootnodes: string[] = [];
    if (explicitBootnodes) {
      // Si nos pasan bootnodes explícitamente, los validamos y filtramos
      bootnodes = explicitBootnodes.filter(bootnode => 
        bootnode && 
        typeof bootnode === 'string' && 
        bootnode.trim() !== '' &&
        bootnode.startsWith('enode://')
      );
      if (explicitBootnodes.length > bootnodes.length) {
        this.log.warn(`Filtered out ${explicitBootnodes.length - bootnodes.length} invalid bootnodes from explicit list`);
      }
    } else {
      // Si no, los calculamos como antes (para el primer nodo).
      for (const [name, node] of this.nodes) {
        if (node.isValidator() && node.getStatus() === 'RUNNING') {
          try {
            const enode = await node.getEnodeUrl();
            // Validate enode before adding
            if (enode && typeof enode === 'string' && enode.startsWith('enode://')) {
              bootnodes.push(enode);
            } else {
              this.log.warn(`Invalid enode URL from node ${name}: ${enode}`);
            }
          } catch (err) {
            this.log.warn(`Could not get enode URL for ${name}`, err);
          }
        }
      }
    }
    // --- FIN DE LA MEJORA ---
    
    // Create node instance
    const node = new BesuNode(
      nodeConfig,
      identity,
      this.dockerManager,
      this.config.network.name,
      this.dataDir,
      path.join(this.dataDir, 'genesis.json'),
      bootnodes
    );
    
    // Register node
    this.nodes.set(nodeConfig.name, node);
    if (nodeConfig.validator) {
      this.validators.add(nodeConfig.name);
    }
    
    // Start the node
    await node.start();
    
    return node;
  }
  
  /**
   * Start monitoring blockchain events
   * 
   * Used internally to detect when the state can be switched to "started"
   */
  private async startBlockMonitoring(): Promise<void> {
    const provider = this.getProvider();
    if (!provider) {
      this.log.warn('No RPC node available for block monitoring');
      return;
    }
    
    this.log.info('Starting block monitoring...');
    
    // Monitor new blocks
    provider.on('block', async (blockNumber: number) => {
      try {
        const block = await provider.getBlock(blockNumber);
        if (block) {
          this.emit('new-block', {
            number: block.number,
            miner: block.miner,
            timestamp: block.timestamp,
            gasUsed: block.gasUsed.toString(),
            transactionCount: block.transactions.length
          });
        }
      } catch (error) {
        this.log.error('Error fetching block details', error);
      }
    });
  }
  
  /**
   * Stop block monitoring
   */
  private stopBlockMonitoring(): void {
    // Remove provider listeners
    const provider = this.getProvider();
    if (provider) {
      provider.removeAllListeners();
    }
  }
  
  /**
   * Save network metadata for recovery/inspection
   */
  private async saveNetworkMetadata(): Promise<void> {
    const metadata: NetworkMetadata = {
      name: this.config.network.name,
      chainId: this.config.chainId,
      createdAt: new Date().toISOString(),
      dockerNetworkId: this.dockerNetwork ? (await this.dockerNetwork.inspect()).Id : '',
      dataDirectory: this.dataDir,
      nodes: {}
    };
    
    for (const [name, node] of this.nodes) {
      metadata.nodes[name] = {
        containerId: node.getContainerId() || '',
        address: node.getAddress(),
        ip: node.getConfig().ip,
        isValidator: node.isValidator()
      };
    }
    
    await this.fileManager.writeJSON(
      path.join(this.dataDir, 'network.json'),
      metadata
    );
  }
  
  /**
   * Log network information summary
   */
  private logNetworkInfo(): void {
    this.log.divider('Network Information');
    this.log.info(`Network Name: ${this.config.network.name}`);
    this.log.info(`Chain ID: ${this.config.chainId}`);
    this.log.info(`Block Period: ${this.config.blockPeriodSeconds}s`);
    this.log.info(`Subnet: ${this.config.network.subnet}`);
    this.log.info(`Total Nodes: ${this.nodes.size}`);
    this.log.info(`Validators: ${this.validators.size}`);
    
    // Log RPC endpoints
    const rpcNodes = Array.from(this.nodes.values()).filter(n => n.getRpcUrl());
    if (rpcNodes.length > 0) {
      this.log.info('RPC Endpoints:');
      for (const node of rpcNodes) {
        this.log.info(`  - ${node.getName()}: ${node.getRpcUrl()}`);
      }
    }
    
    this.log.divider();
  }
  
  /**
   * Validate state transitions
   */
  private validateState(...allowedStates: NetworkStatus[]): void {
    if (allowedStates.length === 0) {
      // If no states specified, any state is allowed
      return;
    }
    
    if (!allowedStates.includes(this.status)) {
      throw new InvalidNetworkStateError(
        'operation',
        this.status,
        allowedStates
      );
    }
  }
  
  /**
   * Update network status and emit events
   */
  private setStatus(newStatus: NetworkStatus): void {
    const oldStatus = this.status;
    this.status = newStatus;
    
    const event: NetworkStatusChangeEvent = {
      from: oldStatus,
      to: newStatus,
      timestamp: new Date()
    };
    
    this.emit('status-change', event);
    this.log.debug(`Network status changed: ${oldStatus} -> ${newStatus}`);
  }
  
  /**
   * 💡 Quick validation that chainId is unique across existing networks
   * This is a secondary check in case someone bypasses NetworkBuilder
   */
  private async validateChainIdUnique(): Promise<void> {
    try {
      const baseDir = path.dirname(this.dataDir);
      const baseExists = await this.fileManager.exists(baseDir);
      
      if (!baseExists) {
        return; // No existing networks
      }
      
      const networkDirs = await this.fileManager.listDirectories(baseDir);
      
      for (const networkDir of networkDirs) {
        // Skip our own directory
        if (networkDir === this.config.network.name) {
          continue;
        }
        
        const metadataPath = path.join(baseDir, networkDir, 'network.json');
        const metadataExists = await this.fileManager.exists(metadataPath);
        
        if (metadataExists) {
          try {
            const metadata = await this.fileManager.readJSON(metadataPath) as any;
            
            if (metadata.chainId === this.config.chainId) {
              throw new ChainIdConflictError(this.config.chainId, metadata.name);
            }
          } catch (error) {
            // If it's our validation error, re-throw it
            if (error instanceof ConfigurationValidationError || error instanceof ChainIdConflictError) {
              throw error;
            }
            // Otherwise ignore corrupted metadata
          }
        }
      }
    } catch (error) {
      // If it's our validation error, re-throw it
      if (error instanceof ConfigurationValidationError || error instanceof ChainIdConflictError) {
        throw error;
      }
      // Otherwise log warning but don't fail setup
      this.log.warn('Could not validate chainId uniqueness in Network.setup()', error);
    }
  }
  
  /**
   * Declare event emitter types
   */
  emit<K extends keyof NetworkEvents>(
    event: K,
    ...args: Parameters<NetworkEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
  
  on<K extends keyof NetworkEvents>(
    event: K,
    listener: NetworkEvents[K]
  ): this {
    return super.on(event, listener);
  }
  
  once<K extends keyof NetworkEvents>(
    event: K,
    listener: NetworkEvents[K]
  ): this {
    return super.once(event, listener);
  }
  
  off<K extends keyof NetworkEvents>(
    event: K,
    listener: NetworkEvents[K]
  ): this {
    return super.off(event, listener);
  }
}