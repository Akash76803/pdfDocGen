import type { Artboard } from '@document-tool/contracts';

export type PackagingExportMode='STANDARD'|'CLIENT_PROOF'|'DIELINE_PROOF'|'TECHNICAL';

export interface CardExportRequest {
  format: 'PDF' | 'PNG' | 'JPEG';
  targetMode: 'CURRENT' | 'SELECTED' | 'ALL';
  selectedArtboardIds?: string[];
  currentArtboardId?: string;
  includeBleed: boolean;
  includeCropMarks: boolean;
  usePrintSettings: boolean;
  rasterDpi?: number;
  jpegQuality?: number;
  transparentBackground?: boolean;
  packagingMode?: PackagingExportMode;
}

import { resolvePrintSettings } from './print/index.js';

export function resolveCardExportGeometry(artboard: Artboard, request: CardExportRequest) {
  const printSettings = resolvePrintSettings(artboard.print);
  const trimWidthMm = artboard.widthMm;
  const trimHeightMm = artboard.heightMm;
  const isLandscape = trimWidthMm >= trimHeightMm;
  const bleed = request.includeBleed ? printSettings.bleed : { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 };
  const outputWidthMm = trimWidthMm + bleed.leftMm + bleed.rightMm;
  const outputHeightMm = trimHeightMm + bleed.topMm + bleed.bottomMm;
  return {
    trimWidthMm,
    trimHeightMm,
    outputWidthMm,
    outputHeightMm,
    orientation: isLandscape ? 'LANDSCAPE' : 'PORTRAIT',
    bleed
  };
}

type PackagingTechnicalLayer='CUT'|'CREASE'|'BLEED'|'SAFE'|'ANNOTATION';

const PACKAGING_TECHNICAL_LAYERS=new Set<PackagingTechnicalLayer>(['CUT','CREASE','BLEED','SAFE','ANNOTATION']);

function resolvePackagingTechnicalLayer(artboard:Artboard,element:Artboard['elements'][number]):PackagingTechnicalLayer|undefined{
  const direct=typeof element.metadata?.technicalLayer==='string'?element.metadata.technicalLayer.toUpperCase():undefined;
  if(direct&&PACKAGING_TECHNICAL_LAYERS.has(direct as PackagingTechnicalLayer))return direct as PackagingTechnicalLayer;

  // Harden older/imported Phase 9.3/9.4 documents where the element-level
  // metadata may be missing but the technical group is still intact.
  if(element.groupId){
    const group=artboard.groups.find(item=>item.id===element.groupId);
    const groupName=group?.name?.trim().toUpperCase();
    if(groupName&&PACKAGING_TECHNICAL_LAYERS.has(groupName as PackagingTechnicalLayer))return groupName as PackagingTechnicalLayer;
  }

  // Last-resort compatibility for generated legacy technical elements that
  // pre-date (or lost) canonical technicalLayer/group metadata. Keep these
  // patterns deliberately narrow so arbitrary user artwork is not reclassified.
  const elementName=(element.name??'').trim();
  if(/^CUT(?:\s|·|:|-)/i.test(elementName))return 'CUT';
  if(/^CREASE(?:\s|·|:|-)/i.test(elementName))return 'CREASE';
  if(element.type==='TEXT'&&/\bpanel label$/i.test(elementName))return 'ANNOTATION';
  return undefined;
}

function isElementGroupHierarchyVisible(element:Artboard['elements'][number],groupById:Map<string,Artboard['groups'][number]>):boolean{
  let groupId=element.groupId;
  const seen=new Set<string>();
  while(groupId){
    if(seen.has(groupId))return false;
    seen.add(groupId);
    const group=groupById.get(groupId);
    if(!group)break;
    if(group.visible===false)return false;
    groupId=group.parentGroupId;
  }
  return true;
}

