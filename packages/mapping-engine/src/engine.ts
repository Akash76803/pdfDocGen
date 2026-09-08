import type {
  DataSourceSchema,
  FieldRole,
  MappingDefinition,
  MappingProfile,
  MappingValidationIssue,
  MappingValidationResult,
  NormalizedRecord,
  NormalizedValue,
} from '@document-tool/contracts';

export interface IMappingEngine {
  mapRecord(record: NormalizedRecord, mappings: MappingDefinition[]): NormalizedRecord;
  validate(profile: MappingProfile, schema: DataSourceSchema): MappingValidationResult;
}

const VALID_ROLES: ReadonlySet<FieldRole> = new Set(['GROUP_KEY', 'HEADER_FIELD', 'LINE_ITEM_FIELD', 'SUMMARY_FIELD', 'IGNORE']);
const TARGET_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export class MappingEngine implements IMappingEngine {
  mapRecord(record: NormalizedRecord, mappings: MappingDefinition[]): NormalizedRecord {
    const result: NormalizedRecord = {};

    for (const mapping of mappings) {
      if ((mapping.role ?? 'HEADER_FIELD') === 'IGNORE') continue;
      const sourceField = sourceOf(mapping);
      const targetPath = targetOf(mapping);
      if (!sourceField || !targetPath) continue;

      const rawValue = this.getValueByPath(record, sourceField);
      const finalValue = this.applyTransforms(rawValue ?? mapping.defaultValue, mapping);
      if (finalValue !== undefined) this.setValueByPath(result, targetPath, finalValue);
    }

    return result;
  }

  validate(profile: MappingProfile, schema: DataSourceSchema): MappingValidationResult {
    const errors: MappingValidationIssue[] = [];
    const warnings: MappingValidationIssue[] = [];
    const sourceNames = new Set(schema.fields.map((field) => field.name));
    const seenSources = new Map<string, FieldRole>();
    const seenTargets = new Set<string>();

    const activeMappings = profile.mappings.filter((mapping) => (mapping.role ?? 'HEADER_FIELD') !== 'IGNORE');
    if (activeMappings.length === 0) {
      errors.push({ code: 'MAPPING_REQUIRED', message: 'At least one mapped field is required.' });
    }

    for (const mapping of profile.mappings) {
      const role = mapping.role ?? 'HEADER_FIELD';
      const sourceField = sourceOf(mapping);
      const targetPath = targetOf(mapping);

      if (!VALID_ROLES.has(role)) {
        errors.push({ code: 'MAPPING_ROLE_CONFLICT', message: `Unsupported mapping role for ${sourceField || mapping.id}.`, mappingId: mapping.id });
        continue;
      }
      if (role === 'IGNORE') continue;

      if (!sourceField || !sourceNames.has(sourceField)) {
        errors.push({ code: 'MAPPING_SOURCE_NOT_FOUND', message: `Source field "${sourceField || '(blank)'}" was not found in imported data.`, mappingId: mapping.id, sourceField });
      }
      if (!targetPath || !TARGET_PATH.test(targetPath)) {
        errors.push({ code: 'MAPPING_TARGET_INVALID', message: `Target path "${targetPath || '(blank)'}" is invalid.`, mappingId: mapping.id, targetPath });
      } else if (seenTargets.has(targetPath)) {
        errors.push({ code: 'MAPPING_TARGET_DUPLICATE', message: `Target path "${targetPath}" is mapped more than once.`, mappingId: mapping.id, targetPath });
      } else {
        seenTargets.add(targetPath);
      }

      if (sourceField) {
        const prior = seenSources.get(sourceField);
        if (prior && prior !== role) {
          errors.push({ code: 'MAPPING_ROLE_CONFLICT', message: `Source field "${sourceField}" has conflicting roles (${prior} and ${role}).`, mappingId: mapping.id, sourceField });
        } else {
          seenSources.set(sourceField, role);
        }
      }
    }

    if (profile.groupDefinition.mode === 'GROUP_BY_FIELD') {
      const groupKeyMappings = profile.mappings.filter((mapping) => mapping.role === 'GROUP_KEY');
      const configured = profile.groupDefinition.groupKey?.sourceField;
      if (groupKeyMappings.length !== 1 || !configured) {
        errors.push({ code: 'GROUP_KEY_REQUIRED', message: 'Select exactly one group key field.' });
      } else if (sourceOf(groupKeyMappings[0]!) !== configured) {
        errors.push({ code: 'GROUP_KEY_REQUIRED', message: 'The selected group key does not match the GROUP_KEY mapping.' });
      }
    }

    for (const mapping of profile.mappings) {
      if (mapping.required && (mapping.role === 'IGNORE' || !sourceOf(mapping) || !targetOf(mapping))) {
        errors.push({ code: 'MAPPING_REQUIRED', message: `Required mapping ${mapping.id} is incomplete.`, mappingId: mapping.id });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private applyTransforms(value: NormalizedValue | undefined, mapping: MappingDefinition): NormalizedValue | undefined {
    let finalValue = value;
    if (!mapping.transformRules || finalValue == null) return finalValue;

    for (const rule of mapping.transformRules) {
      if (rule.type === 'uppercase' && typeof finalValue === 'string') finalValue = finalValue.toUpperCase();
      else if (rule.type === 'lowercase' && typeof finalValue === 'string') finalValue = finalValue.toLowerCase();
      else if (rule.type === 'trim' && typeof finalValue === 'string') finalValue = finalValue.trim();
    }
    return finalValue;
  }

  private getValueByPath(record: NormalizedRecord, path: string): NormalizedValue | undefined {
    const parts = path.replace(/\]/g, '').replace(/\[/g, '.').split('.').filter(Boolean);
    let current: NormalizedValue | undefined = record;
    for (const part of parts) {
      if (current == null || Array.isArray(current) || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  private setValueByPath(record: NormalizedRecord, path: string, value: NormalizedValue): void {
    const parts = path.split('.').filter(Boolean);
    let current: NormalizedRecord = record;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      if (index === parts.length - 1) {
        current[part] = value;
        return;
      }
      const existing = current[part];
      if (!existing || Array.isArray(existing) || typeof existing !== 'object') current[part] = {};
      current = current[part] as NormalizedRecord;
    }
  }
}

export function sourceOf(mapping: MappingDefinition): string | undefined {
  return mapping.sourceField ?? mapping.sourcePath;
}

export function targetOf(mapping: MappingDefinition): string | undefined {
  return mapping.targetPath ?? mapping.templateVariable;
}
