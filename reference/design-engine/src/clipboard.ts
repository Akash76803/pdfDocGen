import type { Artboard, DesignElement, DesignGroup, DesignPoint, DesignTemplate } from '@document-tool/contracts';

export interface DesignClipboardPayload {
  sourceArtboardId: string;
  elements: DesignElement[];
  groups: DesignGroup[];
}

export function createDesignClipboardPayload(
  template: DesignTemplate,
  artboardId: string,
  elementIds: readonly string[],
): DesignClipboardPayload | null {
  const artboard = template.artboards.find((item) => item.id === artboardId);
  if (!artboard) return null;
  const ids = new Set(elementIds);
  const elements = artboard.elements.filter((element) => ids.has(element.id));
  if (!elements.length) return null;
  const includedIds = new Set(elements.map((element) => element.id));
  const groups = artboard.groups.filter((group) => group.elementIds.length > 0 && group.elementIds.every((id) => includedIds.has(id)));
  return {
    sourceArtboardId: artboardId,
    elements: clonePlain(elements),
    groups: clonePlain(groups),
  };
}

export function pasteDesignClipboard(
  template: DesignTemplate,
  targetArtboardId: string,
  payload: DesignClipboardPayload,
  idFactory: (sourceId: string) => string,
  offset: DesignPoint = { xMm: 2, yMm: 2 },
): { template: DesignTemplate; elementIds: string[] } {
  const artboard = template.artboards.find((item) => item.id === targetArtboardId);
  if (!artboard || !payload.elements.length) return { template, elementIds: [] };

  const elementIdMap = new Map<string, string>();
  payload.elements.forEach((element) => elementIdMap.set(element.id, idFactory(element.id)));

  const groupIdMap = new Map<string, string>();
  payload.groups.forEach((group) => groupIdMap.set(group.id, idFactory(group.id)));

  const maxZ = artboard.elements.length ? Math.max(...artboard.elements.map((element) => element.zIndex)) : -1;
  const pastedElements = payload.elements.map((source, index) => {
    const clone = clonePlain(source);
    const mappedGroupId = clone.groupId ? groupIdMap.get(clone.groupId) : undefined;
    return {
      ...clone,
      id: elementIdMap.get(source.id)!,
      name: `${source.name} Copy`,
      position: {
        xMm: source.position.xMm + offset.xMm,
        yMm: source.position.yMm + offset.yMm,
      },
      zIndex: maxZ + index + 1,
      groupId: mappedGroupId,
    } as DesignElement;
  });

  const pastedGroups = payload.groups.map((source) => ({
    ...clonePlain(source),
    id: groupIdMap.get(source.id)!,
    name: `${source.name} Copy`,
    parentGroupId: undefined,
    elementIds: source.elementIds.map((elementId) => elementIdMap.get(elementId)!).filter(Boolean),
  }));

  const nextArtboard: Artboard = {
    ...artboard,
    elements: [...artboard.elements, ...pastedElements],
    groups: [...artboard.groups, ...pastedGroups],
  };

  return {
    template: {
      ...template,
      artboards: template.artboards.map((item) => item.id === targetArtboardId ? nextArtboard : item),
    },
    elementIds: pastedElements.map((element) => element.id),
  };
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
