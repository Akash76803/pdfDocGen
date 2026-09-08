import type { DesignTemplate } from '@document-tool/contracts';
import { validateDesignTemplate } from './validation.js';
import type { DesignElementRegistry } from './element-registry.js';
import { normalizeDesignTemplate } from './normalization.js';
import { repairTemplateGroupIntegrity } from './group-integrity.js';
import { normalizePackagingTemplateForPersistence } from './packagingArtwork.js';

export const CARD_DESIGN_SCHEMA_VERSION=1 as const;

export function serializeDesignTemplate(template:DesignTemplate, registry?:DesignElementRegistry):string {
  // Repair only flat-group references here so serialization remains otherwise
  // value-preserving for already-valid templates. Full style normalization stays on load.
  const repaired=normalizePackagingTemplateForPersistence(repairTemplateGroupIntegrity(template));
  const result=validateDesignTemplate(repaired,registry);
  if (!result.valid) throw new Error(`Cannot serialize invalid card design template: ${result.errors.map(e=>e.message).join('; ')}`);
  return JSON.stringify(repaired);
}

export function deserializeDesignTemplate(serialized:string, registry?:DesignElementRegistry):DesignTemplate {
  let parsed:unknown;
  try { parsed=JSON.parse(serialized); } catch { throw new Error('Card design template is not valid JSON.'); }
  if (!parsed || typeof parsed!=='object' || (parsed as {kind?:unknown}).kind!=='CARD_DESIGN') throw new Error('File is not a Card Design template.');
  const template=parsed as DesignTemplate;
  if (template.schemaVersion!==CARD_DESIGN_SCHEMA_VERSION) throw new Error(`Unsupported Card Design schema version: ${String(template.schemaVersion)}.`);
  const normalized=normalizePackagingTemplateForPersistence(normalizeDesignTemplate(template));
  const result=validateDesignTemplate(normalized,registry);
  if (!result.valid) throw new Error(`Card design template validation failed: ${result.errors.map(e=>e.message).join('; ')}`);
  return normalized;
}
