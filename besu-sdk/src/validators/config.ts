/**
 * Configuration validation functions for the Besu SDK
 * 
 * This module provides comprehensive validation for all configuration objects
 * used in the SDK. Using pure TypeScript functions instead of external validation
 * libraries keeps the SDK lightweight while maintaining type safety.
 */

import { NetworkConfig, NodeConfig, NodeOptions } from '../types';
import { ConfigurationValidationError } from '../errors';

/**
 * Validate a complete network configuration
 * 
 * Ensures all required fields are present and contain valid values
 * for creating a functional Besu network.
 * 
 * @param config Network configuration to validate
 * @throws ConfigurationValidationError if validation fails
 */
export function validateNetworkConfig(config: NetworkConfig): void {
  // Validate chain ID
  if (!Number.isInteger(config.chainId) || config.chainId <= 0) {
    throw new ConfigurationValidationError(
      'chainId',
      'Must be a positive integer',
      config.chainId
    );
  }
  
  // Warn about well-known chain IDs to prevent conflicts
  const wellKnownChainIds = [1, 3, 4, 5, 42, 56, 137, 43114];
  if (wellKnownChainIds.includes(config.chainId)) {
    console.warn(
      `Warning: Chain ID ${config.chainId} is used by a public network. ` +
      `Consider using a different ID to avoid conflicts.`
    );
  }
  
  // Validate block period
  if (!Number.isInteger(config.blockPeriodSeconds) || config.blockPeriodSeconds < 1) {
    throw new ConfigurationValidationError(
      'blockPeriodSeconds',
      'Must be a positive integer (minimum 1 second)',
      config.blockPeriodSeconds
    );
  }
  
  if (config.blockPeriodSeconds > 60) {
    console.warn(
      `Warning: Block period of ${config.blockPeriodSeconds}s is quite long. ` +
      `Typical values are 5-15 seconds.`
    );
  }
  
  // Validate network configuration
  validateNetworkSettings(config.network);
  
  // Validate nodes array
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new ConfigurationValidationError(
      'nodes',
      'Must be a non-empty array of node configurations',
      config.nodes
    );
  }
  
  // Validate each node and check for duplicates
  const nodeNames = new Set<string>();
  const nodeIps = new Set<string>();
  const usedPorts = new Set<number>();
  let validatorCount = 0;
  
  config.nodes.forEach((node, index) => {
    try {
      validateNodeConfig(node, config.network.subnet);
      
      // Check for duplicate names
      if (nodeNames.has(node.name)) {
        throw new ConfigurationValidationError(
          `nodes[${index}].name`,
          'Node names must be unique',
          node.name
        );
      }
      nodeNames.add(node.name);
      
      // Check for duplicate IPs
      if (nodeIps.has(node.ip)) {
        throw new ConfigurationValidationError(
          `nodes[${index}].ip`,
          'IP addresses must be unique',
          node.ip
        );
      }
      nodeIps.add(node.ip);
      
      // Track validators
      if (node.validator) {
        validatorCount++;
      }
      
      // Check for port conflicts
      if (node.rpc && node.rpcPort) {
        if (usedPorts.has(node.rpcPort)) {
          throw new ConfigurationValidationError(
            `nodes[${index}].rpcPort`,
            'RPC ports must be unique',
            node.rpcPort
          );
        }
        usedPorts.add(node.rpcPort);
      }
    } catch (error) {
      if (error instanceof ConfigurationValidationError) {
        // Re-throw with better context
        throw new ConfigurationValidationError(
          `nodes[${index}]`,
          error.message,
          node
        );
      }
      throw error;
    }
  });
  
  // Ensure at least one validator exists
  if (validatorCount === 0) {
    throw new ConfigurationValidationError(
      'nodes',
      'At least one node must be configured as a validator for Clique consensus',
      config.nodes
    );
  }
}

/**
 * Validate network settings (Docker network configuration)
 * 
 * @param network Network settings to validate
 * @throws ConfigurationValidationError if validation fails
 */
function validateNetworkSettings(network: { name: string; subnet: string }): void {
  // Validate network name
  if (!network.name || typeof network.name !== 'string') {
    throw new ConfigurationValidationError(
      'network.name',
      'Must be a non-empty string',
      network.name
    );
  }
  
  // Docker network name constraints
  const networkNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!networkNameRegex.test(network.name)) {
    throw new ConfigurationValidationError(
      'network.name',
      'Must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen',
      network.name
    );
  }
  
  if (network.name.length > 64) {
    throw new ConfigurationValidationError(
      'network.name',
      'Must not exceed 64 characters',
      network.name
    );
  }
  
  // Validate subnet
  validateSubnet(network.subnet);
}

/**
 * Validate a CIDR subnet notation
 * 
 * @param subnet Subnet string to validate (e.g., "172.20.0.0/16")
 * @throws ConfigurationValidationError if invalid
 */
