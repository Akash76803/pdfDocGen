import type { Artboard, DesignElement, DesignTemplate } from '@document-tool/contracts';
import { getSelectionBounds, resizeElement, resizeElementsFromSnapshots } from './transform.js';

export type DesignAlignment = 'LEFT'|'HCENTER'|'RIGHT'|'TOP'|'VCENTER'|'BOTTOM';
export type DesignAlignmentReference = 'SELECTION'|'PRIMARY'|'ARTBOARD';
export type DesignDistributionAxis = 'HORIZONTAL'|'VERTICAL';

interface AlignmentUnit {
  key:string;
  elementIds:string[];
  elements:DesignElement[];
  bounds:{xMm:number;yMm:number;widthMm:number;heightMm:number};
}

function updateArtboard(template:DesignTemplate,artboardId:string,fn:(a:Artboard)=>Artboard):DesignTemplate{
  return {...template,artboards:template.artboards.map(a=>a.id===artboardId?fn(a):a)};
}

function alignmentUnits(artboard:Artboard,elementIds:readonly string[]):AlignmentUnit[]{
  const selected=new Set(elementIds);
  const consumed=new Set<string>();
  const units:AlignmentUnit[]=[];
  const byId=new Map(artboard.elements.map(e=>[e.id,e] as const));

  for(const element of artboard.elements){
    if(!selected.has(element.id)||consumed.has(element.id)||!element.visible)continue;
    if(element.groupId){
      const group=artboard.groups.find(g=>g.id===element.groupId);
      const members=(group?.elementIds??[]).map(id=>byId.get(id)).filter((e):e is DesignElement=>Boolean(e)&&e!.visible);
      members.forEach(e=>consumed.add(e.id));
      // A partially locked group is treated as an atomic locked unit so alignment never tears it apart.
      if(!members.length||members.some(e=>e.locked))continue;
      const bounds=getSelectionBounds(members);if(bounds)units.push({key:`group:${element.groupId}`,elementIds:members.map(e=>e.id),elements:members,bounds});
      continue;
    }
    consumed.add(element.id);
    if(element.locked)continue;
    const bounds=getSelectionBounds([element]);if(bounds)units.push({key:`element:${element.id}`,elementIds:[element.id],elements:[element],bounds});
  }
  return units;
}

export function getAlignmentUnitCount(artboard:Artboard,elementIds:readonly string[]):number{
  return alignmentUnits(artboard,elementIds).length;
}

function applyDeltas(template:DesignTemplate,artboardId:string,deltas:Map<string,{xMm:number;yMm:number}>):DesignTemplate{
  if(!deltas.size)return template;
  return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>{
    const d=deltas.get(e.id);return d&&!e.locked?{...e,position:{xMm:e.position.xMm+d.xMm,yMm:e.position.yMm+d.yMm}}:e;
  })}));
}

export function alignElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],alignment:DesignAlignment,reference:DesignAlignmentReference='SELECTION',primaryElementId?:string):DesignTemplate{
  const artboard=template.artboards.find(a=>a.id===artboardId);if(!artboard)return template;
  const units=alignmentUnits(artboard,elementIds);if(!units.length)return template;
  const selectionBounds=getSelectionBounds(units.flatMap(u=>u.elements));if(!selectionBounds)return template;
  const primaryUnit=reference==='PRIMARY'&&primaryElementId?units.find(unit=>unit.elementIds.includes(primaryElementId)):undefined;
  if(reference==='PRIMARY'&&!primaryUnit)return template;
  const target=reference==='ARTBOARD'?{xMm:0,yMm:0,widthMm:artboard.widthMm,heightMm:artboard.heightMm}:reference==='PRIMARY'?primaryUnit!.bounds:selectionBounds;
  const deltas=new Map<string,{xMm:number;yMm:number}>();
  for(const unit of units){
    let dx=0,dy=0;
    if(alignment==='LEFT')dx=target.xMm-unit.bounds.xMm;
    else if(alignment==='HCENTER')dx=(target.xMm+target.widthMm/2)-(unit.bounds.xMm+unit.bounds.widthMm/2);
    else if(alignment==='RIGHT')dx=(target.xMm+target.widthMm)-(unit.bounds.xMm+unit.bounds.widthMm);
    else if(alignment==='TOP')dy=target.yMm-unit.bounds.yMm;
    else if(alignment==='VCENTER')dy=(target.yMm+target.heightMm/2)-(unit.bounds.yMm+unit.bounds.heightMm/2);
    else if(alignment==='BOTTOM')dy=(target.yMm+target.heightMm)-(unit.bounds.yMm+unit.bounds.heightMm);
    for(const id of unit.elementIds)deltas.set(id,{xMm:dx,yMm:dy});
  }
  return applyDeltas(template,artboardId,deltas);
}

