import { describe, it, expect } from 'vitest';
import { filterAvailableFields } from '../src/pages/field-picker-helpers.js';
import type { FieldDefinition } from '@document-tool/contracts';

describe('Searchable Field Picker - pure logic', () => {
  const fields: FieldDefinition[] = [
    { name: 'Employee Name', label: 'Employee Name', type: 'string', required: true },
    { name: 'Employee Code', label: 'Employee Code', type: 'string', required: true },
    { name: 'Employee.Department.Name', label: 'Department', type: 'string', required: false },
    { name: '__proto__', label: '__proto__', type: 'string', required: false },
  ];

  it('returns all fields if search is empty', () => {
    const result = filterAvailableFields(fields, '  ');
    expect(result).toHaveLength(4);
  });

  it('matches case-insensitive by label', () => {
    const result = filterAvailableFields(fields, 'department');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Employee.Department.Name');
  });

  it('matches case-insensitive by path', () => {
    const result = filterAvailableFields(fields, 'employee.department');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Employee.Department.Name');
  });

  it('trims whitespace', () => {
    const result = filterAvailableFields(fields, '   code  ');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Employee Code');
  });
  
  it('preserves field ordering', () => {
    const result = filterAvailableFields(fields, 'employee');
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Employee Name');
    expect(result[1].name).toBe('Employee Code');
    expect(result[2].name).toBe('Employee.Department.Name');
  });
});