function validateSubnet(subnet: string): void {
  const subnetRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  
  if (!subnetRegex.test(subnet)) {
    throw new ConfigurationValidationError(
      'network.subnet',
      'Must be in CIDR notation (e.g., "172.20.0.0/16")',
      subnet
    );
  }
  
  const [network, prefixStr] = subnet.split('/');
  const prefix = parseInt(prefixStr, 10);
  
  // Validate prefix length
  if (prefix < 8 || prefix > 30) {
    throw new ConfigurationValidationError(
      'network.subnet',
      'Prefix length must be between 8 and 30',
      subnet
    );
  }
  
  // Validate IP octets
  const octets = network.split('.').map(o => parseInt(o, 10));
  for (let i = 0; i < octets.length; i++) {
    if (octets[i] < 0 || octets[i] > 255) {
      throw new ConfigurationValidationError(
        'network.subnet',
        'Invalid IP address in subnet',
        subnet
      );
    }
  }
  
  // Ensure it's a private network range
  const isPrivate = 
    (octets[0] === 10) || // 10.0.0.0/8
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || // 172.16.0.0/12
    (octets[0] === 192 && octets[1] === 168); // 192.168.0.0/16
    
  if (!isPrivate) {
    throw new ConfigurationValidationError(
      'network.subnet',
      'Must be a private network range (10.x, 172.16-31.x, or 192.168.x)',
      subnet
    );
  }
}

/**
 * Validate a node configuration
 * 
 * @param node Node configuration to validate
 * @param subnet Network subnet for IP validation
 * @throws ConfigurationValidationError if validation fails
 */
export function validateNodeConfig(node: NodeConfig, subnet: string): void {
  // Validate name
  if (!node.name || typeof node.name !== 'string') {
    throw new ConfigurationValidationError(
      'name',
      'Must be a non-empty string',
      node.name
    );
  }
  
  // Node name constraints (Docker container name compatible)
  const nodeNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!nodeNameRegex.test(node.name)) {
    throw new ConfigurationValidationError(
      'name',
      'Must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen',
      node.name
    );
  }
  
  // Validate IP address
  validateNodeIp(node.ip, subnet);
  
  // 🍊 rpcPort validation: check logical consistency BEFORE numeric validity.
  // If someone specifies a port but forgets rpc: true, telling them "enable RPC first"
  // is more helpful than "port must be between 1 and 65535".
  if (node.rpcPort !== undefined && node.rpcPort !== null) {
    if (!node.rpc) {
      throw new ConfigurationValidationError(
        'rpcPort',
        'Cannot specify RPC port without enabling RPC (set rpc: true)',
        node.rpcPort
      );
    }
    const portAsNumber = typeof node.rpcPort === 'string' ? parseInt(node.rpcPort, 10) : node.rpcPort;
    validateRpcPort(portAsNumber);
  }
}

/**
 * Validate node options for dynamic node addition
 * 
 * @param options Node options to validate
 * @throws ConfigurationValidationError if validation fails
 */
export function validateNodeOptions(options: NodeOptions): void {
  // Most validation is the same as NodeConfig
  // Note: subnet validation happens at the Network level
  
  if (!options.name || typeof options.name !== 'string') {
    throw new ConfigurationValidationError(
      'name',
      'Must be a non-empty string',
      options.name
    );
  }
  
  const nodeNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!nodeNameRegex.test(options.name)) {
    throw new ConfigurationValidationError(
      'name',
      'Must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen',
      options.name
    );
  }
  
  // 🍊 IP format validation without subnet check.
  // When adding nodes dynamically via addNode(), the subnet context isn't available here —
  // the Network class validates subnet membership separately in addNode().
  // We only validate that the IP is a well-formed IPv4 with valid octets.
  validateIpFormat(options.ip);

  // 🍊 Same rpcPort fix as validateNodeConfig: check logical consistency first.
  if (options.rpcPort !== undefined && options.rpcPort !== null) {
    if (!options.rpc) {
      throw new ConfigurationValidationError(
        'rpcPort',
        'Cannot specify RPC port without enabling RPC (set rpc: true)',
        options.rpcPort
      );
    }
    const portAsNumber = typeof options.rpcPort === 'string' ? parseInt(options.rpcPort, 10) : options.rpcPort;
    validateRpcPort(portAsNumber);
  }
  
  // Validate initialBalance if provided
  if (options.initialBalance !== undefined) {
    if (typeof options.initialBalance !== 'string' || !/^\d+(\.\d+)?$/.test(options.initialBalance)) {
      throw new ConfigurationValidationError(
        'initialBalance',
        'Must be a string representing a positive number (e.g., "100" or "1.5")',
        options.initialBalance
      );
    }
    const balance = parseFloat(options.initialBalance);
    if (isNaN(balance) || balance < 0) {
      throw new ConfigurationValidationError(
        'initialBalance',
        'Must be a positive number',
        options.initialBalance
      );
    }
  }
}

