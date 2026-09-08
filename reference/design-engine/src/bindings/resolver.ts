import type { DesignBinding, DesignDataContext, DesignElement, Artboard, TextDesignElement } from '@document-tool/contracts';
import { evaluateElementVisibility } from './visibility.js';
import { remapTextStyleRunsForTemplate } from '../richText.js';

/**
 * Resolves a dot-notation path against a record deterministically.
 * Disallows dangerous keys to prevent prototype pollution.
 */
export function resolvePath(record: Record<string, unknown> | undefined, path: string): unknown {
  if (!record || !path) return undefined;
  
  const parts = path.split('.');
  let current: any = record;
  
  for (const part of parts) {
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return undefined; // Security: blocked paths
    }
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

export interface TextTemplateResolution {
  text: string;
  placeholders: string[];
  unresolved: string[];
}

export function extractTextPlaceholders(text: string): string[] {
  if (!text) return [];
  const regex = /\{\{([^}]+)\}\}/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    placeholders.push(match[1].trim());
  }
  return [...new Set(placeholders)];
}

export function hasDynamicTextTemplate(text: string): boolean {
  return /\{\{([^}]+)\}\}/.test(text ?? '');
}

export function resolveTextTemplate(
  sourceText: string,
  context: DesignDataContext
): TextTemplateResolution {
  if (!sourceText) {
    return { text: sourceText, placeholders: [], unresolved: [] };
  }

  const placeholders: string[] = [];
  const unresolved: string[] = [];

  const text = sourceText.replace(/\{\{([^}]+)\}\}/g, (...args) => {
    const inner = String(args[1] ?? '');
    const path = inner.trim();
    if (!path) return '';

    placeholders.push(path);
    const resolved = resolvePath(context.record, path);

    if (resolved === null || resolved === undefined) {
      unresolved.push(path);
      return '';
    }
    
    if (typeof resolved === 'object') {
      return '';
    }
    
    return String(resolved);
  });

  return { text, placeholders: [...new Set(placeholders)], unresolved: [...new Set(unresolved)] };
}

/**
 * Resolves a single binding against the provided data context.
 */
export function resolveDesignBinding(binding: DesignBinding, context: DesignDataContext): unknown {
  let resolved: unknown = undefined;

  switch (binding.sourceType) {
    case 'FIELD':
      if (binding.fieldPath) {
        resolved = resolvePath(context.record, binding.fieldPath);
      }
      break;
    case 'CALCULATED':
      if (binding.calculatedFieldId) {
        resolved = resolvePath(context.calculated, binding.calculatedFieldId);
      }
      break;
    case 'STATIC':
      resolved = binding.fallbackValue;
      break;
  }

  if (resolved === null || resolved === undefined) {
    resolved = binding.fallbackValue;
  }

  return resolved;
}

export const MAX_DYNAMIC_IMAGE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_DYNAMIC_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function normalizeBase64Payload(payload: string): string | undefined {
  const trimmed = payload.trim();
  if (!trimmed || /\s/.test(trimmed) || !/^[A-Za-z0-9+/]*={0,2}$/.test(trimmed)) return undefined;
  const unpadded = trimmed.replace(/=+$/, '');
  if (!unpadded || unpadded.length % 4 === 1) return undefined;
  const padding = (4 - (unpadded.length % 4)) % 4;
  return `${unpadded}${'='.repeat(padding)}`;
}

function estimateBase64Bytes(normalizedPayload: string): number {
  const padding = normalizedPayload.endsWith('==') ? 2 : normalizedPayload.endsWith('=') ? 1 : 0;
  return Math.floor((normalizedPayload.length * 3) / 4) - padding;
}

