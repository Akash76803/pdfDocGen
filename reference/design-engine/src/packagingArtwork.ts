import type { Artboard, AssetReference, DesignElement, DesignTemplate, ImageDesignElement } from '@document-tool/contracts';
import { packagingPanelsFromArtboard, type PackagingPanel } from './cartonDieline.js';

export type PackagingFitMode='FIT'|'FILL'|'CONTAIN'|'BLEED_FILL';
export type PackagingArtworkRole='CONTENT'|'BACKGROUND'|'CRITICAL';
export type PackagingArtworkIssueCode='SAFE_AREA'|'PANEL_OVERFLOW'|'BLEED_COVERAGE';
export interface PackagingArtworkIssue{code:PackagingArtworkIssueCode;severity:'WARNING';panelId:string;elementId:string;message:string;}
export interface PackagingArtworkGroupIndex{version:1;groups:Array<{id:string;panelId:string;name:string;elementIds:string[]}>;}

const EPS=.01;
const bounds=(element:DesignElement)=>({left:element.position.xMm,top:element.position.yMm,right:element.position.xMm+element.size.widthMm,bottom:element.position.yMm+element.size.heightMm});
const within=(outer:{left:number;top:number;right:number;bottom:number},inner:{left:number;top:number;right:number;bottom:number})=>inner.left>=outer.left-EPS&&inner.top>=outer.top-EPS&&inner.right<=outer.right+EPS&&inner.bottom<=outer.bottom+EPS;
const covers=(outer:{left:number;top:number;right:number;bottom:number},target:{left:number;top:number;right:number;bottom:number})=>outer.left<=target.left+EPS&&outer.top<=target.top+EPS&&outer.right>=target.right-EPS&&outer.bottom>=target.bottom-EPS;

export function packagingArtworkPanelId(element:DesignElement):string|undefined{return typeof element.metadata?.packagingPanelId==='string'?element.metadata.packagingPanelId:undefined;}
export function packagingArtworkRole(element:DesignElement):PackagingArtworkRole{return element.metadata?.packagingArtworkRole==='BACKGROUND'?'BACKGROUND':element.metadata?.packagingArtworkRole==='CRITICAL'?'CRITICAL':'CONTENT';}

export function packagingMetadataForPanel(panel:PackagingPanel,role:PackagingArtworkRole='CONTENT'):Record<string,unknown>{return{packagingPanelId:panel.id,packagingPanelFace:panel.face,packagingPanelEdge:panel.edge,packagingArtworkRole:role,packagingArtworkVersion:1};}

export function prepareElementForPackagingPanel<T extends DesignElement>(element:T,panel:PackagingPanel,role:PackagingArtworkRole='CONTENT'):T{
 const previousApplied=typeof element.metadata?.packagingPanelOrientationDeg==='number'?element.metadata.packagingPanelOrientationDeg:0;
 const target=((Math.round(panel.artworkRotationDeg/90)*90)%360+360)%360;
 const delta=((target-previousApplied)%360+360)%360;
 return {...element,rotationDeg:((element.rotationDeg+delta)%360+360)%360,metadata:{...element.metadata,...packagingMetadataForPanel(panel,role),packagingPanelOrientationDeg:target}};
}

function updateArtworkIndex(artboard:Artboard,panels:readonly PackagingPanel[]):Artboard{
 const artworkElements=artboard.elements.filter(element=>packagingArtworkPanelId(element));
 const groups=panels.filter(panel=>panel.editable).map(panel=>({id:`artwork-${panel.id}`,panelId:panel.id,name:`${panel.name} Artwork`,elementIds:artworkElements.filter(element=>packagingArtworkPanelId(element)===panel.id).map(element=>element.id)}));
 const carton=artboard.metadata?.cartonDieline;
 if(typeof carton!=='object'||carton===null)return artboard;
 return {...artboard,metadata:{...artboard.metadata,cartonDieline:{...(carton as Record<string,unknown>),artworkGroups:{version:1,groups} satisfies PackagingArtworkGroupIndex}}};
}

export function refreshPackagingArtworkIndex(template:DesignTemplate,artboardId:string,panels:readonly PackagingPanel[]):DesignTemplate{
 return {...template,artboards:template.artboards.map(artboard=>artboard.id===artboardId?updateArtworkIndex(artboard,panels):artboard)};
}

