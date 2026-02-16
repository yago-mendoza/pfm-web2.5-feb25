import { useEffect, useRef, useState } from 'react';
import type { TerminalLine } from '@/types';
import { ArrowDown } from 'lucide-react';

// 🍊 Color mapping for terminal log levels.
// Each level has a label color and a text color, mimicking real terminal output.
// This isn't a simple className swap — the colors are carefully chosen for
// readability on dark backgrounds and to match the SDK's own logging palette.
const LEVEL_STYLES: Record<TerminalLine['level'], { label: string; labelBg: string; text: string }> = {
  info:    { label: 'text-blue-400',   labelBg: 'bg-blue-400/10',   text: 'text-slate-300' },
  success: { label: 'text-emerald-400', labelBg: 'bg-emerald-400/10', text: 'text-emerald-200' },
  warn:    { label: 'text-amber-400',  labelBg: 'bg-amber-400/10',  text: 'text-amber-200' },
  error:   { label: 'text-red-400',    labelBg: 'bg-red-400/10',    text: 'text-red-200' },
  debug:   { label: 'text-slate-500',  labelBg: 'bg-slate-500/10',  text: 'text-slate-500' },
  system:  { label: 'text-violet-400', labelBg: 'bg-violet-400/10', text: 'text-violet-200' },
};

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// 🍊 Individual terminal line component. Memoization isn't needed here because
// lines are append-only — once rendered, their props never change.
function TerminalLineItem({ line }: { line: TerminalLine }) {
  const style = LEVEL_STYLES[line.level];

  return (
    <div className="flex items-start gap-2 px-3 py-0.5 hover:bg-slate-800/50 font-mono text-xs leading-5">
      {/* Timestamp */}
      <span className="text-slate-600 shrink-0 select-none">
        {formatTimestamp(line.timestamp)}
      </span>

      {/* Level badge */}
      <span className={`${style.label} ${style.labelBg} px-1.5 rounded text-[10px] font-bold uppercase shrink-0 select-none`}>
        {line.level === 'success' ? 'OK' : line.level.slice(0, 4)}
      </span>

      {/* Source */}
      <span className="text-slate-500 shrink-0 select-none">
        [{line.source}]
      </span>

      {/* Message */}
      <span className={`${style.text} break-all`}>
        {line.message}
      </span>
    </div>
  );
}

interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
  maxHeight?: string;
  autoScroll?: boolean;
}

// 🍊 The Terminal component is the informational heart of the dashboard.
// It shows a live feed of what the SDK is doing: network creation, node starts,
// block events, errors, etc. It mimics a real terminal with colored output,
// timestamps, and auto-scrolling.
//
// Design decisions:
// - Auto-scroll follows new output but stops if the user scrolls up (like a real terminal)
// - Each line is its own element for accessibility and selection
// - No virtualization needed — terminal caps at ~500 lines which renders fine
// - A "scroll to bottom" pill appears when the user has scrolled up, showing
//   how many new lines they're missing (like Slack's "new messages" indicator)
export default function Terminal({ lines, title = 'Terminal', maxHeight = '400px', autoScroll = true }: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  // 🍊 Track how many lines have arrived since the user scrolled up.
  // This gives the pill a count like "12 new lines" so the user knows
  // whether it's worth scrolling down.
  const lineCountAtScrollUp = useRef(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    const wasScrolledUp = isUserScrolledUp.current;
    isUserScrolledUp.current = !isAtBottom;

    if (!isAtBottom && !wasScrolledUp) {
      // Just scrolled up — record how many lines exist now
      lineCountAtScrollUp.current = lines.length;
    }

    setShowScrollButton(!isAtBottom && lines.length > 0);
  };

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    isUserScrolledUp.current = false;
    setShowScrollButton(false);
  };

  useEffect(() => {
    if (autoScroll && !isUserScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length, autoScroll]);

  const newLineCount = lines.length - lineCountAtScrollUp.current;

  return (
    <div className="relative flex flex-col border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Traffic light dots */}
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-xs text-slate-400 font-mono ml-2">{title}</span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{lines.length} lines</span>
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto py-1"
        style={{ maxHeight }}
      >
        {lines.length === 0 ? (
          <div className="px-3 py-4 text-slate-600 text-xs font-mono text-center">
            Waiting for events...
          </div>
        ) : (
          lines.map(line => <TerminalLineItem key={line.id} line={line} />)
        )}
      </div>

      {/* 🍊 Scroll-to-bottom pill. Appears when user scrolls up.
          Shows count of new lines so user can decide if it's worth jumping down.
          Positioned at the bottom center of the terminal body. */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2
                     flex items-center gap-1.5 px-3 py-1
                     bg-violet-600/90 hover:bg-violet-500 text-white text-[10px] font-medium
                     rounded-full shadow-lg backdrop-blur-sm
                     transition-all duration-200 animate-pulse-once"
        >
          <ArrowDown className="w-3 h-3" />
          {newLineCount > 0 ? `${newLineCount} new lines` : 'Scroll to bottom'}
        </button>
      )}
    </div>
  );
}
