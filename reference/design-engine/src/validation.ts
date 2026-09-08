import type { Artboard, DesignElement, DesignTemplate, DesignValidationIssue, DesignValidationResult } from '@document-tool/contracts';
import { createDefaultDesignElementRegistry, DesignElementRegistry } from './element-registry.js';

const finite=(value:number)=>Number.isFinite(value);
const nonNegativeInsets=(a:Artboard['print']['bleed'])=>[a.topMm,a.rightMm,a.bottomMm,a.leftMm].every(v=>finite(v)&&v>=0);

export function validateDesignTemplate(template:DesignTemplate, registry:DesignElementRegistry=createDefaultDesignElementRegistry()):DesignValidationResult {
  const issues:DesignValidationIssue[]=[];
  const error=(issue:Omit<DesignValidationIssue,'severity'>)=>issues.push({...issue,severity:'ERROR'});
  if (!template || template.kind!=='CARD_DESIGN' || !template.id?.trim() || !template.name?.trim() || !Number.isInteger(template.version) || template.version<1) {
    error({code:'DESIGN_TEMPLATE_INVALID',message:'Card design template id, name and positive version are required.'});
  }
  if (!Array.isArray(template.artboards) || template.artboards.length===0) error({code:'ARTBOARD_REQUIRED',message:'A card design template requires at least one artboard.'});
  const artboardIds=new Set<string>(); const orders=new Set<number>(); const allElementIds=new Set<string>();
  for (const artboard of template.artboards ?? []) {
    if (artboardIds.has(artboard.id)) error({code:'ARTBOARD_ID_DUPLICATE',message:`Duplicate artboard id: ${artboard.id}`,artboardId:artboard.id});
    artboardIds.add(artboard.id);
    if (!artboard.name?.trim()) error({code:'ARTBOARD_NAME_REQUIRED',message:'Artboard name is required.',artboardId:artboard.id});
    if (!finite(artboard.widthMm)||!finite(artboard.heightMm)||artboard.widthMm<=0||artboard.heightMm<=0||!nonNegativeInsets(artboard.print.bleed)||!nonNegativeInsets(artboard.print.safeArea)) error({code:'ARTBOARD_DIMENSION_INVALID',message:'Artboard dimensions and print insets must be finite and non-negative; width/height must be positive.',artboardId:artboard.id});
    if (!Number.isInteger(artboard.order)||orders.has(artboard.order)) error({code:'ARTBOARD_ORDER_DUPLICATE',message:`Artboard order must be a unique integer: ${artboard.order}`,artboardId:artboard.id});
    orders.add(artboard.order);
    validateArtboard(artboard,registry,allElementIds,error);
  }
  const pairCounts=new Map<string,number>();
  for (const artboard of template.artboards ?? []) {
    if (artboard.pairId) {
      pairCounts.set(artboard.pairId, (pairCounts.get(artboard.pairId)||0)+1);
    }
  }
  for (const artboard of template.artboards ?? []) {
    if (artboard.pairId && pairCounts.get(artboard.pairId)!==2) {
      error({code:'ARTBOARD_PAIR_INVALID',message:`Artboard pairId must be shared by exactly two artboards (found ${pairCounts.get(artboard.pairId)}).`,artboardId:artboard.id});
    }
  }
  const assetIds=new Set<string>();
  for (const asset of template.sharedAssets ?? []) {
    if (assetIds.has(asset.id)) error({code:'ASSET_ID_DUPLICATE',message:`Duplicate asset id: ${asset.id}`});
    assetIds.add(asset.id);
  }
  for (const artboard of template.artboards ?? []) for (const element of artboard.elements) {
    if ((element.type==='IMAGE'||element.type==='SVG') && !assetIds.has(element.assetId)) error({code:'ASSET_REFERENCE_MISSING',message:`Element references missing asset: ${element.assetId}`,artboardId:artboard.id,elementId:element.id});
    if ((element.type==='SHAPE'||element.type==='PATH') && element.fill.type==='IMAGE' && !assetIds.has(element.fill.assetId)) error({code:'ASSET_REFERENCE_MISSING',message:`Element image fill references missing asset: ${element.fill.assetId}`,artboardId:artboard.id,elementId:element.id});
  }
  const errors=issues.filter(i=>i.severity==='ERROR'); const warnings=issues.filter(i=>i.severity==='WARNING');
  return {valid:errors.length===0,errors,warnings};
}

