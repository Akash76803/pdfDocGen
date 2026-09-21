import { deleteTemplateFile, persistTemplateFile, readLocalTemplateFiles } from './templateFileStore.ts';

export const TEMPLATE_STORAGE_KEY = 'document-builder.template.db2.v1';
export const TEMPLATE_LIBRARY_KEY = 'document-builder.template-library.db2fix2.v1';
export const ACTIVE_TEMPLATE_ID_KEY = 'document-builder.template-library.active-id.v1';
export const TEMPLATE_BUILDER_ACTION_KEY = 'document-builder.template-library.builder-action.v1';
export const TEMPLATE_LIBRARY_EVENT = 'document-builder:template-library-changed';

export type TemplateDocumentType = 'Invoice' | 'Quotation' | 'Report' | 'Certificate' | 'Agreement' | 'Letter' | 'Document';
export type TemplateDraftStatus = 'Draft' | 'Saved' | 'Published' | 'Archived';
export type TemplateStarter = 'blank' | 'invoice';
export type NewTemplateRequest = {
  name: string;
  documentType: TemplateDocumentType;
  pageSize: 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid' | 'Executive';
  orientation: 'Portrait' | 'Landscape';
  starter: TemplateStarter;
};

export type TemplateLibraryPayload = {
  name: string;
  updatedAt: string;
  pages?: unknown[];
  activePageId?: string;
  pageSize?: string;
  orientation?: string;
  elements?: unknown[];
  documentType?: TemplateDocumentType;
  status?: TemplateDraftStatus;
  starter?: TemplateStarter;
  category?: string;
  version?: number;
  publishedAt?: string;
};

export type TemplateLibraryEntry = {
  id: string;
  name: string;
  documentType: TemplateDocumentType;
  status: TemplateDraftStatus;
  createdAt: string;
  updatedAt: string;
  payload: TemplateLibraryPayload;
  category?: string;
  version?: number;
  cloudPublication?: {
    version: number;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    publishedAt: string;
    apiBaseUrl: string;
  };
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function inferDocumentType(name: string): TemplateDocumentType {
  const value = name.toLowerCase();
  if (value.includes('invoice')) return 'Invoice';
  if (value.includes('quotation') || value.includes('quote')) return 'Quotation';
  if (value.includes('report')) return 'Report';
  if (value.includes('certificate')) return 'Certificate';
  if (value.includes('agreement') || value.includes('contract')) return 'Agreement';
  if (value.includes('letter')) return 'Letter';
  return 'Document';
}

function notifyLibraryChanged(storage: Storage) {
  if (typeof window !== 'undefined' && storage === window.localStorage) window.dispatchEvent(new Event(TEMPLATE_LIBRARY_EVENT));
}

export function readTemplateLibrary(storage: Storage): TemplateLibraryEntry[] {
  const parsed = safeParse<TemplateLibraryEntry[]>(storage.getItem(TEMPLATE_LIBRARY_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item.id === 'string' && item.payload && typeof item.payload === 'object')
    .map((item) => ({ ...item, status: item.status ?? item.payload.status ?? 'Saved', category: item.category ?? item.payload.category ?? 'General', version: item.version ?? item.payload.version ?? 1 }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function migrateLegacyTemplateToLibrary(storage: Storage): TemplateLibraryEntry[] {
  const current = readTemplateLibrary(storage);
  if (current.length) return current;
  const legacy = safeParse<TemplateLibraryPayload | null>(storage.getItem(TEMPLATE_STORAGE_KEY), null);
  if (!legacy || !legacy.name || (!Array.isArray(legacy.pages) && !Array.isArray(legacy.elements))) return current;
  const updatedAt = legacy.updatedAt || new Date().toISOString();
  const entry: TemplateLibraryEntry = {
    id: crypto.randomUUID(),
    name: legacy.name || 'Untitled Document',
    documentType: legacy.documentType || inferDocumentType(legacy.name || ''),
    status: legacy.status ?? 'Saved',
    createdAt: updatedAt,
    updatedAt,
    payload: { ...legacy, status: legacy.status ?? 'Saved', updatedAt },
  };
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify([entry]));
  storage.setItem(ACTIVE_TEMPLATE_ID_KEY, entry.id);
  notifyLibraryChanged(storage);
  void persistTemplateFile(entry);
  return [entry];
}

export function saveTemplateToLibrary(storage: Storage, payload: TemplateLibraryPayload): TemplateLibraryEntry {
  const now = payload.updatedAt || new Date().toISOString();
  const library = readTemplateLibrary(storage);
  const activeId = storage.getItem(ACTIVE_TEMPLATE_ID_KEY);
  const index = activeId ? library.findIndex((item) => item.id === activeId) : -1;
  const existing = index >= 0 ? library[index] : undefined;
  const status: TemplateDraftStatus = payload.status ?? 'Saved';
  const entry: TemplateLibraryEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    name: payload.name || 'Untitled Document',
    documentType: payload.documentType || existing?.documentType || inferDocumentType(payload.name || ''),
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    category: payload.category ?? existing?.category ?? 'General',
    version: payload.version ?? existing?.version ?? 1,
    payload: { ...payload, status, category: payload.category ?? existing?.category ?? 'General', version: payload.version ?? existing?.version ?? 1, updatedAt: now },
  };
  const next = library.filter((item) => item.id !== entry.id);
  next.unshift(entry);
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(next));
  storage.setItem(ACTIVE_TEMPLATE_ID_KEY, entry.id);
  // Keep the existing single-template storage contract as the active template.
  // Generate and older Builder code therefore remain backward compatible.
  storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(entry.payload));
  notifyLibraryChanged(storage);
  void persistTemplateFile(entry);
  return entry;
}

export function openTemplateFromLibrary(storage: Storage, id: string): TemplateLibraryEntry | null {
  const entry = readTemplateLibrary(storage).find((item) => item.id === id) ?? null;
  if (!entry) return null;
  storage.setItem(ACTIVE_TEMPLATE_ID_KEY, entry.id);
  storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(entry.payload));
  storage.removeItem(TEMPLATE_BUILDER_ACTION_KEY);
  return entry;
}