export function distributeElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:DesignDistributionAxis,reference:DesignAlignmentReference='SELECTION'):DesignTemplate{
  const artboard=template.artboards.find(a=>a.id===artboardId);if(!artboard)return template;
  const units=alignmentUnits(artboard,elementIds);if(units.length<3)return template;
  const horizontal=axis==='HORIZONTAL';
  const sorted=[...units].sort((a,b)=>(horizontal?a.bounds.xMm:a.bounds.yMm)-(horizontal?b.bounds.xMm:b.bounds.yMm)||a.key.localeCompare(b.key));
  const totalSize=sorted.reduce((sum,u)=>sum+(horizontal?u.bounds.widthMm:u.bounds.heightMm),0);
  const selectionBounds=getSelectionBounds(sorted.flatMap(u=>u.elements));if(!selectionBounds)return template;
  const start=reference==='ARTBOARD'?0:(horizontal?selectionBounds.xMm:selectionBounds.yMm);
  const span=reference==='ARTBOARD'?(horizontal?artboard.widthMm:artboard.heightMm):(horizontal?selectionBounds.widthMm:selectionBounds.heightMm);
  const gap=(span-totalSize)/(sorted.length-1);
  let cursor=start;
  const deltas=new Map<string,{xMm:number;yMm:number}>();
  for(const unit of sorted){
    const current=horizontal?unit.bounds.xMm:unit.bounds.yMm;
    const delta=cursor-current;
    for(const id of unit.elementIds)deltas.set(id,horizontal?{xMm:delta,yMm:0}:{xMm:0,yMm:delta});
    cursor+=(horizontal?unit.bounds.widthMm:unit.bounds.heightMm)+gap;
  }
  return applyDeltas(template,artboardId,deltas);
}

export function centerElementsOnArtboard(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:'HORIZONTAL'|'VERTICAL'|'BOTH'='BOTH'):DesignTemplate{
  let next=template;
  if(axis==='HORIZONTAL'||axis==='BOTH')next=alignElements(next,artboardId,elementIds,'HCENTER','ARTBOARD');
  if(axis==='VERTICAL'||axis==='BOTH')next=alignElements(next,artboardId,elementIds,'VCENTER','ARTBOARD');
  return next;
}

export type AlignmentMatchSizeMode = 'WIDTH'|'HEIGHT'|'BOTH';

/** Match alignment units (single elements or flat groups) to the primary unit dimensions.
 * Groups scale atomically around their own top-left bound; PATH geometry is scaled with the group. */
export function matchAlignmentUnitsSize(template:DesignTemplate,artboardId:string,elementIds:readonly string[],primaryElementId:string,mode:AlignmentMatchSizeMode):DesignTemplate{
  const artboard=template.artboards.find(a=>a.id===artboardId);if(!artboard)return template;
  const units=alignmentUnits(artboard,elementIds);
  const primaryUnit=units.find(unit=>unit.elementIds.includes(primaryElementId));if(!primaryUnit)return template;
  let next=template;
  for(const unit of units){
    if(unit===primaryUnit)continue;
    const target={
      xMm:unit.bounds.xMm,yMm:unit.bounds.yMm,
      widthMm:mode==='HEIGHT'?unit.bounds.widthMm:primaryUnit.bounds.widthMm,
      heightMm:mode==='WIDTH'?unit.bounds.heightMm:primaryUnit.bounds.heightMm,
    };
    if(unit.elementIds.length>1){
      next=resizeElementsFromSnapshots(next,artboardId,unit.elements,unit.bounds,target);
    }else{
      const element=unit.elements[0]!;
      next=resizeElement(next,artboardId,element.id,{widthMm:target.widthMm,heightMm:target.heightMm},{anchor:'SE'});
    }
  }
  return next;
}
