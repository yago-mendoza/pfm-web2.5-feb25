import { useState, useRef, useCallback, useEffect } from 'react';
import type { NetworkInfo, BlockInfo, NodeStatus } from '@/types';
import type { NetworkConfig } from '@/components/NetworkConfigModal';
import type { NewNodeConfig } from '@/components/AddNodeModal';

// 🍊 Generate a fake hex string of given length (in characters, not bytes).
// Used for block hashes and addresses in demo mode.
function fakeHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function fakeHash(): string {
  return `0x${fakeHex(64)}`;
}

function fakeAddress(): string {
  return `0x${fakeHex(40)}`;
}

// 🍊 Callback types for the hook to communicate events to the UI.
// The hook manages state; the UI decides how to display events.
// This separation means the hook can be tested without rendering anything.
export interface NetworkEventCallbacks {
  onLog: (source: string, message: string) => void;
  onSuccess: (source: string, message: string) => void;
  onSystem: (source: string, message: string) => void;
  onDebug: (source: string, message: string) => void;
  onNotifySuccess: (title: string, message: string) => void;
  onNotifyInfo: (title: string, message: string) => void;
}

export interface UseNetworkReturn {
  network: NetworkInfo | null;
  blocks: BlockInfo[];
  latestBlockNumber: number | null;
  startNetwork: (config: NetworkConfig) => void;
  stopNetwork: () => void;
  restartNetwork: () => void;
  addNode: (config: NewNodeConfig) => void;
  toggleNodeStatus: (nodeName: string) => void;
  mineBlock: () => void;
}

