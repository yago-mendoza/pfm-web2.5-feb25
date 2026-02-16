import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import StatusBar from '@/components/StatusBar';
import Terminal from '@/components/Terminal';
import BlockVisualizer from '@/components/BlockVisualizer';
import NotificationToast from '@/components/NotificationToast';
import FaucetPanel from '@/components/FaucetPanel';
import NetworkConfigModal from '@/components/NetworkConfigModal';
import NodeCard from '@/components/NodeCard';
import AddNodeModal from '@/components/AddNodeModal';
import { useTerminal } from '@/hooks/useTerminal';
import { useNotifications } from '@/hooks/useNotifications';
import { useNetwork } from '@/hooks/useNetwork';
import type { NetworkEventCallbacks } from '@/hooks/useNetwork';
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
//
// State management is split into three hooks:
// - useTerminal: terminal line state (append-only log)
// - useNotifications: toast notification state
// - useNetwork: network, nodes, blocks, auto-mining
//
// App.tsx is purely layout and event wiring.

function App() {
  const terminal = useTerminal();
  const notifications = useNotifications();

  // 🍊 Bridge between useNetwork (events) and the UI (terminal + notifications).
  // useMemo ensures we don't recreate callbacks on every render, which would
  // cause useNetwork to re-initialize its own useCallbacks.
  const networkCallbacks: NetworkEventCallbacks = useMemo(() => ({
    onLog: terminal.log,
    onSuccess: terminal.success,
    onSystem: terminal.system,
    onDebug: terminal.debug,
    onNotifySuccess: notifications.success,
    onNotifyInfo: notifications.info,
  }), [terminal.log, terminal.success, terminal.system, terminal.debug, notifications.success, notifications.info]);

  const net = useNetwork(networkCallbacks);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);

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

            {!net.network ? (
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
                    onClick={net.stopNetwork}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded transition-colors border border-red-600/30"
                  >
                    <Square className="w-3 h-3" /> Stop
                  </button>
                  <button
                    onClick={net.restartNetwork}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors border border-slate-700"
                  >
                    <RefreshCw className="w-3 h-3" /> Restart
                  </button>
                </div>

                {/* Network info */}
                <div className="mt-3 space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name</span>
                    <span className="text-slate-300">{net.network.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chain ID</span>
                    <span className="text-slate-300">{net.network.chainId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Block Period</span>
                    <span className="text-slate-300">{net.network.blockPeriod}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subnet</span>
                    <span className="text-slate-300">{net.network.subnet}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Nodes section */}
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Nodes {net.network && <span className="text-slate-600">({net.network.nodes.length})</span>}
              </h2>
              {net.network && (
                <button
                  onClick={() => setShowAddNodeModal(true)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                  title="Add node"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {net.network ? (
              <div className="space-y-1.5">
                {net.network.nodes.map(node => (
                  <NodeCard
                    key={node.name}
                    node={node}
                    onToggleStatus={net.toggleNodeStatus}
                  />
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
                onClick={net.mineBlock}
                disabled={!net.network}
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
              disabled={!net.network}
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
            <BlockVisualizer blocks={net.blocks} />
          </div>

          {/* Terminal fills remaining space */}
          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            <Terminal
              lines={terminal.lines}
              title={net.network ? `${net.network.name} — Terminal` : 'Terminal'}
              maxHeight="100%"
            />
          </div>
        </div>
      </div>

      <StatusBar network={net.network} blockNumber={net.latestBlockNumber} />
      <NotificationToast notifications={notifications.notifications} onDismiss={notifications.dismiss} />
      <NetworkConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onStart={net.startNetwork}
      />
      <AddNodeModal
        isOpen={showAddNodeModal}
        onClose={() => setShowAddNodeModal(false)}
        onAdd={net.addNode}
        existingNames={net.network?.nodes.map(n => n.name) ?? []}
      />
    </div>
  );
}

export default App;
