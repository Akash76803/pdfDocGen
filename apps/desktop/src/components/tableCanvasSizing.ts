/** Intrinsic Custom Table height, independent of the previous selection-wrapper height.
 * Floating/flow parent height is updated from this result, while dynamic tables
 * preserve their existing pagination/overflow measurement contract.
 */
export function measuredTableHeight(
  mode: 'custom' | 'dynamic',
  tableHeight: number,
  rulerHeight: number,
  shellScrollHeight: number,
  tableScrollHeight: number,
): number {
  const intrinsic = Math.max(0, tableHeight) + Math.max(0, rulerHeight);
  const rendered = mode === 'custom'
    ? intrinsic
    : Math.max(shellScrollHeight, tableScrollHeight, intrinsic);
  return Math.max(32, Math.ceil(rendered));
}
