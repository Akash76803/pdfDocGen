import { describe, expect, it } from 'vitest';
import {
  ACTIVE_TEMPLATE_ID_KEY,
  beginNewTemplate,
  consumeTemplateBuilderAction,
  migrateLegacyTemplateToLibrary,
  openTemplateFromLibrary,
  readTemplateLibrary,
  saveTemplateToLibrary,
  TEMPLATE_STORAGE_KEY,
} from './templateLibrary.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('DB-2 Fix2/Fix3 template library', () => {
  it('migrates the existing single saved template into the visible library', () => {
    const storage = new MemoryStorage();
    storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify({ name: 'Tax Invoice', updatedAt: '2026-09-14T06:00:00Z', pages: [{ elements: [] }] }));
    const library = migrateLegacyTemplateToLibrary(storage);
    expect(library).toHaveLength(1);
    expect(library[0]?.name).toBe('Tax Invoice');
    expect(library[0]?.documentType).toBe('Invoice');
    expect(library[0]?.status).toBe('Saved');
  });

  it('creates a draft immediately and preserves the previous template', () => {
    const storage = new MemoryStorage();
    const first = saveTemplateToLibrary(storage, { name: 'Invoice A', updatedAt: '2026-09-14T06:00:00Z', pages: [] });
    const draft = beginNewTemplate(storage, { name: 'Quotation B', documentType: 'Quotation', pageSize: 'A5', orientation: 'Landscape', starter: 'blank' });
    const library = readTemplateLibrary(storage);
    expect(library.map((item) => item.name)).toEqual(['Quotation B', 'Invoice A']);
    expect(draft.id).not.toBe(first.id);
    expect(draft.status).toBe('Draft');
    expect(storage.getItem(ACTIVE_TEMPLATE_ID_KEY)).toBe(draft.id);
  });

  it('promotes the active draft to Saved instead of creating a duplicate', () => {
    const storage = new MemoryStorage();
    const draft = beginNewTemplate(storage, { name: 'Invoice 2026', documentType: 'Invoice', starter: 'invoice' });
    consumeTemplateBuilderAction(storage);
    const saved = saveTemplateToLibrary(storage, { name: 'Invoice 2026', documentType: 'Invoice', status: 'Saved', updatedAt: '2026-09-14T07:00:00Z', pages: [{ id: 'p1' }] });
    expect(saved.id).toBe(draft.id);
    expect(readTemplateLibrary(storage)).toHaveLength(1);
    expect(readTemplateLibrary(storage)[0]?.status).toBe('Saved');
  });

  it('opens a library card by synchronizing it to the existing active-template key', () => {
    const storage = new MemoryStorage();
    const entry = saveTemplateToLibrary(storage, { name: 'Invoice A', updatedAt: '2026-09-14T06:00:00Z', pages: [{ id: 'p1' }] });
    storage.removeItem(TEMPLATE_STORAGE_KEY);
    expect(openTemplateFromLibrary(storage, entry.id)?.id).toBe(entry.id);
    expect(storage.getItem(ACTIVE_TEMPLATE_ID_KEY)).toBe(entry.id);
    expect(JSON.parse(storage.getItem(TEMPLATE_STORAGE_KEY) ?? '{}').name).toBe('Invoice A');
  });

  it('new-template request is one-shot and carries setup to Builder', () => {
    const storage = new MemoryStorage();
    beginNewTemplate(storage, { name: 'Landscape Invoice', documentType: 'Invoice', pageSize: 'Letter', orientation: 'Landscape', starter: 'invoice' });
    expect(consumeTemplateBuilderAction(storage)).toEqual({ name: 'Landscape Invoice', documentType: 'Invoice', pageSize: 'Letter', orientation: 'Landscape', starter: 'invoice' });
    expect(consumeTemplateBuilderAction(storage)).toBeNull();
  });
});