export function assignElementsToPackagingPanel(template:DesignTemplate,artboardId:string,elementIds:readonly string[],panel:PackagingPanel,panels:readonly PackagingPanel[],role:PackagingArtworkRole='CONTENT'):DesignTemplate{
 const ids=new Set(elementIds);
 const next={...template,artboards:template.artboards.map(artboard=>artboard.id!==artboardId?artboard:{...artboard,elements:artboard.elements.map(element=>ids.has(element.id)&&!element.locked?prepareElementForPackagingPanel(element,panel,role):element)})};
 return refreshPackagingArtworkIndex(next,artboardId,panels);
}

function assetRatio(element:DesignElement,assets:readonly AssetReference[]):number|undefined{
 if(element.type!=='IMAGE')return undefined;const asset=assets.find(item=>item.id===element.assetId);if(!asset?.widthPx||!asset.heightPx)return undefined;return asset.widthPx/asset.heightPx;
}

export function fitElementsToPackagingPanel(template:DesignTemplate,artboardId:string,elementIds:readonly string[],panel:PackagingPanel,panels:readonly PackagingPanel[],mode:PackagingFitMode,assets:readonly AssetReference[]):DesignTemplate{
 const ids=new Set(elementIds);const bleed=mode==='BLEED_FILL'?panel.bleedMm:0;
 const target={x:panel.xMm-bleed,y:panel.yMm-bleed,w:panel.widthMm+2*bleed,h:panel.heightMm+2*bleed};
 const next={...template,artboards:template.artboards.map(artboard=>artboard.id!==artboardId?artboard:{...artboard,elements:artboard.elements.map(element=>{
   if(!ids.has(element.id)||element.locked)return element;
   let x=target.x,y=target.y,w=target.w,h=target.h;
   const ratio=assetRatio(element,assets)??(element.size.heightMm>EPS?element.size.widthMm/element.size.heightMm:1);
   if(mode==='CONTAIN'||mode==='FIT'){
     if(target.w/target.h>ratio){h=target.h;w=h*ratio;x=target.x+(target.w-w)/2;}else{w=target.w;h=w/ratio;y=target.y+(target.h-h)/2;}
   }else if(mode==='FILL'&&element.type==='IMAGE'){
     // The image element becomes the panel mask while its renderer crops according to FILL.
     w=target.w;h=target.h;
   }
   const role:PackagingArtworkRole=mode==='BLEED_FILL'?'BACKGROUND':packagingArtworkRole(element);
   const prepared=prepareElementForPackagingPanel(element,panel,role);
   const resized={...prepared,position:{xMm:x,yMm:y},size:{widthMm:Math.max(.1,w),heightMm:Math.max(.1,h)}} as DesignElement;
   return resized.type==='IMAGE'?{...resized,fit:mode==='CONTAIN'||mode==='FIT'?'FIT':'FILL'} as ImageDesignElement:resized;
 })})};
 return refreshPackagingArtworkIndex(next,artboardId,panels);
}

export function packagingClipInsets(element:DesignElement,panel:PackagingPanel):{topMm:number;rightMm:number;bottomMm:number;leftMm:number}|undefined{
 if(packagingArtworkPanelId(element)!==panel.id)return undefined;
 const b=bounds(element);return{leftMm:Math.max(0,panel.xMm-b.left),topMm:Math.max(0,panel.yMm-b.top),rightMm:Math.max(0,b.right-(panel.xMm+panel.widthMm)),bottomMm:Math.max(0,b.bottom-(panel.yMm+panel.heightMm))};
}

