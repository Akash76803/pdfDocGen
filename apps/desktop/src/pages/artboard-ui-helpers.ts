import type { Artboard } from '@document-tool/contracts';

/**
 * Returns the artboard role, falling back to 'GENERIC' if undefined.
 */
export function getArtboardRole(role?: string): string {
  return role || 'GENERIC';
}

/**
 * Formats the role badge string for display.
 */
export function formatArtboardRole(role?: string): string {
  const r = getArtboardRole(role);
  if (r === 'FRONT') return 'Front';
  if (r === 'BACK') return 'Back';
  return 'Generic';
}

/**
 * Returns a human-readable pair relationship string if the artboard is paired.
 * Returns null if unpaired.
 */
export function getArtboardPairLabel(role: string | undefined, pairId: string | undefined): string | null {
  if (!pairId) return null;
  const r = getArtboardRole(role);
  if (r === 'FRONT') return 'Paired with: Back';
  if (r === 'BACK') return 'Paired with: Front';
  return '↔ Paired';
}

/**
 * Determines whether the "Create Back Side" action should be shown for a given artboard.
 */
export function shouldShowCreateBackSide(artboard: Artboard): boolean {
  // Only eligible if it has no pair, and its role is GENERIC or FRONT.
  // Assuming 'BACK' artboards don't typically spawn 'Back' sides.
  if (artboard.pairId) return false;
  const role = getArtboardRole(artboard.role);
  return role === 'FRONT' || role === 'GENERIC';
}

/**
 * Computes active and selected states cleanly.
 */
export function getArtboardSelectionState(artboardId: string, activeId: string, selectedIds: string[]): { isActive: boolean; isSelected: boolean } {
  return {
    isActive: artboardId === activeId,
    isSelected: selectedIds.includes(artboardId)
  };
}
