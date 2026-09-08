import type { Artboard, DesignElement, DesignGroup, DesignPoint, DesignTemplate } from '@document-tool/contracts';
import { repairArtboardGroupIntegrity } from './group-integrity.js';
import { getSelectionBounds, normalizeRotationDeg, resizeElementsFromSnapshots } from './transform.js';

function updateArtboard(template:DesignTemplate,artboardId:string,fn:(a:Artboard)=>Artboard):DesignTemplate{
 return {...template,artboards:template.artboards.map(a=>a.id===artboardId?fn(a):a)};
}
function normalize(elements:DesignElement[]):DesignElement[]{
 return [...elements].sort((a,b)=>a.zIndex-b.zIndex||a.id.localeCompare(b.id)).map((e,i)=>({...e,zIndex:i}));
}
export function orderedLayers(artboard:Artboard):DesignElement[]{return [...artboard.elements].sort((a,b)=>b.zIndex-a.zIndex||a.id.localeCompare(b.id));}
export function renameElement(template:DesignTemplate,artboardId:string,elementId:string,name:string):DesignTemplate{
 const n=name.trim();if(!n)return template;return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>e.id===elementId?{...e,name:n}:e)}));
}
export function setElementVisibility(template:DesignTemplate,artboardId:string,elementId:string,visible:boolean):DesignTemplate{
 return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>e.id===elementId?{...e,visible}:e)}));
}
export function setElementLocked(template:DesignTemplate,artboardId:string,elementId:string,locked:boolean):DesignTemplate{
 return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>e.id===elementId?{...e,locked}:e)}));
}
export type LayerMove='FORWARD'|'BACKWARD'|'FRONT'|'BACK';
export function moveLayer(template:DesignTemplate,artboardId:string,elementId:string,move:LayerMove):DesignTemplate{
 return moveLayers(template,artboardId,[elementId],move);
}
export function moveLayers(template:DesignTemplate,artboardId:string,elementIds:readonly string[],move:LayerMove):DesignTemplate{
 const ids=new Set(elementIds);if(!ids.size)return template;
 return updateArtboard(template,artboardId,a=>{
  const asc=normalize(a.elements);
  const selected=asc.filter(e=>ids.has(e.id));
  if(!selected.length)return a;
  const selectedIds=new Set(selected.map(e=>e.id));
  const rest=asc.filter(e=>!selectedIds.has(e.id));
  let next:DesignElement[];
  if(move==='FRONT')next=[...rest,...selected];
  else if(move==='BACK')next=[...selected,...rest];
  else {
   // Treat a multi-selection/group as one atomic layer block. Older templates can
   // contain group members separated by unrelated layers, so derive the block's
   // current slot from its front-most member and compact it before stepping.
   const topmostSelectedIndex=Math.max(...selected.map(e=>asc.findIndex(item=>item.id===e.id)));
   const currentInsertion=asc.slice(0,topmostSelectedIndex).filter(e=>!selectedIds.has(e.id)).length;
   const nextInsertion=move==='FORWARD'
    ? Math.min(rest.length,currentInsertion+1)
    : Math.max(0,currentInsertion-1);
   next=[...rest.slice(0,nextInsertion),...selected,...rest.slice(nextInsertion)];
  }
  return{...a,elements:next.map((e,zIndex)=>({...e,zIndex}))};
 });
}
export function replaceElementsAtLayer(template:DesignTemplate,artboardId:string,sourceIds:readonly string[],replacements:readonly DesignElement[]):DesignTemplate{
 const ids=new Set(sourceIds);if(!ids.size)return template;
 return updateArtboard(template,artboardId,a=>{const asc=normalize(a.elements),sources=asc.filter(e=>ids.has(e.id));if(!sources.length)return a;const topZ=Math.max(...sources.map(e=>e.zIndex));const rest=asc.filter(e=>!ids.has(e.id));const insertion=rest.filter(e=>e.zIndex<topZ).length;const next=[...rest];next.splice(insertion,0,...replacements.map(replacement=>({...replacement,groupId:undefined})));const groups=a.groups.map(group=>({...group,elementIds:group.elementIds.filter(id=>!ids.has(id))}));return repairArtboardGroupIntegrity({...a,elements:next.map((e,zIndex)=>({...e,zIndex})),groups});});
}
export function duplicateDesignElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],idFactory:(sourceId:string)=>string,offset:DesignPoint={xMm:2,yMm:2}):{template:DesignTemplate;elementIds:string[]}{
 const art=template.artboards.find(a=>a.id===artboardId);if(!art)return{template,elementIds:[]};const ids=new Set(elementIds);const sources=art.elements.filter(e=>ids.has(e.id));if(!sources.length)return{template,elementIds:[]};const maxZ=art.elements.length?Math.max(...art.elements.map(e=>e.zIndex)): -1;const map=new Map<string,string>();sources.forEach(e=>map.set(e.id,idFactory(e.id)));const groupMap=new Map<string,string>();for(const g of art.groups){if(g.elementIds.some(x=>ids.has(x)))groupMap.set(g.id,idFactory(g.id));}
 const clones=sources.map((e,i)=>({...e,id:map.get(e.id)!,name:`${e.name} Copy`,position:{xMm:e.position.xMm+offset.xMm,yMm:e.position.yMm+offset.yMm},zIndex:maxZ+i+1,groupId:e.groupId&&groupMap.has(e.groupId)?groupMap.get(e.groupId):undefined}));
 const groups:DesignGroup[]=[];for(const g of art.groups){const gid=groupMap.get(g.id);if(!gid)continue;const members=g.elementIds.filter(x=>ids.has(x)).map(x=>map.get(x)!).filter(Boolean);if(members.length>1)groups.push({...g,id:gid,name:`${g.name} Copy`,elementIds:members,parentGroupId:undefined});}
 const next=updateArtboard(template,artboardId,a=>({...a,elements:normalize([...a.elements,...clones]),groups:[...a.groups,...groups]}));return{template:next,elementIds:clones.map(e=>e.id)};
}
export function groupElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],groupId:string,name='Group'):DesignTemplate{
 const ids=[...new Set(elementIds)];if(ids.length<2)return template;return updateArtboard(template,artboardId,a=>{
  const asc=normalize(a.elements);
  const selectable=asc.filter(e=>ids.includes(e.id)&&!e.groupId);
  if(selectable.length<2)return a;
  const memberIds=selectable.map(e=>e.id),memberSet=new Set(memberIds);
  const topmostSelectedIndex=Math.max(...selectable.map(e=>asc.findIndex(item=>item.id===e.id)));
  const rest=asc.filter(e=>!memberSet.has(e.id));
  const insertion=asc.slice(0,topmostSelectedIndex).filter(e=>!memberSet.has(e.id)).length;
  const group:DesignGroup={id:groupId,name,elementIds:memberIds,visible:true,locked:false};
  const grouped=selectable.map(e=>({...e,groupId}));
  const elements=[...rest.slice(0,insertion),...grouped,...rest.slice(insertion)].map((e,zIndex)=>({...e,zIndex}));
  return{...a,groups:[...a.groups,group],elements};
 });
}
export function ungroupElements(template:DesignTemplate,artboardId:string,groupId:string):DesignTemplate{
 return updateArtboard(template,artboardId,a=>({...a,groups:a.groups.filter(g=>g.id!==groupId),elements:a.elements.map(e=>e.groupId===groupId?{...e,groupId:undefined}:e)}));
}

