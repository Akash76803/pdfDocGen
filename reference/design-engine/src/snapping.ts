import type { Artboard, DesignElement, DesignSize } from '@document-tool/contracts';
import { getSelectionBounds } from './transform.js';

export type SnapGuideSource = 'ARTBOARD'|'ELEMENT'|'GUIDE'|'GRID';
export interface SnapGuideIndicator { axis:'X'|'Y'; positionMm:number; source:SnapGuideSource; }
export interface SnapOptions {
  enabled?: boolean;
  toleranceMm?: number;
  snapToArtboard?: boolean;
  snapToElements?: boolean;
  snapToGuides?: boolean;
  snapToGrid?: boolean;
  gridSizeMm?: number;
}
export interface SnapMoveResult { delta:{xMm:number;yMm:number}; guides:SnapGuideIndicator[]; snappedX:boolean; snappedY:boolean; }
export interface SnapResizeResult { size:DesignSize; guides:SnapGuideIndicator[]; snappedX:boolean; snappedY:boolean; }

type Candidate={positionMm:number;source:SnapGuideSource;rank:number};
const DEFAULT_TOLERANCE_MM=1.5;
const DEFAULT_GRID_MM=5;

function candidates(artboard:Artboard,excludeIds:Set<string>,axis:'X'|'Y',options:Required<SnapOptions>):Candidate[]{
  const result:Candidate[]=[];
  if(options.snapToArtboard){
    const size=axis==='X'?artboard.widthMm:artboard.heightMm;
    result.push({positionMm:0,source:'ARTBOARD',rank:1},{positionMm:size/2,source:'ARTBOARD',rank:1},{positionMm:size,source:'ARTBOARD',rank:1});
  }
  if(options.snapToGuides){
    for(const guide of artboard.guides){
      if((axis==='X'&&guide.orientation==='VERTICAL')||(axis==='Y'&&guide.orientation==='HORIZONTAL'))result.push({positionMm:guide.positionMm,source:'GUIDE',rank:0});
    }
  }
  if(options.snapToElements){
    for(const element of artboard.elements){
      if(excludeIds.has(element.id)||!element.visible)continue;
      const start=axis==='X'?element.position.xMm:element.position.yMm;
      const size=axis==='X'?element.size.widthMm:element.size.heightMm;
      result.push({positionMm:start,source:'ELEMENT',rank:2},{positionMm:start+size/2,source:'ELEMENT',rank:2},{positionMm:start+size,source:'ELEMENT',rank:2});
    }
  }
  return result;
}

function normalizedOptions(options:SnapOptions={}):Required<SnapOptions>{
  return {
    enabled:options.enabled??true,
    toleranceMm:Math.max(0,options.toleranceMm??DEFAULT_TOLERANCE_MM),
    snapToArtboard:options.snapToArtboard??true,
    snapToElements:options.snapToElements??true,
    snapToGuides:options.snapToGuides??true,
    snapToGrid:options.snapToGrid??false,
    gridSizeMm:Math.max(0.1,options.gridSizeMm??DEFAULT_GRID_MM)
  };
}

function bestCorrection(anchors:number[],baseCandidates:Candidate[],options:Required<SnapOptions>):{correction:number;guide?:SnapGuideIndicator}|null{
  if(!options.enabled)return null;
  let bestCorrectionValue=0,bestGuide:SnapGuideIndicator|undefined,bestAbs=Number.POSITIVE_INFINITY,bestRank=Number.POSITIVE_INFINITY;
  const tryCandidate=(anchor:number,target:Candidate)=>{
    const correction=target.positionMm-anchor,abs=Math.abs(correction);
    if(abs>options.toleranceMm)return;
    if(abs<bestAbs-1e-9||(Math.abs(abs-bestAbs)<1e-9&&target.rank<bestRank)){
      bestCorrectionValue=correction;bestGuide={axis:'X',positionMm:target.positionMm,source:target.source};bestAbs=abs;bestRank=target.rank;
    }
  };
  for(const anchor of anchors){
    for(const target of baseCandidates)tryCandidate(anchor,target);
    if(options.snapToGrid){
      const positionMm=Math.round(anchor/options.gridSizeMm)*options.gridSizeMm;
      tryCandidate(anchor,{positionMm,source:'GRID',rank:3});
    }
  }
  return bestGuide?{correction:bestCorrectionValue,guide:bestGuide}:null;
}