// 🍊 Hook that encapsulates all network lifecycle management.
// App.tsx was growing too large with start/stop/restart/addNode/toggleStatus/mining
// all living as top-level functions. This hook owns:
// - Network state (NetworkInfo)
// - Block state (BlockInfo[])
// - Auto-mining timer
// - Validator rotation
// - Node management
//
// The callbacks pattern lets the UI layer (App.tsx) decide how to present
// events without the hook needing to know about Terminal or Notifications.
export function useNetwork(callbacks: NetworkEventCallbacks): UseNetworkReturn {
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const blockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const validatorsRef = useRef<{ name: string; address: string }[]>([]);
  // 🍊 Store the last config so we can restart with the same settings.
  const lastConfigRef = useRef<NetworkConfig | null>(null);

  const createBlock = useCallback((blockNum: number): BlockInfo => {
    const validators = validatorsRef.current;
    const validator = validators.length > 0
      ? validators[blockNum % validators.length]
      : { address: '0x0000000000000000000000000000000000000000' };
    const txCount = Math.random() < 0.3 ? Math.floor(Math.random() * 5) + 1 : 0;
    const gasUsed = txCount > 0 ? `${(txCount * 21000).toLocaleString()}` : '0';

    return {
      number: blockNum,
      hash: fakeHash(),
      miner: validator.address,
      timestamp: Math.floor(Date.now() / 1000),
      gasUsed,
      transactionCount: txCount,
    };
  }, []);

  const startAutoMining = useCallback((blockPeriod: number) => {
    if (blockTimerRef.current) clearInterval(blockTimerRef.current);

    let nextBlock = 1;
    const validators = validatorsRef.current;

    const genesis = createBlock(0);
    setBlocks([genesis]);
    callbacks.onSystem('BlockMonitor', 'Genesis block created');

    blockTimerRef.current = setInterval(() => {
      const block = createBlock(nextBlock);
      setBlocks(prev => [...prev, block]);

      const validator = validators.length > 0
        ? validators[nextBlock % validators.length]
        : { name: 'unknown' };
      const txMsg = block.transactionCount > 0
        ? `${block.transactionCount} txs, gas: ${block.gasUsed}`
        : '0 txs';
      callbacks.onLog('BlockMonitor', `Block #${nextBlock} mined by ${validator.name} (${txMsg})`);

      nextBlock++;
    }, blockPeriod * 1000);
  }, [createBlock, callbacks]);

  const stopAutoMining = useCallback(() => {
    if (blockTimerRef.current) {
      clearInterval(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopAutoMining();
  }, [stopAutoMining]);

  const startNetwork = useCallback((config: NetworkConfig) => {
    lastConfigRef.current = config;

    callbacks.onSystem('App', 'Besu SDK Dashboard initialized');
    callbacks.onLog('NetworkBuilder', `Building network configuration...`);
    callbacks.onLog('NetworkBuilder', `Name: ${config.name} | Chain ID: ${config.chainId} | Block period: ${config.blockPeriod}s`);
    callbacks.onLog('NetworkBuilder', `Subnet: ${config.subnet}`);
    callbacks.onLog('NetworkBuilder', `Nodes: ${config.validatorCount} validators + ${config.rpcCount} RPC`);
    callbacks.onSuccess('NetworkBuilder', 'Configuration validated');
    callbacks.onLog('DockerManager', `Creating Docker network: ${config.name}`);
    callbacks.onSuccess('DockerManager', 'Docker network created');
    callbacks.onLog('Network', 'Generating genesis configuration...');

    const validators: { name: string; address: string; ip: string }[] = [];
    for (let i = 0; i < config.validatorCount; i++) {
      validators.push({
        name: `validator-${i + 1}`,
        address: fakeAddress(),
        ip: `172.20.0.${11 + i}`,
      });
    }

    const rpcNodes: { name: string; address: string; ip: string }[] = [];
    for (let i = 0; i < config.rpcCount; i++) {
      rpcNodes.push({
        name: `rpc-${i + 1}`,
        address: fakeAddress(),
        ip: `172.20.0.${101 + i}`,
      });
    }

    validatorsRef.current = validators.map(v => ({ name: v.name, address: v.address }));

    if (validators.length > 0) {
      callbacks.onLog('Network', `Starting anchor node ${validators[0].name} sequentially...`);
      callbacks.onSuccess(`Node:${validators[0].name}`, 'Node started successfully');
    }

    const remaining = [...validators.slice(1), ...rpcNodes];
    if (remaining.length > 0) {
      callbacks.onLog('Network', `Starting remaining ${remaining.length} nodes in parallel...`);
      for (const node of remaining) {
        callbacks.onSuccess(`Node:${node.name}`, 'Node started successfully');
      }
    }

    const totalNodes = validators.length + rpcNodes.length;
    callbacks.onSuccess('Network', `Network setup complete with ${totalNodes} nodes`);
    callbacks.onNotifySuccess('Network Ready', `${config.name} is running with ${totalNodes} nodes`);

    setNetwork({
      name: config.name,
      chainId: config.chainId,
      status: 'RUNNING',
      subnet: config.subnet,
      blockPeriod: config.blockPeriod,
      dataDirectory: `./besu-networks/${config.name}`,
      nodes: [
        ...validators.map(v => ({
          name: v.name,
          address: v.address,
          ip: v.ip,
          type: 'validator' as const,
          status: 'RUNNING' as const,
        })),
        ...rpcNodes.map((r, i) => ({
          name: r.name,
          address: r.address,
          ip: r.ip,
          type: 'rpc' as const,
          status: 'RUNNING' as const,
          rpcUrl: `http://localhost:${8545 + i}`,
        })),
      ],
    });

    startAutoMining(config.blockPeriod);
  }, [callbacks, startAutoMining]);

  const stopNetwork = useCallback(() => {
    if (!network) return;
    stopAutoMining();
    callbacks.onLog('Network', `Tearing down network: ${network.name}`);
    callbacks.onLog('Network', `Stopping ${network.nodes.length} nodes...`);
    callbacks.onSuccess('Network', 'Network teardown complete');
    callbacks.onNotifyInfo('Network Stopped', `${network.name} has been shut down`);
    setNetwork(null);
    setBlocks([]);
    validatorsRef.current = [];
  }, [network, stopAutoMining, callbacks]);

  // 🍊 Restart = stop + start with the same config.
  // We store the config on start so we can replay it here.
  const restartNetwork = useCallback(() => {
    if (!network || !lastConfigRef.current) return;
    const config = lastConfigRef.current;
    stopAutoMining();
    callbacks.onLog('Network', `Restarting network: ${network.name}...`);
    callbacks.onLog('Network', `Stopping ${network.nodes.length} nodes...`);
    setNetwork(null);
    setBlocks([]);
    validatorsRef.current = [];

    // 🍊 Brief delay to make the restart feel real.
    // Instant restart looks like nothing happened.
    setTimeout(() => {
      callbacks.onLog('Network', 'Restart: bringing network back up...');
      startNetwork(config);
    }, 500);
  }, [network, stopAutoMining, callbacks, startNetwork]);

  const addNode = useCallback((config: NewNodeConfig) => {
    if (!network) return;
    const nextIp = config.type === 'rpc'
      ? `172.20.0.${101 + network.nodes.filter(n => n.type === 'rpc').length}`
      : `172.20.0.${11 + network.nodes.filter(n => n.type === 'validator').length}`;

    const newNode = {
      name: config.name,
      address: fakeAddress(),
      ip: nextIp,
      type: config.type,
      status: 'RUNNING' as const,
      ...(config.enableRpc ? { rpcUrl: `http://localhost:${8545 + network.nodes.filter(n => n.rpcUrl).length}` } : {}),
    };

    callbacks.onLog('DockerManager', `Creating container for ${config.name}...`);
    callbacks.onLog(`Node:${config.name}`, `Joining network as ${config.type} node`);
    callbacks.onSuccess(`Node:${config.name}`, 'Node started successfully');
    callbacks.onNotifySuccess('Node Added', `${config.name} joined the network`);

    setNetwork(prev => prev ? { ...prev, nodes: [...prev.nodes, newNode] } : prev);

    if (config.type === 'validator') {
      validatorsRef.current = [...validatorsRef.current, { name: config.name, address: newNode.address }];
    }
  }, [network, callbacks]);

  const toggleNodeStatus = useCallback((nodeName: string) => {
    setNetwork(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        nodes: prev.nodes.map(n => {
          if (n.name !== nodeName) return n;
          const newStatus: NodeStatus = n.status === 'RUNNING' ? 'STOPPED' : 'RUNNING';
          callbacks.onLog('DockerManager', `${newStatus === 'STOPPED' ? 'Stopping' : 'Starting'} node ${nodeName}...`);
          callbacks.onSuccess(`Node:${nodeName}`, `Node ${newStatus === 'STOPPED' ? 'stopped' : 'started'} successfully`);
          return { ...n, status: newStatus };
        }),
      };
    });
  }, [callbacks]);

  const mineBlock = useCallback(() => {
    const nextNum = blocks.length > 0 ? blocks[blocks.length - 1].number + 1 : 0;
    const block = createBlock(nextNum);
    setBlocks(prev => [...prev, block]);

    const validators = validatorsRef.current;
    const validator = validators.length > 0
      ? validators[nextNum % validators.length]
      : { name: 'unknown' };
    const txMsg = block.transactionCount > 0
      ? `${block.transactionCount} txs, gas: ${block.gasUsed}`
      : '0 txs';
    callbacks.onLog('BlockMonitor', `Block #${nextNum} mined by ${validator.name} (${txMsg})`);
  }, [blocks, createBlock, callbacks]);

  const latestBlockNumber = blocks.length > 0 ? blocks[blocks.length - 1].number : null;

  return {
    network,
    blocks,
    latestBlockNumber,
    startNetwork,
    stopNetwork,
    restartNetwork,
    addNode,
    toggleNodeStatus,
    mineBlock,
  };
}
