import { describe, it, expect } from 'vitest';
import { resolveElementBindings, extractTextPlaceholders, hasDynamicTextTemplate } from '../src/bindings/resolver.js';
import type { TextDesignElement, DesignDataContext } from '@document-tool/contracts';

describe('Phase 6.6.4 — Mixed Static + Dynamic Text Binding', () => {
  const context: DesignDataContext = {
    record: {
      Employee: {
        Name: 'Akash',
        Department: 'Sales',
        Code: 'EMP001',
        Active: true,
        Age: 30,
        Address: { City: 'Pune' },
        EmptyField: null,
        UndefinedField: undefined
      }
    }
  };

  const createTextElement = (text: string, mode?: 'FULL' | 'TEMPLATE'): TextDesignElement => ({
    id: 'text-1',
    type: 'TEXT',
    name: 'Text',
    text,
    textBindingMode: mode,
    position: { xMm: 0, yMm: 0 },
    size: { widthMm: 10, heightMm: 10 },
    rotationDeg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 1,
    style: {
      fontFamily: 'Arial',
      fontSizePt: 12,
      fontWeight: 400,
      italic: false,
      underline: false,
      color: '#000',
      alignment: 'LEFT',
      lineHeight: 1.2,
      letterSpacingPt: 0
    }
  });

  describe('extractTextPlaceholders', () => {
    it('extracts single placeholder', () => {
      expect(extractTextPlaceholders('Hello {{Employee.Name}}')).toEqual(['Employee.Name']);
    });
    it('extracts multiple placeholders', () => {
      expect(extractTextPlaceholders('{{A}} and {{B}}')).toEqual(['A', 'B']);
    });
    it('deduplicates repeated placeholders', () => {
      expect(extractTextPlaceholders('{{A}} {{A}}')).toEqual(['A']);
    });
    it('trims whitespace', () => {
      expect(extractTextPlaceholders('{{ A.B }}')).toEqual(['A.B']);
    });
  });

  describe('hasDynamicTextTemplate', () => {
    it('returns true for templates', () => {
      expect(hasDynamicTextTemplate('Hello {{X}}')).toBe(true);
    });
    it('returns false for raw text', () => {
      expect(hasDynamicTextTemplate('Hello {X}')).toBe(false);
    });
  });

  describe('resolveElementBindings (TEMPLATE mode)', () => {
    it('resolves string values correctly', () => {
      const el = createTextElement('Hello {{Employee.Name}}', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Hello Akash');
      expect(el.text).toBe('Hello {{Employee.Name}}'); // Immutability
    });

    it('resolves multiple and repeated placeholders', () => {
      const el = createTextElement('{{Employee.Name}} ({{Employee.Code}}) - {{Employee.Name}}', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Akash (EMP001) - Akash');
    });

    it('resolves numbers and booleans', () => {
      const el = createTextElement('Age: {{Employee.Age}}, Active: {{Employee.Active}}', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Age: 30, Active: true');
    });

    it('replaces missing/null/undefined fields with empty string', () => {
      const el = createTextElement('X{{Employee.Missing}}X{{Employee.EmptyField}}X{{Employee.UndefinedField}}X', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('XXXX');
    });

    it('does not serialize objects to [object Object]', () => {
      const el = createTextElement('Address: {{Employee.Address}}', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Address: ');
    });

    it('preserves multiline text spacing', () => {
      const source = `Name: {{Employee.Name}}\nCode: {{Employee.Code}}`;
      const el = createTextElement(source, 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe(`Name: Akash\nCode: EMP001`);
    });

    it('protects against prototype pollution', () => {
      const el = createTextElement('Malicious: {{__proto__.polluted}}', 'TEMPLATE');
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Malicious: ');
    });
  });

  describe('resolveElementBindings (FULL mode backward compatibility)', () => {
    it('uses explicit text binding if mode is FULL or undefined', () => {
      const el = createTextElement('Fallback Name', 'FULL');
      el.bindings = [{
        id: 'b1',
        targetProperty: 'text',
        sourceType: 'FIELD',
        fieldPath: 'Employee.Name'
      }];
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Akash');
    });

    it('ignores TEMPLATE resolution if mode is not TEMPLATE', () => {
      const el = createTextElement('Hello {{Employee.Name}}'); // Mode undefined
      const resolved = resolveElementBindings(el, context) as TextDesignElement;
      expect(resolved.text).toBe('Hello {{Employee.Name}}');
    });
  });
});