function axisCorrection(axis:'X'|'Y',anchors:number[],artboard:Artboard,excludeIds:Set<string>,options:Required<SnapOptions>){
  const result=bestCorrection(anchors,candidates(artboard,excludeIds,axis,options),options);
  if(result?.guide)result.guide.axis=axis;
  return result;
}

export function snapMoveDelta(artboard:Artboard,elementIds:readonly string[],rawDelta:{xMm:number;yMm:number},options:SnapOptions={}):SnapMoveResult{
  const opts=normalizedOptions(options),ids=new Set(elementIds);
  const moving=artboard.elements.filter(e=>ids.has(e.id)&&e.visible&&!e.locked);
  const bounds=getSelectionBounds(moving);
  if(!bounds||!opts.enabled)return {delta:{...rawDelta},guides:[],snappedX:false,snappedY:false};
  const x0=bounds.xMm+rawDelta.xMm,x1=x0+bounds.widthMm,xc=x0+bounds.widthMm/2;
  const y0=bounds.yMm+rawDelta.yMm,y1=y0+bounds.heightMm,yc=y0+bounds.heightMm/2;
  const sx=axisCorrection('X',[x0,xc,x1],artboard,ids,opts),sy=axisCorrection('Y',[y0,yc,y1],artboard,ids,opts);
  const guides:SnapGuideIndicator[]=[];if(sx?.guide)guides.push(sx.guide);if(sy?.guide)guides.push(sy.guide);
  return {delta:{xMm:rawDelta.xMm+(sx?.correction??0),yMm:rawDelta.yMm+(sy?.correction??0)},guides,snappedX:Boolean(sx),snappedY:Boolean(sy)};
}

export function snapResizeSize(artboard:Artboard,element:DesignElement,anchor:'NW'|'N'|'NE'|'E'|'SE'|'S'|'SW'|'W',requested:DesignSize,options:SnapOptions={}):SnapResizeResult{
  const opts=normalizedOptions(options),exclude=new Set([element.id]);
  if(!opts.enabled||element.locked)return {size:{...requested},guides:[],snappedX:false,snappedY:false};
  let width=requested.widthMm,height=requested.heightMm;
  let left=element.position.xMm,top=element.position.yMm;
  if(anchor.includes('W'))left=element.position.xMm+(element.size.widthMm-width);
  else if(anchor==='N'||anchor==='S')left=element.position.xMm+(element.size.widthMm-width)/2;
  if(anchor.includes('N'))top=element.position.yMm+(element.size.heightMm-height);
  else if(anchor==='E'||anchor==='W')top=element.position.yMm+(element.size.heightMm-height)/2;
  const right=left+width,bottom=top+height;
  const guides:SnapGuideIndicator[]=[];
  let sx:null|ReturnType<typeof axisCorrection>=null,sy:null|ReturnType<typeof axisCorrection>=null;
  if(anchor.includes('W'))sx=axisCorrection('X',[left],artboard,exclude,opts);else if(anchor.includes('E'))sx=axisCorrection('X',[right],artboard,exclude,opts);
  if(anchor.includes('N'))sy=axisCorrection('Y',[top],artboard,exclude,opts);else if(anchor.includes('S'))sy=axisCorrection('Y',[bottom],artboard,exclude,opts);
  if(sx){if(anchor.includes('W'))width-=sx.correction;else if(anchor.includes('E'))width+=sx.correction;if(sx.guide)guides.push(sx.guide);}
  if(sy){if(anchor.includes('N'))height-=sy.correction;else if(anchor.includes('S'))height+=sy.correction;if(sy.guide)guides.push(sy.guide);}
  return {size:{widthMm:width,heightMm:height},guides,snappedX:Boolean(sx),snappedY:Boolean(sy)};
}