/**
 * DB-2 Fix3: creates the draft in the library immediately, then hands the
 * exact setup request to Template Builder. The legacy active-template key is
 * also written so reopening the draft before the first explicit Save is safe.
 */
export function beginNewTemplate(storage: Storage, request?: Partial<NewTemplateRequest>): TemplateLibraryEntry {
  const normalized: NewTemplateRequest = {
    name: request?.name?.trim() || 'Untitled Document',
    documentType: request?.documentType ?? 'Document',
    pageSize: request?.pageSize ?? 'A4',
    orientation: request?.orientation ?? 'Portrait',
    starter: request?.starter ?? 'blank',
  };
  const now = new Date().toISOString();
  const draftPayload: TemplateLibraryPayload = {
    name: normalized.name,
    documentType: normalized.documentType,
    status: 'Draft',
    starter: normalized.starter,
    pageSize: normalized.pageSize,
    orientation: normalized.orientation,
    elements: [],
    updatedAt: now,
  };
  // A new draft must never update the current active template.
  storage.removeItem(ACTIVE_TEMPLATE_ID_KEY);
  const entry = saveTemplateToLibrary(storage, draftPayload);
  storage.setItem(TEMPLATE_BUILDER_ACTION_KEY, JSON.stringify({ type: 'new', request: normalized }));
  return entry;
}

export function consumeTemplateBuilderAction(storage: Storage): NewTemplateRequest | null {
  const raw = storage.getItem(TEMPLATE_BUILDER_ACTION_KEY);
  if (!raw) return null;
  storage.removeItem(TEMPLATE_BUILDER_ACTION_KEY);
  // Backward compatibility with DB-2 Fix2's plain `new` action.
  if (raw === 'new') return { name: 'Untitled Document', documentType: 'Document', pageSize: 'A4', orientation: 'Portrait', starter: 'blank' };
  const parsed = safeParse<{ type?: string; request?: Partial<NewTemplateRequest> } | null>(raw, null);
  if (!parsed || parsed.type !== 'new') return null;
  return {
    name: parsed.request?.name?.trim() || 'Untitled Document',
    documentType: parsed.request?.documentType ?? 'Document',
    pageSize: parsed.request?.pageSize ?? 'A4',
    orientation: parsed.request?.orientation ?? 'Portrait',
    starter: parsed.request?.starter ?? 'blank',
  };
}

export function updateTemplateMetadata(storage: Storage, id: string, patch: { name?: string; category?: string; status?: TemplateDraftStatus }): TemplateLibraryEntry | null {
  const library = readTemplateLibrary(storage);
  const index = library.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const current = library[index];
  const nextStatus = patch.status ?? current.status;
  const next: TemplateLibraryEntry = {
    ...current,
    name: patch.name?.trim() || current.name,
    category: patch.category?.trim() || current.category || 'General',
    status: nextStatus,
    updatedAt: now,
    payload: {
      ...current.payload,
      name: patch.name?.trim() || current.name,
      category: patch.category?.trim() || current.category || 'General',
      status: nextStatus,
      publishedAt: nextStatus === 'Published' ? now : current.payload.publishedAt,
      updatedAt: now,
    },
  };
  const result = library.map((item) => item.id === id ? next : item);
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(result));
  if (storage.getItem(ACTIVE_TEMPLATE_ID_KEY) === id) storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next.payload));
  notifyLibraryChanged(storage);
  void persistTemplateFile(next);
  return next;
}

