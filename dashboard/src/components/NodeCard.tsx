import { useState } from 'react';
import type { NodeInfo } from '@/types';
import {
  ChevronDown,
  ChevronRight,
  Square,
  Play,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

interface NodeCardProps {
  node: NodeInfo;
  onToggleStatus?: (nodeName: string) => void;
}

// 🍊 Expandable card for a single node.
// Collapsed: shows name, type badge, status dot, IP.
// Expanded: shows address, RPC URL (if applicable), stop/start button.
//
// This replaces the simple node list in the left panel with something
// you can actually interact with. In a real blockchain dashboard you
// constantly need to check node details, copy addresses, or restart a node.
export default function NodeCard({ node, onToggleStatus }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isRunning = node.status === 'RUNNING';
  const isStopped = node.status === 'STOPPED';

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded bg-slate-800/50 border border-slate-800 transition-colors hover:border-slate-700">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2.5 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-3 h-3 text-slate-500" />
            : <ChevronRight className="w-3 h-3 text-slate-500" />
          }
          <div className={`w-1.5 h-1.5 rounded-full ${
            isRunning ? 'bg-emerald-400' :
            node.status === 'ERROR' ? 'bg-red-400' :
            'bg-slate-600'
          }`} />
          <span className="text-xs text-slate-300 font-mono">{node.name}</span>
          <span className={`text-[10px] px-1 rounded ${
            node.type === 'validator' ? 'bg-violet-500/20 text-violet-400' :
            node.type === 'rpc' ? 'bg-blue-500/20 text-blue-400' :
            'bg-slate-700 text-slate-500'
          }`}>
            {node.type}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{node.ip}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-800/50">
          {/* Status */}
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] text-slate-500">Status</span>
            <span className={`text-[10px] font-mono font-bold ${
              isRunning ? 'text-emerald-400' :
              node.status === 'ERROR' ? 'text-red-400' :
              'text-slate-500'
            }`}>
              {node.status}
            </span>
          </div>

          {/* Address with copy */}
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-500">Address</span>
            <button
              onClick={() => handleCopy(node.address, 'address')}
              className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>{node.address.length > 14 ? `${node.address.slice(0, 6)}...${node.address.slice(-4)}` : node.address}</span>
              {copied === 'address'
                ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                : <Copy className="w-2.5 h-2.5" />
              }
            </button>
          </div>

          {/* RPC URL for RPC nodes */}
          {node.rpcUrl && (
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500">RPC</span>
              <button
                onClick={() => handleCopy(node.rpcUrl!, 'rpc')}
                className="flex items-center gap-1 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                <span>{node.rpcUrl}</span>
                {copied === 'rpc'
                  ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                  : <Copy className="w-2.5 h-2.5" />
                }
              </button>
            </div>
          )}

          {/* Start/Stop button */}
          {onToggleStatus && (
            <button
              onClick={() => onToggleStatus(node.name)}
              className={`w-full flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded transition-colors mt-1
                ${isRunning
                  ? 'bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-600/20'
                  : isStopped
                    ? 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-600/20'
                    : 'bg-slate-700/50 text-slate-500 border border-slate-700 cursor-not-allowed'
                }
              `}
              disabled={!isRunning && !isStopped}
            >
              {isRunning ? (
                <><Square className="w-2.5 h-2.5" /> Stop Node</>
              ) : isStopped ? (
                <><Play className="w-2.5 h-2.5" /> Start Node</>
              ) : (
                <span>{node.status}...</span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
