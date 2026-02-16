import { Hexagon } from 'lucide-react';

// 🍊 Minimal header. The dashboard is about content density, not chrome.
// Logo + title is enough — navigation happens through the panel layout.
export default function Header() {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <Hexagon className="w-5 h-5 text-violet-400" />
        <h1 className="text-sm font-bold text-slate-200 tracking-wide">
          BESU<span className="text-violet-400">SDK</span>
        </h1>
        <span className="text-[10px] text-slate-600 font-mono ml-1">v1.0.0</span>
      </div>
      <div className="text-[10px] text-slate-600 font-mono">
        Hyperledger Besu Network Manager
      </div>
    </div>
  );
}
