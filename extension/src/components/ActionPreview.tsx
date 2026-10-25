import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Lock,
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
    <div className="my-3 p-3.5 rounded-xl bg-pilot-panel border-2 border-pilot-primary/40 shadow-xl shadow-black/40 animate-fade-in">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-pilot-border/80">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-md bg-amber-500/10 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-white tracking-wide">
            Approval Required
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {action.riskLevel || 'medium'} Risk
        </span>
      </div>

      {/* Description */}
      <div className="mb-3">
        <div className="text-xs font-medium text-pilot-text-primary mb-1">
          {action.description}
        </div>
        {activeUrl && (
          <div className="flex items-center space-x-1 text-[11px] text-pilot-text-muted truncate">
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate">Target: {activeUrl}</span>
          </div>
        )}
      </div>

      {/* Form Fields Preview if applicable */}
      {action.fields && action.fields.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-pilot-card border border-pilot-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-pilot-text-secondary">
              Values to be entered:
            </span>
            <div className="flex items-center space-x-1 text-[10px] text-pilot-text-muted">
              <Lock className="w-3 h-3 text-pilot-success" />
              <span>Preview only</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {action.fields.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs px-2 py-1 rounded bg-pilot-panel border border-pilot-border/50"
              >
                <span className="text-pilot-text-secondary font-mono text-[11px] truncate max-w-[45%]">
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
      <div className="flex items-center space-x-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className="flex-1 py-1.5 px-3 rounded-lg bg-pilot-primary hover:bg-pilot-primaryHover disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center space-x-1.5 transition-colors shadow-md shadow-pilot-primary/20"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isExecuting ? 'Running...' : 'Approve & Execute'}</span>
        </button>

        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="py-1.5 px-3 rounded-lg bg-pilot-card hover:bg-pilot-cardHover border border-pilot-border text-pilot-text-secondary hover:text-white text-xs flex items-center space-x-1 transition-colors"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Dismiss</span>
        </button>
      </div>
    </div>
  );
};