function decodeBase64Prefix(normalizedPayload: string, byteCount = 16): Uint8Array | undefined {
  try {
    const charsNeeded = Math.min(normalizedPayload.length, Math.ceil(byteCount / 3) * 4);
    const prefix = normalizedPayload.slice(0, charsNeeded);
    const binary = globalThis.atob(prefix);
    const bytes = new Uint8Array(Math.min(binary.length, byteCount));
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

export function detectDynamicImageMimeType(base64Payload: string): string | undefined {
  const normalized = normalizeBase64Payload(base64Payload);
  if (!normalized || estimateBase64Bytes(normalized) > MAX_DYNAMIC_IMAGE_BYTES) return undefined;
  const bytes = decodeBase64Prefix(normalized, 16);
  if (!bytes) return undefined;

  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return undefined;
}

export function normalizeDynamicImageSource(value: unknown, fallbackValue: unknown): string | undefined {
  const fallback = typeof fallbackValue === 'string' && fallbackValue.trim() !== '' ? fallbackValue.trim() : undefined;
  if (typeof value !== 'string') return fallback;

  const candidate = value.trim();
  if (!candidate) return fallback;

  // Preserve pre-existing URL-based image bindings for backward compatibility.
  if (/^https?:\/\//i.test(candidate) || /^blob:/i.test(candidate)) return candidate;

  const dataUrlMatch = candidate.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/i);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1]!.toLowerCase();
    const payload = normalizeBase64Payload(dataUrlMatch[2]!);
    if (!payload || !SUPPORTED_DYNAMIC_IMAGE_MIME_TYPES.has(mimeType) || estimateBase64Bytes(payload) > MAX_DYNAMIC_IMAGE_BYTES) return fallback;
    const detected = detectDynamicImageMimeType(payload);
    if (!detected || detected !== mimeType) return fallback;
    return candidate;
  }

  const normalizedPayload = normalizeBase64Payload(candidate);
  if (!normalizedPayload || estimateBase64Bytes(normalizedPayload) > MAX_DYNAMIC_IMAGE_BYTES) return fallback;
  const mimeType = detectDynamicImageMimeType(normalizedPayload);
  return mimeType ? `data:${mimeType};base64,${normalizedPayload}` : fallback;
}

export function normalizeDynamicAssetSource(value: unknown, fallbackValue: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (typeof fallbackValue === 'string' && fallbackValue.trim() !== '') {
    return fallbackValue.trim();
  }
  return undefined;
}

export function normalizeDynamicCodeValue(value: unknown, fallbackValue: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof fallbackValue === 'string' && fallbackValue.trim() !== '') {
    return fallbackValue;
  }
  return typeof fallbackValue === 'string' ? fallbackValue : undefined;
}

/**
 * Validates and normalizes the target value for a specific property on a DesignElement.
 */
export function applyResolvedValueToElement(element: DesignElement, binding: DesignBinding, rawValue: unknown): void {
  const targetProperty = binding.targetProperty;
  // Do not mutate if undefined (fallback didn't exist and value was missing)
  if (rawValue === undefined) return;

  switch (targetProperty) {
    case 'text':
      if (element.type === 'TEXT') {
        let textValue = '';
        if (rawValue !== null) {
          if (typeof rawValue === 'boolean') {
            textValue = rawValue ? 'true' : 'false';
          } else {
            textValue = String(rawValue);
          }
        }
        (element as any).text = textValue;
      }
      break;

    case 'visible':
      if (typeof rawValue === 'boolean') {
        element.visible = rawValue;
      }
      // If it's not a boolean, we do not invent magic truthy logic in this phase.
      break;

    case 'source':
      if (element.type === 'IMAGE') {
        const normalized = normalizeDynamicImageSource(rawValue, binding.fallbackValue);
        if (normalized !== undefined) {
          (element as any).source = normalized;
        }
      } else if (element.type === 'SVG') {
        const normalized = normalizeDynamicAssetSource(rawValue, binding.fallbackValue);
        if (normalized !== undefined) {
          (element as any).source = normalized;
        }
      }
      break;

    case 'fillImageSource':
      if ((element.type === 'SHAPE' || element.type === 'PATH') && element.fill.type === 'IMAGE') {
        const normalized = normalizeDynamicImageSource(rawValue, undefined);
        if (normalized !== undefined) {
          (element.fill as typeof element.fill & { source?: string }).source = normalized;
        }
      }
      break;

    case 'altText':
      if (element.type === 'IMAGE') {
        if (typeof rawValue === 'string') {
          (element as any).altText = rawValue;
        }
      }
      break;

    case 'tintColor':
      if (element.type === 'SVG') {
        if (typeof rawValue === 'string') {
          (element as any).tintColor = rawValue;
        }
      }
      break;

    case 'value':
      if (element.type === 'QR' || element.type === 'BARCODE') {
        const normalized = normalizeDynamicCodeValue(rawValue, binding.fallbackValue);
        if (normalized !== undefined) {
          (element as any).value = normalized;
        }
      }
      break;
      
    // Future target properties (fill, stroke, etc.) go here
  }
}

