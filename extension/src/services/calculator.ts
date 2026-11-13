/**
 * Z-Pilot Advanced Calculator Math Engine
 * 100% CSP-Safe Pure Parser (No eval / No new Function for MV3 compliance).
 * Evaluates arithmetic, trigonometry (Deg/Rad), logarithms, powers, factorials, percentages, and constants.
 */

export type AngleMode = 'deg' | 'rad';

export interface CalculationResult {
  value: number;
  formatted: string;
  error?: string;
}

export function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

/**
 * Cleanly format numbers to avoid floating point anomalies like 0.1 + 0.2 = 0.30000000000000004
 */
export function formatResultNumber(num: number): string {
  if (!Number.isFinite(num)) {
    if (Number.isNaN(num)) return 'Error';
    return num > 0 ? 'Infinity' : '-Infinity';
  }
  // Trim tiny float inaccuracies
  const fixed = Number(num.toPrecision(12));
  return String(fixed);
}

/**
 * Sanitize expression: normalize symbols, collapse duplicate operators, auto-close parens
 */
export function sanitizeExpression(input: string): string {
  let str = input.trim();
  if (!str) return '0';

  // Normalize Unicode math symbols
  str = str
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, `(${Math.PI})`)
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z0-9])/g, `(${Math.E})`);

  // Handle sqrt symbol √4 or √(4)
  str = str.replace(/√\s*(\d+(\.\d+)?)/g, 'sqrt($1)');
  str = str.replace(/√\(/g, 'sqrt(');

  // Remove percentage directly following an operator: e.g. "+ %" -> "+"
  str = str.replace(/([+*\/^-])\s*%+/g, '$1');

  // Collapse consecutive operators:
  // Allow unary minus after operator: "* -", "/ -", "+ -"
  str = str.replace(/([+*\/^])\s*([+*\/^])/g, '$2');
  str = str.replace(/-\s*([+*\/^])/g, '$1');

  // Strip trailing binary operators (+, -, *, /, ^)
  str = str.replace(/[+\-*\/^]+$/, '');

  // Prepend 0 to standalone decimals: .5 -> 0.5
  str = str.replace(/(^|[^0-9])\./g, '$10.');

  // Auto-close open parentheses
  let openCount = 0;
  for (const ch of str) {
    if (ch === '(') openCount++;
    if (ch === ')') openCount--;
  }
  while (openCount > 0) {
    str += ')';
    openCount--;
  }

  // Implicit multiplication: number before ( or function
  str = str.replace(/(\d)\s*\(/g, '$1*(');
  str = str.replace(/\)\s*(\d)/g, ')*$1');
  str = str.replace(/\)\s*\(/g, ')*(');
  str = str.replace(/(\d)\s*([a-zA-Z]+)/g, '$1*$2');

  return str.trim() || '0';
}

/**
 * Evaluates an advanced math expression safely without eval or new Function
 */
export function evaluateExpression(expr: string, angleMode: AngleMode = 'deg'): CalculationResult {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { value: 0, formatted: '0' };
  }

  try {
    const str = sanitizeExpression(trimmed);

    let pos = 0;

    function peek(): string {
      while (pos < str.length && str[pos] === ' ') pos++;
      return str[pos] || '';
    }

    function get(): string {
      while (pos < str.length && str[pos] === ' ') pos++;
      return str[pos++];
    }

    function parseNumber(): number {
      while (pos < str.length && str[pos] === ' ') pos++;
      const start = pos;
      let hasDot = false;
      while (pos < str.length) {
        const c = str[pos];
        if (c >= '0' && c <= '9') {
          pos++;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          pos++;
        } else {
          break;
        }
      }
      const sub = str.slice(start, pos);
      return parseFloat(sub);
    }

    function parseFactor(): number {
      const ch = peek();
      if (ch === '+') {
        get();
        return parseFactor();
      }
      if (ch === '-') {
        get();
        return -parseFactor();
      }
      if (ch === '(') {
        get();
        const val = parseExpressionInternal();
        if (peek() === ')') get();
        return val;
      }
      if (/[a-zA-Z]/.test(ch)) {
        const start = pos;
        while (pos < str.length && /[a-zA-Z0-9]/.test(str[pos])) pos++;
        const fn = str.slice(start, pos).toLowerCase();
        const arg = parseFactor();
        if (fn === 'sin') return angleMode === 'deg' ? Math.sin((arg * Math.PI) / 180) : Math.sin(arg);
        if (fn === 'cos') return angleMode === 'deg' ? Math.cos((arg * Math.PI) / 180) : Math.cos(arg);
        if (fn === 'tan') return angleMode === 'deg' ? Math.tan((arg * Math.PI) / 180) : Math.tan(arg);
        if (fn === 'asin') return angleMode === 'deg' ? (Math.asin(arg) * 180) / Math.PI : Math.asin(arg);
        if (fn === 'acos') return angleMode === 'deg' ? (Math.acos(arg) * 180) / Math.PI : Math.acos(arg);
        if (fn === 'atan') return angleMode === 'deg' ? (Math.atan(arg) * 180) / Math.PI : Math.atan(arg);
        if (fn === 'sqrt') return Math.sqrt(arg);
        if (fn === 'cbrt') return Math.cbrt(arg);
        if (fn === 'ln') return Math.log(arg);
        if (fn === 'log') return Math.log10(arg);
        if (fn === 'abs') return Math.abs(arg);
        return arg;
      }
      return parseNumber();
    }

    function parsePostfix(): number {
      let val = parseFactor();
      while (true) {
        if (peek() === '!') {
          get();
          val = factorial(val);
        } else if (peek() === '%') {
          get();
          val = val / 100;
        } else {
          break;
        }
      }
      return val;
    }

    function parsePower(): number {
      const left = parsePostfix();
      if (peek() === '^') {
        get();
        const right = parsePower();
        return Math.pow(left, right);
      }
      return left;
    }

    function parseTerm(): number {
      let val = parsePower();
      while (true) {
        const op = peek();
        if (op === '*' || op === '/') {
          get();
          const next = parsePower();
          if (op === '*') val *= next;
          else if (op === '/') val /= next;
        } else {
          break;
        }
      }
      return val;
    }

    function parseExpressionInternal(): number {
      let val = parseTerm();
      while (true) {
        const op = peek();
        if (op === '+' || op === '-') {
          get();
          const next = parseTerm();
          if (op === '+') val += next;
          else val -= next;
        } else {
          break;
        }
      }
      return val;
    }

    const resultVal = parseExpressionInternal();

    if (typeof resultVal !== 'number' || Number.isNaN(resultVal)) {
      return { value: NaN, formatted: 'Error', error: 'Invalid calculation' };
    }

    return {
      value: resultVal,
      formatted: formatResultNumber(resultVal),
    };
  } catch (err) {
    return {
      value: NaN,
      formatted: 'Error',
      error: (err as Error).message,
    };
  }
}
