import { createDir, readDir, readTextFile, removeFile, writeTextFile } from '@tauri-apps/api/fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import type { TemplateLibraryEntry } from './templateLibrary.ts';
import { loadImageAsset } from './imageAssetStore.ts';

const TEMPLATE_FOLDER = 'templates';
const LOCAL_API_BASE_URL = 'http://127.0.0.1:8787';

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const runtime = window as Window & { __TAURI__?: unknown; __TAURI_IPC__?: unknown };
  return Boolean(runtime.__TAURI__ || runtime.__TAURI_IPC__);
}

async function templateDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const root = await appDataDir();
  const directory = await join(root, TEMPLATE_FOLDER);
  await createDir(directory, { recursive: true });
  return directory;
}

function isTemplateEntry(value: unknown): value is TemplateLibraryEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TemplateLibraryEntry>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.createdAt === 'string'
    && typeof candidate.updatedAt === 'string'
    && Boolean(candidate.payload && typeof candidate.payload === 'object');
}


async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to materialize image asset.'));
    reader.readAsDataURL(blob);
  });
}

async function imageBlobToHeadlessDataUrl(blob: Blob): Promise<string> {
  if (/image\/(jpeg|jpg)/i.test(blob.type)) return await blobToDataUrl(blob);
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context) { context.drawImage(bitmap, 0, 0); const value = canvas.toDataURL('image/jpeg', .94); bitmap.close?.(); return value; }
      bitmap.close?.();
    }
  } catch { /* fall back to original data URL */ }
  return await blobToDataUrl(blob);
}

async function normalizeEmbeddedImageSource(source: string): Promise<string> {
  if (!source.startsWith('data:image/') || /^data:image\/(jpeg|jpg);base64,/i.test(source)) return source;
  try { const response = await fetch(source); return await imageBlobToHeadlessDataUrl(await response.blob()); } catch { return source; }
}

export async function selfContainedTemplateEntry(entry: TemplateLibraryEntry): Promise<TemplateLibraryEntry> {
  // The REST API cannot read browser IndexedDB. Before mirroring a template to
  // the shared local repository, materialize static imageAssetId references as
  // data URLs inside the persisted JSON. The in-app template keeps the asset ID
  // too, so normal Builder editing remains unchanged.
  const clone = JSON.parse(JSON.stringify(entry)) as TemplateLibraryEntry;
  const payload = clone.payload as TemplateLibraryEntry['payload'] & { pages?: Array<{ elements?: Array<Record<string, unknown>> }>; elements?: Array<Record<string, unknown>> };
  const pages = Array.isArray(payload.pages) ? payload.pages : [{ elements: Array.isArray(payload.elements) ? payload.elements : [] }];
  const hydrate = async (target: Record<string, unknown>) => {
    const assetId = typeof target.imageAssetId === 'string' ? target.imageAssetId : '';
    const source = typeof target.imageSource === 'string' ? target.imageSource : '';
    if (assetId && !source.startsWith('data:image/')) {
      try { const blob = await loadImageAsset(assetId); if (blob) target.imageSource = await imageBlobToHeadlessDataUrl(blob); } catch { /* preserve original reference */ }
    } else if (source.startsWith('data:image/')) {
      target.imageSource = await normalizeEmbeddedImageSource(source);
    }
  };
  for (const page of pages) for (const element of page.elements ?? []) {
    await hydrate(element);
    const table = element.table as { bodyRows?: Array<{cells?:Array<Record<string,unknown>>}>; customRows?: Array<{cells?:Array<Record<string,unknown>>}>; rows?: Array<{cells?:Array<Record<string,unknown>>}> } | undefined;
    if (!table) continue;
    for (const row of [...(table.bodyRows ?? []), ...(table.customRows ?? []), ...(table.rows ?? [])]) for (const cell of row.cells ?? []) await hydrate(cell);
  }
  return clone;
}

async function syncTemplateToLocalApi(entry: TemplateLibraryEntry): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    await fetch(`${LOCAL_API_BASE_URL}/api/v1/templates/${encodeURIComponent(entry.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await selfContainedTemplateEntry(entry)),
    });
  } catch {
    // Browser dev mode remains localStorage-first if the local API is not running.
  }
}

async function deleteTemplateFromLocalApi(id: string): Promise<void> {
  if (typeof fetch !== 'function') return;
  try { await fetch(`${LOCAL_API_BASE_URL}/api/v1/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch { /* optional dev bridge */ }
}

export async function getLocalTemplateDirectory(): Promise<string | null> {
  return templateDirectory();
}

export async function persistTemplateFile(entry: TemplateLibraryEntry): Promise<void> {
  const directory = await templateDirectory();
  if (!directory) {
    await syncTemplateToLocalApi(entry);
    return;
  }
  const filePath = await join(directory, `${entry.id}.json`);
  await writeTextFile(filePath, JSON.stringify(await selfContainedTemplateEntry(entry), null, 2));
}

export async function deleteTemplateFile(id: string): Promise<void> {
  const directory = await templateDirectory();
  if (!directory) {
    await deleteTemplateFromLocalApi(id);
    return;
  }
  const filePath = await join(directory, `${id}.json`);
  try { await removeFile(filePath); } catch { /* file may not exist yet */ }
}

export async function readLocalTemplateFiles(): Promise<TemplateLibraryEntry[]> {
  const directory = await templateDirectory();
  if (!directory) return [];
  const files = await readDir(directory, { recursive: false });
  const entries: TemplateLibraryEntry[] = [];
  for (const file of files) {
    if (!file.name?.toLowerCase().endsWith('.json')) continue;
    try {
      const raw = await readTextFile(file.path);
      const parsed: unknown = JSON.parse(raw);
      if (isTemplateEntry(parsed)) entries.push(parsed);
    } catch { /* ignore one corrupt/unreadable file */ }
  }
  return entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
