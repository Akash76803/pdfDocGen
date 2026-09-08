import {describe,expect,it} from 'vitest';
import type {Artboard,AssetReference,DesignTemplate,ImageDesignElement,SvgDesignElement} from '@document-tool/contracts';
import {NO_BLEED_DIGITAL_PRESET,STANDARD_PRINT_PRESET,bleedExpandedDimensions,calculateEffectiveRasterDpi,createBlankArtboard,imagePrintQuality,inchesToMm,mmToInches,requiredPixels,resolveCardRenderModel,resolvePrintSettings,updateArtboardPrintSettings,validateArtboardPrint,validateDesignPrint} from '../src/index.js';

const rasterAsset:AssetReference={id:'raster',name:'Raster',kind:'IMAGE',sourceType:'DATA_URL',source:'data:image/png;base64,AA==',mimeType:'image/png',widthPx:500,heightPx:250};
const vectorAsset:AssetReference={id:'vector',name:'Vector',kind:'SVG',sourceType:'DATA_URL',source:'data:image/svg+xml,%3Csvg%2F%3E',mimeType:'image/svg+xml'};
const image=(id='image',assetId='raster',widthMm=100,heightMm=50,rotationDeg=0):ImageDesignElement=>({id,type:'IMAGE',name:id,assetId,fit:'FIT',position:{xMm:0,yMm:0},size:{widthMm,heightMm},rotationDeg,opacity:1,visible:true,locked:false,zIndex:0});
const svg=(id='svg'):SvgDesignElement=>({id,type:'SVG',name:id,assetId:'vector',preserveVector:true,position:{xMm:5,yMm:5},size:{widthMm:20,heightMm:20},rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1});
const artboard=(id='front',widthMm=90,heightMm=50):Artboard=>({...createBlankArtboard({id,name:id,order:0,widthMm,heightMm}),print:resolvePrintSettings(),elements:[]});
const template=(artboards:Artboard[],assets:AssetReference[]=[]):DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'template',name:'Print Template',version:1,status:'DRAFT',artboards,sharedAssets:assets});

