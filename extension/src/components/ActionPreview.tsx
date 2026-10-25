import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Lock,
  Loader2,
} from 'lucide-react';
import { BrowserAction } from '../types/index.js';

interface ActionPreviewProps {
  action: BrowserAction;
  activeUrl?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

export const ActionPreview: React.FC<ActionPreviewProps> = ({
  action,
  activeUrl,
  onConfirm,
  onCancel,
  isExecuting = false,
}) => {
  return (
    <div className="my-3 p-3.5 rounded-2xl bg-black/70 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/80 animate-fade-in font-sans">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-white tracking-wide">
            Approval Required
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
          {action.riskLevel || 'medium'} Risk
        </span>
      </div>

      {/* Description */}
      <div className="mb-3">
        <div className="text-xs font-medium text-white mb-1">
          {action.description}
        </div>
        {activeUrl && (
          <div className="flex items-center space-x-1 text-[11px] text-white/50 truncate">
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">Target: {activeUrl}</span>
          </div>
        )}
      </div>

      {/* Form Fields Preview if applicable */}
      {action.fields && action.fields.length > 0 && (
        <div className="mb-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-white/70">
              Values to be entered:
            </span>
            <div className="flex items-center space-x-1 text-[10px] text-white/50">
              <Lock className="w-3 h-3 text-orange-400" />
              <span>Preview only</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {action.fields.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10"
              >
                <span className="text-white/50 font-mono text-[11px] truncate max-w-[45%]">
                  {f.label || f.name || f.selector || 'Field'}:
                </span>
                <span className="text-white font-medium truncate max-w-[50%] text-right">
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-60 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-orange-600/30 cursor-pointer active:scale-[0.98]"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Executing Action...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 stroke-[2.2]" />
              <span>Approve & Execute</span>
            </>
          )}
        </button>

        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer active:scale-[0.98]"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Dismiss Action</span>
        </button>
      </div>
    </div>
  );
};