export function filterCardExportElements(artboard:Artboard,request:CardExportRequest){
  const hasPackaging=typeof artboard.metadata?.cartonDieline==='object'&&artboard.metadata.cartonDieline!==null;
  const mode=hasPackaging?(request.packagingMode??'STANDARD'):'STANDARD';
  const groupById=new Map(artboard.groups.map(group=>[group.id,group] as const));
  return artboard.elements.filter(e => {
    if(e.metadata?.cadExport===false||e.metadata?.cadConstruction===true)return false;
    const technical=resolvePackagingTechnicalLayer(artboard,e);
    const editorVisible=e.visible&&isElementGroupHierarchyVisible(e,groupById);

    if(mode==='CLIENT_PROOF'){
      // Artwork only: all carton technical geometry/guides/labels are editor-only.
      // Normal artwork still respects both element and hierarchical group visibility.
      if(!editorVisible)return false;
      return !technical&&e.metadata?.nonPrintingGuide!==true;
    }
    if(mode==='DIELINE_PROOF'){
      // Printer placement proof must always include physical CUT + CREASE, even
      // when those technical layers/groups are temporarily hidden in the editor UI.
      // Non-technical artwork still respects editor element/group visibility.
      // SAFE, BLEED and ANNOTATION are never allowed to leak into this mode.
      if(technical)return technical==='CUT'||technical==='CREASE';
      if(!editorVisible)return false;
      return e.metadata?.nonPrintingGuide!==true;
    }
    if(mode==='TECHNICAL'){
      // Technical inspection view is independent from editor visibility too.
      return technical==='CUT'||technical==='CREASE'||technical==='ANNOTATION';
    }
    if(!editorVisible)return false;
    return e.metadata?.nonPrintingGuide!==true;
  });
}

export function prepareArtboardForCardExport(artboard:Artboard,request:CardExportRequest):Artboard{
  const hasPackaging=typeof artboard.metadata?.cartonDieline==='object'&&artboard.metadata.cartonDieline!==null;
  const mode=hasPackaging?(request.packagingMode??'STANDARD'):'STANDARD';
  const elements=filterCardExportElements(artboard,request).map(element=>{
    const technical=resolvePackagingTechnicalLayer(artboard,element);
    const forceVisible=(mode==='DIELINE_PROOF'&&(technical==='CUT'||technical==='CREASE'))
      ||(mode==='TECHNICAL'&&(technical==='CUT'||technical==='CREASE'||technical==='ANNOTATION'));
    return forceVisible&&!element.visible?{...element,visible:true}:element;
  });
  const includedIds=new Set(elements.map(element=>element.id));
  const groups:Artboard['groups']=artboard.groups.flatMap(group=>{
    const elementIds=group.elementIds.filter(id=>includedIds.has(id));
    if(!elementIds.length)return [];
    const technicalName=group.name?.trim().toUpperCase();
    const forceVisible=(mode==='DIELINE_PROOF'&&(technicalName==='CUT'||technicalName==='CREASE'))
      ||(mode==='TECHNICAL'&&(technicalName==='CUT'||technicalName==='CREASE'||technicalName==='ANNOTATION'));
    return [{...group,elementIds,visible:forceVisible?true:group.visible}];
  });
  return {...artboard,elements,groups};
}

export function buildCardRenderModel(artboard: Artboard, request: CardExportRequest) {
  const geometry = resolveCardExportGeometry(artboard, request);
  return {
    page: { 
      size: 'CUSTOM', 
      customWidthMm: geometry.outputWidthMm, 
      customHeightMm: geometry.outputHeightMm, 
      orientation: 'PORTRAIT', // Force PORTRAIT to prevent renderer-sdk from swapping width/height
      margins: { top: 0, right: 0, bottom: 0, left: 0 } 
    },
    trimWidthMm: geometry.trimWidthMm,
    trimHeightMm: geometry.trimHeightMm,
    bleedMm: request.includeBleed ? 3 : 0,
    background: request.transparentBackground && request.format === 'PNG' ? 'transparent' : (artboard.background.type === 'SOLID' ? artboard.background.color : 'transparent'),
    elements: prepareArtboardForCardExport(artboard,request).elements
  };
}

export function validateExportMemory(request: CardExportRequest, widthMm: number, heightMm: number): string | null {
  if (request.format !== 'PNG' && request.format !== 'JPEG') return null;
  const dpi = request.rasterDpi || 300;
  const widthPx = (widthMm / 25.4) * dpi;
  const heightPx = (heightMm / 25.4) * dpi;
  const bytes = widthPx * heightPx * 4;
  if (bytes > 500 * 1024 * 1024) { // 500MB safety limit per frame
    return `Requested export at ${dpi} DPI exceeds safe memory limits.`;
  }
  return null;
}
