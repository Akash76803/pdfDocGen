import { describe, expect, it } from 'vitest';
import type { DesignTemplate, ImageDesignElement } from '@document-tool/contracts';
import { deserializeDesignTemplate, resolveElementBindings, serializeDesignTemplate, setSourceFieldBinding } from '@document-tool/design-engine';

const FALLBACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const RUNTIME_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//9k=';

function templateWithBinding(): DesignTemplate {
  const image = setSourceFieldBinding({
    id: 'img-1', type: 'IMAGE', name: 'Photo', assetId: 'manual-asset', fit: 'FIT',
    position: { xMm: 0, yMm: 0 }, size: { widthMm: 20, heightMm: 20 },
    rotationDeg: 0, opacity: 1, visible: true, locked: false, zIndex: 1,
  } as ImageDesignElement, 'photo');

  return {
    kind: 'CARD_DESIGN', schemaVersion: 1, id: 't1', name: 'Base64 binding', version: 1, status: 'DRAFT',
    sharedAssets: [{ id: 'manual-asset', name: 'Fallback', kind: 'IMAGE', sourceType: 'DATA_URL', source: FALLBACK, mimeType: 'image/png' }],
    artboards: [{ id: 'a1', name: 'Front', order: 0, widthMm: 90, heightMm: 50, background: { type: 'NONE' }, elements: [image], groups: [], guides: [], print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}} }],
  } as DesignTemplate;
}

describe('Dynamic Base64 image binding persistence', () => {
  it('10. binding survives save/reopen and resolved runtime Base64 never enters the persisted template', () => {
    const template = templateWithBinding();
    const sourceImage = template.artboards[0]!.elements[0] as ImageDesignElement & { source?: string };
    const resolved = resolveElementBindings(sourceImage, { record: { photo: RUNTIME_JPEG } }) as ImageDesignElement & { source?: string };

    expect(resolved.source).toBe(RUNTIME_JPEG);
    expect(sourceImage.source).toBeUndefined();

    const serialized = serializeDesignTemplate(template);
    expect(serialized).not.toContain(RUNTIME_JPEG);

    const reopened = deserializeDesignTemplate(serialized);
    const image = reopened.artboards[0]!.elements[0] as ImageDesignElement & { source?: string };
    expect(image.assetId).toBe('manual-asset');
    expect(image.bindings?.find(binding => binding.targetProperty === 'source')?.fieldPath).toBe('photo');
    expect(image.source).toBeUndefined();
    expect(reopened.sharedAssets[0]!.source).toBe(FALLBACK);
  });
});