describe('Phase 6.3 Print Readiness',()=>{
  it('resolves deterministic defaults and safely handles legacy missing print settings',()=>{
    const defaults=resolvePrintSettings();
    expect(defaults.bleed).toEqual({topMm:3,rightMm:3,bottomMm:3,leftMm:3});
    expect(defaults.safeArea).toEqual({topMm:3,rightMm:3,bottomMm:3,leftMm:3});
    expect(defaults.minimumRasterDpi).toBe(150);
    expect(defaults.preferredRasterDpi).toBe(300);
    const legacy=artboard();delete (legacy as Partial<Artboard>).print;
    const snapshot=JSON.stringify(legacy);
    expect(()=>validateArtboardPrint(legacy,[])).not.toThrow();
    expect(resolvePrintSettings(legacy.print).bleed.leftMm).toBe(3);
    expect(JSON.stringify(legacy)).toBe(snapshot);
  });

  it('uses canonical physical math and keeps bleed separate from trim size',()=>{
    expect(mmToInches(25.4)).toBeCloseTo(1);
    expect(inchesToMm(1)).toBeCloseTo(25.4);
    expect(requiredPixels(90,300)).toBe(1063);
    expect(requiredPixels(50,300)).toBe(591);
    expect(bleedExpandedDimensions(90,50,{topMm:3,rightMm:3,bottomMm:3,leftMm:3})).toEqual({widthMm:96,heightMm:56});
    const board=artboard('trim',90,50),updated=updateArtboardPrintSettings(template([board]),board.id,{bleed:{topMm:5,rightMm:4,bottomMm:3,leftMm:2}}).artboards[0]!;
    expect([updated.widthMm,updated.heightMm]).toEqual([90,50]);
    expect(updated.print.bleed).toEqual({topMm:5,rightMm:4,bottomMm:3,leftMm:2});
  });

  it('supports asymmetric and zero bleed without changing trim or safe-area semantics',()=>{
    expect(bleedExpandedDimensions(90,50,{topMm:1,rightMm:2,bottomMm:3,leftMm:4})).toEqual({widthMm:96,heightMm:54});
    expect(bleedExpandedDimensions(90,50,{topMm:0,rightMm:0,bottomMm:0,leftMm:0})).toEqual({widthMm:90,heightMm:50});
    const settings=resolvePrintSettings({showBleedInEditor:false,bleed:{topMm:3,rightMm:3,bottomMm:3,leftMm:3},safeArea:{topMm:4,rightMm:5,bottomMm:4,leftMm:5}});
    expect(settings.showBleedInEditor).toBe(false);
    expect(settings.bleed.leftMm).toBe(3);
    expect(90-settings.safeArea.leftMm-settings.safeArea.rightMm).toBe(80);
  });

  it('calculates effective DPI from placed physical size using the lower axis',()=>{
    const good=calculateEffectiveRasterDpi(1200,1200,100,50);
    expect(good.status).toBe('GOOD');
    expect(good.effectiveDpi).toBeCloseTo(good.dpiX!);
    expect(good.dpiY).toBeGreaterThan(good.dpiX!);
    expect(calculateEffectiveRasterDpi(600,600,100,50).status).toBe('WARNING');
    expect(calculateEffectiveRasterDpi(500,500,100,50).status).toBe('LOW');
    const normal=imagePrintQuality(image('normal','raster',100,50,0),rasterAsset);
    const rotated=imagePrintQuality(image('rotated','raster',100,50,90),rasterAsset);
    expect(rotated.effectiveDpi).toBe(normal.effectiveDpi);
    expect(imagePrintQuality(image('vector-image','vector'),vectorAsset).status).toBe('VECTOR');
  });

  it('uses independent physical axes for stretched raster placement',()=>{
    const stretched=calculateEffectiveRasterDpi(1200,300,50,100);
    expect(stretched.dpiX).toBeCloseTo(609.6);
    expect(stretched.dpiY).toBeCloseTo(76.2);
    expect(stretched.effectiveDpi).toBeCloseTo(76.2);
    expect(stretched.status).toBe('LOW');
  });

  it('returns structured preflight issues without throwing',()=>{
    const negative={...artboard(),print:{...resolvePrintSettings(),bleed:{topMm:-1,rightMm:3,bottomMm:3,leftMm:3}}};
    expect(validateArtboardPrint(negative,[]).issues.some(issue=>issue.code==='PRINT_INSETS_INVALID')).toBe(true);
    const impossible={...artboard(),print:{...resolvePrintSettings(),safeArea:{topMm:30,rightMm:46,bottomMm:30,leftMm:46}}};
    expect(validateArtboardPrint(impossible,[]).issues.some(issue=>issue.code==='PRINT_SAFE_AREA_IMPOSSIBLE')).toBe(true);
    const low={...artboard(),elements:[image()]};
    expect(validateArtboardPrint(low,[rasterAsset]).issues.some(issue=>issue.code==='PRINT_RASTER_DPI_LOW')).toBe(true);
    const missing={...artboard(),elements:[image('missing','absent')]};
    expect(()=>validateArtboardPrint(missing,[])).not.toThrow();
    expect(validateArtboardPrint(missing,[]).issues.some(issue=>issue.code==='PRINT_ASSET_MISSING')).toBe(true);
    const missingDimensions={...rasterAsset,id:'no-dimensions',widthPx:undefined,heightPx:undefined},unknown={...artboard(),elements:[image('unknown','no-dimensions')]};
    expect(validateArtboardPrint(unknown,[missingDimensions]).issues.some(issue=>issue.code==='PRINT_RASTER_DIMENSIONS_MISSING')).toBe(true);
    const invalidTrim={...artboard('invalid'),widthMm:0},trimIssue=validateArtboardPrint(invalidTrim,[]).issues.find(issue=>issue.code==='PRINT_DIMENSIONS_INVALID');
    expect(trimIssue).toMatchObject({severity:'ERROR',artboardId:'invalid'});
    expect(trimIssue?.id).toBeTruthy();expect(trimIssue?.message).toBeTruthy();
    const lowIssue=validateArtboardPrint(low,[rasterAsset]).issues.find(issue=>issue.code==='PRINT_RASTER_DPI_LOW');
    expect(lowIssue).toMatchObject({severity:'WARNING',artboardId:'front',elementId:'image'});
  });

  it('aggregates deterministic per-artboard errors and warnings',()=>{
    const clean=artboard('clean'),low={...artboard('low'),order:1,elements:[image()]},invalid={...artboard('invalid'),order:2,print:{...resolvePrintSettings(),bleed:{topMm:-1,rightMm:3,bottomMm:3,leftMm:3}}};
    const result=validateDesignPrint(template([clean,low,invalid],[rasterAsset]));
    expect(result.artboards.map(item=>item.artboardId)).toEqual(['clean','low','invalid']);
    expect(result.warnings).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(result.issues.length).toBe(result.errors+result.warnings+result.info);
  });

  it('updates one artboard without mutating independent mixed-size settings',()=>{
    const first={...artboard('first',90,50),print:{...resolvePrintSettings(),minimumRasterDpi:150,preferredRasterDpi:300,cropMarksEnabledForExport:false}},second={...artboard('second',120,80),order:1,print:{...resolvePrintSettings(),bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:5,rightMm:5,bottomMm:5,leftMm:5},minimumRasterDpi:100,preferredRasterDpi:200,cropMarksEnabledForExport:true}};
    const beforeSecond=JSON.stringify(second),updated=updateArtboardPrintSettings(template([first,second]),'first',{minimumRasterDpi:200,showBleedInEditor:true});
    expect(updated.artboards[0]!.print.minimumRasterDpi).toBe(200);
    expect(JSON.stringify(updated.artboards[1])).toBe(beforeSecond);
  });

  it('exposes deterministic standard and no-bleed presets',()=>{
    expect(STANDARD_PRINT_PRESET).toMatchObject({bleed:{topMm:3,rightMm:3,bottomMm:3,leftMm:3},safeArea:{topMm:3,rightMm:3,bottomMm:3,leftMm:3},minimumRasterDpi:150,preferredRasterDpi:300});
    expect(NO_BLEED_DIGITAL_PRESET.bleed).toEqual({topMm:0,rightMm:0,bottomMm:0,leftMm:0});
  });

  it('aggregates independent mixed-size artboards and separates editor/export policy',()=>{
    const front={...artboard('front',90,50),print:{...resolvePrintSettings(),showCropMarksInEditor:true,cropMarksEnabledForExport:false}};
    const back={...artboard('back',100,140),order:1,print:{...resolvePrintSettings(),bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},showCropMarksInEditor:false,cropMarksEnabledForExport:true}};
    const result=validateDesignPrint(template([front,back]));
    expect(result.artboards).toHaveLength(2);
    expect(front.print.showCropMarksInEditor).not.toBe(front.print.cropMarksEnabledForExport);
    expect(back.widthMm).toBe(100);
    expect(back.print.bleed.leftMm).toBe(0);
  });

  it('prepares resolved print and asset quality metadata in the render model',()=>{
    const board={...artboard(),print:{...resolvePrintSettings(),cropMarksEnabledForExport:true},elements:[image(),svg()]};
    const resolved=resolveCardRenderModel(template([board],[rasterAsset,vectorAsset]));
    expect(resolved.errors).toEqual([]);
    const modelBoard=resolved.model!.artboards[0]!;
    expect([modelBoard.widthMm,modelBoard.heightMm]).toEqual([90,50]);
    expect(modelBoard.print.bleed.leftMm).toBe(3);
    expect(modelBoard.print.safeArea.rightMm).toBe(3);
    expect(modelBoard.print.cropMarksEnabledForExport).toBe(true);
    expect(modelBoard.print.minimumRasterDpi).toBe(150);
    expect(modelBoard.print.preferredRasterDpi).toBe(300);
    expect(modelBoard.elements[0]!.content).toMatchObject({assetRenderKind:'RASTER_IMAGE',printQuality:{status:'LOW'}});
    expect(modelBoard.elements[1]!.content).toMatchObject({assetRenderKind:'VECTOR_SVG',printQuality:{status:'VECTOR'}});
  });
});
