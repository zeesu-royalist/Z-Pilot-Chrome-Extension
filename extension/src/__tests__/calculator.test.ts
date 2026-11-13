import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateExpression,
  factorial,
} from '../services/calculator.js';
import { StorageService } from '../services/storage.js';

describe('Advanced Calculator Engine & Storage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.clearCalculationHistory();
  });

  describe('Basic Arithmetic & Precedence', () => {
    it('evaluates standard addition and subtraction', () => {
      const res = evaluateExpression('15 + 27 - 8');
      expect(res.formatted).toBe('34');
      expect(res.value).toBe(34);
    });

    it('respects multiplication and division precedence over addition', () => {
      const res = evaluateExpression('10 + 5 × 4 ÷ 2');
      expect(res.formatted).toBe('20');
    });

    it('handles parentheses correctly', () => {
      const res = evaluateExpression('(10 + 5) × 2');
      expect(res.formatted).toBe('30');
    });

    it('handles floating point additions cleanly', () => {
      const res = evaluateExpression('0.1 + 0.2');
      expect(res.formatted).toBe('0.3');
    });
  });

  describe('Powers, Roots & Factorials', () => {
    it('calculates powers using ^ operator', () => {
      const res = evaluateExpression('2 ^ 8');
      expect(res.formatted).toBe('256');
    });

    it('calculates square root', () => {
      const res = evaluateExpression('√(144)');
      expect(res.formatted).toBe('12');
    });

    it('calculates factorials with ! operator', () => {
      expect(factorial(5)).toBe(120);
      expect(factorial(0)).toBe(1);
      const res = evaluateExpression('5!');
      expect(res.formatted).toBe('120');
    });
  });

  describe('Trigonometry & Angle Modes', () => {
    it('evaluates sin, cos, tan in DEG mode', () => {
      const sin30 = evaluateExpression('sin(30)', 'deg');
      expect(Number(sin30.formatted)).toBeCloseTo(0.5, 4);

      const cos60 = evaluateExpression('cos(60)', 'deg');
      expect(Number(cos60.formatted)).toBeCloseTo(0.5, 4);

      const tan45 = evaluateExpression('tan(45)', 'deg');
      expect(Number(tan45.formatted)).toBeCloseTo(1, 4);
    });

    it('evaluates trig in RAD mode', () => {
      const sinPiOver2 = evaluateExpression(`sin(${Math.PI / 2})`, 'rad');
      expect(Number(sinPiOver2.formatted)).toBeCloseTo(1, 4);
    });

    it('evaluates constants π and e', () => {
      const piRes = evaluateExpression('π');
      expect(Number(piRes.formatted)).toBeCloseTo(Math.PI, 6);

      const eRes = evaluateExpression('e');
      expect(Number(eRes.formatted)).toBeCloseTo(Math.E, 6);
    });
  });

  describe('Error Handling', () => {
    it('handles empty input gracefully', () => {
      const res = evaluateExpression('   ');
      expect(res.formatted).toBe('0');
      expect(res.value).toBe(0);
    });

    it('returns Error on invalid syntax or disallowed tokens', () => {
      const res = evaluateExpression('alert("hack")');
      expect(res.formatted).toBe('Error');
    });

    it('handles division by zero', () => {
      const res = evaluateExpression('10 ÷ 0');
      expect(res.formatted).toBe('Infinity');
    });

    it('safely handles trailing operators and multiple consecutive operators', () => {
      const res1 = evaluateExpression('5638565896-×÷%-+');
      expect(res1.formatted).toBe('5638565896');

      const res2 = evaluateExpression('100 + - 20');
      expect(res2.formatted).toBe('80');
    });

    it('auto-closes open parentheses and evaluates properly', () => {
      const res = evaluateExpression('sin(30', 'deg');
      expect(Number(res.formatted)).toBeCloseTo(0.5, 4);

      const parenRes = evaluateExpression('(10 + 5');
      expect(parenRes.formatted).toBe('15');
    });

    it('evaluates percentages correctly', () => {
      const pctRes = evaluateExpression('200 × 15%');
      expect(pctRes.formatted).toBe('30');
    });
  });

  describe('Calculation History Persistence', () => {
    it('saves and retrieves calculation tape history', async () => {
      const record = await StorageService.saveCalculation({
        expression: '25 × 4 + 10',
        result: '110',
      });

      expect(record.id).toBeTruthy();
      expect(record.expression).toBe('25 × 4 + 10');
      expect(record.result).toBe('110');

      const all = await StorageService.getCalculationHistory();
      expect(all).toHaveLength(1);
      expect(all[0].result).toBe('110');
    });

    it('clears calculation history', async () => {
      await StorageService.saveCalculation({ expression: '1+1', result: '2' });
      await StorageService.saveCalculation({ expression: '2+2', result: '4' });

      expect(await StorageService.getCalculationHistory()).toHaveLength(2);

      await StorageService.clearCalculationHistory();
      expect(await StorageService.getCalculationHistory()).toHaveLength(0);
    });
  });
});
