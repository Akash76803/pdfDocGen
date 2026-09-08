import type { Artboard, DesignElement } from '@document-tool/contracts';
import type { DesignRectMm } from './transform.js';
import { rectIntersects } from './transform.js';

export interface DesignSelectionState { artboardId:string; elementIds:string[]; primaryElementId?:string; }
export function emptySelection(artboardId:string):DesignSelectionState{return{artboardId,elementIds:[]};}
export function selectOnly(artboardId:string,elementId:string):DesignSelectionState{return{artboardId,elementIds:[elementId],primaryElementId:elementId};}
export function toggleSelection(state:DesignSelectionState,elementId:string):DesignSelectionState{
  const exists=state.elementIds.includes(elementId);
  if(exists){const ids=state.elementIds.filter(id=>id!==elementId);return{...state,elementIds:ids,primaryElementId:state.primaryElementId===elementId?ids.at(-1):state.primaryElementId};}
  return{...state,elementIds:[...state.elementIds,elementId],primaryElementId:elementId};
}
export function selectAllSelectable(artboard:Artboard):DesignSelectionState{
  const ids=artboard.elements.filter(e=>e.visible&&!e.locked).map(e=>e.id);
  return{artboardId:artboard.id,elementIds:ids,primaryElementId:ids.at(-1)};
}
export function sanitizeSelection(state:DesignSelectionState,artboard:Artboard):DesignSelectionState{
  if(state.artboardId!==artboard.id)return emptySelection(artboard.id);
  const valid=new Set(artboard.elements.filter(e=>e.visible).map(e=>e.id));const ids=state.elementIds.filter(id=>valid.has(id));
  return{artboardId:artboard.id,elementIds:ids,primaryElementId:state.primaryElementId&&valid.has(state.primaryElementId)?state.primaryElementId:ids.at(-1)};
}
export function selectByMarquee(artboard:Artboard,rect:DesignRectMm,mode:'REPLACE'|'ADD'='REPLACE',current:DesignSelectionState=emptySelection(artboard.id)):DesignSelectionState{
  const hit=artboard.elements.filter(e=>e.visible&&!e.locked&&rectIntersects({xMm:e.position.xMm,yMm:e.position.yMm,widthMm:e.size.widthMm,heightMm:e.size.heightMm},rect)).map(e=>e.id);
  const ids=mode==='ADD'?[...new Set([...current.elementIds,...hit])]:hit;
  return{artboardId:artboard.id,elementIds:ids,primaryElementId:hit.at(-1)??(mode==='ADD'?current.primaryElementId:undefined)};
}
export function selectedElements(artboard:Artboard,state:DesignSelectionState):DesignElement[]{const ids=new Set(state.elementIds);return artboard.elements.filter(e=>ids.has(e.id));}