export function validatePackagingArtwork(artboard:Artboard,panels:readonly PackagingPanel[]):PackagingArtworkIssue[]{
 const issues:PackagingArtworkIssue[]=[];
 for(const element of artboard.elements){
   const panelId=packagingArtworkPanelId(element);if(!panelId||!element.visible||element.runtimeHidden)continue;
   const panel=panels.find(item=>item.id===panelId);if(!panel)continue;
   const eb=bounds(element),pb={left:panel.xMm,top:panel.yMm,right:panel.xMm+panel.widthMm,bottom:panel.yMm+panel.heightMm};
   const role=packagingArtworkRole(element);
   if(role==='BACKGROUND'){
     const bleed=panel.bleedMm;const bleedBounds={left:pb.left-bleed,top:pb.top-bleed,right:pb.right+bleed,bottom:pb.bottom+bleed};
     if(!covers(eb,bleedBounds))issues.push({code:'BLEED_COVERAGE',severity:'WARNING',panelId:panel.id,elementId:element.id,message:`${element.name} does not cover ${panel.bleedMm.toFixed(1)} mm bleed around ${panel.name}.`});
     continue;
   }
   const safe=panel.safeMarginMm;const safeBounds={left:pb.left+safe,top:pb.top+safe,right:pb.right-safe,bottom:pb.bottom-safe};
   const critical=role==='CRITICAL'||element.type==='TEXT'||element.type==='QR'||element.type==='BARCODE';
   if(critical&&!within(safeBounds,eb))issues.push({code:'SAFE_AREA',severity:'WARNING',panelId:panel.id,elementId:element.id,message:`${element.name} is outside the ${safe.toFixed(1)} mm safe area of ${panel.name}.`});
   if(!within(pb,eb))issues.push({code:'PANEL_OVERFLOW',severity:'WARNING',panelId:panel.id,elementId:element.id,message:`${element.name} crosses the panel boundary of ${panel.name}.`});
 }
 return issues;
}

export type PackagingArtworkOrientation=0|90|180|270;
export type PackagingPreflightSeverity='ERROR'|'WARNING'|'INFO';
export type PackagingPreflightIssueCode='CUT_MISSING'|'CUT_OPEN'|'CREASE_MISSING'|'TECHNICAL_UNLOCKED'|'PANEL_MISSING'|'UNASSIGNED_ARTWORK'|PackagingArtworkIssueCode;
export interface PackagingPreflightIssue{code:PackagingPreflightIssueCode;severity:PackagingPreflightSeverity;panelId?:string;elementId?:string;message:string;}
export interface PackagingPreflightResult{errors:number;warnings:number;infos:number;issues:PackagingPreflightIssue[];passed:boolean;}

const normalizeQuarterTurn=(value:number):PackagingArtworkOrientation=>{const normalized=((Math.round(value/90)*90)%360+360)%360;return (normalized===90||normalized===180||normalized===270?normalized:0) as PackagingArtworkOrientation;};

function replacePackagingPanels(artboard:Artboard,panels:readonly PackagingPanel[]):Artboard{
 const carton=artboard.metadata?.cartonDieline;
 if(typeof carton!=='object'||carton===null)return artboard;
 const record=carton as Record<string,unknown>;
 const measurements=record.measurements;
 const nextMeasurements=typeof measurements==='object'&&measurements!==null?{...(measurements as Record<string,unknown>),packagingPanels:structuredClone(panels)}:measurements;
 return {...artboard,metadata:{...artboard.metadata,cartonDieline:{...record,packagingPanels:structuredClone(panels),measurements:nextMeasurements}}};
}

export function setPackagingPanelArtworkOrientation(template:DesignTemplate,artboardId:string,panelId:string,orientationDeg:number,panels:readonly PackagingPanel[]):DesignTemplate{
 const panel=panels.find(item=>item.id===panelId);if(!panel)return template;
 const target=normalizeQuarterTurn(orientationDeg);
 const nextPanels=panels.map(item=>item.id===panelId?{...item,artworkRotationDeg:target}:item);
 const cx=panel.xMm+panel.widthMm/2,cy=panel.yMm+panel.heightMm/2;
 const next={...template,artboards:template.artboards.map(artboard=>{
  if(artboard.id!==artboardId)return artboard;
  const rotated=artboard.elements.map(element=>{
   if(packagingArtworkPanelId(element)!==panelId||element.locked)return element;
   const applied=normalizeQuarterTurn(typeof element.metadata?.packagingPanelOrientationDeg==='number'?element.metadata.packagingPanelOrientationDeg:0);
   const delta=((target-applied)%360+360)%360;if(delta===0)return {...element,metadata:{...element.metadata,packagingPanelOrientationDeg:target}};
   const rad=delta*Math.PI/180,ex=element.position.xMm+element.size.widthMm/2,ey=element.position.yMm+element.size.heightMm/2,dx=ex-cx,dy=ey-cy;
   const nx=cx+dx*Math.cos(rad)-dy*Math.sin(rad),ny=cy+dx*Math.sin(rad)+dy*Math.cos(rad),width=element.size.widthMm,height=element.size.heightMm;
   return {...element,position:{xMm:nx-width/2,yMm:ny-height/2},rotationDeg:((element.rotationDeg+delta)%360+360)%360,metadata:{...element.metadata,packagingPanelOrientationDeg:target}};
  });
  return replacePackagingPanels({...artboard,elements:rotated},nextPanels);
 })};
 return refreshPackagingArtworkIndex(next,artboardId,nextPanels);
}


