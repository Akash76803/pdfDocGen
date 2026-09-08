/**
 * Phase 6.7 — Bulk Personalized Card Generation Service
 *
 * Architecture:
 * - Pure planner (createBulkGenerationPlan) produces a deterministic list of items to generate.
 * - Each item is record-major (Record N Front, Record N Back, then Record N+1...).
 * - Pipeline resolves source template + record → runtime clone per item.
 * - Template and records are never mutated.
 * - Memory strategy: sequential per-item processing, no all-at-once pre-resolution.
 * - Renderer receives already-resolved artboards — no datasource business logic in renderer.
 */

import type { Artboard, DesignDataContext, DesignTemplate } from '@document-tool/contracts';
import { resolveArtboardBindings } from '@document-tool/design-engine';
import { expandFilenameTemplate, deduplicateFilename } from './previewRecordHelpers.js';

// ─── Request Contract ─────────────────────────────────────────────────────────

/** Which datasource rows to generate. Independent of artboard targeting. */
export type BulkRecordTarget = 'CURRENT_RECORD' | 'SELECTED_RECORDS' | 'ALL_RECORDS';

/** Which artboards to generate per record. */
export type BulkArtboardTarget = 'CURRENT' | 'SELECTED' | 'ALL';

export interface BulkCardGenerationRequest {
  /** Which records to generate. */
  recordTarget: BulkRecordTarget;
  /** Index of the current preview record (used for CURRENT_RECORD). */
  currentRecordIndex: number;
  /** Indexes of records selected by user (used for SELECTED_RECORDS). */
  selectedRecordIndexes?: number[];

  /** Which artboards to output per record. */
  artboardTarget: BulkArtboardTarget;
  /** The currently active artboard ID (used for CURRENT artboard target). */
  currentArtboardId?: string;
  /** The IDs of artboards selected by user (used for SELECTED artboard target). */
  selectedArtboardIds?: string[];

  /** Output format */
  format: 'PDF' | 'PNG' | 'JPEG';

  /**
   * Template for output filenames.
   * Supported tokens: {{recordIndex}}, {{artboardName}}, {{FieldName}}
   * Default: "{{recordIndex}}-{{artboardName}}"
   */
  filenameTemplate?: string;

  /** Combine all pages into a single PDF (only applies when format=PDF). */
  combinePdf?: boolean;

  dpi?: number;
  jpegQuality?: number;
  transparentBackground?: boolean;
  includeBleed?: boolean;
  includeCropMarks?: boolean;
}

// ─── Plan Item ───────────────────────────────────────────────────────────────

/** A single planned output item. Contains everything needed to render without additional context. */
export interface BulkGenerationPlanItem {
  /** The datasource row index this item comes from. */
  recordIndex: number;
  /** The artboard source (from the template, UNRESOLVED). */
  artboard: Artboard;
  /** The resolved DesignDataContext for this record. */
  context: DesignDataContext;
  /** The intended filename (with extension, deduplicated). */
  filename: string;
  /** A human-readable label for progress reporting. */
  label: string;
}

/** The full planned output for a bulk generation request. */
export interface BulkGenerationPlan {
  items: BulkGenerationPlanItem[];
  totalRecords: number;
  totalArtboards: number;
  format: 'PDF' | 'PNG' | 'JPEG';
  combinePdf: boolean;
}

// ─── Result Contract ─────────────────────────────────────────────────────────

export interface BulkGenerationFailure {
  recordIndex: number;
  artboardId: string;
  message: string;
}

export interface BulkGenerationResult {
  totalItems: number;
  succeededItems: number;
  failedItems: number;
  cancelled: boolean;
  failures: BulkGenerationFailure[];
}

// ─── Pure Planner ────────────────────────────────────────────────────────────

/**
 * Creates a deterministic list of plan items for bulk generation.
 *
 * Ordering: record-major (R1-Front, R1-Back, R2-Front, R2-Back, ...)
 * This is the canonical order for personalized card sets.
 *
 * Pure function: no rendering, no side effects.
 */
