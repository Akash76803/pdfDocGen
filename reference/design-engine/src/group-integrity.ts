import type { Artboard, DesignGroup, DesignTemplate } from '@document-tool/contracts';

/**
 * Repairs flat-group membership after destructive topology operations.
 * Existing group.elementIds are treated as the source of truth, but only
 * members that still exist are retained. Groups with fewer than two members
 * are dissolved and stale element.groupId values are cleared.
 */
export function repairArtboardGroupIntegrity(artboard: Artboard): Artboard {
  const elementsById = new Map(artboard.elements.map(element => [element.id, element] as const));
  const claimed = new Set<string>();
  const groups: DesignGroup[] = [];

  for (const group of artboard.groups ?? []) {
    const elementIds = group.elementIds.filter(id => elementsById.has(id) && !claimed.has(id));
    if (elementIds.length < 2) continue;
    elementIds.forEach(id => claimed.add(id));
    groups.push({ ...group, elementIds, parentGroupId: undefined });
  }

  const groupByElement = new Map<string, string>();
  groups.forEach(group => group.elementIds.forEach(id => groupByElement.set(id, group.id)));
  const liveGroupIds = new Set(groups.map(group => group.id));

  const elements = artboard.elements.map(element => {
    const groupId = groupByElement.get(element.id);
    if (groupId) return element.groupId === groupId ? element : { ...element, groupId };
    if (element.groupId && !liveGroupIds.has(element.groupId)) return { ...element, groupId: undefined };
    if (element.groupId && liveGroupIds.has(element.groupId)) return { ...element, groupId: undefined };
    return element;
  });

  return { ...artboard, groups, elements };
}

export function repairTemplateGroupIntegrity(template: DesignTemplate): DesignTemplate {
  return { ...template, artboards: template.artboards.map(repairArtboardGroupIntegrity) };
}
