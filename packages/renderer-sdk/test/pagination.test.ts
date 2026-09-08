import { describe, expect, it } from 'vitest';
import { canPlace, paginate, paginateStable, resolvePageCapacity, type PageCapacity } from '../src/pagination.js';

const capacity=(h:number):PageCapacity=>({pageHeight:h,topMargin:0,bottomMargin:0,repeatedHeaderHeight:0,repeatedFooterHeight:0,safetyGap:3,usableBodyHeight:h});

describe('shared pagination planner',()=>{
  it('reserves followup height before placing the current row',()=>{
    expect(canPlace(20,10,12,3,.1)).toBe(false);
    expect(canPlace(25,10,12,3,.1)).toBe(true);
  });

  it('moves last row and footer to next page when they do not fit together',()=>{
    const pages=paginate([
      {id:'r1',kind:'TABLE_ROW',height:70},
      {id:'r2',kind:'TABLE_ROW',height:10,keepWithNextHeight:12},
      {id:'total',kind:'TABLE_FOOTER',height:12},
    ],{policy:{safetyGapMm:3},capacityResolver:()=>capacity(90)});
    expect(pages).toHaveLength(2);
    expect(pages[0]!.items.map(i=>i.id)).toEqual(['r1']);
    expect(pages[1]!.items.map(i=>i.id)).toEqual(['r2','total']);
  });

  it('keeps grouped subtotal with its last group row',()=>{
    const pages=paginate([
      {id:'g-r1',kind:'TABLE_ROW',height:70},
      {id:'g-last',kind:'TABLE_ROW',height:10,keepWithNextHeight:10},
      {id:'subtotal',kind:'GROUP_SUBTOTAL',height:10},
    ],{policy:{safetyGapMm:3},capacityResolver:()=>capacity(90)});
    expect(pages[0]!.items.map(i=>i.id)).toEqual(['g-r1']);
    expect(pages[1]!.items.map(i=>i.id)).toEqual(['g-last','subtotal']);
  });



  it('honors exact 99/100/101 percent boundary with epsilon',()=>{
    expect(canPlace(100,99,0,0,.1)).toBe(true);
    expect(canPlace(100,100,0,0,.1)).toBe(true);
    expect(canPlace(100,101,0,0,.1)).toBe(false);
  });

  it('replans when the actual last page has a smaller capacity',()=>{
    const items=[
      {id:'a',kind:'BLOCK' as const,height:55},
      {id:'b',kind:'BLOCK' as const,height:35},
    ];
    const pages=paginateStable(items,{
      policy:{safetyGapMm:0},
      capacityResolver:(_i,kind)=>capacity(kind==='LAST'?70:100),
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.items.map(i=>i.id)).toEqual(['a']);
    expect(pages[1]!.items.map(i=>i.id)).toEqual(['b']);
  });

  it('rejects an oversize keep-together trailing block unless emergency split is enabled',()=>{
    expect(()=>paginate([{id:'tail',kind:'TRAILING_BLOCK',height:110,keepTogether:true}],{
      policy:{safetyGapMm:0,emergencySplitEnabled:false},capacityResolver:()=>capacity(100),
    })).toThrow('PAGINATION_ITEM_EXCEEDS_PAGE:tail');
  });

  it('calculates usable body height from page reservations',()=>{
    expect(resolvePageCapacity({pageHeight:297,topMargin:10,bottomMargin:10,repeatedHeaderHeight:30,repeatedFooterHeight:15,safetyGap:3}).usableBodyHeight).toBe(229);
  });

  it('does not oscillate between page counts on a larger N-page <-> 1-page transition',()=>{
    // Four items that comfortably fit on one FIRST/MIDDLE-capacity page (100) but not
    // on the true LAST-capacity page (70) once it's actually the only page. A resolver
    // that keeps flipping page-index-0 between FIRST and LAST across passes would cycle
    // forever between a 1-page and a multi-page layout instead of settling on the safe one.
    const items=[
      {id:'a',kind:'BLOCK' as const,height:25},
      {id:'b',kind:'BLOCK' as const,height:25},
      {id:'c',kind:'BLOCK' as const,height:20},
      {id:'d',kind:'BLOCK' as const,height:15},
    ];
    const pages=paginateStable(items,{
      policy:{safetyGapMm:0},
      capacityResolver:(_i,kind)=>capacity(kind==='LAST'?70:100),
    });
    const total=pages.reduce((sum,p)=>sum+p.items.length,0);
    expect(total).toBe(items.length);
    // Must never collapse everything onto a single page sized against the wrong (larger) capacity.
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(p=>p.bodyHeightUsed<=p.capacity.usableBodyHeight+0.1)).toBe(true);
  });
});
