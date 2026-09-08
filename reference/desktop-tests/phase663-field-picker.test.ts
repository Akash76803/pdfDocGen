import { describe, it, expect } from 'vitest';
import { getTextBinding, setTextFieldBinding, removeTextBinding, resolveDataContextSeeding } from '@document-tool/design-engine';
import { resolveArtboardBindings } from '@document-tool/design-engine';
import { createTextElement } from '@document-tool/design-engine';
import type { TextDesignElement, Artboard, DesignDataContext, DesignBinding, FieldDefinition } from '@document-tool/contracts';

describe('Phase 6.6.3 - Field Picker Domain Helpers', () => {
  const makeText = (id: string, text: string): TextDesignElement => {
    const base = createTextElement({ id });
    return { ...base, text };
  };

  describe('getTextBinding', () => {
    it('returns the text binding if present', () => {
      const el = makeText('text-1', 'Hello');
      el.bindings = [
        { id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'showMe' },
        { id: 'b2', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Greeting' }
      ];
      
      const binding = getTextBinding(el);
      expect(binding).toBeDefined();
      expect(binding?.targetProperty).toBe('text');
      expect(binding?.fieldPath).toBe('Greeting');
    });

    it('returns undefined when absent or unrelated bindings exist', () => {
      const el = makeText('text-1', 'Hello');
      el.bindings = [
        { id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'showMe' }
      ];
      expect(getTextBinding(el)).toBeUndefined();
    });
  });

  describe('setTextFieldBinding', () => {
    it('creates a FIELD binding for text with deterministic id and preserves unrelated bindings', () => {
      const el = makeText('text-1', 'FallbackText');
      el.bindings = [
        { id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'showMe' }
      ];

      const updated = setTextFieldBinding(el, 'Employee.Name');
      
      expect(updated.bindings).toHaveLength(2);
      expect(updated.bindings![0].id).toBe('b1');
      
      const newBinding = updated.bindings![1];
      expect(newBinding.id).toBe('text-1-text-binding');
      expect(newBinding.targetProperty).toBe('text');
      expect(newBinding.sourceType).toBe('FIELD');
      expect(newBinding.fieldPath).toBe('Employee.Name');
      expect(newBinding.fallbackValue).toBe('FallbackText');
    });

    it('updates existing text binding keeping the id and updating fieldPath', () => {
      const el = makeText('text-1', 'FallbackText');
      el.bindings = [
        { id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'showMe' },
        { id: 'custom-id', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'OldPath', fallbackValue: 'OldFallback' }
      ];

      const updated = setTextFieldBinding(el, 'NewPath');
      
      expect(updated.bindings).toHaveLength(2);
      const textBind = updated.bindings!.find(b => b.targetProperty === 'text');
      expect(textBind?.id).toBe('custom-id');
      expect(textBind?.fieldPath).toBe('NewPath');
      expect(textBind?.fallbackValue).toBe('OldFallback'); // preserves old fallback
    });
  });

  describe('removeTextBinding', () => {
    it('removes only text binding and preserves unrelated bindings', () => {
      const el = makeText('text-1', 'Hello');
      el.bindings = [
        { id: 'b1', targetProperty: 'visible', sourceType: 'FIELD', fieldPath: 'showMe' },
        { id: 'b2', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Greeting' }
      ];

      const updated = removeTextBinding(el);
      expect(updated.bindings).toHaveLength(1);
      expect(updated.bindings![0].id).toBe('b1');
      expect(updated.text).toBe('Hello');
    });
    
    it('returns element with undefined bindings array if it was the last binding', () => {
      const el = makeText('text-1', 'Hello');
      el.bindings = [
        { id: 'b2', targetProperty: 'text', sourceType: 'FIELD', fieldPath: 'Greeting' }
      ];

      const updated = removeTextBinding(el);
      expect(updated.bindings).toBeUndefined();
    });
  });

  describe('Datasource / Preview Resolution', () => {
    it('resolves TEXT element FIELD binding correctly', () => {
      const el = makeText('text-1', 'Fallback');
      const boundEl = setTextFieldBinding(el, 'Employee.Name');
      
      const artboard: Artboard = {
        id: 'ab-1',
        name: 'Front',
        widthMm: 100,
        heightMm: 100,
        order: 0,
        background: { type: 'NONE' },
        guides: [],
        elements: [boundEl]
      };

      const context: DesignDataContext = {
        record: {
          Employee: {
            Name: 'Akash'
          }
        }
      };

      const resolvedArtboard = resolveArtboardBindings(artboard, context);
      const resolvedEl = resolvedArtboard.elements[0] as TextDesignElement;

      expect(resolvedEl.text).toBe('Akash');
      // Verify source element remains unchanged
      expect((artboard.elements[0] as TextDesignElement).text).toBe('Fallback');
    });
  });

  describe('Missing Field Case', () => {
    it('detects missing fields logically without deleting bindings', () => {
      // Replicate the inline missing-field detection logic used in CardDesigner
      const el = makeText('text-1', 'Fallback');
      const boundEl = setTextFieldBinding(el, 'Employee.LegacyCode');
      
      const availableFields: FieldDefinition[] = [
        { name: 'Employee.Name', label: 'Name', type: 'string', required: true }
      ];

      const textBinding = getTextBinding(boundEl);
      const isBound = !!textBinding;
      
      // pure helper logic used inline in UI
      const isMissingField = isBound && textBinding.sourceType === 'FIELD' && !availableFields.some(f => f.name === textBinding.fieldPath);
      
      expect(isBound).toBe(true);
      expect(isMissingField).toBe(true);
      expect(textBinding?.fieldPath).toBe('Employee.LegacyCode');
    });
  });

  describe('resolveDataContextSeeding', () => {
    it('seeds context from imported data when current context is empty', () => {
      const prev = { record: {} };
      const imported = { "Employee Name": "Akash" };
      const next = resolveDataContextSeeding(prev, imported, 'IMPORTED');
      expect(next.record).toEqual(imported);
    });

    it('does not overwrite manual preview data', () => {
      const prev = { record: { "Custom": "Data" } };
      const imported = { "Employee Name": "Akash" };
      const next = resolveDataContextSeeding(prev, imported, 'MANUAL');
      expect(next.record).toEqual({ "Custom": "Data" });
    });

    it('updates imported context on datasource change if source is IMPORTED', () => {
      const prev = { record: { "Employee Name": "Akash" } }; // old data
      const imported = { "Employee Name": "NewPerson" }; // new data
      const next = resolveDataContextSeeding(prev, imported, 'IMPORTED');
      expect(next.record).toEqual(imported);
    });

    it('handles empty datasource row properly', () => {
      const prev = { record: {} };
      const imported = {};
      const next = resolveDataContextSeeding(prev, imported, 'IMPORTED');
      expect(next.record).toEqual({});
    });
  });
});