/**
 * Resolves all bindings for a single design element, returning a newly cloned element
 * with the bindings applied. If no bindings exist, returns the original element.
 */
export function resolveElementBindings(element: DesignElement, context: DesignDataContext): DesignElement {
  const isTemplateMode = element.type === 'TEXT' && (element as TextDesignElement).textBindingMode === 'TEMPLATE';
  const hasBindings = element.bindings && element.bindings.length > 0;
  const hasVisibilityRule = element.visibilityRule !== undefined;

  if (!hasBindings && !isTemplateMode && !hasVisibilityRule) {
    return element; // Immutability: return unchanged if no bindings and not in template mode
  }

  // Clone element for runtime safety
  const resolvedElement = structuredClone(element);

  // If we are in TEMPLATE mode for text, resolve the mixed placeholders
  if (isTemplateMode) {
    const textElement = resolvedElement as unknown as TextDesignElement;
    const sourceText = textElement.text;
    const resolution = resolveTextTemplate(sourceText, context);
    if (textElement.style.runs?.length) {
      textElement.style.runs = remapTextStyleRunsForTemplate(
        sourceText,
        resolution.text,
        textElement.style.runs,
        path => {
          const resolved = resolvePath(context.record, path);
          return resolved === null || resolved === undefined || typeof resolved === 'object' ? '' : String(resolved);
        }
      );
    }
    textElement.text = resolution.text;
  }

  // Then resolve any explicit property bindings (if ANY exist). 
  // If 'text' is also bound explicitly via bindings[], it will overwrite the template result,
  // which aligns with the fallback/override principle.
  if (hasBindings) {
    for (const binding of resolvedElement.bindings!) {
      const rawValue = resolveDesignBinding(binding, context);
      applyResolvedValueToElement(resolvedElement, binding, rawValue);
    }
  }

  // Resolve conditional visibility
  if (hasVisibilityRule) {
    const isVisible = evaluateElementVisibility(resolvedElement.visibilityRule, context);
    resolvedElement.runtimeHidden = !isVisible;
  }

  return resolvedElement;
}

/**
 * Resolves an entire Artboard's elements against the given data context.
 * Returns a clone of the Artboard with resolved elements.
 */
export function resolveArtboardBindings(artboard: Artboard, context: DesignDataContext): Artboard {
  let hasChanges = false;
  let resolvedBackground = artboard.background;

  const backgroundBinding = artboard.backgroundBindings?.find(binding => binding.targetProperty === 'backgroundImageSource');
  if (backgroundBinding && artboard.background.type === 'IMAGE') {
    const rawValue = resolveDesignBinding(backgroundBinding, context);
    const normalized = normalizeDynamicImageSource(rawValue, undefined);
    if (normalized !== undefined) {
      resolvedBackground = { ...artboard.background, source: normalized } as typeof artboard.background;
      hasChanges = true;
    }
  }

  const resolvedElements = artboard.elements.map(el => {
    const resolvedEl = resolveElementBindings(el, context);
    if (resolvedEl !== el) hasChanges = true;
    return resolvedEl;
  });

  if (!hasChanges) {
    return artboard; // Return original if perfectly unchanged
  }

  return {
    ...artboard,
    background: resolvedBackground,
    elements: resolvedElements
  };
}
