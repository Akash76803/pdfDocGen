export type LinearWidthMode = 'AUTO'|'PERCENT'|'FIXED';
export interface LinearWidthSpec {
  mode: LinearWidthMode;
  percent?: number;
  fixed?: number;
}

/**
 * Renderer-neutral row-column allocator.
 * - FIXED reserves exact units first (mm converted by caller for PDF, px for DOM probes).
 * - PERCENT consumes the requested share of the non-fixed pool.
 * - AUTO/FLEX shares whatever remains after explicit percentage allocations.
 * - If explicit requests overrun the available width, non-fixed widths are scaled proportionally;
 *   fixed widths are preserved whenever physically possible.
 */
export function allocateLinearWidths(specs: readonly LinearWidthSpec[], available: number): number[] {
  if (!specs.length) return [];
  const safeAvailable = Math.max(0, available);
  const fixed = specs.map((s) => s.mode === 'FIXED' ? Math.max(0, s.fixed ?? 0) : 0);
  const fixedTotal = fixed.reduce((a,b)=>a+b,0);
  if (fixedTotal >= safeAvailable && fixedTotal > 0) {
    const scale = safeAvailable / fixedTotal;
    return fixed.map((v,i)=> specs[i]!.mode === 'FIXED' ? v*scale : 0);
  }

  const pool = Math.max(0, safeAvailable-fixedTotal);
  const explicitPercent = specs.map((s)=>s.mode==='PERCENT'?Math.max(0,s.percent??0):0);
  const percentTotal = explicitPercent.reduce((a,b)=>a+b,0);
  const autoCount = specs.filter((s)=>s.mode==='AUTO').length;

  let percentScale = 1;
  if (percentTotal > 100) percentScale = 100/percentTotal;
  const percentWidths = explicitPercent.map((p)=> pool*(p*percentScale/100));
  const usedPercent = percentWidths.reduce((a,b)=>a+b,0);
  const autoPool = Math.max(0,pool-usedPercent);
  const autoWidth = autoCount ? autoPool/autoCount : 0;

  // If there are only PERCENT columns and their declared total is <100, preserve legacy
  // behavior by scaling them to fill the non-fixed pool instead of leaving dead space.
  const percentOnly = autoCount===0 && specs.some(s=>s.mode==='PERCENT');
  const fillScale = percentOnly && usedPercent > 0 ? pool/usedPercent : 1;

  return specs.map((s,i)=>{
    if(s.mode==='FIXED') return fixed[i]!;
    if(s.mode==='AUTO') return autoWidth;
    return percentWidths[i]!*fillScale;
  });
}
