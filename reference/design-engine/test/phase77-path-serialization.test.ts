import { describe, expect, it } from 'vitest';
import type { DesignTemplate, PathDesignElement } from '@document-tool/contracts';
import { CARD_DESIGN_SCHEMA_VERSION, deserializeDesignTemplate, normalizeDesignTemplate, serializeDesignTemplate, validateDesignTemplate } from '../src/index.js';

const pathElement = (id='face-1'): PathDesignElement => ({
  id, type:'PATH', name:'Generated Face',
  position:{xMm:10,yMm:10}, size:{widthMm:30,heightMm:20}, rotationDeg:0,
  opacity:1, visible:true, locked:false, zIndex:1,
  geometry:{
    closed:true,
    points:[
      {id:'p1',x:0,y:0},{id:'p2',x:30,y:0},{id:'p3',x:30,y:20},{id:'p4',x:0,y:20}
    ],
    segments:[
      {id:'s1',type:'LINE',fromPointId:'p1',toPointId:'p2'},
      {id:'s2',type:'LINE',fromPointId:'p2',toPointId:'p3'},
      {id:'s3',type:'LINE',fromPointId:'p3',toPointId:'p4'},
      {id:'s4',type:'LINE',fromPointId:'p4',toPointId:'p1'}
    ]
  },
  fill:{type:'SOLID',color:'#ff0000',opacity:1},
  stroke:{style:'SOLID',color:'#111827',widthMm:.3,opacity:1},
  bindings:[{id:'visible-binding',targetProperty:'visible',sourceType:'STATIC',fallbackValue:true}]
});

const template = (): DesignTemplate => ({
  kind:'CARD_DESIGN', schemaVersion:CARD_DESIGN_SCHEMA_VERSION, id:'path-card', name:'Path Card', version:1, status:'DRAFT', sharedAssets:[],
  artboards:[{
    id:'front', name:'Front', order:0, widthMm:100, heightMm:60, displayUnit:'MM',
    background:{type:'SOLID',color:'#ffffff'},
    print:{bleed:{topMm:0,rightMm:0,bottomMm:0,leftMm:0},safeArea:{topMm:0,rightMm:0,bottomMm:0,leftMm:0}},
    guides:[], groups:[], elements:[pathElement()]
  }]
});

describe('Phase 7.7 PATH serialization regression', () => {
  it('accepts first-class PATH elements in the default registry', () => {
    const result = validateDesignTemplate(template());
    expect(result.valid).toBe(true);
    expect(result.errors.some(error => error.code === 'ELEMENT_TYPE_UNSUPPORTED')).toBe(false);
  });

  it('serializes and restores generated PATH faces losslessly', () => {
    const input = template();
    const output = deserializeDesignTemplate(serializeDesignTemplate(input));
    expect(output).toEqual(normalizeDesignTemplate(input));
    expect(output.artboards[0]?.elements[0]?.type).toBe('PATH');
  });
});
