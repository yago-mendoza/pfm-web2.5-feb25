import { useState } from 'react';
import { X, Play, AlertTriangle } from 'lucide-react';

// 🍊 Network configuration form data.
// These map 1:1 to the SDK's NetworkBuilder parameters.
// Sensible defaults mean you can just click "Start" without changing anything.
export interface NetworkConfig {
  name: string;
  chainId: number;
  blockPeriod: number;
  subnet: string;
  validatorCount: number;
  rpcCount: number;
}

const DEFAULT_CONFIG: NetworkConfig = {
  name: 'dev-network',
  chainId: 1337,
  blockPeriod: 5,
  subnet: '172.20.0.0/16',
  validatorCount: 2,
  rpcCount: 1,
};

interface NetworkConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: NetworkConfig) => void;
}

// 🍊 Validation rules. Each returns an error message or null.
// These mirror the SDK's own validators — catching errors here
// gives a better UX than letting the SDK throw cryptic errors.
function validateConfig(config: NetworkConfig): string[] {
  const errors: string[] = [];

  if (!config.name.trim()) {
    errors.push('Network name is required');
  } else if (!/^[a-z0-9-]+$/.test(config.name)) {
    errors.push('Name must be lowercase alphanumeric with hyphens');
  }

  if (config.chainId < 1 || config.chainId > 2147483647) {
    errors.push('Chain ID must be between 1 and 2,147,483,647');
  }

  if (config.blockPeriod < 1 || config.blockPeriod > 60) {
    errors.push('Block period must be 1-60 seconds');
  }

  if (config.validatorCount < 1 || config.validatorCount > 10) {
    errors.push('Need 1-10 validators');
  }

  if (config.rpcCount < 0 || config.rpcCount > 5) {
    errors.push('RPC nodes must be 0-5');
  }

  const totalNodes = config.validatorCount + config.rpcCount;
  if (totalNodes > 12) {
    errors.push('Maximum 12 nodes total (Docker resource limit)');
  }

  return errors;
}

// 🍊 Reusable form field wrapper. Keeps the layout consistent
// without a full form library — we only have 6 fields.
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>}
    </div>
  );
}

const inputClass = `w-full px-2.5 py-1.5 text-xs font-mono bg-slate-800/50 border border-slate-700 rounded
  text-slate-200 placeholder-slate-600
  focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20
  transition-colors`;

// 🍊 The NetworkConfigModal is a proper dialog (not a route or page).
// It appears when the user clicks "Start Network" and collects configuration
// before actually starting. This separation matters because starting a network
// takes time (Docker containers, genesis generation) — you want to validate
// inputs BEFORE committing to that process.
//
// Design: overlay with backdrop blur, centered card, escape to close.
export default function NetworkConfigModal({ isOpen, onClose, onStart }: NetworkConfigModalProps) {
  const [config, setConfig] = useState<NetworkConfig>({ ...DEFAULT_CONFIG });

  if (!isOpen) return null;

  const errors = validateConfig(config);
  const canStart = errors.length === 0;

  const handleStart = () => {
    if (!canStart) return;
    onStart(config);
    onClose();
  };

  // 🍊 Close on backdrop click or Escape key.
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-200">Configure Network</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <Field label="Network Name" hint="Lowercase, alphanumeric, hyphens allowed">
            <input
              type="text"
              value={config.name}
              onChange={e => setConfig(c => ({ ...c, name: e.target.value }))}
              placeholder="dev-network"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Chain ID" hint="1337 for local dev">
              <input
                type="number"
                value={config.chainId}
                onChange={e => setConfig(c => ({ ...c, chainId: parseInt(e.target.value) || 0 }))}
                className={inputClass}
              />
            </Field>

            <Field label="Block Period" hint="Seconds between blocks">
              <input
                type="number"
                value={config.blockPeriod}
                onChange={e => setConfig(c => ({ ...c, blockPeriod: parseInt(e.target.value) || 0 }))}
                min={1}
                max={60}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Subnet" hint="Docker network subnet">
            <input
              type="text"
              value={config.subnet}
              onChange={e => setConfig(c => ({ ...c, subnet: e.target.value }))}
              placeholder="172.20.0.0/16"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Validators" hint="PoA signer nodes">
              <input
                type="number"
                value={config.validatorCount}
                onChange={e => setConfig(c => ({ ...c, validatorCount: parseInt(e.target.value) || 0 }))}
                min={1}
                max={10}
                className={inputClass}
              />
            </Field>

            <Field label="RPC Nodes" hint="JSON-RPC endpoints">
              <input
                type="number"
                value={config.rpcCount}
                onChange={e => setConfig(c => ({ ...c, rpcCount: parseInt(e.target.value) || 0 }))}
                min={0}
                max={5}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Node summary */}
          <div className="flex items-center justify-between px-3 py-2 rounded bg-slate-800/50 border border-slate-800">
            <span className="text-[10px] text-slate-500 uppercase">Total Nodes</span>
            <span className="text-xs text-slate-300 font-mono font-bold">
              {config.validatorCount + config.rpcCount}
            </span>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="space-y-1 p-2.5 rounded bg-red-500/10 border border-red-500/20">
              {errors.map((err, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                  <span className="text-[10px] text-red-300">{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors
                       bg-emerald-600 hover:bg-emerald-500 text-white
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
          >
            <Play className="w-3.5 h-3.5" /> Start Network
          </button>
        </div>
      </div>
    </div>
  );
}
