import { describe, expect, it } from 'vitest';
import type { DocumentGroup, TemplateDefinition } from '@document-tool/contracts';
import { TemplateEngine } from '../src/template-engine.js';

const group: DocumentGroup = {
  id:'g1', key:'INV-1', header:{ invoice:{number:'INV-1'}, gst:1725.86 },
  items:[
    { hsn:'73201020', gstRate:18, qty:1, taxable:2010, sgst:180.9, cgst:180.9 },
    { hsn:'73201020', gstRate:18, qty:3, taxable:3810, sgst:342.9, cgst:342.9 },
    { hsn:'85011019', gstRate:18, qty:3, taxable:3768.15, sgst:339.13, cgst:339.13 },
  ], itemDetails:[], sourceRowIndexes:[1,2,3], warnings:[], valid:true,
};

function template(): TemplateDefinition {
  return {
    id:'p35', name:'Phase 3.5', version:1,
    page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}}, header:{blocks:[]}, footer:{blocks:[]},
    body:{blocks:[
      { id:'items', type:'TABLE', sourcePath:'items', columns:[
        {id:'p',label:'HSN',path:'hsn'}, {id:'q',label:'Qty',path:'qty'}, {id:'t',label:'Taxable',path:'taxable'},
      ], footerRows:[{ id:'total', cells:[
        {id:'tl',columnId:'p',value:{operation:'STATIC',staticValue:'TOTAL'}},
        {id:'tq',columnId:'q',value:{operation:'SUM',path:'qty',decimals:0}},
        {id:'tt',columnId:'t',value:{operation:'SUM',path:'taxable',decimals:2}},
      ] }] },
      { id:'amounts', type:'SUMMARY_TABLE', title:'Amounts', dataMode:'MANUAL', sourcePath:'items', showHeader:false,
        columns:[{id:'l',label:'Label',widthPercent:60},{id:'v',label:'Value',widthPercent:40,alignment:'RIGHT'}],
        rows:[
          {id:'net',cells:[{id:'nl',columnId:'l',value:{operation:'STATIC',staticValue:'Net Amount'}},{id:'nv',columnId:'v',value:{operation:'SUM',path:'taxable',decimals:2},alignment:'RIGHT'}]},
          {id:'gst',cells:[{id:'gl',columnId:'l',value:{operation:'STATIC',staticValue:'GST'}},{id:'gv',columnId:'v',value:{operation:'FIELD',path:'gst',decimals:2},alignment:'RIGHT'}]},
        ],
        totalRow:{id:'grand',bold:true,cells:[{id:'g1',columnId:'l',value:{operation:'STATIC',staticValue:'TOTAL AMOUNT'}},{id:'g2',columnId:'v',value:{operation:'SUM',path:'taxable',format:'WORDS'},alignment:'RIGHT'}]}
      },
      { id:'tax', type:'SUMMARY_TABLE', title:'Tax Summary', dataMode:'GROUP_BY', sourcePath:'items', groupByPath:'hsn', showHeader:true,
        columns:[{id:'hsn',label:'HSN'},{id:'taxable',label:'Taxable',alignment:'RIGHT'},{id:'sgst',label:'SGST',alignment:'RIGHT'}],
        rows:[{id:'tax-template',cells:[
          {id:'h',columnId:'hsn',value:{operation:'FIELD',path:'groupKey'}},
          {id:'ta',columnId:'taxable',value:{operation:'SUM',path:'taxable',decimals:2}},
          {id:'s',columnId:'sgst',value:{operation:'SUM',path:'sgst',decimals:2}},
        ]}],
        totalRow:{id:'tax-total',bold:true,cells:[
          {id:'ht',columnId:'hsn',value:{operation:'STATIC',staticValue:'Total'}},
          {id:'tat',columnId:'taxable',value:{operation:'SUM',path:'taxable',decimals:2}},
          {id:'st',columnId:'sgst',value:{operation:'SUM',path:'sgst',decimals:2}},
        ]}
      }
    ]}
  };
}

