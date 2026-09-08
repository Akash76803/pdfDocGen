import type { DesignElement, DesignTemplate, PathDesignElement, PathGeometry } from '@document-tool/contracts';
import { getSelectionBounds, normalizeRotationDeg } from './transform.js';

export type MirrorAxis = 'HORIZONTAL'|'VERTICAL';

function clone<T>(value:T):T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reflectPathGeometry(geometry:PathGeometry,widthMm:number,heightMm:number,axis:MirrorAxis):PathGeometry {
  const next=clone(geometry);
  next.points=next.points.map(point=>{
    const reflected={...point};
    if(axis==='VERTICAL'){
      reflected.x=widthMm-point.x;
      if(point.inHandle) reflected.inHandle={x:widthMm-point.inHandle.x,y:point.inHandle.y};
      if(point.outHandle) reflected.outHandle={x:widthMm-point.outHandle.x,y:point.outHandle.y};
    }else{
      reflected.y=heightMm-point.y;
      if(point.inHandle) reflected.inHandle={x:point.inHandle.x,y:heightMm-point.inHandle.y};
      if(point.outHandle) reflected.outHandle={x:point.outHandle.x,y:heightMm-point.outHandle.y};
    }
    reflected.id=crypto.randomUUID();
    return reflected;
  });
  const idMap=new Map(geometry.points.map((point,index)=>[point.id,next.points[index]!.id]));
  next.segments=next.segments.map(segment=>({...segment,id:crypto.randomUUID(),fromPointId:idMap.get(segment.fromPointId)!,toPointId:idMap.get(segment.toPointId)!}));
  if(next.subpaths){
    const segmentMap=new Map(geometry.segments.map((segment,index)=>[segment.id,next.segments[index]!.id]));
    next.subpaths=next.subpaths.map(subpath=>({...subpath,segmentIds:subpath.segmentIds.map(id=>segmentMap.get(id)!).filter(Boolean)}));
  }
  return next;
}

function mirroredElement(source:DesignElement,artboardWidthMm:number,artboardHeightMm:number,axis:MirrorAxis,newId:string,newGroupId?:string):DesignElement {
  const next=clone(source) as DesignElement;
  next.id=newId;
  next.name=`${source.name} Mirror`;
  next.groupId=newGroupId;
  next.position={
    xMm:axis==='VERTICAL'?artboardWidthMm-(source.position.xMm+source.size.widthMm):source.position.xMm,
    yMm:axis==='HORIZONTAL'?artboardHeightMm-(source.position.yMm+source.size.heightMm):source.position.yMm,
  };
  next.rotationDeg=-source.rotationDeg;

  if(next.type==='SHAPE'){
    if(axis==='VERTICAL') next.flipX=!next.flipX;
    else next.flipY=!next.flipY;
  }else if(next.type==='PATH'){
    next.geometry=reflectPathGeometry((source as PathDesignElement).geometry,source.size.widthMm,source.size.heightMm,axis);
  }else if(next.type==='IMAGE'){
    if(axis==='VERTICAL') next.flipX=!next.flipX;
    else next.flipY=!next.flipY;
  }else if(next.type==='SVG'){
    if(axis==='VERTICAL') next.flipX=!next.flipX;
    else next.flipY=!next.flipY;
  }
  // TEXT, QR and BARCODE intentionally remain readable/scannable: only placement/rotation are reflected.
  return next;
}


function reflectPathGeometryInPlace(geometry:PathGeometry,widthMm:number,heightMm:number,axis:MirrorAxis):PathGeometry {
  const next=clone(geometry);
  next.points=next.points.map(point=>{
    const reflected={...point};
    if(axis==='VERTICAL'){
      reflected.x=widthMm-point.x;
      if(point.inHandle) reflected.inHandle={x:widthMm-point.inHandle.x,y:point.inHandle.y};
      if(point.outHandle) reflected.outHandle={x:widthMm-point.outHandle.x,y:point.outHandle.y};
    }else{
      reflected.y=heightMm-point.y;
      if(point.inHandle) reflected.inHandle={x:point.inHandle.x,y:heightMm-point.inHandle.y};
      if(point.outHandle) reflected.outHandle={x:point.outHandle.x,y:heightMm-point.outHandle.y};
    }
    return reflected;
  });
  return next;
}


function flipElementVisualInPlace(element:DesignElement,axis:MirrorAxis):DesignElement {
 if(element.type==='SHAPE') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
 if(element.type==='IMAGE') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
 if(element.type==='SVG') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
 if(element.type==='PATH') return {...element,geometry:reflectPathGeometryInPlace(element.geometry,element.size.widthMm,element.size.heightMm,axis)};
 return element;
}