export function createBulkGenerationPlan(
  template: DesignTemplate,
  rows: Record<string, unknown>[],
  request: BulkCardGenerationRequest
): BulkGenerationPlan {
  if (!rows.length) {
    return { items: [], totalRecords: 0, totalArtboards: 0, format: request.format, combinePdf: request.combinePdf ?? true };
  }

  // Resolve target record indexes
  let targetRecordIndexes: number[];
  if (request.recordTarget === 'CURRENT_RECORD') {
    const idx = Math.max(0, Math.min(rows.length - 1, request.currentRecordIndex));
    targetRecordIndexes = [idx];
  } else if (request.recordTarget === 'SELECTED_RECORDS') {
    targetRecordIndexes = (request.selectedRecordIndexes ?? []).filter(i => i >= 0 && i < rows.length);
  } else {
    targetRecordIndexes = rows.map((_, i) => i);
  }

  // Resolve target artboards (in template order)
  const sortedArtboards = [...template.artboards].sort((a, b) => a.order - b.order);
  let targetArtboards: Artboard[];
  if (request.artboardTarget === 'CURRENT') {
    const current = sortedArtboards.find(a => a.id === request.currentArtboardId);
    targetArtboards = current ? [current] : sortedArtboards.slice(0, 1);
  } else if (request.artboardTarget === 'SELECTED') {
    const selIds = new Set(request.selectedArtboardIds ?? []);
    targetArtboards = sortedArtboards.filter(a => selIds.has(a.id));
    if (!targetArtboards.length) targetArtboards = sortedArtboards.slice(0, 1);
  } else {
    targetArtboards = sortedArtboards;
  }

  const ext = request.format.toLowerCase();
  const tpl = request.filenameTemplate ?? '{{recordIndex}}-{{artboardName}}';
  const usedFilenames = new Set<string>();
  const items: BulkGenerationPlanItem[] = [];

  // Record-major ordering: R1-Front, R1-Back, R2-Front, R2-Back, ...
  for (const recordIndex of targetRecordIndexes) {
    const record = rows[recordIndex]!;
    const context: DesignDataContext = { record };

    for (const artboard of targetArtboards) {
      const baseName = expandFilenameTemplate(tpl, record, recordIndex, artboard.name);
      const filename = deduplicateFilename(`${baseName}.${ext}`, usedFilenames);
      const label = `Record ${recordIndex + 1} / ${artboard.name}`;

      items.push({ recordIndex, artboard, context, filename, label });
    }
  }

  return {
    items,
    totalRecords: targetRecordIndexes.length,
    totalArtboards: targetArtboards.length,
    format: request.format,
    combinePdf: request.combinePdf ?? true,
  };
}

// ─── Per-item Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a single plan item to a runtime artboard.
 * Always creates a fresh clone — never mutates source.
 */
export function resolveItemArtboard(item: BulkGenerationPlanItem): Artboard {
  return resolveArtboardBindings(item.artboard, item.context);
}

// ─── Progress Callback ───────────────────────────────────────────────────────

export interface BulkProgressUpdate {
  completedItems: number;
  totalItems: number;
  currentLabel: string;
  cancelled: boolean;
}

export type BulkProgressCallback = (update: BulkProgressUpdate) => void;

// ─── Cancellation ────────────────────────────────────────────────────────────

export class BulkCancellationToken {
  private _cancelled = false;
  get cancelled(): boolean { return this._cancelled; }
  cancel(): void { this._cancelled = true; }
  
  // ExportCancellationToken compliance
  get isCancellationRequested(): boolean { return this._cancelled; }
  throwIfCancellationRequested(): void {
    if (this._cancelled) throw new Error('Export was cancelled.');
  }
}

// ─── Safe Record Label for UI ─────────────────────────────────────────────────

export { getRecordDisplayLabel } from './previewRecordHelpers.js';