describe('Phase 3.5 totals and summary tables', () => {
  it('resolves table footer SUM cells', () => {
    const result=new TemplateEngine().buildRenderModel(template(),group);
    const table=result.model?.body?.[0];
    if(table?.type!=='TABLE') throw new Error('Expected table');
    expect(table.footerRows).toHaveLength(1);
    expect(table.footerRows[0]?.cells.map(c=>c.value)).toEqual(['TOTAL','7','9588.15']);
  });

  it('renders manual summary table rows from static, field and aggregate values', () => {
    const result=new TemplateEngine().buildRenderModel(template(),group);
    const summary=result.model?.body?.[1];
    if(summary?.type!=='SUMMARY_TABLE') throw new Error('Expected summary');
    expect(summary.rows[0]?.cells.map(c=>c.value)).toEqual(['Net Amount','9588.15']);
    expect(summary.rows[1]?.cells.map(c=>c.value)).toEqual(['GST','1725.86']);
  });

  it('supports amount-in-words formatting', () => {
    const result=new TemplateEngine().buildRenderModel(template(),group);
    const summary=result.model?.body?.[1];
    if(summary?.type!=='SUMMARY_TABLE') throw new Error('Expected summary');
    expect(String(summary.totalRow?.cells[1]?.value)).toContain('Nine Thousand Five Hundred Eighty Eight');
    expect(String(summary.totalRow?.cells[1]?.value)).toContain('Paise');
  });

  it('builds grouped tax summary rows by HSN', () => {
    const result=new TemplateEngine().buildRenderModel(template(),group);
    const summary=result.model?.body?.[2];
    if(summary?.type!=='SUMMARY_TABLE') throw new Error('Expected tax summary');
    expect(summary.rows).toHaveLength(2);
    expect(summary.rows[0]?.cells[0]?.value).toBe('73201020');
    expect(summary.rows[0]?.cells[1]?.value).toBe('5820.00');
  });

  it('builds a total row across all tax rows', () => {
    const result=new TemplateEngine().buildRenderModel(template(),group);
    const summary=result.model?.body?.[2];
    if(summary?.type!=='SUMMARY_TABLE') throw new Error('Expected tax summary');
    expect(summary.totalRow?.cells[1]?.value).toBe('9588.15');
  });

  it('rejects grouped summary without group-by path', () => {
    const bad=template(); const block=bad.body.blocks[2]; if(block.type!=='SUMMARY_TABLE') throw new Error(); block.groupByPath='';
    const validation=new TemplateEngine().validate(bad);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e=>e.code==='SUMMARY_TABLE_INVALID')).toBe(true);
  });

  it('rejects aggregate requiring a path when path is missing', () => {
    const bad=template(); const block=bad.body.blocks[1]; if(block.type!=='SUMMARY_TABLE'||!block.rows) throw new Error(); block.rows[0]!.cells[1]!.value={operation:'SUM'};
    const validation=new TemplateEngine().validate(bad);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e=>e.code==='SUMMARY_VALUE_INVALID')).toBe(true);
  });

  it('aggregates imported source headers when mapped item path is unavailable', () => {
    const rawGroup: DocumentGroup = {
      id:'raw', key:'INV-RAW', header:{},
      items:[{}, {}],
      sourceItems:[{'Taxable Value':100.5},{'Taxable Value':249.5}],
      itemDetails:[], sourceRowIndexes:[1,2], warnings:[], valid:true,
    };
    const t=template();
    const summary=t.body.blocks[1]; if(summary.type!=='SUMMARY_TABLE'||!summary.rows) throw new Error();
    summary.rows=[{id:'raw-net',cells:[
      {id:'raw-label',columnId:'l',value:{operation:'STATIC',staticValue:'Net Amount'}},
      {id:'raw-value',columnId:'v',value:{operation:'SUM',path:'items.taxableValue',targetPath:'items.taxableValue',sourceField:'Taxable Value',decimals:2}},
    ]}];
    const result=new TemplateEngine().buildRenderModel(t,rawGroup);
    const rendered=result.model?.body?.[1]; if(rendered?.type!=='SUMMARY_TABLE') throw new Error();
    expect(rendered.rows[0]?.cells[1]?.value).toBe('350.00');
  });

  it('resolves full collection-prefixed aggregate paths inside mapped item rows', () => {
    const nestedGroup: DocumentGroup = {
      id:'nested', key:'INV-NESTED', header:{},
      items:[{items:{taxableValue:125}},{items:{taxableValue:75}}],
      sourceItems:[], itemDetails:[], sourceRowIndexes:[1,2], warnings:[], valid:true,
    };
    const t=template();
    const summary=t.body.blocks[1]; if(summary.type!=='SUMMARY_TABLE'||!summary.rows) throw new Error();
    summary.rows=[{id:'nested-net',cells:[
      {id:'nested-label',columnId:'l',value:{operation:'STATIC',staticValue:'Net Amount'}},
      {id:'nested-value',columnId:'v',value:{operation:'SUM',path:'items.taxableValue',decimals:2}},
    ]}];
    const result=new TemplateEngine().buildRenderModel(t,nestedGroup);
    const rendered=result.model?.body?.[1]; if(rendered?.type!=='SUMMARY_TABLE') throw new Error();
    expect(rendered.rows[0]?.cells[1]?.value).toBe('200.00');
  });



  it('resolves collection-prefixed SUM paths against flat line-item rows', () => {
    const flatGroup: DocumentGroup = {
      id:'flat', key:'INV-FLAT', header:{},
      items:[{finalAmount:125},{finalAmount:75}],
      sourceItems:[], itemDetails:[], sourceRowIndexes:[1,2], warnings:[], valid:true,
    };
    const t=template();
    const summary=t.body.blocks[1]; if(summary.type!=='SUMMARY_TABLE'||!summary.rows) throw new Error();
    summary.sourcePath='items';
    summary.rows=[{id:'flat-final',cells:[
      {id:'flat-label',columnId:'l',value:{operation:'STATIC',staticValue:'Final'}},
      {id:'flat-value',columnId:'v',value:{operation:'SUM',path:'items.finalAmount',targetPath:'items.finalAmount',decimals:2}},
    ]}];
    const result=new TemplateEngine().buildRenderModel(t,flatGroup);
    const rendered=result.model?.body?.[1]; if(rendered?.type!=='SUMMARY_TABLE') throw new Error();
    expect(rendered.rows[0]?.cells[1]?.value).toBe('200.00');
  });

  it('uses the original imported numeric source field when compact mapped items do not contain the selected value', () => {
    const compactGroup: DocumentGroup = {
      id:'compact', key:'INV-COMPACT', header:{},
      items:[{},{}],
      sourceItems:[{'Final Amount':125},{'Final Amount':75}],
      itemDetails:[], sourceRowIndexes:[2,3], warnings:[], valid:true,
    };
    const t=template();
    const summary=t.body.blocks[1]; if(summary.type!=='SUMMARY_TABLE'||!summary.rows) throw new Error();
    summary.sourcePath='items';
    summary.rows=[{id:'compact-final',cells:[
      {id:'compact-label',columnId:'l',value:{operation:'STATIC',staticValue:'Final'}},
      {id:'compact-value',columnId:'v',value:{operation:'SUM',path:'items.finalAmount',targetPath:'items.finalAmount',sourceField:'Final Amount',decimals:2}},
    ]}];
    const result=new TemplateEngine().buildRenderModel(t,compactGroup);
    const rendered=result.model?.body?.[1]; if(rendered?.type!=='SUMMARY_TABLE') throw new Error();
    expect(rendered.rows[0]?.cells[1]?.value).toBe('200.00');
  });

  it('keeps templates without Phase 3.5 fields backward-compatible', () => {
    const legacy=template(); legacy.body.blocks=[{id:'t',type:'TEXT',text:'Legacy'}];
    const result=new TemplateEngine().buildRenderModel(legacy,group);
    expect(result.errors).toHaveLength(0);
    expect(result.model?.body?.[0]?.type).toBe('TEXT');
  });
});

