import { useState } from 'react';
import { X, Plus } from 'lucide-react';

export interface NewNodeConfig {
  name: string;
  type: 'validator' | 'rpc' | 'normal';
  enableRpc: boolean;
}

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (config: NewNodeConfig) => void;
  existingNames: string[];
}

// 🍊 Modal for adding a new node to a running network.
// In a real Besu setup you can add nodes dynamically — validators need
// a governance vote, but RPC/normal nodes can join freely.
// This modal keeps it simple: pick a name and type.
export default function AddNodeModal({ isOpen, onClose, onAdd, existingNames }: AddNodeModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'validator' | 'rpc' | 'normal'>('rpc');

  if (!isOpen) return null;

  const nameError = name.trim() === ''
    ? null // don't show error while empty
    : !/^[a-z0-9-]+$/.test(name)
      ? 'Lowercase alphanumeric with hyphens only'
      : existingNames.includes(name)
        ? 'Name already in use'
        : null;

  const canAdd = name.trim() !== '' && !nameError;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      name,
      type,
      enableRpc: type === 'rpc',
    });
    setName('');
    setType('rpc');
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const typeOptions: { value: 'validator' | 'rpc' | 'normal'; label: string; desc: string; color: string }[] = [
    { value: 'validator', label: 'Validator', desc: 'Signs and proposes blocks', color: 'violet' },
    { value: 'rpc', label: 'RPC', desc: 'JSON-RPC endpoint for clients', color: 'blue' },
    { value: 'normal', label: 'Normal', desc: 'Sync-only peer node', color: 'slate' },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-200">Add Node</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Node Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. rpc-2"
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-800/50 border border-slate-700 rounded
                         text-slate-200 placeholder-slate-600
                         focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20
                         transition-colors"
            />
            {nameError && <p className="text-[10px] text-red-400 mt-0.5">{nameError}</p>}
          </div>

          {/* Type selector */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">
              Node Type
            </label>
            <div className="space-y-1.5">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-colors
                    ${type === opt.value
                      ? `border-${opt.color}-500/40 bg-${opt.color}-500/10`
                      : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                    }`}
                >
                  <div>
                    <span className={`text-xs font-medium ${
                      type === opt.value ? `text-${opt.color}-300` : 'text-slate-300'
                    }`}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    type === opt.value
                      ? `border-${opt.color}-400 bg-${opt.color}-400`
                      : 'border-slate-600'
                  }`} />
                </button>
              ))}
            </div>
          </div>
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
            onClick={handleAdd}
            disabled={!canAdd}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors
                       bg-violet-600 hover:bg-violet-500 text-white
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-violet-600"
          >
            <Plus className="w-3.5 h-3.5" /> Add Node
          </button>
        </div>
      </div>
    </div>
  );
}
