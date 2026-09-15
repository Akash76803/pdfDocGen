import type { FieldDefinition, NormalizedRecord, NormalizedValue } from '@document-tool/contracts';

export type { NormalizedRecord, NormalizedValue };

export type BuilderDataSource = {
  id: string;
  name: string;
  sourceType: 'csv' | 'excel' | 'json';
  fields: FieldDefinition[];
  records: NormalizedRecord[];
  warnings: string[];
  importedAt: string;
  sheetName?: string;
};
export type BuilderDataState = { sources: BuilderDataSource[]; activeSourceId: string | null; activeRecordIndex: number; };

type StoredDataMeta = { activeSourceId: string | null; activeRecordIndex: number };

export const DATA_STORAGE_KEY = 'document-builder.datasource.db3.v1';
export const DATA_EVENT = 'document-builder:data-changed';
const DB_NAME = 'document-builder-db3';
const DB_VERSION = 1;
const STORE_NAME = 'dataSources';
const EMPTY_STATE: BuilderDataState = { sources: [], activeSourceId: null, activeRecordIndex: 0 };

function loadMeta(): StoredDataMeta {
  try {
    const raw = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) return { activeSourceId: null, activeRecordIndex: 0 };
    const parsed = JSON.parse(raw) as Partial<StoredDataMeta & BuilderDataState>;
    return {
      activeSourceId: parsed.activeSourceId ?? null,
      activeRecordIndex: Number.isInteger(parsed.activeRecordIndex) ? Number(parsed.activeRecordIndex) : 0,
    };
  } catch {
    return { activeSourceId: null, activeRecordIndex: 0 };
  }
}

function saveMeta(state: Pick<BuilderDataState, 'activeSourceId' | 'activeRecordIndex'>) {
  const meta: StoredDataMeta = { activeSourceId: state.activeSourceId, activeRecordIndex: state.activeRecordIndex };
  try {
    window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Metadata is intentionally tiny. If storage is unavailable, the data itself remains safe in IndexedDB.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local data storage.'));
  });
}

async function readAllSources(): Promise<BuilderDataSource[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result as BuilderDataSource[]).sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
      request.onerror = () => reject(request.error ?? new Error('Unable to read local data sources.'));
    });
  } finally {
    db.close();
  }
}

async function replaceAllSources(sources: BuilderDataSource[]): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const source of sources) store.put(source);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to persist data sources.'));
      tx.onabort = () => reject(tx.error ?? new Error('Data source persistence was aborted.'));
    });
  } finally {
    db.close();
  }
}

async function migrateLegacyLocalStorage(): Promise<void> {
  try {
    const raw = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<BuilderDataState>;
    if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) return;
    const existing = await readAllSources();
    if (existing.length === 0) await replaceAllSources(parsed.sources);
    const meta: StoredDataMeta = {
      activeSourceId: parsed.activeSourceId ?? parsed.sources[0]?.id ?? null,
      activeRecordIndex: Number.isInteger(parsed.activeRecordIndex) ? Number(parsed.activeRecordIndex) : 0,
    };
    window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Legacy data may itself be malformed or quota-truncated. Continue with IndexedDB state.
  }
}

export function loadDataState(): BuilderDataState {
  const meta = loadMeta();
  return { ...EMPTY_STATE, ...meta };
}

export async function loadDataStateAsync(): Promise<BuilderDataState> {
  await migrateLegacyLocalStorage();
  const meta = loadMeta();
  const sources = await readAllSources();
  const activeSourceId = sources.some((source) => source.id === meta.activeSourceId) ? meta.activeSourceId : sources[0]?.id ?? null;
  const source = sources.find((item) => item.id === activeSourceId) ?? sources[0];
  const activeRecordIndex = source ? Math.min(Math.max(0, meta.activeRecordIndex), Math.max(0, source.records.length - 1)) : 0;
  return { sources, activeSourceId, activeRecordIndex };
}

export async function saveDataState(state: BuilderDataState): Promise<void> {
  // Persist selection metadata first so navigation/other mounted views can observe it immediately.
  saveMeta(state);
  await replaceAllSources(state.sources);
  window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: { activeSourceId: state.activeSourceId, activeRecordIndex: state.activeRecordIndex } }));
}

export function saveDataSelection(state: Pick<BuilderDataState, 'activeSourceId' | 'activeRecordIndex'>): void {
  // Record/source selection is tiny metadata. Never rewrite the complete imported dataset for this interaction.
  saveMeta(state);
  window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: { activeSourceId: state.activeSourceId, activeRecordIndex: state.activeRecordIndex } }));
}

export async function clearLegacyDataStorage(): Promise<void> {
  try { window.localStorage.removeItem(DATA_STORAGE_KEY); } catch { /* ignore */ }
}

export function activeSource(state: BuilderDataState): BuilderDataSource | null { return state.sources.find((source) => source.id === state.activeSourceId) ?? state.sources[0] ?? null; }
export function activeRecord(state: BuilderDataState): NormalizedRecord | null { const source = activeSource(state); if (!source || source.records.length === 0) return null; const index = Math.min(Math.max(0, state.activeRecordIndex), source.records.length - 1); return source.records[index] ?? null; }
export function valueForField(record: NormalizedRecord | null, field: string | undefined): NormalizedValue | undefined { if (!record || !field) return undefined; if (Object.prototype.hasOwnProperty.call(record, field)) return record[field]; const parts = field.split('.').filter(Boolean); let current: NormalizedValue | undefined = record; for (const part of parts) { if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined; current = (current as NormalizedRecord)[part]; } return current; }
export function displayValue(value: NormalizedValue | undefined): string { if (value == null) return ''; if (typeof value === 'string') return value; if (typeof value === 'number' || typeof value === 'boolean') return String(value); try { return JSON.stringify(value); } catch { return ''; } }
