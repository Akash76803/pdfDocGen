import paper from 'paper';
import type {DesignElement,PathDesignElement,PathGeometry,ShapeDesignElement} from '@document-tool/contracts';
import {geometryToPaperItem,transformGeometry} from './booleanUtils.js';
import {localToWorld,shapeToPathGeometry} from './pathUtils.js';

export type CadRayIntersection={x:number;y:number;distanceMm:number;elementId:string};

function sourceGeometry(element:DesignElement):PathGeometry|undefined{
  if(element.type==='PATH')return (element as PathDesignElement).geometry;
  if(element.type==='SHAPE')return shapeToPathGeometry((element as ShapeDesignElement).shape,element.size);
  return undefined;
}

function worldPathItem(element:DesignElement):paper.PathItem|undefined{
  const geometry=sourceGeometry(element);if(!geometry)return undefined;
  const world=transformGeometry(geometry,point=>localToWorld(point,element));
  const item=geometryToPaperItem(world);
  if(item instanceof paper.Path||item instanceof paper.CompoundPath)return item;
  item.remove();
  return undefined;
}

/** Exact Paper.js ray/vector-boundary intersections for CAD snapping. */
export function findCadRayIntersections(elements:readonly DesignElement[],start:{x:number;y:number},angleDeg:number,excludeIds:readonly string[]=[]):CadRayIntersection[]{
  const excluded=new Set(excludeIds),rad=angleDeg*Math.PI/180,dx=Math.cos(rad),dy=Math.sin(rad);
  // Long finite construction ray. Coordinates are millimetres; 100000 mm is safely beyond any supported artboard.
  const ray=new paper.Path.Line(new paper.Point(start.x,start.y),new paper.Point(start.x+dx*100000,start.y+dy*100000));
  const hits:CadRayIntersection[]=[];
  try{
    for(const element of elements){
      if(excluded.has(element.id)||!element.visible||element.runtimeHidden||(element.type!=='PATH'&&element.type!=='SHAPE'))continue;
      const item=worldPathItem(element);if(!item)continue;
      try{
        for(const intersection of ray.getIntersections(item)){
          const vx=intersection.point.x-start.x,vy=intersection.point.y-start.y;
          const along=vx*dx+vy*dy;
          if(along<=0.00001)continue;
          // Reject numerical intersections that do not sit on the forward ray.
          const cross=Math.abs(vx*dy-vy*dx);
          if(cross>0.002)continue;
          hits.push({x:intersection.point.x,y:intersection.point.y,distanceMm:along,elementId:element.id});
        }
      }finally{item.remove();}
    }
  }finally{ray.remove();}
  hits.sort((a,b)=>a.distanceMm-b.distanceMm||a.elementId.localeCompare(b.elementId));
  const unique:CadRayIntersection[]=[];
  for(const hit of hits){if(unique.some(previous=>Math.hypot(previous.x-hit.x,previous.y-hit.y)<0.0005))continue;unique.push(hit);if(unique.length>=24)break;}
  return unique;
}