/** Flip a set as one composite around its shared bounds. Child placement mirrors as a group,
 * while vector/raster visuals are reflected locally. TEXT/QR/BARCODE stay readable/scannable. */
export function flipElementsAsGroup(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:MirrorAxis):DesignTemplate {
 const selected=new Set(elementIds);
 const artboard=template.artboards.find(a=>a.id===artboardId);if(!artboard)return template;
 const members=artboard.elements.filter(e=>selected.has(e.id)&&!e.locked),bounds=getSelectionBounds(members);if(!bounds)return template;
 return {...template,artboards:template.artboards.map(a=>a.id!==artboardId?a:{...a,elements:a.elements.map(element=>{
  if(!selected.has(element.id)||element.locked)return element;
  const position=axis==='VERTICAL'
   ?{xMm:bounds.xMm+bounds.widthMm-(element.position.xMm-bounds.xMm)-element.size.widthMm,yMm:element.position.yMm}
   :{xMm:element.position.xMm,yMm:bounds.yMm+bounds.heightMm-(element.position.yMm-bounds.yMm)-element.size.heightMm};
  const placed={...element,position,rotationDeg:normalizeRotationDeg(-element.rotationDeg)} as DesignElement;
  return flipElementVisualInPlace(placed,axis);
 })})};
}

export function flipElementsInPlace(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:MirrorAxis):DesignTemplate {
  const selected=new Set(elementIds);
  return {
    ...template,
    artboards:template.artboards.map(artboard=>artboard.id!==artboardId?artboard:{
      ...artboard,
      elements:artboard.elements.map(element=>{
        if(!selected.has(element.id)||element.locked)return element;
        if(element.type==='SHAPE') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
        if(element.type==='IMAGE') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
        if(element.type==='SVG') return {...element,[axis==='VERTICAL'?'flipX':'flipY']:!(axis==='VERTICAL'?element.flipX:element.flipY)} as DesignElement;
        if(element.type==='PATH') return {...element,geometry:reflectPathGeometryInPlace(element.geometry,element.size.widthMm,element.size.heightMm,axis)};
        return element;
      })
    })
  };
}

export function mirrorElementsAcrossArtboard(template:DesignTemplate,artboardId:string,elementIds:readonly string[],axis:MirrorAxis):DesignTemplate {
  const selected=new Set(elementIds);
  return {
    ...template,
    artboards:template.artboards.map(artboard=>{
      if(artboard.id!==artboardId)return artboard;
      const source=artboard.elements.filter(element=>selected.has(element.id)&&!element.locked);
      if(!source.length)return artboard;

      const usedGroupIds=new Set(source.map(element=>element.groupId).filter((id):id is string=>Boolean(id)));
      const groupMap=new Map<string,string>();
      usedGroupIds.forEach(id=>groupMap.set(id,crypto.randomUUID()));

      const elementIdMap=new Map<string,string>();
      source.forEach(element=>elementIdMap.set(element.id,crypto.randomUUID()));

      const mirrored=source.map(element=>mirroredElement(
        element,
        artboard.widthMm,
        artboard.heightMm,
        axis,
        elementIdMap.get(element.id)!,
        element.groupId?groupMap.get(element.groupId):undefined
      ));

      const mirroredGroups=artboard.groups
        .filter(group=>usedGroupIds.has(group.id))
        .map(group=>({
          ...clone(group),
          id:groupMap.get(group.id)!,
          name:`${group.name} Mirror`,
          parentGroupId:group.parentGroupId?groupMap.get(group.parentGroupId):undefined,
          elementIds:group.elementIds.map(id=>elementIdMap.get(id)).filter((id):id is string=>Boolean(id)),
        }))
        .filter(group=>group.elementIds.length>0);

      const sourceIndexes=source.map(element=>artboard.elements.findIndex(candidate=>candidate.id===element.id)).filter(index=>index>=0);
      const insertAt=sourceIndexes.length?Math.max(...sourceIndexes)+1:artboard.elements.length;
      const elements=[...artboard.elements];
      elements.splice(insertAt,0,...mirrored);
      return {...artboard,elements,groups:[...artboard.groups,...mirroredGroups]};
    })
  };
}

export type ReferenceLineMirrorMode = 'COPY'|'MOVE';
export type ReferenceLinePoint = {xMm:number;yMm:number};

