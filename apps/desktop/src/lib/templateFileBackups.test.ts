import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateLibraryEntry } from './templateLibrary.ts';

const disk = vi.hoisted(() => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return { files, dirs };
});
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/appdata'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));
vi.mock('@tauri-apps/api/fs', () => ({
  createDir: vi.fn(async (path: string) => { disk.dirs.add(path); }),
  readTextFile: vi.fn(async (path: string) => {
    const content = disk.files.get(path);
    if (content === undefined) throw new Error('NotFound');
    return content;
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => { disk.files.set(path, content); }),
  readDir: vi.fn(async (path: string) => [...disk.files.keys()]
    .filter((name) => name.startsWith(path + '/') && !name.slice(path.length + 1).includes('/'))
    .map((file) => ({ name: file.split('/').slice(-1)[0], path: file }))),
  removeFile: vi.fn(async (path: string) => { disk.files.delete(path); }),
}));
vi.mock('./imageAssetStore.ts', () => ({ loadImageAsset: vi.fn() }));

import { persistTemplateFile, readLocalTemplateFiles } from './templateFileStore.ts';
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';

const id = 'tax-test-id';
const live = `/appdata/templates/${id}.json`;
const backupDirectory = `/appdata/templates/backups/${id}/`;
const entry = (revision: number): TemplateLibraryEntry => ({
  id, name: 'Tax', documentType: 'Invoice', status: 'Saved',
  createdAt: '2026-09-25T10:00:00.000Z',
  updatedAt: `2026-09-27T10:00:${String(revision).padStart(2, '0')}.000Z`,
  payload: { name: 'Tax', updatedAt: '2026-09-27T10:00:00.000Z',
    pages: [{ id: 'page-1', elements: [{ id: 'text-1', text: String(revision) }] }],
  },
});

describe('automatic local template backups', () => {
  beforeEach(() => {
    disk.files.clear();
    disk.dirs.clear();
    vi.clearAllMocks();
    Object.assign(window, { __TAURI_IPC__: vi.fn() });
  });

  it('saves the live template normally on first Save without creating a backup', async () => {
    await persistTemplateFile(entry(1));
    expect(JSON.parse(disk.files.get(live) ?? '{}').payload.pages[0].elements[0].text).toBe('1');
    expect([...disk.files.keys()].filter((key) => key.startsWith(backupDirectory))).toHaveLength(0);
  });

  it('takes a restorable snapshot before overwriting an edited template', async () => {
    await persistTemplateFile(entry(1));
    const original = disk.files.get(live);
    await persistTemplateFile(entry(2));
    const backups = [...disk.files.keys()].filter((key) => key.startsWith(backupDirectory));
    expect(backups).toHaveLength(1);
    expect(disk.files.get(backups[0])).toBe(original);
    expect(JSON.parse(disk.files.get(live) ?? '{}').payload.pages[0].elements[0].text).toBe('2');
    // Non-json nested backup directories cannot become visible template cards.
    expect(await readLocalTemplateFiles()).toHaveLength(1);
  });

  it('does not produce duplicate snapshots when a save has identical content', async () => {
    const snapshot = entry(1);
    await persistTemplateFile(snapshot);
    await persistTemplateFile(snapshot);
    expect([...disk.files.keys()].filter((key) => key.startsWith(backupDirectory))).toHaveLength(0);
  });

  it('keeps only ten newest historical snapshots per template', async () => {
    for (let index = 0; index < 14; index += 1) await persistTemplateFile(entry(index));
    const backups = [...disk.files.keys()].filter((key) => key.startsWith(backupDirectory));
    expect(backups).toHaveLength(10);
    const revisions = backups.map((path) => JSON.parse(disk.files.get(path) ?? '{}').payload.pages[0].elements[0].text);
    expect(revisions).toContain('12');
    expect(revisions).not.toContain('0');
  });

  it('refuses to overwrite if existing backup cannot be written', async () => {
    await persistTemplateFile(entry(1));
    const old = disk.files.get(live);
    vi.mocked(writeTextFile).mockImplementationOnce(async (file, content) => {
      const path = typeof file === 'string' ? file : String(file.path ?? '');
      if (path.startsWith(backupDirectory)) throw new Error('disk full');
      disk.files.set(path, content);
    });
    await expect(persistTemplateFile(entry(2))).rejects.toThrow('disk full');
    expect(disk.files.get(live)).toBe(old);
  });

  it('refuses to overwrite when existing template cannot be read', async () => {
    await persistTemplateFile(entry(1));
    const old = disk.files.get(live);
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error('Permission denied'));
    await expect(persistTemplateFile(entry(2))).rejects.toThrow('Permission denied');
    expect(disk.files.get(live)).toBe(old);
  });
});