// Regression: old/manual Amount Summary blocks could persist sourcePath='fields'
// while individual aggregate bindings point at the item collection.
describe('Phase 3.6 summary canonical binding regressions', () => {
  it('falls back to document item rows when manual summary sourcePath is a scalar object', () => {
    const itemGroup: DocumentGroup = {
      id:'manual-fields', key:'INV-MANUAL', header:{fields:{customerName:'ABC'}},
      items:[{taxableValue:100},{taxableValue:250}],
      sourceItems:[{'Taxable Value':100},{'Taxable Value':250}],
      itemDetails:[], sourceRowIndexes:[1,2], warnings:[], valid:true,
    };
    const t=template();
    const summary=t.body.blocks[1]; if(summary.type!=='SUMMARY_TABLE'||!summary.rows) throw new Error();
    summary.sourcePath='fields';
    summary.rows=[{id:'manual-row',cells:[
      {id:'manual-label',columnId:'l',value:{operation:'STATIC',staticValue:'Net Amount'}},
      {id:'manual-value',columnId:'v',value:{operation:'SUM',path:'items.taxableValue',targetPath:'items.taxableValue',sourceField:'Taxable Value',decimals:2,format:'NUMBER'}},
    ]}];
    const result=new TemplateEngine().buildRenderModel(t,itemGroup);
    const rendered=result.model?.body?.[1]; if(rendered?.type!=='SUMMARY_TABLE') throw new Error();
    expect(rendered.rows[0]?.cells[1]?.value).toBe('350.00');
  });
});

