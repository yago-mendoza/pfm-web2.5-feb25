// Importaciones explícitas para evitar problemas de resolución de módulos
import { BesuNetworkBuilder } from './core/NetworkBuilder';
import { Network } from './core/Network';
import { BesuNode } from './core/BesuNode';
import { DockerManager } from './services/DockerManager';
import { FileManager } from './services/FileManager';
import { SystemValidator } from './services/SystemValidator';
import { logger } from './utils/logger';
import { 
  generateNodeIdentity,
  generateMultipleIdentities,
  generateDeterministicIdentity,
  validateNodeIdentity,
  deriveAddressFromPrivateKey,
  formatPrivateKeyForBesu,
  addressFromEnode
} from './utils/key-generator';
import { 
  validateNetworkConfig,
  validateNodeConfig,
  validateNodeOptions,
  validateDockerConnection
} from './validators/config';
import { ethers } from 'ethers';

// 💡 Core exports - primary API
export { BesuNetworkBuilder } from './core/NetworkBuilder';
export { Network } from './core/Network';
export { BesuNode } from './core/BesuNode';

// Type exports - for TypeScript consumers
// Re-export all TypeScript types so users have access to interfaces and types.
export * from './types';

// Error exports - for proper error handling
export * from './errors';

/** Utility exports - for advanced usage
 * These generate and manage node keys, addresses, and node identities.
 * - Create node cryptographic identities (private key, public key, enode ID, ...)
 * - Validate identities (during setup, not during blockchain runtime)
 *   - Ethereum addres format
 *   - Private key derived from public key
 *   - Public matches private key
 * - Convert formats ("Ox-", "enode", ...)
 * 💡 Note: not used for RPC-JSON calls, only for cryptographic operations.
*/
export { 
  generateNodeIdentity,
  generateMultipleIdentities,
  generateDeterministicIdentity,
  validateNodeIdentity,
  deriveAddressFromPrivateKey,
  formatPrivateKeyForBesu,
  addressFromEnode
} from './utils/key-generator';

// Service export
// 💡 For ADVANCED users who want to customize the SDK behavior.
export { DockerManager } from './services/DockerManager';
export { FileManager } from './services/FileManager';
// 💡 Exported for advanced users to run system checks independently.
export { SystemValidator } from './services/SystemValidator';

/**
 * Validator exports
 * Functions to validate configurations before creating networks.
 * 💡 Why expose them instead of keeping internal?
 *    - Advanced users may want to validate before creating
 *    - Testing - to try configurations
 *    - Debugging - to check why something fails
 * But yes, conceptually should be hidden from the user.
 */
export { 
  validateNetworkConfig,
  validateNodeConfig,
  validateNodeOptions,
  validateDockerConnection
} from './validators/config';

// Logger export - for consistent logging
export { logger } from './utils/logger';

// Re-export ethers for convenience
export { ethers } from 'ethers';

/**
 * SDK Version
 */
export const VERSION = '1.0.0';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  blockPeriod: 5,
  subnet: '172.20.0.0/16',
  rpcPort: 8545,
  p2pPort: 30303,
  dataDirectory: './besu-networks',
  besuImage: 'hyperledger/besu:latest'
} as const;

/**
 * Convenience function to create and start a simple test network
 * 
 * @param validatorCount Number of validator nodes (default: 1)
 * @param rpcNodeCount Number of RPC nodes (default: 1)
 * @returns Configured and running network
 * 
 * @example
 * ```typescript
 * import { createTestNetwork } from 'besu-sdk';
 * 
 * const network = await createTestNetwork(3, 1);
 * // Network with 3 validators and 1 RPC node
 * ```
 */
export async function createTestNetwork(
  validatorCount = 1,
  rpcNodeCount = 1
): Promise<Network> {
  const builder = new BesuNetworkBuilder()
    .withChainId(1337)
    .withBlockPeriod(DEFAULTS.blockPeriod) // ✅ Usar DEFAULTS
    .withNetworkName(`test-network-${Date.now()}`)
    .withSubnet(DEFAULTS.subnet); // ✅ Usar DEFAULTS
  
  // Add validators
  for (let i = 1; i <= validatorCount; i++) {
    builder.addValidator(`validator-${i}`, `172.20.0.${10 + i}`);
  }
  
  // Add RPC nodes
  for (let i = 1; i <= rpcNodeCount; i++) {
    builder.addRpcNode(
      `rpc-${i}`, 
      `172.20.0.${100 + i}`,
      DEFAULTS.rpcPort + i // ✅ Usar DEFAULTS
    );
  }
  
  return await builder.build();
}