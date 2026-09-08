import type { DocumentGroup, GroupingMode, GroupingResult, MappingDefinition, NormalizedData } from '@document-tool/contracts';
import type { FileInspectionResult, SourceFileInput } from '@document-tool/datasource-sdk';

export interface StoredImportWorkspace {
  id: string;
  sourceFile: SourceFileInput | null;
  inspection?: FileInspectionResult | null;
  selectedSheet?: string;
  headerRow?: number;
  dataPreview?: NormalizedData | null;
  mappings?: MappingDefinition[];
  groupingMode?: GroupingMode;
  groupingResult?: GroupingResult | null;
  groups: DocumentGroup[];
  createdAt?: string;
  updatedAt: string;
}

export interface ImportWorkspaceMetadata {
  id: string;
  sourceName: string;
  sourceSize: number;
  sourceType?: string;
  groupCount: number;
  rowCount: number;
  createdAt?: string;
  updatedAt: string;
}

const DB_NAME = 'document-tool-workspace';
const LEGACY_STORE = 'workspace';
const SOURCES_STORE = 'sources';
const SOURCE_META_STORE = 'source-meta';
const META_STORE = 'meta';
const LEGACY_KEY = 'active-import';
const ACTIVE_KEY = 'active-source-id';

function toMetadata(value: StoredImportWorkspace): ImportWorkspaceMetadata {
  const groups = value.groups?.length ? value.groups : value.groupingResult?.groups ?? [];
  return {
    id: value.id,
    sourceName: value.sourceFile?.name ?? 'Imported source',
    sourceSize: value.sourceFile?.size ?? value.sourceFile?.bytes?.byteLength ?? 0,
    sourceType: value.inspection?.sourceType,
    groupCount: groups.length,
    rowCount: value.dataPreview?.records.length ?? value.groupingResult?.statistics.sourceRowCount ?? 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction!;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE);
      if (!db.objectStoreNames.contains(SOURCES_STORE)) db.createObjectStore(SOURCES_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      let metaStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(SOURCE_META_STORE)) metaStore = db.createObjectStore(SOURCE_META_STORE, { keyPath: 'id' });
      else metaStore = tx.objectStore(SOURCE_META_STORE);

      // One-time v3 migration: build tiny metadata records inside the upgrade transaction.
      if (db.objectStoreNames.contains(SOURCES_STORE)) {
        const sources = tx.objectStore(SOURCES_STORE);
        const cursor = sources.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          try { metaStore.put(toMetadata(current.value as StoredImportWorkspace)); } catch { /* best effort migration */ }
          current.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local workspace storage.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function normalizeWorkspace(value: StoredImportWorkspace): StoredImportWorkspace {
  // Keep persisted groups compact on load. Hydrating every group for a large source
  // (thousands of invoices) blocks the browser main thread. UI consumers hydrate
  // only the currently selected group via hydrateWorkspaceGroup().
  const groups = value.groups?.length ? value.groups : value.groupingResult?.groups ?? [];
  const groupingResult = value.groupingResult ? { ...value.groupingResult, groups } : value.groupingResult;
  return { ...value, groups, groupingResult };
}

/** Hydrate source-row context for one selected group only. */
export function hydrateWorkspaceGroup(value: StoredImportWorkspace | null | undefined, group: DocumentGroup | null | undefined): DocumentGroup | null {
  if (!value || !group) return group ?? null;
  if (!value.dataPreview) return group;
  if (group.sourceItems?.length === group.sourceRowIndexes.length && group.itemDetails?.length === group.items.length) return group;
  const headerRow = typeof value.dataPreview.metadata?.headerRow === 'number' ? value.dataPreview.metadata.headerRow : 1;
  const sourceItems = group.sourceRowIndexes
    .map((sourceRowIndex) => value.dataPreview!.records[sourceRowIndex - headerRow - 1])
    .filter((record): record is NonNullable<typeof record> => !!record);
  const itemDetails = group.items.map((data, index) => ({ data, sourceRowIndex: group.sourceRowIndexes[index] ?? headerRow + 1 + index }));
  return { ...group, sourceItems, itemDetails };
}

/** Keep large transient row copies out of IndexedDB. Rehydrate them from dataPreview on read. */
function compactForStorage(value: StoredImportWorkspace): StoredImportWorkspace {
  const groups = getWorkspaceGroups(value).map((group) => ({ ...group, sourceItems: [], itemDetails: [] }));
  return {
    ...value,
    groups,
    groupingResult: value.groupingResult ? { ...value.groupingResult, groups: [] } : value.groupingResult,
  };
}

function normalizeLegacy(value: Omit<StoredImportWorkspace, 'id'> & { id?: string } | null | undefined): StoredImportWorkspace | null {
  if (!value) return null;
  const now = value.updatedAt || new Date().toISOString();
  return normalizeWorkspace({ ...value, id: value.id || `source-legacy-${now.replace(/[^0-9]/g, '')}`, createdAt: value.createdAt || now } as StoredImportWorkspace);
}

export function getWorkspaceGroups(value: StoredImportWorkspace | null | undefined): DocumentGroup[] {
  if (!value) return [];
  return value.groups?.length ? value.groups : value.groupingResult?.groups ?? [];
}

async function migrateLegacyIfNeeded(db: IDBDatabase): Promise<void> {
  const sourceTx = db.transaction(SOURCES_STORE, 'readonly');
  const count = await requestValue(sourceTx.objectStore(SOURCES_STORE).count());
  if (count > 0 || !db.objectStoreNames.contains(LEGACY_STORE)) return;

  const legacyTx = db.transaction(LEGACY_STORE, 'readonly');
  const legacy = normalizeLegacy(await requestValue(legacyTx.objectStore(LEGACY_STORE).get(LEGACY_KEY)) as StoredImportWorkspace | undefined);
  if (!legacy) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SOURCES_STORE, SOURCE_META_STORE, META_STORE], 'readwrite');
    tx.objectStore(SOURCES_STORE).put(compactForStorage(legacy));
    tx.objectStore(SOURCE_META_STORE).put(toMetadata(legacy));
    tx.objectStore(META_STORE).put(legacy.id, ACTIVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to migrate imported source library.'));
  });
}

