import { Activity, Box, Cpu, HardDrive } from 'lucide-react';
import type { NetworkInfo } from '@/types';

interface StatusBarProps {
  network: NetworkInfo | null;
  blockNumber: number | null;
}

// 🍊 Bottom status bar showing at-a-glance network health.
// Inspired by VS Code's status bar — compact, always visible, information-dense.
export default function StatusBar({ network, blockNumber }: StatusBarProps) {
  const isConnected = network?.status === 'RUNNING';
  const nodeCount = network?.nodes.length ?? 0;
  const validatorCount = network?.nodes.filter(n => n.type === 'validator').length ?? 0;

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-t border-slate-800 text-xs font-mono">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={isConnected ? 'text-emerald-400' : 'text-slate-500'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Network name */}
        {network && (
          <span className="text-slate-400">
            {network.name} <span className="text-slate-600">|</span> Chain {network.chainId}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Block number */}
        {blockNumber !== null && (
          <div className="flex items-center gap-1 text-slate-400">
            <Box className="w-3 h-3" />
            <span>#{blockNumber}</span>
          </div>
        )}

        {/* Node count */}
        {network && (
          <div className="flex items-center gap-1 text-slate-400">
            <Cpu className="w-3 h-3" />
            <span>{nodeCount} nodes ({validatorCount} validators)</span>
          </div>
        )}

        {/* Subnet */}
        {network && (
          <div className="flex items-center gap-1 text-slate-500">
            <Activity className="w-3 h-3" />
            <span>{network.subnet}</span>
          </div>
        )}

        {/* Local indicator */}
        <div className="flex items-center gap-1 text-slate-600">
          <HardDrive className="w-3 h-3" />
          <span>Local</span>
        </div>
      </div>
    </div>
  );
}
