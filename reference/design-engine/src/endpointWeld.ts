import type {DesignElement,PathDesignElement} from '@document-tool/contracts';
import {getPathEndpoints,localToWorld,worldToLocal} from './pathUtils.js';

export const TRIM_ENDPOINT_WELD_TOLERANCE_MM=.15;

/**
 * Moves endpoints of the supplied target PATHs onto a nearby canonical PATH
 * node. Multiple target endpoints in the same junction share one coordinate.
 * No connector segment is inserted and non-target geometry is not changed.
 */
export function weldPathEndpointsToNearbyNodes(elements:readonly DesignElement[],targetIds:readonly string[],toleranceMm=TRIM_ENDPOINT_WELD_TOLERANCE_MM):DesignElement[]{
 const targetSet=new Set(targetIds);
 const anchors=elements.flatMap(element=>element.type==='PATH'&&element.visible&&!element.runtimeHidden&&!targetSet.has(element.id)?element.geometry.points.map(point=>({elementId:element.id,world:localToWorld({x:point.x,y:point.y},element)})):[]);
 const targetEndpoints=elements.flatMap(element=>{if(element.type!=='PATH'||!targetSet.has(element.id))return[];const endpointIds=new Set(getPathEndpoints(element.geometry));return element.geometry.points.filter(point=>endpointIds.has(point.id)).map(point=>({element,pointId:point.id,world:localToWorld({x:point.x,y:point.y},element)}));});
 const canonical=new Map<string,{x:number;y:number}>();
 for(const endpoint of targetEndpoints){let best:{x:number;y:number}|undefined,bestDistance=toleranceMm;for(const anchor of anchors){const distance=Math.hypot(anchor.world.x-endpoint.world.x,anchor.world.y-endpoint.world.y);if(distance<=bestDistance){bestDistance=distance;best=anchor.world;}}if(!best){for(const other of targetEndpoints){if(other===endpoint)continue;const resolved=canonical.get(`${other.element.id}:${other.pointId}`)??other.world,distance=Math.hypot(resolved.x-endpoint.world.x,resolved.y-endpoint.world.y);if(distance<=bestDistance){bestDistance=distance;best=resolved;}}}if(best)canonical.set(`${endpoint.element.id}:${endpoint.pointId}`,best);}
 if(!canonical.size)return elements.map(element=>element);
 return elements.map(element=>{if(element.type!=='PATH'||!targetSet.has(element.id))return element;let changed=false;const geometry={...element.geometry,points:element.geometry.points.map(point=>{const world=canonical.get(`${element.id}:${point.id}`);if(!world)return point;const local=worldToLocal(world,element),dx=local.x-point.x,dy=local.y-point.y;if(Math.hypot(dx,dy)<1e-9)return point;changed=true;return{...point,x:local.x,y:local.y,inHandle:point.inHandle?{x:point.inHandle.x+dx,y:point.inHandle.y+dy}:undefined,outHandle:point.outHandle?{x:point.outHandle.x+dx,y:point.outHandle.y+dy}:undefined};})};return changed?{...element,geometry} as PathDesignElement:element;});
}