/** Fast source-library listing: returns tiny metadata only, never file bytes/rows/groups. */
export async function listImportWorkspaceMetadata(): Promise<ImportWorkspaceMetadata[]> {
  const db = await openDb();
  try {
    await migrateLegacyIfNeeded(db);
    const tx = db.transaction(SOURCE_META_STORE, 'readonly');
    const values = await requestValue(tx.objectStore(SOURCE_META_STORE).getAll()) as ImportWorkspaceMetadata[];
    return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

/** @deprecated Prefer listImportWorkspaceMetadata + loadImportWorkspace(id) for UI lists. */
export async function listImportWorkspaces(): Promise<StoredImportWorkspace[]> {
  const db = await openDb();
  try {
    await migrateLegacyIfNeeded(db);
    const tx = db.transaction(SOURCES_STORE, 'readonly');
    const values = await requestValue(tx.objectStore(SOURCES_STORE).getAll()) as StoredImportWorkspace[];
    return values.map(normalizeWorkspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export async function getActiveImportWorkspaceId(): Promise<string | null> {
  const db = await openDb();
  try {
    await migrateLegacyIfNeeded(db);
    const tx = db.transaction(META_STORE, 'readonly');
    return (await requestValue(tx.objectStore(META_STORE).get(ACTIVE_KEY)) as string | undefined) ?? null;
  } finally { db.close(); }
}

export async function setActiveImportWorkspace(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(id, ACTIVE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Unable to select imported source.')); };
  });
}

export async function loadImportWorkspace(id?: string): Promise<StoredImportWorkspace | null> {
  const db = await openDb();
  try {
    await migrateLegacyIfNeeded(db);
    let targetId = id;
    if (!targetId) {
      const metaTx = db.transaction(META_STORE, 'readonly');
      targetId = (await requestValue(metaTx.objectStore(META_STORE).get(ACTIVE_KEY)) as string | undefined) ?? undefined;
    }
    if (!targetId) {
      const metaTx = db.transaction(SOURCE_META_STORE, 'readonly');
      const metadata = (await requestValue(metaTx.objectStore(SOURCE_META_STORE).getAll()) as ImportWorkspaceMetadata[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      targetId = metadata[0]?.id;
    }
    if (!targetId) return null;
    const sourceTx = db.transaction(SOURCES_STORE, 'readonly');
    const source = await requestValue(sourceTx.objectStore(SOURCES_STORE).get(targetId)) as StoredImportWorkspace | undefined;
    return source ? normalizeWorkspace(source) : null;
  } finally { db.close(); }
}

export async function saveImportWorkspace(value: StoredImportWorkspace): Promise<void> {
  const db = await openDb();
  const metadata = toMetadata(value);
  const compact = compactForStorage(value);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SOURCES_STORE, SOURCE_META_STORE, META_STORE], 'readwrite');
    tx.objectStore(SOURCES_STORE).put(compact);
    tx.objectStore(SOURCE_META_STORE).put(metadata);
    tx.objectStore(META_STORE).put(value.id, ACTIVE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Unable to save local source library.')); };
  });
}

export async function clearImportWorkspace(id?: string): Promise<void> {
  const db = await openDb();
  try {
    await migrateLegacyIfNeeded(db);
    let targetId = id;
    if (!targetId) {
      const tx = db.transaction(META_STORE, 'readonly');
      targetId = (await requestValue(tx.objectStore(META_STORE).get(ACTIVE_KEY)) as string | undefined) ?? undefined;
    }
    if (!targetId) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SOURCES_STORE, SOURCE_META_STORE], 'readwrite');
      tx.objectStore(SOURCES_STORE).delete(targetId!);
      tx.objectStore(SOURCE_META_STORE).delete(targetId!);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to remove imported source.'));
    });
    const remainingTx = db.transaction(SOURCE_META_STORE, 'readonly');
    const remaining = (await requestValue(remainingTx.objectStore(SOURCE_META_STORE).getAll()) as ImportWorkspaceMetadata[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      if (remaining[0]) tx.objectStore(META_STORE).put(remaining[0].id, ACTIVE_KEY);
      else tx.objectStore(META_STORE).delete(ACTIVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to update active imported source.'));
    });
  } finally { db.close(); }
}
