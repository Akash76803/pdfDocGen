import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileStore = vi.hoisted(() => ({
  readLocalTemplateFiles: vi.fn(),
  persistTemplateFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./templateFileStore.ts', () => ({
  readLocalTemplateFiles: fileStore.readLocalTemplateFiles,
  persistTemplateFile: fileStore.persistTemplateFile,
  deleteTemplateFile: vi.fn(),
}));

import {
  ACTIVE_TEMPLATE_ID_KEY,
  TEMPLATE_STORAGE_KEY,
  readTemplateLibrary,
  syncTemplateLibraryFromLocalFiles,
  type TemplateLibraryEntry,
} from './templateLibrary.ts';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const taxId = '73165488-8888-4c23-916c-d7564863b60e';
const tax: TemplateLibraryEntry = {
  id: taxId,
  name: 'Tax',
  documentType: 'Invoice',
  status: 'Published',
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
  payload: {
    name: 'Tax',
    updatedAt: '2026-09-27T10:00:00.000Z',
    pages: [{ id: 'page-1', elements: [
      ...Array.from({ length: 5 }, (_, index) => ({ id: 'text-' + index, type: 'text', text: 'Visible' })),
      { id: 'divider', type: 'divider' },
      { id: 'table', type: 'table' },
    ] }],
  },
};

describe('Desktop template file library sync', () => {
  beforeEach(() => {
    fileStore.readLocalTemplateFiles.mockReset();
    fileStore.persistTemplateFile.mockClear();
  });

  it('recovers a published, seven-element saved Tax JSON file into the visible library and active builder', async () => {
    fileStore.readLocalTemplateFiles.mockResolvedValue([tax]);
    const storage = new MemoryStorage();
    const loaded = await syncTemplateLibraryFromLocalFiles(storage);
    expect(loaded).toHaveLength(1);
    expect(readTemplateLibrary(storage)[0]?.status).toBe('Published');
    expect(readTemplateLibrary(storage)[0]?.id).toBe(taxId);
    expect(storage.getItem(ACTIVE_TEMPLATE_ID_KEY)).toBe(taxId);
    const payload = JSON.parse(storage.getItem(TEMPLATE_STORAGE_KEY) ?? '{}') as { pages?: Array<{ elements?: unknown[] }> };
    expect(payload.pages?.[0]?.elements).toHaveLength(7);
  });

  it('does not destroy existing cached templates when disk enumeration fails', async () => {
    const storage = new MemoryStorage();
    fileStore.readLocalTemplateFiles.mockResolvedValue([tax]);
    await syncTemplateLibraryFromLocalFiles(storage);
    fileStore.readLocalTemplateFiles.mockRejectedValue(new Error('fs.readDir denied'));
    await expect(syncTemplateLibraryFromLocalFiles(storage)).rejects.toThrow('fs.readDir denied');
    expect(readTemplateLibrary(storage)).toHaveLength(1);
    expect(readTemplateLibrary(storage)[0]?.id).toBe(taxId);
  });
});