/**
 * Validate that a node IP is within the specified subnet
 * 
 * @param ip IP address to validate
 * @param subnet Subnet in CIDR notation
 * @throws ConfigurationValidationError if IP is invalid or outside subnet
 */
export function validateNodeIp(ip: string, subnet: string): void {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!ipRegex.test(ip)) {
    throw new ConfigurationValidationError(
      'ip',
      'Must be a valid IPv4 address',
      ip
    );
  }
  
  // Parse IP and subnet
  const ipOctets = ip.split('.').map(o => parseInt(o, 10));
  const [subnetBase, prefixStr] = subnet.split('/');
  const subnetOctets = subnetBase.split('.').map(o => parseInt(o, 10));
  const prefixLength = parseInt(prefixStr, 10);
  
  // Validate IP octets
  for (let i = 0; i < ipOctets.length; i++) {
    if (ipOctets[i] < 0 || ipOctets[i] > 255) {
      throw new ConfigurationValidationError(
        'ip',
        'Invalid octet value',
        ip
      );
    }
  }
  
  // Check if IP is within subnet using bit masking
  const mask = (0xFFFFFFFF << (32 - prefixLength)) >>> 0;
  const ipNum = ipToNumber(ipOctets);
  const subnetNum = ipToNumber(subnetOctets);
  
  if ((ipNum & mask) !== (subnetNum & mask)) {
    throw new ConfigurationValidationError(
      'ip',
      `Must be within subnet ${subnet}`,
      ip
    );
  }
  
  // Ensure IP is not the network address or broadcast address
  const hostBits = 32 - prefixLength;
  const hostMask = (1 << hostBits) - 1;
  const hostPart = ipNum & hostMask;
  
  if (hostPart === 0) {
    throw new ConfigurationValidationError(
      'ip',
      'Cannot use network address',
      ip
    );
  }
  
  if (hostPart === hostMask) {
    throw new ConfigurationValidationError(
      'ip',
      'Cannot use broadcast address',
      ip
    );
  }
}

/**
 * 🍊 Validate IP format and octet ranges without subnet membership check.
 * Used by validateNodeOptions where subnet context isn't available.
 * Subnet membership is validated separately by Network.addNode().
 *
 * @param ip IP address to validate
 * @throws ConfigurationValidationError if format is invalid or octets out of range
 */
function validateIpFormat(ip: string): void {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

  if (!ipRegex.test(ip)) {
    throw new ConfigurationValidationError(
      'ip',
      'Must be a valid IPv4 address',
      ip
    );
  }

  const octets = ip.split('.').map(o => parseInt(o, 10));
  for (let i = 0; i < octets.length; i++) {
    if (octets[i] < 0 || octets[i] > 255) {
      throw new ConfigurationValidationError(
        'ip',
        'Invalid octet value',
        ip
      );
    }
  }
}

/**
 * Convert IP octets to 32-bit number for subnet calculations
 */
function ipToNumber(octets: number[]): number {
  return (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3];
}

/**
 * Validate RPC port number
 * 
 * @param port Port number to validate
 * @throws ConfigurationValidationError if invalid
 */
function validateRpcPort(port: number): void {
  // Aquí la validación de tipo 'number' es crucial antes del rango
  if (typeof port !== 'number' || !Number.isInteger(port)) {
    throw new ConfigurationValidationError(
      'rpcPort',
      'Must be an integer',
      port
    );
  }
  if (port < 1 || port > 65535) { // 0 es inválido según esta regla
    throw new ConfigurationValidationError(
      'rpcPort',
      'Must be an integer between 1 and 65535',
      port
    );
  }
  
  // Warn about privileged ports
  if (port < 1024) {
    console.warn(
      `Warning: Port ${port} is a privileged port and may require elevated permissions.`
    );
  }
  
  // Warn about commonly used ports
  const commonPorts = [80, 443, 3000, 3306, 5432, 6379, 8080, 8443, 9000, 27017];
  if (commonPorts.includes(port)) {
    console.warn(
      `Warning: Port ${port} is commonly used by other services and may cause conflicts.`
    );
  }
}

/**
 * Validate Docker daemon connection settings
 * 
 * @param dockerHost Optional Docker host string
 * @throws ConfigurationValidationError if invalid
 */
export function validateDockerConnection(dockerHost?: string): void {
  if (!dockerHost) {
    // Default Docker socket will be used
    return;
  }
  
  // Validate Docker host format
  const validProtocols = ['unix://', 'tcp://', 'http://', 'https://'];
  const hasValidProtocol = validProtocols.some(proto => dockerHost.startsWith(proto));
  
  if (!hasValidProtocol) {
    throw new ConfigurationValidationError(
      'dockerHost',
      `Must start with one of: ${validProtocols.join(', ')}`,
      dockerHost
    );
  }
}