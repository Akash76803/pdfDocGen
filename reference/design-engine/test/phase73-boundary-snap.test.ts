import {describe,expect,it} from 'vitest';
import {createShapeElement,findBoundarySnap} from '../src/index.js';

describe('Phase 7.3 boundary snapping',()=>{
 const rectangle=createShapeElement('RECTANGLE',{id:'rect',xMm:10,yMm:10,widthMm:40,heightMm:30});
 it('returns the exact nearest segment coordinate',()=>{expect(findBoundarySnap([rectangle],{x:30,y:10.8},2)?.point).toEqual({x:30,y:10});});
 it('prioritizes an existing canonical node',()=>{expect(findBoundarySnap([rectangle],{x:10.1,y:10.1},2)).toMatchObject({kind:'NODE',point:{x:10,y:10}});});
 it('respects caller-provided zoom-aware tolerance',()=>{expect(findBoundarySnap([rectangle],{x:30,y:12},1)).toBeUndefined();expect(findBoundarySnap([rectangle],{x:30,y:12},3)).toBeDefined();});
 it('supports curved shape boundaries through the Paper path',()=>{const ellipse=createShapeElement('ELLIPSE',{id:'ellipse',xMm:0,yMm:0,widthMm:40,heightMm:20});const snap=findBoundarySnap([ellipse],{x:20,y:.7},2);expect(snap?.point.y).toBeCloseTo(0,1);});
});
