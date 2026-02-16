import { useState } from 'react';
import Header from '@/components/Header';
import StatusBar from '@/components/StatusBar';
import Terminal from '@/components/Terminal';
import NotificationToast from '@/components/NotificationToast';
import { useTerminal } from '@/hooks/useTerminal';
import { useNotifications } from '@/hooks/useNotifications';
import type { NetworkInfo } from '@/types';
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

function App() {
  const terminal = useTerminal();
  const notifications = useNotifications();
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);

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

    setNetwork({
      name: 'demo-network',
      chainId: 1337,
      status: 'RUNNING',
      subnet: '172.20.0.0/16',
      blockPeriod: 5,
      dataDirectory: './besu-networks/demo-network',
      nodes: [
        { name: 'validator-1', address: '0xabc...', ip: '172.20.0.11', type: 'validator', status: 'RUNNING' },
        { name: 'validator-2', address: '0xdef...', ip: '172.20.0.12', type: 'validator', status: 'RUNNING' },
        { name: 'rpc-1', address: '0x123...', ip: '172.20.0.101', type: 'rpc', status: 'RUNNING', rpcUrl: 'http://localhost:8545' },
      ],
    });
    setBlockNumber(0);
  };

  const handleDemoStop = () => {
    terminal.log('Network', 'Tearing down network: demo-network');
    terminal.log('Network', 'Stopping 3 nodes...');
    terminal.success('Network', 'Network teardown complete');
    notifications.info('Network Stopped', 'demo-network has been shut down');
    setNetwork(null);
    setBlockNumber(null);
  };

  const handleDemoBlock = () => {
    const num = (blockNumber ?? 0) + 1;
    setBlockNumber(num);
    terminal.log('BlockMonitor', `New block #${num} mined by validator-1 (0 txs)`);
  };

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
                onClick={handleDemoBlock}
                disabled={!network}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" /> Simulate Block
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

        {/* Right panel — Terminal + Block Visualizer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Terminal takes up available space */}
          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            <Terminal
              lines={terminal.lines}
              title={network ? `${network.name} — Terminal` : 'Terminal'}
              maxHeight="100%"
            />
          </div>
        </div>
      </div>

      <StatusBar network={network} blockNumber={blockNumber} />
      <NotificationToast notifications={notifications.notifications} onDismiss={notifications.dismiss} />
    </div>
  );
}

export default App;
