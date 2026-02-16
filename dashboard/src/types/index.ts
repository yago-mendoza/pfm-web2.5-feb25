// 🍊 Centralized type definitions for the dashboard.
// Keeping types in one place prevents the duplication problem
// that plagued the old frontback (two incompatible NetworkConfig interfaces).

/** Terminal line with color and metadata */
export interface TerminalLine {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug' | 'system';
  source: string;
  message: string;
}

/** Node status as reported by the SDK */
export type NodeStatus = 'CREATED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';

/** Network status as reported by the SDK */
export type NetworkStatus = 'UNINITIALIZED' | 'INITIALIZING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';

/** Simplified node info for the dashboard */
export interface NodeInfo {
  name: string;
  address: string;
  ip: string;
  type: 'validator' | 'rpc' | 'normal';
  status: NodeStatus;
  rpcUrl?: string;
  balance?: string;
}

/** Simplified network info for the dashboard */
export interface NetworkInfo {
  name: string;
  chainId: number;
  status: NetworkStatus;
  subnet: string;
  blockPeriod: number;
  nodes: NodeInfo[];
  dataDirectory: string;
}

/** Block info for the block visualizer */
export interface BlockInfo {
  number: number;
  hash: string;
  miner: string;
  timestamp: number;
  gasUsed: string;
  transactionCount: number;
}

/** Notification for the notification system */
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  dismissed: boolean;
}