function validateArtboard(artboard:Artboard, registry:DesignElementRegistry, allElementIds:Set<string>, error:(issue:Omit<DesignValidationIssue,'severity'>)=>void):void {
  const groupIds=new Set<string>(); const guideIds=new Set<string>();
  for (const group of artboard.groups ?? []) {
    if (groupIds.has(group.id)) error({code:'GROUP_ID_DUPLICATE',message:`Duplicate group id: ${group.id}`,artboardId:artboard.id});
    groupIds.add(group.id);
  }
  for (const guide of artboard.guides ?? []) {
    if (guideIds.has(guide.id)) error({code:'GUIDE_ID_DUPLICATE',message:`Duplicate guide id: ${guide.id}`,artboardId:artboard.id});
    guideIds.add(guide.id);
    const max=guide.orientation==='VERTICAL'?artboard.widthMm:artboard.heightMm;
    if (!finite(guide.positionMm)||guide.positionMm<0||guide.positionMm>max) error({code:'GUIDE_POSITION_INVALID',message:`Guide ${guide.id} is outside the artboard.`,artboardId:artboard.id});
  }
  const localElements=new Set<string>();
  for (const element of artboard.elements ?? []) {
    if (allElementIds.has(element.id)||localElements.has(element.id)) error({code:'ELEMENT_ID_DUPLICATE',message:`Duplicate element id: ${element.id}`,artboardId:artboard.id,elementId:element.id});
    allElementIds.add(element.id); localElements.add(element.id);
    validateElement(artboard,element,registry,groupIds,error);
  }
  for (const group of artboard.groups ?? []) {
    for (const id of group.elementIds) if (!localElements.has(id)) error({code:'GROUP_ELEMENT_MISSING',message:`Group ${group.id} references missing element ${id}.`,artboardId:artboard.id});
    if (group.parentGroupId && !groupIds.has(group.parentGroupId)) error({code:'GROUP_PARENT_MISSING',message:`Group ${group.id} references missing parent ${group.parentGroupId}.`,artboardId:artboard.id});
  }
  for (const group of artboard.groups ?? []) {
    const seen=new Set<string>([group.id]); let current=group;
    while (current.parentGroupId) {
      if (seen.has(current.parentGroupId)) { error({code:'GROUP_CYCLE',message:`Group cycle detected at ${group.id}.`,artboardId:artboard.id}); break; }
      seen.add(current.parentGroupId); const next=artboard.groups.find(g=>g.id===current.parentGroupId); if (!next) break; current=next;
    }
  }
}

function validateElement(artboard:Artboard, element:DesignElement, registry:DesignElementRegistry, groupIds:Set<string>, error:(issue:Omit<DesignValidationIssue,'severity'>)=>void):void {
  if (!registry.has(element)) error({code:'ELEMENT_TYPE_UNSUPPORTED',message:`Unsupported design element type: ${element.type==='CUSTOM'?element.customType:element.type}`,artboardId:artboard.id,elementId:element.id});
  if (![element.position.xMm,element.position.yMm,element.size.widthMm,element.size.heightMm,element.rotationDeg].every(finite)||element.size.widthMm<=0||element.size.heightMm<=0) error({code:'ELEMENT_GEOMETRY_INVALID',message:'Element position/size/rotation must be finite and size must be positive.',artboardId:artboard.id,elementId:element.id});
  if (!finite(element.opacity)||element.opacity<0||element.opacity>1) error({code:'ELEMENT_OPACITY_INVALID',message:'Element opacity must be between 0 and 1.',artboardId:artboard.id,elementId:element.id});
  if (element.groupId&&!groupIds.has(element.groupId)) error({code:'ELEMENT_GROUP_MISSING',message:`Element references missing group: ${element.groupId}`,artboardId:artboard.id,elementId:element.id});
  if (element.bindings) {
    const bindingIds = new Set<string>();
    
    // Supported target property registry
    const supportedProps: Record<string, string[]> = {
      TEXT: ['text', 'visible'],
      IMAGE: ['source', 'altText', 'visible'],
      SVG: ['source', 'tintColor', 'visible'],
      SHAPE: ['visible', 'fillImageSource'],
      PATH: ['visible', 'fillImageSource']
    };
    
    for (const binding of element.bindings) {
      if (!binding.id) error({code:'BINDING_INVALID',message:'Binding requires an id.',artboardId:artboard.id,elementId:element.id});
      if (bindingIds.has(binding.id)) error({code:'BINDING_INVALID',message:`Duplicate binding id on element: ${binding.id}`,artboardId:artboard.id,elementId:element.id});
      bindingIds.add(binding.id);
      
      if (!binding.targetProperty) error({code:'BINDING_INVALID',message:'Binding requires a targetProperty.',artboardId:artboard.id,elementId:element.id});
      
      const allowed = supportedProps[element.type] || [];
      if (binding.targetProperty && !allowed.includes(binding.targetProperty)) {
        error({code:'BINDING_INVALID',message:`Unsupported target property '${binding.targetProperty}' for element type ${element.type}.`,artboardId:artboard.id,elementId:element.id});
      }
      
      if (binding.sourceType === 'FIELD') {
        if (!binding.fieldPath?.trim()) error({code:'BINDING_INVALID',message:'FIELD bindings require a fieldPath.',artboardId:artboard.id,elementId:element.id});
        if (binding.fieldPath && (binding.fieldPath.includes('__proto__') || binding.fieldPath.includes('constructor') || binding.fieldPath.includes('prototype'))) {
          error({code:'BINDING_INVALID',message:'FIELD binding path contains blocked dangerous keys.',artboardId:artboard.id,elementId:element.id});
        }
      } else if (binding.sourceType === 'CALCULATED') {
        if (!binding.calculatedFieldId?.trim()) error({code:'BINDING_INVALID',message:'CALCULATED bindings require a calculatedFieldId.',artboardId:artboard.id,elementId:element.id});
      } else if (binding.sourceType === 'STATIC') {
        if (binding.fallbackValue === undefined) error({code:'BINDING_INVALID',message:'STATIC bindings require a fallbackValue.',artboardId:artboard.id,elementId:element.id});
      }
    }
  }

  for (const message of registry.validate(element)) error({code:'DESIGN_TEMPLATE_INVALID',message,artboardId:artboard.id,elementId:element.id});
}
