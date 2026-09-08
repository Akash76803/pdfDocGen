import type { DocumentGroup } from '@document-tool/contracts';

export function retainAvailableGroupIds(current: string[], groups: readonly DocumentGroup[]): string[] {
  const available = new Set(groups.map((group) => group.id));
  const next = current.filter((id) => available.has(id));
  return next.length === current.length ? current : next;
}

export function selectDefaultCollectionPath(collections: readonly { path:string }[]): string {
  return collections.find((collection) => collection.path === 'items')?.path
    ?? collections.find((collection) => collection.path === 'sourceItems')?.path
    ?? collections[0]?.path
    ?? 'items';
}
