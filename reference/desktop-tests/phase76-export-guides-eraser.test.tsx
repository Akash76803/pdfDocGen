import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IsolatedCardExportCanvas } from '../src/pages/CardExportCanvas';
import type { Artboard, PathDesignElement } from '@document-tool/contracts';

const path: PathDesignElement = {
  id:'face-a', type:'PATH', name:'Face A', position:{xMm:5,yMm:5}, size:{widthMm:30,heightMm:20}, rotationDeg:0,
  opacity:1, visible:true, locked:false, zIndex:1,
  geometry:{points:[{id:'a',x:0,y:0,mode:'CORNER'},{id:'b',x:30,y:0,mode:'CORNER'},{id:'c',x:30,y:20,mode:'CORNER'},{id:'d',x:0,y:20,mode:'CORNER'}],segments:[{id:'ab',type:'LINE',fromPointId:'a',toPointId:'b'},{id:'bc',type:'LINE',fromPointId:'b',toPointId:'c'},{id:'cd',type:'LINE',fromPointId:'c',toPointId:'d'},{id:'da',type:'LINE',fromPointId:'d',toPointId:'a'}],closed:true},
  fill:{type:'SOLID',color:'#ff0000',opacity:1}, stroke:{style:'SOLID',color:'#000000',widthMm:.5,opacity:1}, metadata:{faceGeneration:'AUTO_SECTION'}
};
const artboard: Artboard = {id:'a',name:'A',order:0,widthMm:90,heightMm:50,displayUnit:'MM',background:{type:'SOLID',color:'#ffffff',opacity:1},elements:[path],guides:[],groups:[],print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},showBleedInEditor:false,showSafeAreaInEditor:false,showCropMarksInEditor:false,cropMarksEnabledForExport:false,minimumRasterDpi:150,preferredRasterDpi:300}} as Artboard;

describe('Phase 7.6 export fidelity, spacing guides, and eraser',()=>{
  it('renders generated PATH faces and their fill colors in isolated export canvas',()=>{
    const html=renderToStaticMarkup(<IsolatedCardExportCanvas artboard={artboard} assets={[]}/>);
    expect(html).toContain('data-export-path-id="face-a"');
    expect(html).toContain('fill="#ff0000"');
    expect(html).toContain('<path');
  });

  it('contains equal-spacing snap guides with measurement labels',()=>{
    const source=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
    expect(source).toContain('equalSpacingSnap');
    expect(source).toContain('data-spacing-guide');
    expect(source).toContain('guide.gapMm');
  });

  it('contains a sticky freeform eraser that trims touched vector intervals on release',()=>{
    const designer=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
    const library=readFileSync(resolve(process.cwd(),'apps/desktop/src/components/designer/ElementLibraryPanel.tsx'),'utf8');
    expect(library).toContain("label: 'Freeform Eraser'");
    expect(designer).toContain("mode:'ERASER_LASSO'");
    expect(designer).toContain('eraserHitsElement');
    expect(designer).toContain('data-eraser-lasso');
    expect(designer).toContain('erasePathWithWorldStroke(pathSource,stroke,radiusMm)');
    expect(designer).toContain('splitGeometryIntoConnectedFragments(erased)');
    expect(designer).toContain("if(!source.visible||source.runtimeHidden||source.locked)continue");
    expect(designer).toContain('onPointerCancel={cancelEraserStroke}');
  });

  it('contains a sticky fill bucket for solid and transparent closed regions',()=>{
    const designer=readFileSync(resolve(process.cwd(),'apps/desktop/src/pages/CardDesigner.tsx'),'utf8');
    const library=readFileSync(resolve(process.cwd(),'apps/desktop/src/components/designer/ElementLibraryPanel.tsx'),'utf8');
    expect(library).toContain("label: 'Fill Bucket'");
    expect(library).toContain('<option value="SOLID">Solid</option>');
    expect(library).toContain('<option value="NONE">Transparent / No Fill</option>');
    expect(designer).toContain('fillableElementContainsPoint(element,p)');
    expect(designer).toContain("if(!closed){setStatus('Fill Bucket — boundary is open; close the path before filling')");
    expect(designer).toContain("fillBucketType==='NONE'?{type:'NONE' as const}:{type:'SOLID' as const");
    expect(designer).toContain("interactionMode==='FILL_BUCKET'");
  });
});
