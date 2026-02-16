/**
 * BesuNode - Representation of a single Hyperledger Besu node
 * 
 * This class encapsulates all functionality related to a single node in the
 * Besu network. It manages the node's lifecycle, configuration, and interaction
 * with the underlying Docker container.
 */

import Docker from 'dockerode';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import * as path from 'path';
import { 
  NodeConfig, 
  NodeIdentity, 
  NodeStatus,
  NodeStatusChangeEvent,
  ContainerOptions 
} from '../types';
import { 
  InvalidNodeStateError, 
  DockerOperationError, 
  ContainerNotAssociatedError, 
  NodeReadinessTimeoutError 
} from '../errors';
import { DockerManager } from '../services/DockerManager';
import { logger, ChildLogger } from '../utils/logger';

/**
 * Node lifecycle events
 * 💡 Allows users to proactively react to status-change events.
 */
export interface BesuNodeEvents {
  'status-change': (event: NodeStatusChangeEvent) => void;
}

export class BesuNode extends EventEmitter {
  private status: NodeStatus = NodeStatus.CREATED; // Container not yet started
  private container: Docker.Container | null = null;
  private log: ChildLogger;
  private rpcUrl: string | null = null; // for direct RPC queries (e.g. http://localhost:<puerto_host>)
  private wsUrl: string | null = null; // for real-time event listening (e.g. ws://localhost:<puerto_host>)
  private networkName: string;
  private dataPath: string;
  
  /**
   * Key design principles:
   * - No public constructor, only internal (nodes are created through Network class)
   *   - This ensures nodes are always associated with a network 💡
   * - Encapsulates all Docker container operations
   * - Manages node identity and configuration
   * - Provides RPC access when enabled (optional)
   */
  constructor(
    private readonly config: NodeConfig,
    private readonly identity: NodeIdentity,
    private readonly dockerManager: DockerManager,
    networkName: string,
    dataPath: string,
    private readonly genesisPath: string,
    private readonly bootnodes: string[] = []
  ) {
    super();
    this.networkName = networkName;
    this.dataPath = dataPath;
    this.log = logger.child(`Node:${config.name}`);
    
    // Set up RPC URLs if enabled
    if (config.rpc) {
      const rpcPort = config.rpcPort || 8545;
      this.rpcUrl = `http://localhost:${rpcPort}`;
      this.wsUrl = `ws://localhost:${rpcPort}`;
    }
  }
  
  /**
   * Get the current node status
   */
  getStatus(): NodeStatus {
    return this.status;
  }
  
  /**
   * Get node configuration
   */
  getConfig(): Readonly<NodeConfig> {
    return this.config;
  }
  
  /**
   * Get node identity (address and keys)
   */
  getIdentity(): Readonly<NodeIdentity> {
    return this.identity;
  }
  
  /**
   * Get the node's Ethereum address
   */
  getAddress(): string {
    return this.identity.address;
  }
  
  /**
   * Get node name
   */
  getName(): string {
    return this.config.name;
  }
  
  /**
   * Check if node is a validator
   */
  isValidator(): boolean {
    return this.config.validator || false;
  }
  
  /**
   * Get RPC URL if node has RPC enabled
   */
  getRpcUrl(): string | null {
    return this.rpcUrl;
  }
  
  /**
   * Get WebSocket URL if node has RPC enabled
   */
  getWsUrl(): string | null {
    return this.wsUrl;
  }
  
  /**
   * Get an ethers.js provider for this node
   * Only available if RPC is enabled
   * 💡 Internally, it retrieves the node's RPC URL (e.g. http://localhost:<puerto_host>) and uses it to create the provider, a ethers.js object that allows you to call predefined JSON-RPC operations as provider methods that will interact directly with this node.
   */
  getRpcProvider(): ethers.JsonRpcProvider | null {
    if (!this.rpcUrl) {
      return null;
    }
    return new ethers.JsonRpcProvider(this.rpcUrl);
  }
  
  /**
   * Get an ethers.js WebSocket provider for this node
   * Only available if RPC is enabled
   */
  getWsProvider(): ethers.WebSocketProvider | null {
    if (!this.wsUrl) {
      return null;
    }
    return new ethers.WebSocketProvider(this.wsUrl);
  }
  
  /**
   * Get an ethers.js wallet for this node
   * Useful for signing transactions
   */
  getWallet(provider?: ethers.Provider): ethers.Wallet {
    // 💡 Wallets are the objects that know how to sign transactions.
    // This is the sane and reliable way to sign transactions in TS (no need to reinvent cryptography)
    const wallet = new ethers.Wallet(this.identity.privateKey);
    // 💡 Wallet and Provider aren't strictly linked, but a provider is needed to broadcast transactions.
    return provider ? wallet.connect(provider) : wallet;
  }
  
  /**
   * Get the Docker container ID
   * Returns null if container not created
   */
  getContainerId(): string | null {
    return this.container ? (this.container as any).id : null;
  }
  