export function recordCloudPublication(
  storage: Storage,
  id: string,
  publication: NonNullable<TemplateLibraryEntry['cloudPublication']>,
): TemplateLibraryEntry | null {
  const library = readTemplateLibrary(storage);
  const current = library.find((item) => item.id === id);
  if (!current) return null;
  const now = new Date().toISOString();
  const next: TemplateLibraryEntry = {
    ...current,
    status: publication.status === 'ACTIVE' ? 'Published' : publication.status === 'ARCHIVED' ? 'Archived' : 'Draft',
    version: publication.version,
    updatedAt: now,
    cloudPublication: publication,
    payload: {
      ...current.payload,
      status: publication.status === 'ACTIVE' ? 'Published' : publication.status === 'ARCHIVED' ? 'Archived' : 'Draft',
      version: publication.version,
      publishedAt: publication.publishedAt,
      updatedAt: now,
    },
  };
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(library.map((item) => item.id === id ? next : item)));
  if (storage.getItem(ACTIVE_TEMPLATE_ID_KEY) === id) storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next.payload));
  notifyLibraryChanged(storage);
  void persistTemplateFile(next);
  return next;
}

export function duplicateTemplate(storage: Storage, id: string): TemplateLibraryEntry | null {
  const source = readTemplateLibrary(storage).find((item) => item.id === id);
  if (!source) return null;
  const now = new Date().toISOString();
  const entry: TemplateLibraryEntry = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} Copy`,
    status: 'Draft',
    createdAt: now,
    updatedAt: now,
    version: 1,
    payload: { ...source.payload, name: `${source.name} Copy`, status: 'Draft', version: 1, publishedAt: undefined, updatedAt: now },
  };
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify([entry, ...readTemplateLibrary(storage)]));
  notifyLibraryChanged(storage);
  void persistTemplateFile(entry);
  return entry;
}

export function saveAsTemplate(storage: Storage, id: string, name: string): TemplateLibraryEntry | null {
  const copy = duplicateTemplate(storage, id);
  if (!copy) return null;
  return updateTemplateMetadata(storage, copy.id, { name, status: 'Draft' });
}

export function createTemplateVersion(storage: Storage, id: string): TemplateLibraryEntry | null {
  const current = readTemplateLibrary(storage).find((item) => item.id === id);
  if (!current) return null;
  const version = (current.version ?? 1) + 1;
  const copy = duplicateTemplate(storage, id);
  if (!copy) return null;
  const library = readTemplateLibrary(storage);
  const next = library.map((item) => item.id === copy.id ? { ...item, name: current.name, version, payload: { ...item.payload, name: current.name, version } } : item);
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(next));
  notifyLibraryChanged(storage);
  const versioned = next.find((item) => item.id === copy.id) ?? null;
  if (versioned) void persistTemplateFile(versioned);
  return versioned;
}

export function removeTemplateFromLibrary(storage: Storage, id: string) {
  const next = readTemplateLibrary(storage).filter((item) => item.id !== id);
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(next));
  if (storage.getItem(ACTIVE_TEMPLATE_ID_KEY) === id) {
    storage.removeItem(ACTIVE_TEMPLATE_ID_KEY);
    if (next[0]) {
      storage.setItem(ACTIVE_TEMPLATE_ID_KEY, next[0].id);
      storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next[0].payload));
    } else {
      storage.removeItem(TEMPLATE_STORAGE_KEY);
    }
  }
  notifyLibraryChanged(storage);
  void deleteTemplateFile(id);
}

export async function syncTemplateLibraryFromLocalFiles(storage: Storage): Promise<TemplateLibraryEntry[]> {
  const cachedEntries = readTemplateLibrary(storage);
  const localEntries = await readLocalTemplateFiles();
  const merged = new Map<string, TemplateLibraryEntry>();
  for (const entry of cachedEntries) merged.set(entry.id, entry);
  for (const entry of localEntries) {
    const current = merged.get(entry.id);
    if (!current || Date.parse(entry.updatedAt) >= Date.parse(current.updatedAt)) merged.set(entry.id, entry);
  }
  const result = Array.from(merged.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  storage.setItem(TEMPLATE_LIBRARY_KEY, JSON.stringify(result));
  const activeId = storage.getItem(ACTIVE_TEMPLATE_ID_KEY);
  const active = (activeId ? result.find((entry) => entry.id === activeId) : undefined) ?? result[0];
  if (active) {
    storage.setItem(ACTIVE_TEMPLATE_ID_KEY, active.id);
    storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(active.payload));
  }
  // Backfill templates created before DB-6B Fix2 into durable local JSON files.
  await Promise.allSettled(result.map((entry) => persistTemplateFile(entry)));
  notifyLibraryChanged(storage);
  return result;
}

export function templatePageCount(entry: TemplateLibraryEntry): number {
  return Array.isArray(entry.payload.pages) ? entry.payload.pages.length : 1;
}

export function templateElementCount(entry: TemplateLibraryEntry): number {
  if (Array.isArray(entry.payload.pages)) {
    return entry.payload.pages.reduce<number>((total, page) => {
      const elements = page && typeof page === 'object' && Array.isArray((page as { elements?: unknown[] }).elements)
        ? (page as { elements: unknown[] }).elements.length : 0;
      return total + elements;
    }, 0);
  }
  return Array.isArray(entry.payload.elements) ? entry.payload.elements.length : 0;
}
