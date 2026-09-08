import { getPageDimensions, type Alignment, type BlockAlignment, type PageDefinition } from '@document-tool/contracts';

/**
 * Phase 4.16 renderer-fidelity contract.
 *
 * These helpers intentionally contain no PDF/DOM-specific code. They resolve
 * physical page geometry and deterministic table/block widths so every output
 * renderer can consume the same presentation decisions.
 */
export interface ResolvedPageGeometry {
  widthMm:number;
  heightMm:number;
  marginTopMm:number;
  marginRightMm:number;
  marginBottomMm:number;
  marginLeftMm:number;
  contentWidthMm:number;
  contentHeightMm:number;
}

export interface ResolvedBlockFrame {
  width:number;
  x:number;
  marginTop:number;
  marginRight:number;
  marginBottom:number;
  marginLeft:number;
}

export interface FidelityColumnSpec {
  widthPercent?:number;
  /** Minimum physical/render-space width required by content or a semantic role. */
  minWidth?:number;
  /** Preferred content width used only for AUTO columns. */
  preferredWidth?:number;
  /** Higher values receive a larger share of remaining AUTO width. */
  weight?:number;
}

export function resolvePageGeometry(page:PageDefinition):ResolvedPageGeometry {
  const dims=getPageDimensions(page);
  const m=page.margins;
  return {
    widthMm:dims.widthMm,
    heightMm:dims.heightMm,
    marginTopMm:m.top,
    marginRightMm:m.right,
    marginBottomMm:m.bottom,
    marginLeftMm:m.left,
    contentWidthMm:Math.max(0,dims.widthMm-m.left-m.right),
    contentHeightMm:Math.max(0,dims.heightMm-m.top-m.bottom),
  };
}

export function resolveBlockFrame(
  availableWidth:number,
  widthPercent:number,
  alignment:BlockAlignment,
  marginLeft=0,
  marginRight=0,
  marginTop=0,
  marginBottom=0,
):ResolvedBlockFrame {
  const safePercent=Math.max(0,Math.min(100,Number.isFinite(widthPercent)?widthPercent:100));
  const width=availableWidth*(safePercent/100);
  const aligned=alignment==='CENTER'?(availableWidth-width)/2:alignment==='RIGHT'?availableWidth-width:0;
  return {width,x:aligned+marginLeft-marginRight,marginTop,marginRight,marginBottom,marginLeft};
}

/**
 * Deterministic width resolver shared by table-capable renderers.
 * Explicit percentages remain authoritative. AUTO columns share all remaining
 * space while respecting semantic/content minimum widths. If minimums exceed
 * available width they are proportionally compressed, never allowed to expand
 * the table beyond its configured box.
 */
export function resolveFidelityColumnWidths(specs:FidelityColumnSpec[],totalWidth:number):number[] {
  if(!specs.length) return [];
  const total=Math.max(0,totalWidth);
  const autoIndices=specs.map((s,i)=>s.widthPercent==null?i:-1).filter(i=>i>=0);
  const widths=specs.map(s=>s.widthPercent==null?0:total*Math.max(0,s.widthPercent)/100);

  if(!autoIndices.length){
    const current=widths.reduce((a,b)=>a+b,0);
    if(current<=0) return specs.map(()=>total/specs.length);
    // Treat specified percentages as ratios if they do not sum to 100.
    return widths.map(w=>w*(total/current));
  }

  const remaining=Math.max(0,total-widths.reduce((a,b)=>a+b,0));
  const desired=autoIndices.map(i=>{
    const s=specs[i]!;
    return Math.max(0,s.minWidth??0,s.preferredWidth??0);
  });
  const desiredTotal=desired.reduce((a,b)=>a+b,0);

  if(desiredTotal>=remaining && desiredTotal>0){
    const scale=remaining/desiredTotal;
    autoIndices.forEach((idx,j)=>{widths[idx]=desired[j]!*scale;});
    return normalizeWidthSum(widths,total);
  }

  const extra=Math.max(0,remaining-desiredTotal);
  const weights=autoIndices.map(i=>Math.max(.01,specs[i]!.weight??1));
  const weightTotal=weights.reduce((a,b)=>a+b,0);
  autoIndices.forEach((idx,j)=>{widths[idx]=desired[j]!+extra*(weights[j]!/weightTotal);});
  return normalizeWidthSum(widths,total);
}

function normalizeWidthSum(widths:number[],total:number):number[] {
  const sum=widths.reduce((a,b)=>a+b,0);
  if(!widths.length || Math.abs(sum-total)<1e-7) return widths;
  if(sum<=0) return widths.map(()=>total/widths.length);
  const scale=total/sum;
  return widths.map(w=>w*scale);
}

/** Strings that should preserve a single visual line in financial/table cells. */
export function isFinancialDisplayValue(value:unknown):boolean {
  const text=String(value??'').trim();
  if(!text) return false;
  // Currency symbols/codes and formatted numeric scalars. Keep deliberately
  // conservative so identifiers/descriptions are still free to wrap.
  return /^(?:₹|Rs\.?\s*|INR\s*|\$|€|£)?\s*\(?[-+]?\d[\d,]*(?:\.\d+)?\)?%?$/.test(text);
}

export function semanticColumnWeight(label:string,alignment?:Alignment):number {
  const normalized=label.trim().toLowerCase();
  if(/^(gst|sgst|cgst|igst|tax|qty|quantity|rate|%)$/.test(normalized)) return .75;
  if(/(total|amount|value|taxable)/.test(normalized)) return 1.25;
  if(/(description|product|name|address)/.test(normalized)) return 2.2;
  return alignment==='RIGHT'?1.05:1;
}
