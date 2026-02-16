import { useState, useRef, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import StatusBar from '@/components/StatusBar';
import Terminal from '@/components/Terminal';
import BlockVisualizer from '@/components/BlockVisualizer';
import NotificationToast from '@/components/NotificationToast';
import { useTerminal } from '@/hooks/useTerminal';
import { useNotifications } from '@/hooks/useNotifications';
import type { NetworkInfo, BlockInfo } from '@/types';
import {
  Play,
  Square,
  Plus,
  Trash2,
  RefreshCw,
  Send,
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

// 🍊 Rotate through validators for mining simulation.
// In Clique PoA the validators take turns signing blocks in round-robin order.
const VALIDATORS = [
  { name: 'validator-1', address: '0xaBcDeF1234567890aBcDeF1234567890aBcDeF12' },
  { name: 'validator-2', address: '0xdEf456789012345678901234567890AbCdEf4567' },
];

function App() {
  const terminal = useTerminal();
  const notifications = useNotifications();
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const blockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 🍊 Create a new block with realistic-looking data.
  // The block number increments, the miner rotates between validators,
  // and occasionally blocks have transactions (makes the visualizer more interesting).
  const createBlock = useCallback((blockNum: number): BlockInfo => {
    const validator = VALIDATORS[blockNum % VALIDATORS.length];
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

    // Mine genesis block immediately
    const genesis = createBlock(0);
    setBlocks([genesis]);
    terminal.system('BlockMonitor', 'Genesis block created');

    blockTimerRef.current = setInterval(() => {
      const block = createBlock(nextBlock);
      setBlocks(prev => [...prev, block]);

      const validator = VALIDATORS[nextBlock % VALIDATORS.length];
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

  // 🍊 Demo function to show the terminal and notifications in action.
  // This will be replaced by real SDK integration in the next iteration.
  const handleDemoStart = () => {
    terminal.system('App', 'Besu SDK Dashboard initialized');
    terminal.log('NetworkBuilder', 'Building network configuration...');
    terminal.log('NetworkBuilder', 'Chain ID: 1337 | Block period: 5s');
    terminal.log('NetworkBuilder', 'Subnet: 172.20.0.0/16');
    terminal.success('NetworkBuilder', 'Configuration validated');
    terminal.log('DockerManager', 'Creating Docker network: demo-network');
    terminal.success('DockerManager', 'Docker network created');
    terminal.log('Network', 'Generating genesis configuration...');
    terminal.log('Network', 'Starting anchor node validator-1 sequentially...');
    terminal.success('Node:validator-1', 'Node started successfully');
    terminal.log('Network', 'Starting remaining 2 nodes in parallel...');
    terminal.success('Node:validator-2', 'Node started successfully');
    terminal.success('Node:rpc-1', 'Node started successfully');
    terminal.success('Network', 'Network setup complete with 3 nodes');

    notifications.success('Network Ready', 'demo-network is running with 3 nodes');

    const networkInfo: NetworkInfo = {
      name: 'demo-network',
      chainId: 1337,
      status: 'RUNNING',
      subnet: '172.20.0.0/16',
      blockPeriod: 5,
      dataDirectory: './besu-networks/demo-network',
      nodes: [
        { name: 'validator-1', address: '0xaBcDeF12...', ip: '172.20.0.11', type: 'validator', status: 'RUNNING' },
        { name: 'validator-2', address: '0xdEf45678...', ip: '172.20.0.12', type: 'validator', status: 'RUNNING' },
        { name: 'rpc-1', address: '0x12345678...', ip: '172.20.0.101', type: 'rpc', status: 'RUNNING', rpcUrl: 'http://localhost:8545' },
      ],
    };
    setNetwork(networkInfo);

    // Start auto-mining blocks
    startAutoMining(networkInfo.blockPeriod);
  };

  const handleDemoStop = () => {
    stopAutoMining();
    terminal.log('Network', 'Tearing down network: demo-network');
    terminal.log('Network', 'Stopping 3 nodes...');
    terminal.success('Network', 'Network teardown complete');
    notifications.info('Network Stopped', 'demo-network has been shut down');
    setNetwork(null);
    setBlocks([]);
  };

  const handleManualBlock = () => {
    const nextNum = blocks.length > 0 ? blocks[blocks.length - 1].number + 1 : 0;
    const block = createBlock(nextNum);
    setBlocks(prev => [...prev, block]);

    const validator = VALIDATORS[nextNum % VALIDATORS.length];
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
                onClick={handleDemoStart}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Play className="w-4 h-4" /> Start Network
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleDemoStop}
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
          <div className="p-3">
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
                disabled={!network}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" /> Send Transaction
              </button>
              <button
                onClick={() => terminal.clear()}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear Terminal
              </button>
            </div>
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
    </div>
  );
}

export default App;
