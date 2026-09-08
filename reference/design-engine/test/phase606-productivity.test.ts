import { describe, expect, it } from 'vitest';
import type { DesignTemplate } from '@document-tool/contracts';
import {
  addArtboard,
  addDesignElement,
  commitDesignHistory,
  createBlankArtboard,
  createDesignClipboardPayload,
  createDesignHistory,
  createShapeElement,
  createTextElement,
  groupElements,
  pasteDesignClipboard,
  redoDesignHistory,
  undoDesignHistory,
} from '../src/index.js';

function template(): DesignTemplate {
  const front = createBlankArtboard({ id: 'front', name: 'Front', order: 0, widthMm: 90, heightMm: 50 });
  const back = createBlankArtboard({ id: 'back', name: 'Back', order: 1, widthMm: 90, heightMm: 50 });
  let result: DesignTemplate = {
    kind: 'CARD_DESIGN',
    schemaVersion: 1,
    id: 'card',
    name: 'Card',
    version: 1,
    status: 'DRAFT',
    artboards: [front],
    sharedAssets: [],
  };
  result = addArtboard(result, back);
  result = addDesignElement(result, 'front', createTextElement({ id: 'text', xMm: 10, yMm: 10, zIndex: 0 }));
  result = addDesignElement(result, 'front', createShapeElement('RECTANGLE', { id: 'shape', xMm: 20, yMm: 20, zIndex: 1 }));
  return groupElements(result, 'front', ['text', 'shape'], 'group', 'Pair');
}

describe('Phase 6.0.6 productivity foundation', () => {
  it('supports bounded undo and redo history', () => {
    const original = template();
    const renamed = { ...original, name: 'One' };
    const renamedAgain = { ...renamed, name: 'Two' };
    let history = createDesignHistory(original, 2);
    history = commitDesignHistory(history, renamed);
    history = commitDesignHistory(history, renamedAgain);
    expect(history.past).toHaveLength(2);
    history = undoDesignHistory(history);
    expect(history.present.name).toBe('One');
    history = undoDesignHistory(history);
    expect(history.present.name).toBe('Card');
    history = redoDesignHistory(history);
    expect(history.present.name).toBe('One');
  });

  it('clears redo after a new committed edit', () => {
    const original = template();
    let history = createDesignHistory(original);
    history = commitDesignHistory(history, { ...original, name: 'One' });
    history = undoDesignHistory(history);
    expect(history.future).toHaveLength(1);
    history = commitDesignHistory(history, { ...history.present, name: 'Different' });
    expect(history.future).toHaveLength(0);
  });

  it('copies a complete flat group and pastes it with new ids', () => {
    const original = template();
    const payload = createDesignClipboardPayload(original, 'front', ['text', 'shape']);
    expect(payload?.groups).toHaveLength(1);
    let serial = 0;
    const result = pasteDesignClipboard(original, 'front', payload!, () => `copy-${++serial}`, { xMm: 3, yMm: 4 });
    const front = result.template.artboards.find((artboard) => artboard.id === 'front')!;
    expect(result.elementIds).toHaveLength(2);
    expect(front.elements).toHaveLength(4);
    expect(front.groups).toHaveLength(2);
    const pastedText = front.elements.find((element) => result.elementIds.includes(element.id) && element.type === 'TEXT')!;
    expect(pastedText.position).toEqual({ xMm: 13, yMm: 14 });
    expect(pastedText.groupId).toBeTruthy();
    expect(pastedText.groupId).not.toBe('group');
  });

  it('supports cross-artboard paste without mutating the source artboard', () => {
    const original = template();
    const payload = createDesignClipboardPayload(original, 'front', ['text', 'shape'])!;
    let serial = 0;
    const result = pasteDesignClipboard(original, 'back', payload, () => `back-${++serial}`);
    const front = result.template.artboards.find((artboard) => artboard.id === 'front')!;
    const back = result.template.artboards.find((artboard) => artboard.id === 'back')!;
    expect(front.elements.map((element) => element.id)).toEqual(['text', 'shape']);
    expect(back.elements).toHaveLength(2);
    expect(back.groups).toHaveLength(1);
  });

  it('returns no clipboard payload for an empty selection', () => {
    expect(createDesignClipboardPayload(template(), 'front', [])).toBeNull();
  });
});
