import {describe,expect,it} from 'vitest';
import {
  DEFAULT_CARTON_DIELINE_INPUT,
  buildCardRenderModel,
  commitDesignHistory,
  createDesignHistory,
  createTextElement,
  deserializeDesignTemplate,
  generateCartonDieline,
  packagingPanelsFromArtboard,
  prepareArtboardForCardExport,
  prepareElementForPackagingPanel,
  redoDesignHistory,
  serializeDesignTemplate,
  setPackagingPanelArtworkOrientation,
  undoDesignHistory,
} from '../src/index.js';

const ids=()=>{let n=0;return(prefix:string)=>`${prefix}-${++n}`;};
const request=(packagingMode:'CLIENT_PROOF'|'DIELINE_PROOF'|'TECHNICAL')=>({format:'PDF' as const,targetMode:'CURRENT' as const,includeBleed:false,includeCropMarks:false,usePrintSettings:true,packagingMode});

describe('Phase 9.4J-K packaging persistence and export modes',()=>{
  it('round-trips panel orientation, artwork ownership and virtual artwork index',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
    const text=prepareElementForPackagingPanel(createTextElement({id:'front-copy',name:'Front Copy',xMm:panel.xMm+10,yMm:panel.yMm+10,zIndex:500}),panel);
    const withText={...generated.template,artboards:[{...artboard,elements:[...artboard.elements,text]}]};
    const oriented=setPackagingPanelArtworkOrientation(withText,artboard.id,panel.id,90,generated.measurements.packagingPanels);
    const loaded=deserializeDesignTemplate(serializeDesignTemplate(oriented));
    const loadedArtboard=loaded.artboards[0]!;
    const loadedPanel=packagingPanelsFromArtboard(loadedArtboard).find(item=>item.id===panel.id)!;
    const loadedText=loadedArtboard.elements.find(item=>item.id===text.id)!;
    const carton=loadedArtboard.metadata?.cartonDieline as Record<string,unknown>;
    const groups=(carton.artworkGroups as {groups:Array<{panelId:string;elementIds:string[]}>}).groups;
    expect(loadedPanel.artworkRotationDeg).toBe(90);
    expect(loadedText.metadata?.packagingPanelId).toBe(panel.id);
    expect(loadedText.metadata?.packagingPanelOrientationDeg).toBe(90);
    expect(groups.find(group=>group.panelId===panel.id)?.elementIds).toContain(text.id);
  });

  it('keeps packaging orientation changes undoable and redoable',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
    const changed=setPackagingPanelArtworkOrientation(generated.template,artboard.id,panel.id,90,generated.measurements.packagingPanels);
    const committed=commitDesignHistory(createDesignHistory(generated.template),changed);
    const undone=undoDesignHistory(committed);
    expect(packagingPanelsFromArtboard(undone.present.artboards[0]!).find(item=>item.id===panel.id)?.artworkRotationDeg).toBe(0);
    const redone=redoDesignHistory(undone);
    expect(packagingPanelsFromArtboard(redone.present.artboards[0]!).find(item=>item.id===panel.id)?.artworkRotationDeg).toBe(90);
  });

  it('exports artwork-only, dieline-proof and technical modes with distinct policies',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
    const text=prepareElementForPackagingPanel(createTextElement({id:'front-copy',name:'Front Copy',xMm:panel.xMm+10,yMm:panel.yMm+10,zIndex:500}),panel);
    const source={...artboard,elements:[...artboard.elements,text]};
    const client=buildCardRenderModel(source,request('CLIENT_PROOF'));
    const proof=buildCardRenderModel(source,request('DIELINE_PROOF'));
    const technical=buildCardRenderModel(source,request('TECHNICAL'));
    expect(client.elements.some(element=>element.id===text.id)).toBe(true);
    expect(client.elements.some(element=>element.metadata?.technicalLayer==='CUT')).toBe(false);
    expect(proof.elements.some(element=>element.id===text.id)).toBe(true);
    expect(proof.elements.some(element=>element.metadata?.technicalLayer==='CUT')).toBe(true);
    expect(proof.elements.some(element=>element.metadata?.technicalLayer==='CREASE')).toBe(true);
    expect(proof.elements.some(element=>element.metadata?.technicalLayer==='ANNOTATION')).toBe(false);
    expect(technical.elements.some(element=>element.id===text.id)).toBe(false);
    expect(technical.elements.some(element=>element.metadata?.technicalLayer==='CUT')).toBe(true);
    expect(technical.elements.some(element=>element.metadata?.technicalLayer==='ANNOTATION')).toBe(true);
  });

  it('keeps legacy panel labels and SAFE/BLEED guides out of dieline proof exports',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const annotation=artboard.elements.find(element=>element.metadata?.technicalLayer==='ANNOTATION')!;
    const safe=artboard.elements.find(element=>element.metadata?.technicalLayer==='SAFE')!;
    const bleed=artboard.elements.find(element=>element.metadata?.technicalLayer==='BLEED')!;
    const legacyAnnotation={...annotation,metadata:{},groupId:''};
    const legacySafe={...safe,metadata:{...safe.metadata,technicalLayer:undefined,nonPrintingGuide:false}};
    const legacyBleed={...bleed,metadata:{...bleed.metadata,technicalLayer:undefined,nonPrintingGuide:false}};
    const source={...artboard,elements:[...artboard.elements.filter(element=>element.id!==annotation.id&&element.id!==safe.id&&element.id!==bleed.id),legacyAnnotation,legacySafe,legacyBleed]};
    const proof=buildCardRenderModel(source,request('DIELINE_PROOF'));
    expect(proof.elements.some(element=>element.id===legacyAnnotation.id)).toBe(false);
    expect(proof.elements.some(element=>element.id===legacySafe.id)).toBe(false);
    expect(proof.elements.some(element=>element.id===legacyBleed.id)).toBe(false);
  });

  it('forces CUT and CREASE into dieline proof even when hidden in the editor',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const hidden={...artboard,
      groups:artboard.groups.map(group=>(group.name==='CUT'||group.name==='CREASE')?{...group,visible:false}:group),
      elements:artboard.elements.map(element=>(element.metadata?.technicalLayer==='CUT'||element.metadata?.technicalLayer==='CREASE')?{...element,visible:false}:element)
    };
    const prepared=prepareArtboardForCardExport(hidden,request('DIELINE_PROOF'));
    expect(prepared.elements.some(element=>element.metadata?.technicalLayer==='CUT')).toBe(true);
    expect(prepared.elements.some(element=>element.metadata?.technicalLayer==='CREASE')).toBe(true);
    expect(prepared.elements.filter(element=>element.metadata?.technicalLayer==='CUT'||element.metadata?.technicalLayer==='CREASE').every(element=>element.visible)).toBe(true);
    const model=buildCardRenderModel(hidden,request('DIELINE_PROOF'));
    expect(model.elements.filter(element=>element.metadata?.technicalLayer==='CUT'||element.metadata?.technicalLayer==='CREASE').every(element=>element.visible)).toBe(true);
    expect(prepared.groups.find(group=>group.name==='CUT')?.visible).toBe(true);
    expect(prepared.groups.find(group=>group.name==='CREASE')?.visible).toBe(true);
  });

  it('respects hidden artwork groups and ancestor groups while preserving technical export overrides',()=>{
    const generated=generateCartonDieline(DEFAULT_CARTON_DIELINE_INPUT,ids());
    const artboard=generated.template.artboards[0]!;
    const panel=generated.measurements.packagingPanels.find(item=>item.id==='body-front')!;
    const directHidden={...prepareElementForPackagingPanel(createTextElement({id:'hidden-direct',name:'Hidden Direct',xMm:panel.xMm+10,yMm:panel.yMm+10,zIndex:500}),panel),groupId:'art-hidden'};
    const ancestorHidden={...prepareElementForPackagingPanel(createTextElement({id:'hidden-parent',name:'Hidden Parent',xMm:panel.xMm+15,yMm:panel.yMm+15,zIndex:501}),panel),groupId:'art-child'};
    const visibleArtwork={...prepareElementForPackagingPanel(createTextElement({id:'visible-art',name:'Visible Art',xMm:panel.xMm+20,yMm:panel.yMm+20,zIndex:502}),panel),groupId:'art-visible'};
    const source={...artboard,
      groups:[
        ...artboard.groups,
        {id:'art-hidden',name:'Hidden Artwork',elementIds:[directHidden.id],visible:false},
        {id:'art-parent',name:'Hidden Parent',elementIds:[ancestorHidden.id],visible:false},
        {id:'art-child',name:'Child Artwork',elementIds:[ancestorHidden.id],visible:true,parentGroupId:'art-parent'},
        {id:'art-visible',name:'Visible Artwork',elementIds:[visibleArtwork.id],visible:true},
      ],
      elements:[...artboard.elements,directHidden,ancestorHidden,visibleArtwork]
    };
    const proof=buildCardRenderModel(source,request('DIELINE_PROOF'));
    const client=buildCardRenderModel(source,request('CLIENT_PROOF'));
    expect(proof.elements.some(element=>element.id===directHidden.id)).toBe(false);
    expect(proof.elements.some(element=>element.id===ancestorHidden.id)).toBe(false);
    expect(proof.elements.some(element=>element.id===visibleArtwork.id)).toBe(true);
    expect(client.elements.some(element=>element.id===directHidden.id)).toBe(false);
    expect(client.elements.some(element=>element.id===ancestorHidden.id)).toBe(false);
    expect(client.elements.some(element=>element.id===visibleArtwork.id)).toBe(true);
    expect(proof.elements.some(element=>element.metadata?.technicalLayer==='CUT')).toBe(true);
    expect(proof.elements.some(element=>element.metadata?.technicalLayer==='CREASE')).toBe(true);
  });

});
