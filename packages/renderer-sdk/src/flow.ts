/** Renderer-neutral sequential block-flow helpers. No DOM/PDF dependency. */
export interface FlowItemMetric { id:string; height:number; marginTop?:number; marginBottom?:number; }
export interface FlowPosition { id:string; top:number; bottom:number; height:number; }

/**
 * Computes runtime Y positions from measured heights. Design-time absolute Y is
 * intentionally not part of the contract: ordinary document blocks always flow.
 */
export function layoutFlow(items:FlowItemMetric[], startY=0, defaultSpacing=0):FlowPosition[]{
  const out:FlowPosition[]=[];
  let cursor=startY;
  for(const item of items){
    cursor += item.marginTop ?? defaultSpacing;
    const top=cursor;
    const height=Math.max(0,item.height);
    const bottom=top+height;
    out.push({id:item.id,top,bottom,height});
    cursor=bottom+(item.marginBottom ?? 0);
  }
  return out;
}
