import { useState } from 'react';
import { Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';

// 🍊 Minimal Ethereum address validation.
// Full checksum validation isn't needed for a dashboard — we just need
// to catch obvious typos before they hit the backend.
function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

// 🍊 Generate a fake tx hash for demo mode.
// In production this comes from the eth_sendTransaction response.
function fakeTxHash(): string {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `0x${hex}`;
}

interface FaucetPanelProps {
  disabled: boolean;
  onSend?: (address: string, amount: string, txHash: string) => void;
}

type FaucetState = 'idle' | 'sending' | 'success' | 'error';

// 🍊 The FaucetPanel lets users send test ETH to any address.
// In a real blockchain dev workflow, you constantly need test funds:
// deploying contracts, testing transfers, funding new accounts.
//
// This panel is self-contained: input validation, loading state,
// success/error feedback — all handled internally.
// The onSend callback notifies the parent (for terminal logging).
export default function FaucetPanel({ disabled, onSend }: FaucetPanelProps) {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('1');
  const [state, setState] = useState<FaucetState>('idle');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSend = !disabled && state !== 'sending' && isValidAddress(address) && parseFloat(amount) > 0;

  const handleSend = () => {
    if (!canSend) return;

    setState('sending');
    setError(null);
    setLastTxHash(null);

    // 🍊 Simulate network delay. Real integration will call the faucet backend.
    // The 1-2s delay makes the UX feel realistic — instant responses feel fake.
    const delay = 1000 + Math.random() * 1000;
    setTimeout(() => {
      // 90% success rate to occasionally show error state
      if (Math.random() > 0.1) {
        const txHash = fakeTxHash();
        setLastTxHash(txHash);
        setState('success');
        onSend?.(address, amount, txHash);

        // Reset after 3 seconds
        setTimeout(() => {
          setState('idle');
          setAddress('');
          setLastTxHash(null);
        }, 3000);
      } else {
        setError('Transaction reverted: insufficient funds in faucet');
        setState('error');

        setTimeout(() => {
          setState('idle');
          setError(null);
        }, 3000);
      }
    }, delay);
  };

  return (
    <div className="space-y-2.5">
      {/* Address input */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
          Recipient Address
        </label>
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="0x..."
          disabled={disabled || state === 'sending'}
          className="w-full px-2 py-1.5 text-xs font-mono bg-slate-800/50 border border-slate-700 rounded
                     text-slate-200 placeholder-slate-600
                     focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        />
        {address.length > 0 && !isValidAddress(address) && (
          <p className="text-[10px] text-red-400 mt-0.5">Invalid Ethereum address</p>
        )}
      </div>

      {/* Amount input */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
          Amount (ETH)
        </label>
        <div className="flex gap-1.5">
          {/* 🍊 Quick amount buttons. Most faucet interactions use standard amounts.
              Typing "0.5" is tedious on a dashboard you use 50 times a day. */}
          {['0.1', '1', '5', '10'].map(preset => (
            <button
              key={preset}
              onClick={() => setAmount(preset)}
              disabled={disabled || state === 'sending'}
              className={`flex-1 px-1 py-1 text-[10px] font-mono rounded border transition-colors
                ${amount === preset
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                }
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors
                   bg-violet-600 hover:bg-violet-500 text-white
                   disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
      >
        {state === 'sending' ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...
          </>
        ) : (
          <>
            <Send className="w-3.5 h-3.5" /> Send ETH
          </>
        )}
      </button>

      {/* Status feedback */}
      {state === 'success' && lastTxHash && (
        <div className="flex items-start gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-[10px] font-mono">
            <p className="text-emerald-300">Sent {amount} ETH</p>
            <p className="text-slate-500 break-all mt-0.5">tx: {lastTxHash}</p>
          </div>
        </div>
      )}

      {state === 'error' && error && (
        <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
          <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-300 font-mono">{error}</p>
        </div>
      )}
    </div>
  );
}