describe('Phase 4.16 Fix2 summary row-level styling', () => {
  it('applies row style over table default and lets cell style override the row', () => {
    const t=template();
    const summary=t.body.blocks[1];
    if(summary.type!=='SUMMARY_TABLE' || !summary.rows) throw new Error('Expected manual summary');
    summary.tableStyle={cellStyle:{fontFamily:'Arial',fontSize:9,textColor:'#111827'}};
    summary.rows[0]!.style={fontFamily:'Arial',fontSize:14,bold:true,textColor:'#2563EB',alignment:'RIGHT'};
    summary.rows[0]!.backgroundColor='#EFF6FF';
    summary.rows[0]!.cells[1]!.style={fontSize:16,textColor:'#DC2626'};

    const result=new TemplateEngine().buildRenderModel(t,group);
    const rendered=result.model?.body?.[1];
    if(rendered?.type!=='SUMMARY_TABLE') throw new Error('Expected summary render model');
    const row=rendered.rows[0]!;
    expect(row.style.fontSize).toBe(14);
    expect(row.style.bold).toBe(true);
    expect(row.style.textColor).toBe('#2563EB');
    expect(row.backgroundColor).toBe('#EFF6FF');
    expect(row.cells[0]!.style.fontSize).toBe(14);
    expect(row.cells[0]!.style.textColor).toBe('#2563EB');
    expect(row.cells[1]!.style.fontSize).toBe(16);
    expect(row.cells[1]!.style.textColor).toBe('#DC2626');
  });

  it('supports an independent total-row font size override', () => {
    const t=template();
    const summary=t.body.blocks[1];
    if(summary.type!=='SUMMARY_TABLE' || !summary.totalRow) throw new Error('Expected total row');
    summary.tableStyle={cellStyle:{fontFamily:'Arial',fontSize:9,textColor:'#111827'}};
    summary.totalRow.style={fontFamily:'Arial',fontSize:15,bold:true,textColor:'#111827'};

    const result=new TemplateEngine().buildRenderModel(t,group);
    const rendered=result.model?.body?.[1];
    if(rendered?.type!=='SUMMARY_TABLE' || !rendered.totalRow) throw new Error('Expected summary total row');
    expect(rendered.totalRow.style.fontSize).toBe(15);
    expect(rendered.totalRow.cells[0]!.style.fontSize).toBe(15);
    expect(rendered.totalRow.cells[1]!.style.fontSize).toBe(15);
  });
});
