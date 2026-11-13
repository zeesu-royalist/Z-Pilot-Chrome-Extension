import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  History,
  Copy,
  CheckCheck,
  Delete,
  Trash2,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { StorageService } from '../services/storage.js';
import {
  AngleMode,
  evaluateExpression,
  formatResultNumber,
} from '../services/calculator.js';
import { CalculationRecord } from '../types/index.js';

interface CalculatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculatorPanel: React.FC<CalculatorPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [expression, setExpression] = useState('');
  const [lastEquation, setLastEquation] = useState('');
  const [result, setResult] = useState('0');
  const [livePreview, setLivePreview] = useState('');
  const [justCalculated, setJustCalculated] = useState(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');
  const [memory, setMemory] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState<boolean>(false);
  const [history, setHistory] = useState<CalculationRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayEndRef = useRef<HTMLDivElement>(null);

  // Load persistent history on open
  useEffect(() => {
    if (isOpen) {
      StorageService.getCalculationHistory().then((h) => setHistory(h));
    }
  }, [isOpen]);

  // Auto-scroll expression display to the end
  useEffect(() => {
    displayEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [expression]);

  // Live preview calculation as user inputs formulas
  useEffect(() => {
    const trimmed = expression.trim();
    if (!trimmed || justCalculated) {
      setLivePreview('');
      return;
    }

    // Only compute live preview if expression has an operator or function
    if (/[+\-−×÷^%√]/.test(trimmed) || /[a-zA-Z]+\(/.test(trimmed)) {
      const res = evaluateExpression(trimmed, angleMode);
      if (res.formatted !== 'Error') {
        setLivePreview(res.formatted);
      } else {
        setLivePreview('');
      }
    } else {
      setLivePreview('');
    }
  }, [expression, angleMode, justCalculated]);

  const isOperator = (ch: string) => /[+\-−×÷^]/.test(ch);

  // Intelligent Token Input Handler
  const handlePress = useCallback((token: string) => {
    setLastEquation('');

    setExpression((prev) => {
      const trimmed = prev.trim();

      // 1. If user just pressed '=', handle next keypress intelligently
      if (justCalculated) {
        setJustCalculated(false);
        // If user presses an operator, continue from previous result
        if (isOperator(token) || token === '%') {
          return prev + ' ' + token + ' ';
        }
        // If decimal point, start '0.'
        if (token === '.') {
          return '0.';
        }
        // If digit or function, start fresh with the new input
        return token;
      }

      // 2. Binary Operators (+, −, ×, ÷, ^)
      if (isOperator(token)) {
        if (!trimmed || trimmed === '0') {
          if (token === '−' || token === '-') return '-';
          return '0 ' + token + ' ';
        }

        // If the expression currently ends with an operator, REPLACE IT!
        // Prevents ugly corrupted sequences like "+-×÷%-+"
        const lastOpMatch = trimmed.match(/([+\-−×÷^])$/);
        if (lastOpMatch) {
          return trimmed.slice(0, -1).trimEnd() + ' ' + token + ' ';
        }

        // If ending with open paren '(', allow minus for negative number
        if (trimmed.endsWith('(')) {
          if (token === '−' || token === '-') return trimmed + '-';
          return prev;
        }

        return trimmed + ' ' + token + ' ';
      }

      // 3. Percentage (%)
      if (token === '%') {
        if (!trimmed || trimmed.endsWith('(') || isOperator(trimmed.slice(-1))) {
          return prev;
        }
        return trimmed + '%';
      }

      // 4. Decimal (.)
      if (token === '.') {
        if (!trimmed || isOperator(trimmed.slice(-1)) || trimmed.endsWith('(')) {
          return prev + '0.';
        }
        const parts = trimmed.split(/[\s+\-−×÷^()]+/);
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          return prev; // Disallow multiple decimals in the same number
        }
        return prev + '.';
      }

      // 5. Digits (0 - 9)
      if (/^\d$/.test(token)) {
        if (trimmed === '0') {
          return token;
        }
        if (/[)πe%]$/.test(trimmed)) {
          return trimmed + ' × ' + token;
        }
        return prev + token;
      }

      // 6. Reciprocal function (1/x -> 1/()
      if (token === '1/(') {
        if (trimmed && !isOperator(trimmed.slice(-1)) && !trimmed.endsWith('(')) {
          return `1/(${trimmed})`;
        }
        return prev + '1/(';
      }

      // 7. Functions: sin(, cos(, tan(, ln(, log(, √(, abs(
      if (token.endsWith('(')) {
        if (trimmed === '0' || !trimmed) {
          return token;
        }
        if (/[\d)πe%]$/.test(trimmed)) {
          return trimmed + ' × ' + token;
        }
        return prev + token;
      }

      // 8. Constants (π, e)
      if (token === 'π' || token === 'e') {
        if (trimmed === '0' || !trimmed) {
          return token;
        }
        if (/[\d)πe%]$/.test(trimmed)) {
          return trimmed + ' × ' + token;
        }
        return prev + token;
      }

      // 9. Closing parenthesis ')'
      if (token === ')') {
        const openCount = (prev.match(/\(/g) || []).length;
        const closeCount = (prev.match(/\)/g) || []).length;
        if (openCount > closeCount && !isOperator(trimmed.slice(-1)) && !trimmed.endsWith('(')) {
          return prev + ')';
        }
        return prev;
      }

      // 10. Postfix (^2, !)
      if (token === '^2' || token === '!') {
        if (/[\d)πe%]$/.test(trimmed)) {
          return trimmed + token;
        }
        return prev;
      }

      return prev + token;
    });
  }, [justCalculated]);

  // Clear all
  const handleClear = () => {
    setExpression('');
    setLastEquation('');
    setResult('0');
    setLivePreview('');
    setJustCalculated(false);
  };

  // Backspace
  const handleBackspace = () => {
    if (justCalculated) {
      handleClear();
      return;
    }
    setExpression((prev) => {
      // If ends with spaced operator " + ", remove all 3 chars
      if (/\s[+\-−×÷^]\s$/.test(prev)) {
        return prev.slice(0, -3);
      }
      // If ends with function like "sin(", "abs(", remove the whole token
      const fnMatch = prev.match(/([a-zA-Z]+\()$/);
      if (fnMatch) {
        return prev.slice(0, -fnMatch[1].length);
      }
      return prev.slice(0, -1);
    });
  };

  // Calculate final result
  const handleCalculate = async () => {
    const trimmed = expression.trim();
    if (!trimmed) return;

    const res = evaluateExpression(trimmed, angleMode);
    if (res.formatted !== 'Error') {
      const finalVal = res.formatted;
      setResult(finalVal);
      setLastEquation(trimmed + ' =');
      setExpression(finalVal);
      setLivePreview('');
      setJustCalculated(true);

      // Save to persistent storage
      const saved = await StorageService.saveCalculation({
        expression: trimmed,
        result: finalVal,
      });
      setHistory((prev) => [saved, ...prev].slice(0, 100));
    } else {
      setResult('Error');
      setJustCalculated(true);
    }
  };

  // Toggle +/-
  const handleToggleSign = () => {
    if (!expression) return;
    if (expression.startsWith('-(') && expression.endsWith(')')) {
      setExpression(expression.slice(2, -1));
    } else if (expression.startsWith('-')) {
      setExpression(expression.slice(1));
    } else {
      setExpression(`-(${expression})`);
    }
  };

  // Memory operations
  const handleMemory = (op: 'MC' | 'MR' | 'M+' | 'M-') => {
    const currentVal = Number(livePreview || result || expression) || 0;
    if (op === 'MC') {
      setMemory(0);
      setHasMemory(false);
    } else if (op === 'MR') {
      handlePress(formatResultNumber(memory));
    } else if (op === 'M+') {
      const next = memory + currentVal;
      setMemory(next);
      setHasMemory(next !== 0);
    } else if (op === 'M-') {
      const next = memory - currentVal;
      setMemory(next);
      setHasMemory(next !== 0);
    }
  };

  // What is shown on the Main Big Display
  const displayMain = (() => {
    if (result === 'Error' && justCalculated) return 'Error';
    if (!expression.trim()) return '0';
    if (justCalculated) return result;
    // While typing an expression with operators, show the live calculated answer
    if (livePreview) return livePreview;
    // While typing a single number, show that number directly
    return expression;
  })();

  // What is shown on the formula top line
  const displayFormula = (() => {
    if (lastEquation) return lastEquation;
    if (livePreview) return expression;
    if (expression && /[+\-−×÷^%√]/.test(expression)) return expression;
    return ' ';
  })();

  // Copy result
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayMain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  // Load from history
  const handleSelectHistory = (item: CalculationRecord) => {
    setExpression(item.expression);
    setResult(item.result);
    setLastEquation(item.expression + ' =');
    setJustCalculated(true);
    setShowHistory(false);
  };

  const handleClearHistory = async () => {
    await StorageService.clearCalculationHistory();
    setHistory([]);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handlePress(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handlePress('.');
      } else if (e.key === '+') {
        e.preventDefault();
        handlePress('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handlePress('−');
      } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        handlePress('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handlePress('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        handlePress('%');
      } else if (e.key === '(' || e.key === ')') {
        e.preventDefault();
        handlePress(e.key);
      } else if (e.key === '^') {
        e.preventDefault();
        handlePress('^');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleCalculate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePress]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white tracking-tight">
              Scientific Calculator
            </span>
          </div>
        </div>

        {/* History & Close Buttons */}
        <div className="flex items-center space-x-1.5">
          {/* History Drawer Toggle */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            title="Calculation History"
            className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer active:scale-95 ${
              showHistory
                ? 'bg-orange-500/30 border-orange-500/50 text-orange-300'
                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
            }`}
          >
            <History className="w-4 h-4" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Close calculator"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-col p-3 overflow-hidden relative space-y-2.5">
        {/* Display Screen */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-b from-black/80 to-[#140803] border border-orange-500/25 shadow-xl shadow-black/40 flex flex-col justify-between min-h-[96px] shrink-0">
          {/* Top Status Indicators */}
          <div className="flex items-center justify-between text-xs text-white/40">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setAngleMode(angleMode === 'deg' ? 'rad' : 'deg')}
                title="Switch Angle Mode (Degree / Radian)"
                className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-orange-500/25 text-[10px] font-mono font-bold text-orange-300 border border-white/10 cursor-pointer transition-colors"
              >
                {angleMode.toUpperCase()}
              </button>
              {hasMemory && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-[9px] font-mono text-amber-300 font-bold">
                  M ({formatResultNumber(memory)})
                </span>
              )}
            </div>

            <button
              onClick={handleCopy}
              title="Copy result"
              className="flex items-center space-x-1 text-[11px] text-white/50 hover:text-orange-300 transition-colors cursor-pointer"
            >
              {copied ? (
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Formula Line (Scrollable) */}
          <div className="overflow-x-auto whitespace-nowrap text-right text-xs text-white/50 font-mono scrollbar-none py-0.5 min-h-[18px]">
            <span>{displayFormula}</span>
            <div ref={displayEndRef} className="inline-block w-1" />
          </div>

          {/* Main Big Result / Current Input display */}
          <div className="text-right text-2xl font-bold text-amber-50 font-mono tracking-tight overflow-x-auto scrollbar-none select-text">
            {displayMain}
          </div>
        </div>

        {/* History Overlay Drawer */}
        {showHistory ? (
          <div className="flex-1 rounded-2xl bg-black/60 border border-orange-500/25 p-3 flex flex-col overflow-hidden animate-fade-in shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-bold text-white/80">Calculation History</span>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-[11px] text-white/40 hover:text-red-400 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {history.length === 0 ? (
                <p className="text-center text-xs text-white/40 py-8">
                  No calculations saved yet
                </p>
              ) : (
                history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleSelectHistory(h)}
                    className="w-full text-left p-2.5 rounded-xl bg-white/5 hover:bg-orange-500/15 border border-white/10 hover:border-orange-500/40 transition-all group cursor-pointer"
                  >
                    <p className="text-xs text-white/50 font-mono truncate">{h.expression}</p>
                    <p className="text-sm font-bold text-amber-300 font-mono">{h.result}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Permanent Scientific Keypad */
          <div className="flex-1 flex flex-col justify-between space-y-1.5 overflow-y-auto no-scrollbar pb-1">
            {/* Scientific Function Rows */}
            <div className="space-y-1 shrink-0">
              {/* Memory row */}
              <div className="grid grid-cols-4 gap-1">
                {(['MC', 'MR', 'M+', 'M-'] as const).map((mOp) => (
                  <button
                    key={mOp}
                    onClick={() => handleMemory(mOp)}
                    className="py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-white/70 hover:text-white border border-white/10 transition-all active:scale-95 cursor-pointer"
                  >
                    {mOp}
                  </button>
                ))}
              </div>

              {/* Trig & Log Row */}
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'sin', val: 'sin(' },
                  { label: 'cos', val: 'cos(' },
                  { label: 'tan', val: 'tan(' },
                  { label: 'ln', val: 'ln(' },
                  { label: 'log', val: 'log(' },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => handlePress(btn.val)}
                    className="py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-200 border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Powers & Roots Row */}
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'x²', val: '^2' },
                  { label: 'xʸ', val: '^' },
                  { label: '√', val: '√(' },
                  { label: 'n!', val: '!' },
                  { label: '|x|', val: 'abs(' },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => handlePress(btn.val)}
                    className="py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-200 border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Constants & Parens Row */}
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'π', val: 'π' },
                  { label: 'e', val: 'e' },
                  { label: '(', val: '(' },
                  { label: ')', val: ')' },
                  { label: '1/x', val: '1/(' },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => handlePress(btn.val)}
                    className="py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-200 border border-amber-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Numeric & Arithmetic Grid */}
            <div className="grid grid-cols-4 gap-1.5 flex-1">
              {/* Row 1 */}
              <button
                onClick={handleClear}
                className="py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/35 text-red-300 font-bold text-sm transition-all active:scale-95 cursor-pointer"
              >
                C
              </button>
              <button
                onClick={handleBackspace}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold text-sm flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePress('%')}
                className="py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 font-bold text-base transition-all active:scale-95 cursor-pointer"
              >
                %
              </button>
              <button
                onClick={() => handlePress('÷')}
                className="py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/35 text-orange-200 font-bold text-lg transition-all active:scale-95 cursor-pointer"
              >
                ÷
              </button>

              {/* Row 2 */}
              <button
                onClick={() => handlePress('7')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                7
              </button>
              <button
                onClick={() => handlePress('8')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                8
              </button>
              <button
                onClick={() => handlePress('9')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                9
              </button>
              <button
                onClick={() => handlePress('×')}
                className="py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/35 text-orange-200 font-bold text-lg transition-all active:scale-95 cursor-pointer"
              >
                ×
              </button>

              {/* Row 3 */}
              <button
                onClick={() => handlePress('4')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                4
              </button>
              <button
                onClick={() => handlePress('5')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                5
              </button>
              <button
                onClick={() => handlePress('6')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                6
              </button>
              <button
                onClick={() => handlePress('−')}
                className="py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/35 text-orange-200 font-bold text-lg transition-all active:scale-95 cursor-pointer"
              >
                −
              </button>

              {/* Row 4 */}
              <button
                onClick={() => handlePress('1')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                1
              </button>
              <button
                onClick={() => handlePress('2')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                2
              </button>
              <button
                onClick={() => handlePress('3')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                3
              </button>
              <button
                onClick={() => handlePress('+')}
                className="py-2.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/35 text-orange-200 font-bold text-lg transition-all active:scale-95 cursor-pointer"
              >
                +
              </button>

              {/* Row 5 */}
              <button
                onClick={handleToggleSign}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-semibold text-sm transition-all active:scale-95 cursor-pointer"
              >
                ±
              </button>
              <button
                onClick={() => handlePress('0')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                0
              </button>
              <button
                onClick={() => handlePress('.')}
                className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base transition-all active:scale-95 cursor-pointer"
              >
                .
              </button>
              <button
                onClick={handleCalculate}
                className="py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-lg shadow-lg shadow-orange-600/30 border border-orange-400/40 transition-all active:scale-95 cursor-pointer"
              >
                =
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
