import { useEffect, useRef } from 'react';
import type { BlockInfo } from '@/types';
import { Box, ArrowRight } from 'lucide-react';

// 🍊 Truncate a hex string for display. Blockchain addresses and hashes are
// 66+ chars — nobody reads them in full. "0xabc...def" is the convention.
function truncateHex(hex: string, chars = 4): string {
  if (hex.length <= chars * 2 + 4) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

// 🍊 Format a Unix timestamp into a human-readable relative time.
// "12s ago" is far more useful than "2026-02-17T14:32:05Z" in a live dashboard.
function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// 🍊 Each block is a card in the chain. The newest block pulses briefly to
// draw attention, then settles. Color-coded border based on tx count:
// empty blocks are dimmer (validators signing but no activity),
// blocks with txs glow green (actual usage).
function BlockCard({ block, isLatest }: { block: BlockInfo; isLatest: boolean }) {
  const hasTransactions = block.transactionCount > 0;

  return (
    <div
      className={`
        relative shrink-0 w-44 rounded-lg border p-3
        transition-all duration-500 ease-out
        ${isLatest ? 'animate-pulse-once scale-[1.02]' : ''}
        ${hasTransactions
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-slate-700 bg-slate-800/50'
        }
      `}
    >
      {/* Block number — the most important identifier */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Box className={`w-3.5 h-3.5 ${hasTransactions ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span className="text-sm font-bold text-slate-200 font-mono">
            #{block.number}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {timeAgo(block.timestamp)}
        </span>
      </div>

      {/* Block details */}
      <div className="space-y-1 text-[11px] font-mono">
        <div className="flex justify-between">
          <span className="text-slate-500">Hash</span>
          <span className="text-slate-400">{truncateHex(block.hash)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Miner</span>
          <span className="text-violet-400">{truncateHex(block.miner)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Txs</span>
          <span className={hasTransactions ? 'text-emerald-400' : 'text-slate-600'}>
            {block.transactionCount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Gas</span>
          <span className="text-slate-400">{block.gasUsed}</span>
        </div>
      </div>

      {/* New block indicator dot */}
      {isLatest && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
      )}
    </div>
  );
}

// 🍊 Chain connector arrow between blocks. Simple but important —
// without visual connectors the blocks look like unrelated cards.
function ChainArrow() {
  return (
    <div className="flex items-center shrink-0 px-1">
      <ArrowRight className="w-4 h-4 text-slate-700" />
    </div>
  );
}

interface BlockVisualizerProps {
  blocks: BlockInfo[];
  maxVisible?: number;
}

// 🍊 The BlockVisualizer shows the blockchain as a horizontal chain of block cards.
// It auto-scrolls to the right as new blocks arrive, keeping the latest block visible.
// The user can scroll left to see older blocks.
//
// Design decisions:
// - Horizontal layout because a blockchain IS a chain — visual metaphor matters
// - Only the latest N blocks shown to avoid DOM bloat (configurable via maxVisible)
// - Newest block briefly animates to draw attention
// - Auto-scroll right (same logic as Terminal: stops if user scrolls left)
export default function BlockVisualizer({ blocks, maxVisible = 20 }: BlockVisualizerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledLeft = useRef(false);

  const visibleBlocks = blocks.slice(-maxVisible);

  // 🍊 Same auto-scroll pattern as Terminal, but horizontal.
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const isAtEnd = scrollWidth - scrollLeft - clientWidth < 50;
    isUserScrolledLeft.current = !isAtEnd;
  };

  useEffect(() => {
    if (!isUserScrolledLeft.current && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [blocks.length]);

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
        <div className="flex items-center px-3 py-1.5 bg-slate-900 border-b border-slate-800">
          <Box className="w-3.5 h-3.5 text-slate-500 mr-2" />
          <span className="text-xs text-slate-400 font-mono">Block Explorer</span>
        </div>
        <div className="px-3 py-8 text-slate-600 text-xs font-mono text-center">
          No blocks yet. Start a network to see blocks appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Box className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-slate-400 font-mono">Block Explorer</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
          <span>Latest: #{blocks[blocks.length - 1].number}</span>
          <span>{blocks.length} blocks</span>
        </div>
      </div>

      {/* Horizontal scrollable block chain */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex items-center gap-0 p-3 overflow-x-auto scrollbar-thin"
      >
        {visibleBlocks.map((block, i) => (
          <div key={block.number} className="flex items-center">
            {i > 0 && <ChainArrow />}
            <BlockCard
              block={block}
              isLatest={i === visibleBlocks.length - 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
