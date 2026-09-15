import { describe, expect, it } from 'vitest';
import { buildTemplateInputContract } from './templateJsonBody.ts';
import type { BuilderDataSource } from './dataSourceStore.ts';
import type { TableDefinition } from './tableModel.ts';

const source: BuilderDataSource = {
  id: 'src-contract', name: 'Invoice API', sourceType: 'json', importedAt: '2026-09-15T00:00:00Z', warnings: [],
  fields: [
    { name: 'invoice.number', label: 'Invoice Number', type: 'string', required: true, nullable: false },
    { name: 'customer.name', label: 'Customer Name', type: 'string', required: true, nullable: false },
    { name: 'customer.photo', label: 'Customer Photo', type: 'string', required: false, nullable: true },
    { name: 'items.productName', label: 'Product', type: 'string', required: true, nullable: false },
    { name: 'items.qty', label: 'Qty', type: 'number', required: true, nullable: false },
    { name: 'items.rate', label: 'Rate', type: 'number', required: false, nullable: true },
  ],
  records: [{
    'invoice.number': 'INV-1001', 'customer.name': 'Aai Laxmi Automobiles', 'customer.photo': 'https://example.com/photo.png',
    'items.productName': 'Product A', 'items.qty': 2, 'items.rate': 100,
  }],
};

const table: TableDefinition = {
  id: 'items-table', name: 'Items', mode: 'dynamic',
  columns: [
    { id:'c1', key:'p', label:'Product', width:100, minWidth:40, align:'left' },
    { id:'c2', key:'q', label:'Qty', width:60, minWidth:40, align:'right' },
  ],
  headerRows: [], customRows: [], rows: [],
  bodyRows: [{ id:'r1', kind:'body', height:30, autoHeight:true, repeatOnEveryPage:false, keepTogether:true, cells:[
    { id:'p', type:'text', content:'', binding:'items.productName', valueMode:'binding', rowSpan:1, colSpan:1, style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'left',verticalAlign:'middle',padding:4}},
    { id:'q', type:'text', content:'', binding:'items.qty', valueMode:'binding', rowSpan:1, colSpan:1, style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
    { id:'r', type:'text', content:'', formula:'items.qty * items.rate', valueMode:'formula', rowSpan:1, colSpan:1, style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
  ]}],
  binding: { repeatSource:'items', sourceId:'src-contract' },
  pagination:{repeatHeader:true,allowRowSplit:false,keepRowsTogether:true}, borderWidth:1,borderColor:'#000',defaultPadding:4,
};

describe('DB-6A template input contract', () => {
  it('separates required/optional fields, arrays and calculated values', () => {
    const result = buildTemplateInputContract({
      templateId: 'invoice-template-001', templateName: 'Invoice', source, record: source.records[0],
      pages: [{ elements: [
        { id:'n', type:'text', text:'Invoice {{invoice.number}} - {{customer.name}}' },
        { id:'photo', type:'image', binding:'customer.photo' },
        { id:'grand', type:'formula', formulaName:'GrandTotal', formulaExpression:'items.qty * items.rate' },
        { id:'t', type:'table', table },
      ] }],
    });

    expect(result.contract.contractVersion).toBe('1.0');
    expect(result.contract.template.id).toBe('invoice-template-001');
    expect(result.contract.required).toEqual(['customer.name', 'invoice.number']);
    expect(result.contract.optional).toEqual(['customer.photo']);
    expect(result.contract.calculatedInternally).toEqual(['GrandTotal']);
    expect(result.contract.collections.items?.requiredFields).toEqual(['productName', 'qty']);
    expect(result.contract.collections.items?.optionalFields).toEqual(['rate']);
    expect(result.contract.fields.find((field) => field.path === 'customer.photo')).toMatchObject({
      contentKind: 'image', acceptedImageSources: ['url', 'base64', 'data-url'],
    });
    expect(result.contract.example).toHaveProperty('items');
  });
});
