import { useState, useRef, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import StatusBar from '@/components/StatusBar';
import Terminal from '@/components/Terminal';
import BlockVisualizer from '@/components/BlockVisualizer';
import NotificationToast from '@/components/NotificationToast';
import FaucetPanel from '@/components/FaucetPanel';
import NetworkConfigModal from '@/components/NetworkConfigModal';
import type { NetworkConfig } from '@/components/NetworkConfigModal';
import { useTerminal } from '@/hooks/useTerminal';
import { useNotifications } from '@/hooks/useNotifications';
import type { NetworkInfo, BlockInfo } from '@/types';
import {
  Play,
  Square,
  Plus,
  Trash2,
  RefreshCw,
  Droplets,
} from 'lucide-react';

// 🍊 Main application layout.
// The dashboard uses a fixed layout: header at top, status bar at bottom,
// and a flexible content area in between. The content area is split into
// a left panel (controls) and right panel (terminal + block visualizer).
//
// This is intentionally NOT using a router — everything is visible at once.
// A blockchain dashboard needs to show multiple things simultaneously:
// you want to see node status WHILE watching the terminal output.

// 🍊 Generate a fake block hash. In a real integration this comes from the RPC.
// We use random hex here so blocks look visually distinct in the visualizer.
function fakeHash(): string {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `0x${hex}`;
}

// 🍊 Generate a fake Ethereum address for demo nodes.
function fakeAddress(): string {
  const hex = Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `0x${hex}`;
}

function App() {
  const terminal = useTerminal();
  const notifications = useNotifications();
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const blockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 🍊 Store validator info for block mining rotation.
  // This is set when the network starts and used by the auto-miner.
  const validatorsRef = useRef<{ name: string; address: string }[]>([]);

  // 🍊 Create a new block with realistic-looking data.
  // The block number increments, the miner rotates between validators,
  // and occasionally blocks have transactions (makes the visualizer more interesting).
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

  // 🍊 Auto-mine: simulate blocks at the network's block period.
  // Uses setInterval tied to the network's blockPeriod config.
  // Cleanup on stop prevents orphaned timers.
  const startAutoMining = useCallback((blockPeriod: number) => {
    if (blockTimerRef.current) clearInterval(blockTimerRef.current);

    let nextBlock = 1;
    const validators = validatorsRef.current;

    // Mine genesis block immediately
    const genesis = createBlock(0);
    setBlocks([genesis]);
    terminal.system('BlockMonitor', 'Genesis block created');

    blockTimerRef.current = setInterval(() => {
      const block = createBlock(nextBlock);
      setBlocks(prev => [...prev, block]);

      const validator = validators.length > 0
        ? validators[nextBlock % validators.length]
        : { name: 'unknown' };
      const txMsg = block.transactionCount > 0
        ? `${block.transactionCount} txs, gas: ${block.gasUsed}`
        : '0 txs';
      terminal.log('BlockMonitor', `Block #${nextBlock} mined by ${validator.name} (${txMsg})`);

      nextBlock++;
    }, blockPeriod * 1000);
  }, [createBlock, terminal]);

  const stopAutoMining = useCallback(() => {
    if (blockTimerRef.current) {
      clearInterval(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }, []);

  // 🍊 Cleanup timer on unmount to prevent memory leaks.
  useEffect(() => {
    return () => stopAutoMining();
  }, [stopAutoMining]);

  // 🍊 Start network using config from the modal.
  // Generates nodes dynamically based on validatorCount and rpcCount.
  const handleStartNetwork = useCallback((config: NetworkConfig) => {
    terminal.system('App', 'Besu SDK Dashboard initialized');
    terminal.log('NetworkBuilder', `Building network configuration...`);
    terminal.log('NetworkBuilder', `Name: ${config.name} | Chain ID: ${config.chainId} | Block period: ${config.blockPeriod}s`);
    terminal.log('NetworkBuilder', `Subnet: ${config.subnet}`);
    terminal.log('NetworkBuilder', `Nodes: ${config.validatorCount} validators + ${config.rpcCount} RPC`);
    terminal.success('NetworkBuilder', 'Configuration validated');
    terminal.log('DockerManager', `Creating Docker network: ${config.name}`);
    terminal.success('DockerManager', 'Docker network created');
    terminal.log('Network', 'Generating genesis configuration...');

    // 🍊 Generate nodes from config. IP addresses increment from .11 for validators
    // and .101 for RPC nodes (same convention the real SDK uses).
    const validators: { name: string; address: string; ip: string }[] = [];
    for (let i = 0; i < config.validatorCount; i++) {
      const name = `validator-${i + 1}`;
      const address = fakeAddress();
      const ip = `172.20.0.${11 + i}`;
      validators.push({ name, address, ip });
    }

    const rpcNodes: { name: string; address: string; ip: string }[] = [];
    for (let i = 0; i < config.rpcCount; i++) {
      const name = `rpc-${i + 1}`;
      const address = fakeAddress();
      const ip = `172.20.0.${101 + i}`;
      rpcNodes.push({ name, address, ip });
    }

    // Store validators for mining rotation
    validatorsRef.current = validators.map(v => ({ name: v.name, address: v.address }));

    // Log node startup sequence
    if (validators.length > 0) {
      terminal.log('Network', `Starting anchor node ${validators[0].name} sequentially...`);
      terminal.success(`Node:${validators[0].name}`, 'Node started successfully');
    }

    const remainingNodes = [...validators.slice(1), ...rpcNodes];
    if (remainingNodes.length > 0) {
      terminal.log('Network', `Starting remaining ${remainingNodes.length} nodes in parallel...`);
      for (const node of remainingNodes) {
        terminal.success(`Node:${node.name}`, 'Node started successfully');
      }
    }

    const totalNodes = validators.length + rpcNodes.length;
    terminal.success('Network', `Network setup complete with ${totalNodes} nodes`);
    notifications.success('Network Ready', `${config.name} is running with ${totalNodes} nodes`);

    const networkInfo: NetworkInfo = {
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
    };
    setNetwork(networkInfo);
    startAutoMining(config.blockPeriod);
  }, [terminal, notifications, startAutoMining]);

  const handleStopNetwork = () => {
    if (!network) return;
    stopAutoMining();
    terminal.log('Network', `Tearing down network: ${network.name}`);
    terminal.log('Network', `Stopping ${network.nodes.length} nodes...`);
    terminal.success('Network', 'Network teardown complete');
    notifications.info('Network Stopped', `${network.name} has been shut down`);
    setNetwork(null);
    setBlocks([]);
    validatorsRef.current = [];
  };

  const handleManualBlock = () => {
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
    terminal.log('BlockMonitor', `Block #${nextNum} mined by ${validator.name} (${txMsg})`);
  };

  const latestBlockNumber = blocks.length > 0 ? blocks[blocks.length - 1].number : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — Controls */}
        <div className="w-80 shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
          {/* Network section */}
          <div className="p-3 border-b border-slate-800">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Network</h2>

            {!network ? (
              <button
                onClick={() => setShowConfigModal(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Play className="w-4 h-4" /> Start Network
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleStopNetwork}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded transition-colors border border-red-600/30"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors border border-slate-700"
                  >
                    <RefreshCw className="w-3 h-3" /> Restart
                  </button>
                </div>

                {/* Network info */}
                <div className="mt-3 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name</span>
                    <span className="text-slate-300">{network.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chain ID</span>
                    <span className="text-slate-300">{network.chainId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Block Period</span>
                    <span className="text-slate-300">{network.blockPeriod}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subnet</span>
                    <span className="text-slate-300">{network.subnet}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Nodes section */}
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nodes</h2>
              {network && (
                <button className="text-slate-500 hover:text-slate-300 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {network ? (
              <div className="space-y-1.5">
                {network.nodes.map(node => (
                  <div
                    key={node.name}
                    className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        node.status === 'RUNNING' ? 'bg-emerald-400' :
                        node.status === 'ERROR' ? 'bg-red-400' :
                        'bg-slate-600'
                      }`} />
                      <div>
                        <span className="text-xs text-slate-300 font-mono">{node.name}</span>
                        <span className={`ml-1.5 text-[10px] px-1 rounded ${
                          node.type === 'validator' ? 'bg-violet-500/20 text-violet-400' :
                          node.type === 'rpc' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-slate-700 text-slate-500'
                        }`}>
                          {node.type}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono">{node.ip}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">No network running</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-3 border-b border-slate-800">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              <button
                onClick={handleManualBlock}
                disabled={!network}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" /> Mine Block
              </button>
              <button
                onClick={() => terminal.clear()}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear Terminal
              </button>
            </div>
          </div>

          {/* Faucet */}
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Droplets className="w-3.5 h-3.5 text-violet-400" />
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faucet</h2>
            </div>
            <FaucetPanel
              disabled={!network}
              onSend={(address, amount, txHash) => {
                terminal.success('Faucet', `Sent ${amount} ETH to ${address.slice(0, 10)}...`);
                terminal.debug('Faucet', `tx: ${txHash}`);
                notifications.success('Transaction Sent', `${amount} ETH sent successfully`);
              }}
            />
          </div>
        </div>

        {/* Right panel — Block Visualizer + Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Block Visualizer at the top */}
          <div className="shrink-0 p-3 pb-0">
            <BlockVisualizer blocks={blocks} />
          </div>

          {/* Terminal fills remaining space */}
          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            <Terminal
              lines={terminal.lines}
              title={network ? `${network.name} — Terminal` : 'Terminal'}
              maxHeight="100%"
            />
          </div>
        </div>
      </div>

      <StatusBar network={network} blockNumber={latestBlockNumber} />
      <NotificationToast notifications={notifications.notifications} onDismiss={notifications.dismiss} />
      <NetworkConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onStart={handleStartNetwork}
      />
    </div>
  );
}

export default App;