export function normalizePackagingTemplateForPersistence(template:DesignTemplate):DesignTemplate{
 let changed=false;
 const artboards=template.artboards.map(artboard=>{
  const carton=artboard.metadata?.cartonDieline;
  if(typeof carton!=='object'||carton===null)return artboard;
  const derived=packagingPanelsFromArtboard(artboard);
  if(!derived.length)return artboard;
  const panels=derived.map(panel=>({...panel,artworkRotationDeg:normalizeQuarterTurn(panel.artworkRotationDeg)}));
  const panelMap=new Map(panels.map(panel=>[panel.id,panel]));
  let nextArtboard=replacePackagingPanels(artboard,panels);
  nextArtboard={...nextArtboard,elements:nextArtboard.elements.map(element=>{
   const panelId=packagingArtworkPanelId(element);
   if(!panelId)return element;
   const panel=panelMap.get(panelId);
   if(!panel)return element;
   const raw=typeof element.metadata?.packagingPanelOrientationDeg==='number'?element.metadata.packagingPanelOrientationDeg:panel.artworkRotationDeg;
   const normalized=normalizeQuarterTurn(raw);
   if(element.metadata?.packagingPanelOrientationDeg===normalized)return element;
   changed=true;
   return {...element,metadata:{...element.metadata,packagingPanelOrientationDeg:normalized}};
  })};
  const indexed=updateArtworkIndex(nextArtboard,panels);
  if(indexed!==artboard)changed=true;
  return indexed;
 });
 return changed?{...template,artboards}:template;
}

export function selectPackagingPanelArtworkIds(artboard:Artboard,panelId:string):string[]{return artboard.elements.filter(element=>packagingArtworkPanelId(element)===panelId&&!element.locked).map(element=>element.id);}

export function runPackagingPreflight(artboard:Artboard,panels:readonly PackagingPanel[]):PackagingPreflightResult{
 const issues:PackagingPreflightIssue[]=[];
 const cut=artboard.elements.filter(element=>element.metadata?.technicalLayer==='CUT');
 if(!cut.length)issues.push({code:'CUT_MISSING',severity:'ERROR',message:'No CUT geometry found on the dieline.'});
 for(const element of cut){if(element.type==='PATH'&&!element.geometry.closed)issues.push({code:'CUT_OPEN',severity:'ERROR',elementId:element.id,message:`${element.name} is an open CUT path.`});}
 if(!artboard.elements.some(element=>element.metadata?.technicalLayer==='CREASE'))issues.push({code:'CREASE_MISSING',severity:'WARNING',message:'No CREASE geometry found on the dieline.'});
 const technicalNames=new Set(['CUT','CREASE']);
 for(const group of artboard.groups){if(technicalNames.has(group.name)&&!group.locked)issues.push({code:'TECHNICAL_UNLOCKED',severity:'WARNING',message:`Technical group ${group.name} is unlocked.`});}
 for(const issue of validatePackagingArtwork(artboard,panels))issues.push({...issue});
 const panelIds=new Set(panels.map(panel=>panel.id));
 for(const element of artboard.elements){
  const assigned=packagingArtworkPanelId(element);
  if(assigned&&!panelIds.has(assigned))issues.push({code:'PANEL_MISSING',severity:'ERROR',elementId:element.id,message:`${element.name} references missing packaging panel ${assigned}.`});
  if(!assigned&&!element.metadata?.technicalLayer&&!element.metadata?.nonPrintingGuide&&element.visible&&!element.runtimeHidden)issues.push({code:'UNASSIGNED_ARTWORK',severity:'INFO',elementId:element.id,message:`${element.name} is not assigned to a packaging panel.`});
 }
 const errors=issues.filter(issue=>issue.severity==='ERROR').length,warnings=issues.filter(issue=>issue.severity==='WARNING').length,infos=issues.filter(issue=>issue.severity==='INFO').length;
 return{errors,warnings,infos,issues,passed:errors===0};
}