export function renameGroup(template:DesignTemplate,artboardId:string,groupId:string,name:string):DesignTemplate{
 const nextName=name.trim();if(!nextName)return template;
 return updateArtboard(template,artboardId,a=>({...a,groups:a.groups.map(g=>g.id===groupId?{...g,name:nextName}:g)}));
}

export interface RegroupSnapshot { id:string; name:string; elementIds:string[]; visible:boolean; locked:boolean; parentGroupId?:string; }
export function restoreGroups(template:DesignTemplate,artboardId:string,snapshots:readonly RegroupSnapshot[]):DesignTemplate{
 if(!snapshots.length)return template;
 return updateArtboard(template,artboardId,a=>{
  const existingGroupIds=new Set(a.groups.map(g=>g.id));
  const claimed=new Set<string>();
  const restored:DesignGroup[]=[];
  for(const snapshot of snapshots){
   if(existingGroupIds.has(snapshot.id))continue;
   const members=snapshot.elementIds.filter(id=>{
    const element=a.elements.find(e=>e.id===id);
    return Boolean(element&&!element.groupId&&!claimed.has(id));
   });
   if(members.length<2||members.length!==snapshot.elementIds.length)continue;
   members.forEach(id=>claimed.add(id));
   restored.push({id:snapshot.id,name:snapshot.name,elementIds:[...members],visible:snapshot.visible,locked:snapshot.locked,parentGroupId:undefined});
  }
  if(!restored.length)return a;
  const groupByElement=new Map<string,DesignGroup>();
  restored.forEach(group=>group.elementIds.forEach(id=>groupByElement.set(id,group)));
  return {...a,groups:[...a.groups,...restored],elements:a.elements.map(element=>{
   const group=groupByElement.get(element.id);if(!group)return element;
   return {...element,groupId:group.id,locked:group.locked??false,visible:group.visible??true};
  })};
 });
}
export function groupForElement(artboard:Artboard,elementId:string):DesignGroup|undefined{const e=artboard.elements.find(x=>x.id===elementId);return e?.groupId?artboard.groups.find(g=>g.id===e.groupId):undefined;}
export function expandElementIdsToGroups(artboard:Artboard,elementIds:readonly string[]):string[]{const out=new Set(elementIds);for(const id of elementIds){const g=groupForElement(artboard,id);g?.elementIds.forEach(x=>out.add(x));}return [...out];}
export function setGroupLocked(template:DesignTemplate,artboardId:string,groupId:string,locked:boolean):DesignTemplate{return updateArtboard(template,artboardId,a=>{const g=a.groups.find(x=>x.id===groupId);if(!g)return a;const ids=new Set(g.elementIds);return{...a,groups:a.groups.map(x=>x.id===groupId?{...x,locked}:x),elements:a.elements.map(e=>ids.has(e.id)?{...e,locked}:e)};});}
export function setGroupVisibility(template:DesignTemplate,artboardId:string,groupId:string,visible:boolean):DesignTemplate{return updateArtboard(template,artboardId,a=>{const g=a.groups.find(x=>x.id===groupId);if(!g)return a;const ids=new Set(g.elementIds);return{...a,groups:a.groups.map(x=>x.id===groupId?{...x,visible}:x),elements:a.elements.map(e=>ids.has(e.id)?{...e,visible}:e)};});}
export function scaleElements(template:DesignTemplate,artboardId:string,elementIds:readonly string[],scaleX:number,scaleY=scaleX):DesignTemplate{
 if(!Number.isFinite(scaleX)||!Number.isFinite(scaleY)||scaleX<=0||scaleY<=0)return template;
 const art=template.artboards.find(a=>a.id===artboardId);if(!art)return template;
 const ids=new Set(elementIds),members=art.elements.filter(e=>ids.has(e.id)&&!e.locked),bounds=getSelectionBounds(members);if(!bounds)return template;
 const target={xMm:bounds.xMm,yMm:bounds.yMm,widthMm:bounds.widthMm*scaleX,heightMm:bounds.heightMm*scaleY};
 return resizeElementsFromSnapshots(template,artboardId,members,bounds,target);
}
export function rotateElementsAsGroup(template:DesignTemplate,artboardId:string,elementIds:readonly string[],deltaDeg:number):DesignTemplate{
 if(!Number.isFinite(deltaDeg))return template;const art=template.artboards.find(a=>a.id===artboardId);if(!art)return template;const ids=new Set(elementIds);const members=art.elements.filter(e=>ids.has(e.id)&&!e.locked);const b=getSelectionBounds(members);if(!b)return template;const cx=b.xMm+b.widthMm/2,cy=b.yMm+b.heightMm/2,rad=deltaDeg*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);return updateArtboard(template,artboardId,a=>({...a,elements:a.elements.map(e=>{if(!ids.has(e.id)||e.locked)return e;const ex=e.position.xMm+e.size.widthMm/2,ey=e.position.yMm+e.size.heightMm/2,dx=ex-cx,dy=ey-cy,nx=cx+dx*cos-dy*sin,ny=cy+dx*sin+dy*cos;return{...e,position:{xMm:nx-e.size.widthMm/2,yMm:ny-e.size.heightMm/2},rotationDeg:normalizeRotationDeg(e.rotationDeg+deltaDeg)};})}));
}