  /**
   * Start the node
   * Creates and starts the Docker container
   */
  async start(): Promise<void> {
    // Validate state transition
    if (this.status !== NodeStatus.CREATED && this.status !== NodeStatus.STOPPED) {
      throw new InvalidNodeStateError(
        this.config.name,
        'start',
        this.status
      );
    }
    
    this.setStatus(NodeStatus.STARTING);
    
    try {
      // Create container if it doesn't exist
      if (!this.container) {
        this.container = await this.createContainer();
      }
      
      // Start the container
      await this.dockerManager.startContainer(this.container);
      
      // Wait for node to be ready
      await this.waitForNodeReady();
      
      this.setStatus(NodeStatus.RUNNING);
      this.log.success('Node started successfully');
    } catch (error) {
      this.setStatus(NodeStatus.ERROR);
      this.log.error('Failed to start node', error);
      throw error;
    }
  }
  
  /**
   * Stop the node
   * Stops the Docker container but doesn't remove it
   */
  async stop(): Promise<void> {
    if (this.status !== NodeStatus.RUNNING) {
      throw new InvalidNodeStateError(
        this.config.name,
        'stop',
        this.status
      );
    }
    
    if (!this.container) {
      throw new ContainerNotAssociatedError(this.config.name, 'stop');
    }
    
    this.setStatus(NodeStatus.STOPPING);
    
    try {
      await this.dockerManager.stopContainer(this.container);
      this.setStatus(NodeStatus.STOPPED);
      this.log.success('Node stopped successfully');
    } catch (error) {
      this.setStatus(NodeStatus.ERROR);
      this.log.error('Failed to stop node', error);
      throw error;
    }
  }
  
  /**
   * Remove the node container
   * Should only be called during network teardown
   */
  async remove(): Promise<void> {
    if (!this.container) {
      return;
    }
    
    try {
      await this.dockerManager.removeContainer(this.container, true);
      this.container = null;
      this.log.debug('Container removed');
    } catch (error) {
      this.log.error('Failed to remove container', error);
      throw error;
    }
  }
  
  /**
   * Get node logs
   * 
   * @param tail Number of lines to return (default: 100)
   * @returns Recent log output
   */
  async getLogs(tail = 100): Promise<string> {
    if (!this.container) {
      throw new Error('Container not found');
    }
    
    return await this.dockerManager.getContainerLogs(this.container, { tail });
  }
  
  /**
   * Get enode URL for this node
   * Used for peer discovery
   */
  async getEnodeUrl(): Promise<string> {
    if (!this.container || this.status !== NodeStatus.RUNNING) {
      throw new InvalidNodeStateError(
        this.config.name,
        'getEnodeUrl',
        this.status
      );
    }

    try {
      // Execute besu command to get enode URL
      const output = await this.dockerManager.executeSystemCommand(
        this.container,
        ['besu', 'public-key', 'export']
      );

      // Besu public-key export should output a 128-character hex string (64 bytes).
      // We use a regex to extract exactly that, ignoring any log lines.
      const publicKeyMatch = output.match(/[0-9a-fA-F]{128}/);

      if (!publicKeyMatch || publicKeyMatch[0].length !== 128) {
        this.log.error(`Unexpected output format when getting enode URL for node ${this.config.name}. Output: "${output.trim()}"`);
        throw new Error(`Failed to extract a valid 128-character public key from Besu command output.`);
      }

      const publicKey = publicKeyMatch[0]; // Extract only the 128-char hex string

      return `enode://${publicKey}@${this.config.ip}:30303`;
    } catch (error) {
      this.log.error('Failed to get enode URL', error);
      throw error;
    }
  }
  
  /**
   * Create the Docker container for this node
   */
  private async createContainer(): Promise<Docker.Container> {
    const nodePath = path.join(this.dataPath, 'nodes', this.config.name);
    
    // Build container options
    const containerOptions: ContainerOptions = {
      name: `besu-${this.networkName}-${this.config.name}`,
      image: 'hyperledger/besu:latest',
      env: this.buildEnvironment(),
      volumes: this.buildVolumes(nodePath),
      networkMode: this.networkName,
      networks: {
        [this.networkName]: {
          ipv4Address: this.config.ip
        }
      }
    };
    
    // Add port mapping if RPC is enabled
    if (this.config.rpc && this.config.rpcPort) {
      containerOptions.ports = {
        '8545': { hostPort: this.config.rpcPort }
      };
    }
    
    return await this.dockerManager.createContainer(containerOptions);
  }
  
