import { describe, expect, it, test } from 'vitest';
import { adaptDesktopTemplateEntry } from './desktop-template-adapter.js';

describe('adaptDesktopTemplateEntry', () => {
  it('adapts a desktop local-library template into a headless template definition', () => {
    const result = adaptDesktopTemplateEntry({
      id: 'desktop-template-1',
      name: 'Invoice',
      version: 3,
      payload: {
        name: 'Invoice',
        updatedAt: '2026-09-15T00:00:00.000Z',
        pages: [{
          id: 'p1',
          settings: { preset: 'A4', orientation: 'Portrait', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
          elements: [
            { id: 'title', type: 'text', text: 'Invoice {{Invoice No}}', x: 0, y: 0, width: 100, height: 20, fontSize: 14, textAlign: 'left', color: '#111111', fill: 'transparent' },
            { id: 'customer', type: 'text', binding: 'Customer: Account Name', x: 0, y: 30, width: 100, height: 20, fontSize: 10, textAlign: 'left', color: '#111111', fill: 'transparent' },
            { id: 'items', type: 'table', x: 0, y: 60, width: 500, height: 120, table: {
              columns: [
                { id: 'c1', key: 'Product Description', label: 'Product Description', width: 150, align: 'left' },
                { id: 'c2', key: 'Unit Price', label: 'Unit Price', width: 80, align: 'right' },
              ],
              headerRows: [{ cells: [{ content: 'Product Description' }, { content: 'Unit Price' }] }],
              bodyRows: [{ cells: [{ binding: 'Product: Products Name' }, { binding: 'Unit Price' }] }],
              borderStyle: 'solid', borderWidth: 1,
            } },
          ],
        }],
      },
    });
    expect(result.id).toBe('desktop-template-1');
    expect(result.version).toBe(3);
    expect(result.body.blocks).toHaveLength(3);
    expect(result.body.blocks[1]?.type).toBe('FIELD');
    expect(result.body.blocks[1]?.type === 'FIELD' ? result.body.blocks[1].path : '').toBe('customerAccountName');
    const tableBlock = result.body.blocks[2];
    expect(tableBlock?.type).toBe('TABLE');
    if (tableBlock?.type === 'TABLE') expect(tableBlock.columns.map((column) => column.path)).toEqual(['productProductsName', 'unitPrice']);
  });
});

test('normalizes mixed scalar tokens while preserving system pagination tokens', () => {
  const result = adaptDesktopTemplateEntry({
    id: 'mixed-token-template',
    name: 'Mixed Tokens',
    version: 1,
    payload: {
      pages: [{
        id: 'page-1',
        settings: {},
        elements: [{
          id: 'text-1',
          type: 'text',
          region: 'body',
          text: 'Invoice {{Invoice No}} · {{Customer: Account Name}} · Page {{pageNumber}} of {{totalPages}}',
        }],
      }],
    },
  });
  const block = result.body.blocks[0];
  expect(block?.type).toBe('TEXT');
  if (block?.type !== 'TEXT') throw new Error('Expected TEXT block');
  expect(block.text).toBe('Invoice {{invoiceNo}} · {{customerAccountName}} · Page {{pageNumber}} of {{totalPages}}');
});

test('preserves desktop absolute geometry, formula definitions, and embedded static images', () => {
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////2wBDAf//////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//9k=';
  const result = adaptDesktopTemplateEntry({
    id: 'fidelity', name: 'Fidelity', version: 1,
    payload: { pages: [{ id:'p1', settings:{preset:'A4',orientation:'Portrait'}, elements:[
      {id:'f1',type:'formula',formulaName:'Grand Total',formulaExpression:'[Final Amount] + 100'},
      {id:'v1',type:'text',binding:'Grand Total',x:96,y:144,width:200,height:30,fontSize:16,textAlign:'left',fill:'transparent',color:'#000'},
      {id:'img',type:'image',imageSource:jpeg,x:400,y:96,width:100,height:60,textAlign:'left',fill:'transparent',color:'#000'},
    ]}] },
  });
  expect(result.metadata?.desktopAbsoluteLayout).toBe(true);
  expect(result.metadata?.desktopBodyTopMm).toBeDefined();
  expect(result.metadata?.desktopBodyBottomMm).toBeDefined();
  expect(result.metadata?.desktopFormulaFields).toEqual(expect.arrayContaining([expect.objectContaining({name:'Grand Total',alias:'grandTotal'})]));
  const field=result.body.blocks.find((block)=>block.id==='v1');
  expect(field?.type).toBe('FIELD');
  if(field?.type==='FIELD') expect(field.path).toBe('calc.grandTotal');
  expect(field?.layout?.positionMode).toBe('ABSOLUTE');
  expect(field?.layout?.xMm).toBeCloseTo(25.4,4);
  const image=result.body.blocks.find((block)=>block.id==='img');
  expect(image?.type).toBe('IMAGE');
  if(image?.type==='IMAGE') expect(image.source).toBe(jpeg);
});

test('adapts DISCOUNT table formulas to safe headless bindings', () => {
  const result = adaptDesktopTemplateEntry({
    id:'discount-table',name:'Discount Table',version:1,
    payload:{pages:[{id:'p1',settings:{},elements:[{
      id:'t1',type:'table',x:0,y:0,width:500,height:100,table:{
        columns:[
          {id:'c1',key:'Basic Value',label:'Basic Value',width:100,align:'right'},
          {id:'c2',key:'Total Discount',label:'Total Discount',width:100,align:'right'},
          {id:'c3',key:'Taxable',label:'Taxable',width:100,align:'right'},
        ],
        headerRows:[{cells:[{content:'Basic Value'},{content:'Total Discount'},{content:'Taxable'}]}],
        bodyRows:[{cells:[
          {binding:'Basic Value'},
          {binding:'Total Discount'},
          {valueMode:'formula',formula:'DISCOUNT([Basic Value], [Total Discount])'},
        ]}],
      },
    }]}]},
  });
  const table=result.body.blocks[0];
  expect(table?.type).toBe('TABLE');
  if(table?.type!=='TABLE') throw new Error('Expected TABLE');
  const taxable=table.columns[2]!;
  expect(taxable.kind).toBe('FORMULA');
  expect(taxable.formulaExpression).toBe('DISCOUNT({{b0}}, {{b1}})');
  expect(taxable.formulaBindings?.map((binding)=>binding.path)).toEqual(['basicValue','totalDiscount']);
});


test('normalizes bare calculated-column references without confusing DISCOUNT function calls', () => {
  const result = adaptDesktopTemplateEntry({
    id:'calc-chain',name:'Calculated Chain',version:1,
    payload:{pages:[{id:'p1',settings:{},elements:[{
      id:'t1',type:'table',x:0,y:0,width:500,height:100,table:{
        columns:[
          {id:'c1',key:'basic',label:'Basic Value',width:100,align:'right'},
          {id:'c2',key:'discount',label:'Discount',width:100,align:'right'},
          {id:'c3',key:'taxable',label:'Taxable',width:100,align:'right'},
        ],
        headerRows:[{cells:[{content:'Basic Value'},{content:'Discount'},{content:'Taxable'}]}],
        bodyRows:[{cells:[
          {binding:'Basic Value'},
          {valueMode:'formula',formula:'[Basic Value] * [Total Discount]'},
          {valueMode:'formula',formula:'[Basic Value] - Discount'},
        ]}],
      },
    }]}]},
  });
  const table=result.body.blocks[0];
  expect(table?.type).toBe('TABLE'); if(table?.type!=='TABLE')throw new Error('Expected TABLE');
  const discount=table.columns[1]!; const taxable=table.columns[2]!;
  expect(discount.path).toBe('discount');
  expect(taxable.formulaExpression).toBe('{{b0}} - {{b1}}');
  expect(taxable.formulaBindings?.map((binding)=>binding.path)).toEqual(['basicValue','discount']);
});

test('uses summary aggregate field as canonical path for a calculated table column', () => {
  const result = adaptDesktopTemplateEntry({
    id:'calc-summary-alias',name:'Calculated Summary Alias',version:1,
    payload:{pages:[{id:'p1',settings:{},elements:[{
      id:'t1',type:'table',x:0,y:0,width:500,height:100,table:{
        columns:[
          {id:'c1',key:'basic',label:'Basic Value',width:100,align:'right'},
          {id:'c2',key:'taxable',label:'Taxable',width:100,align:'right'},
        ],
        headerRows:[{cells:[{content:'Basic Value'},{content:'Taxable'}]}],
        bodyRows:[{cells:[
          {binding:'Basic Value'},
          {valueMode:'formula',formula:'[Basic Value] * 0.8'},
        ]}],
        customRows:[{cells:[
          {content:'Total'},
          {summaryMode:'aggregate',aggregate:{operation:'sum',field:'Taxable Value'},summaryName:'Taxable Total'},
        ]}],
      },
    }]}]},
  });
  const table=result.body.blocks[0];
  expect(table?.type).toBe('TABLE'); if(table?.type!=='TABLE')throw new Error('Expected TABLE');
  expect(table.columns[1]?.path).toBe('taxableValue');
  expect(table.columns[1]?.targetPath).toBe('taxableValue');
});


test('UX-8 maps universal multi-rule conditions into renderer visibility rules', () => {
  const result = adaptDesktopTemplateEntry({
    id:'ux8-conditions',name:'UX8 Conditions',version:1,
    payload:{pages:[{id:'p1',settings:{},elements:[{
      id:'conditional-text',type:'text',text:'Approved High Value',x:0,y:0,width:200,height:30,
      conditionalRendering:{
        enabled:true,action:'show',match:'all',
        rules:[
          {id:'r1',field:'Status',operator:'equals',value:'Approved'},
          {id:'r2',field:'Grand Total',operator:'greaterThanOrEqual',value:'10000'},
        ],
      },
    },{
      id:'conditional-hide',type:'divider',x:0,y:40,width:200,height:2,
      conditionalRendering:{
        enabled:true,action:'hide',match:'any',
        rules:[
          {id:'r3',field:'Status',operator:'equals',value:'Cancelled'},
          {id:'r4',field:'Grand Total',operator:'lessThanOrEqual',value:'0'},
        ],
      },
    }]}]},
  });
  expect(result.body.blocks[0]?.visibility).toEqual({
    logic:'ALL',
    conditions:[
      {path:'status',operator:'EQUALS',value:'Approved'},
      {path:'grandTotal',operator:'GREATER_OR_EQUAL',value:'10000'},
    ],
    negate:false,
  });
  expect(result.body.blocks[1]?.visibility).toEqual({
    logic:'ANY',
    conditions:[
      {path:'status',operator:'EQUALS',value:'Cancelled'},
      {path:'grandTotal',operator:'LESS_OR_EQUAL',value:'0'},
    ],
    negate:true,
  });
});

test('UX-8 keeps legacy single-condition templates compatible', () => {
  const result = adaptDesktopTemplateEntry({
    id:'ux8-legacy',name:'Legacy Condition',version:1,
    payload:{pages:[{id:'p1',settings:{},elements:[{
      id:'legacy-text',type:'text',text:'Legacy',x:0,y:0,width:100,height:20,
      conditionEnabled:true,conditionField:'Payment Status',conditionOperator:'isNotEmpty',conditionValue:'',
    }]}]},
  });
  expect(result.body.blocks[0]?.visibility).toEqual({path:'paymentStatus',operator:'NOT_EMPTY'});
});
