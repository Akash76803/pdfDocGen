import { describe, expect, it } from 'vitest';
import type { PathDesignElement } from '@document-tool/contracts';
import { appendCadPolylinePoint, createCadPolylineGeometry, createCadPolylineMetadata } from '../src/cadPolyline.js';

describe('Phase 8.8A2 CAD Polyline',()=>{
  it('keeps exact world vertices while normalizing bounds',()=>{
    const r=createCadPolylineGeometry([{xMm:10.125,yMm:8.5},{xMm:30.75,yMm:8.5},{xMm:20.25,yMm:25.875}],['a','b','c']);
    expect(r.position).toEqual({xMm:10.125,yMm:8.5});
    expect(r.geometry.points.map(p=>[p.id,p.x+r.position.xMm,p.y+r.position.yMm])).toEqual([
      ['a',10.125,8.5],['b',30.75,8.5],['c',20.25,25.875]
    ]);
    expect(r.geometry.segments).toHaveLength(2);
  });
  it('appends to the same PATH and ignores a duplicate double-click vertex',()=>{
    const first=createCadPolylineGeometry([{xMm:5,yMm:5}],['a']);
    const el:PathDesignElement={id:'poly',type:'PATH',name:'Polyline',position:first.position,size:first.size,rotationDeg:0,opacity:1,visible:true,locked:false,zIndex:1,geometry:first.geometry,fill:{type:'NONE'},stroke:{style:'SOLID',color:'#000',widthMm:.5},metadata:createCadPolylineMetadata()};
    const two=appendCadPolylinePoint(el,{xMm:25,yMm:5},'b');
    const three=appendCadPolylinePoint(two,{xMm:25,yMm:20},'c');
    const duplicate=appendCadPolylinePoint(three,{xMm:25,yMm:20},'d');
    expect(three.id).toBe('poly');
    expect(three.geometry.points).toHaveLength(3);
    expect(three.geometry.segments).toHaveLength(2);
    expect(duplicate.geometry.points).toHaveLength(3);
  });
  it('marks geometry for future sectioning',()=>{
    expect(createCadPolylineMetadata('shape-1')).toMatchObject({cadGeometryKind:'POLYLINE',cadSectionCandidate:true,cadIntent:'DRAW',cadStartTargetId:'shape-1'});
  });
});