  /**
   * Build environment variables for Besu container
   */
  private buildEnvironment(): string[] {
    // 🍊 BESU_MINER_ENABLED should only be true for validator nodes.
    // Non-validators (RPC nodes, regular peers) don't participate in block production
    // under Clique consensus. Enabling mining on a non-signer causes unnecessary
    // resource usage and confusing log messages from Besu.
    const env: string[] = [
      // Basic Besu configuration
      'BESU_LOGGING=INFO',
      `BESU_DATA_PATH=/data`,
      `BESU_GENESIS_FILE=/data/genesis.json`,
      `BESU_NODE_PRIVATE_KEY_FILE=/data/key`,

      // Network configuration
      `BESU_P2P_HOST=${this.config.ip}`,
      'BESU_P2P_PORT=30303',

      // Sync settings
      'BESU_SYNC_MODE=FULL',

      // Network settings
      'BESU_HOST_ALLOWLIST=*'
    ];

    // 🍊 Only validators should mine. In Clique PoA, mining = signing blocks.
    // A non-validator with MINER_ENABLED=true will attempt to mine but fail
    // because it's not in the signer set, wasting CPU and polluting logs.
    if (this.config.validator) {
      env.push(
        'BESU_MINER_ENABLED=true',
        'BESU_MINER_COINBASE=' + this.identity.address
      );
    }
    
    // Add RPC configuration if enabled
    if (this.config.rpc) {
      env.push(
        'BESU_RPC_HTTP_ENABLED=true',
        'BESU_RPC_HTTP_HOST=0.0.0.0',
        'BESU_RPC_HTTP_PORT=8545',
        'BESU_RPC_HTTP_CORS_ORIGINS=*',
        'BESU_RPC_HTTP_API=ETH,NET,WEB3,CLIQUE,ADMIN,MINER,DEBUG,TXPOOL',
        'BESU_RPC_WS_ENABLED=true',
        'BESU_RPC_WS_HOST=0.0.0.0',
        'BESU_RPC_WS_PORT=8545',
        'BESU_RPC_WS_API=ETH,NET,WEB3,CLIQUE,ADMIN,MINER,DEBUG,TXPOOL'
      );
    }
    
    // Add bootnodes if available
    // Filter out any undefined, null, or empty values to prevent null byte errors
    const validBootnodes = this.bootnodes.filter(bootnode => 
      bootnode && 
      typeof bootnode === 'string' && 
      bootnode.trim() !== '' &&
      bootnode.startsWith('enode://')
    );
    
    if (validBootnodes.length > 0) {
      env.push(`BESU_BOOTNODES=${validBootnodes.join(',')}`);
      this.log.debug(`Using bootnodes: ${validBootnodes.join(', ')}`);
    } else if (this.bootnodes.length > 0) {
      this.log.warn(`All bootnodes were invalid or empty. Original array: ${JSON.stringify(this.bootnodes)}`);
    }
    
    return env;
  }
  
  /**
   * Build volume mounts for the container
   */
  private buildVolumes(nodePath: string): string[] {
    // Convert paths to absolute paths to avoid Docker's "bad parameter" error
    // Docker requires absolute paths for host directory binds
    const absoluteNodePath = path.resolve(nodePath);
    const absoluteGenesisPath = path.resolve(this.genesisPath);
    
    return [
      `${absoluteNodePath}:/data`,
      `${absoluteGenesisPath}:/data/genesis.json:ro`
    ];
  }
  
  /**
   * Wait for the node to be ready
   * Polls the node until it's responsive or timeout
   */
  private async waitForNodeReady(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 1000;
    
    this.log.debug('Waiting for node to be ready...');
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // If RPC is enabled, try to connect
        if (this.config.rpc) {
          const provider = this.getRpcProvider();
          // 💡 Uses the node's RPC URL to create an ethers.js provider for direct JSON-RPC calls.
          if (provider) {
            await provider.getBlockNumber();
            this.log.debug('Node is responsive via RPC');
            return;
          }
        } else {
          // For non-RPC nodes, check container health
          if (this.container) {
            const state = await this.dockerManager.getContainerState(this.container);
            if (state.running && !state.restarting) {
              // Give it a bit more time to fully initialize
              await new Promise(resolve => setTimeout(resolve, 2000));
              return;
            }
          }
        }
      } catch (error) {
        // Node not ready yet, continue waiting
        this.log.debug('Node not ready yet, retrying...');
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new NodeReadinessTimeoutError(this.config.name, timeoutMs);
  }
  
  /**
   * Update node status and emit events
   */
  private setStatus(newStatus: NodeStatus): void {
    const oldStatus = this.status;
    this.status = newStatus;
    
    const event: NodeStatusChangeEvent = {
      nodeName: this.config.name,
      from: oldStatus,
      to: newStatus,
      timestamp: new Date()
    };
    
    this.emit('status-change', event);
    this.log.debug(`Status changed: ${oldStatus} -> ${newStatus}`);
  }
  
  /**
   * Declare event emitter types
   */
  emit<K extends keyof BesuNodeEvents>(
    event: K,
    ...args: Parameters<BesuNodeEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
  
  on<K extends keyof BesuNodeEvents>(
    event: K,
    listener: BesuNodeEvents[K]
  ): this {
    return super.on(event, listener);
  }
  
  once<K extends keyof BesuNodeEvents>(
    event: K,
    listener: BesuNodeEvents[K]
  ): this {
    return super.once(event, listener);
  }
  
  off<K extends keyof BesuNodeEvents>(
    event: K,
    listener: BesuNodeEvents[K]
  ): this {
    return super.off(event, listener);
  }
}