function reflectWorldPointAcrossLine(point:ReferenceLinePoint,a:ReferenceLinePoint,b:ReferenceLinePoint):ReferenceLinePoint {
  const vx=b.xMm-a.xMm,vy=b.yMm-a.yMm;
  const len2=vx*vx+vy*vy;
  if(len2<1e-10)return point;
  const t=((point.xMm-a.xMm)*vx+(point.yMm-a.yMm)*vy)/len2;
  const px=a.xMm+t*vx,py=a.yMm+t*vy;
  return {xMm:2*px-point.xMm,yMm:2*py-point.yMm};
}

function referenceAxisAngleDeg(a:ReferenceLinePoint,b:ReferenceLinePoint):number {
  return Math.atan2(b.yMm-a.yMm,b.xMm-a.xMm)*180/Math.PI;
}

function mirrorVisualAcrossReferenceLine(source:DesignElement,a:ReferenceLinePoint,b:ReferenceLinePoint,newId?:string,newGroupId?:string):DesignElement {
  const next=clone(source) as DesignElement;
  if(newId){next.id=newId;next.name=`${source.name} Mirror`;}
  if(newGroupId!==undefined)next.groupId=newGroupId;
  const center={xMm:source.position.xMm+source.size.widthMm/2,yMm:source.position.yMm+source.size.heightMm/2};
  const reflectedCenter=reflectWorldPointAcrossLine(center,a,b);
  const axisAngle=referenceAxisAngleDeg(a,b);
  next.position={xMm:reflectedCenter.xMm-source.size.widthMm/2,yMm:reflectedCenter.yMm-source.size.heightMm/2};
  next.rotationDeg=normalizeRotationDeg(2*axisAngle-source.rotationDeg);

  // Reflection reverses handedness. In the element's reflected local frame this is a local Y flip.
  if(next.type==='SHAPE') next.flipY=!next.flipY;
  else if(next.type==='IMAGE') next.flipY=!next.flipY;
  else if(next.type==='SVG') next.flipY=!next.flipY;
  else if(next.type==='PATH') next.geometry=reflectPathGeometryInPlace((source as PathDesignElement).geometry,source.size.widthMm,source.size.heightMm,'HORIZONTAL');
  // TEXT / QR / BARCODE remain readable/scannable, matching existing page-mirror semantics.
  return next;
}

/** CAD-style mirror across an arbitrary user-defined reference line.
 * COPY preserves originals and creates mirrored clones. MOVE mirrors originals in place.
 */
export function mirrorElementsAcrossReferenceLine(
  template:DesignTemplate,
  artboardId:string,
  elementIds:readonly string[],
  lineStart:ReferenceLinePoint,
  lineEnd:ReferenceLinePoint,
  mode:ReferenceLineMirrorMode='COPY'
):DesignTemplate {
  if(Math.hypot(lineEnd.xMm-lineStart.xMm,lineEnd.yMm-lineStart.yMm)<0.01)return template;
  const selected=new Set(elementIds);
  return {...template,artboards:template.artboards.map(artboard=>{
    if(artboard.id!==artboardId)return artboard;
    const source=artboard.elements.filter(element=>selected.has(element.id)&&!element.locked);
    if(!source.length)return artboard;
    if(mode==='MOVE'){
      return {...artboard,elements:artboard.elements.map(element=>selected.has(element.id)&&!element.locked?mirrorVisualAcrossReferenceLine(element,lineStart,lineEnd):element)};
    }

    const usedGroupIds=new Set(source.map(element=>element.groupId).filter((id):id is string=>Boolean(id)));
    const groupMap=new Map<string,string>();usedGroupIds.forEach(groupId=>groupMap.set(groupId,crypto.randomUUID()));
    const elementIdMap=new Map<string,string>();source.forEach(element=>elementIdMap.set(element.id,crypto.randomUUID()));
    const mirrored=source.map(element=>mirrorVisualAcrossReferenceLine(element,lineStart,lineEnd,elementIdMap.get(element.id)!,element.groupId?groupMap.get(element.groupId):undefined));
    const mirroredGroups=artboard.groups.filter(group=>usedGroupIds.has(group.id)).map(group=>({
      ...clone(group),id:groupMap.get(group.id)!,name:`${group.name} Mirror`,
      parentGroupId:group.parentGroupId?groupMap.get(group.parentGroupId):undefined,
      elementIds:group.elementIds.map(id=>elementIdMap.get(id)).filter((id):id is string=>Boolean(id)),
    })).filter(group=>group.elementIds.length>0);
    const indexes=source.map(element=>artboard.elements.findIndex(candidate=>candidate.id===element.id)).filter(index=>index>=0);
    const insertAt=indexes.length?Math.max(...indexes)+1:artboard.elements.length;
    const elements=[...artboard.elements];elements.splice(insertAt,0,...mirrored);
    return {...artboard,elements,groups:[...artboard.groups,...mirroredGroups]};
  })};
}
