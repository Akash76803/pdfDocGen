import { describe, expect, it } from 'vitest';
import { buildCurrentDocumentJsonBody } from './templateJsonBody.ts';
import type { BuilderDataSource } from './dataSourceStore.ts';
import type { TableDefinition } from './tableModel.ts';

const source: BuilderDataSource = {
  id: 'src-1', name: 'Invoices', sourceType: 'json', importedAt: '2026-09-14T00:00:00Z', warnings: [],
  fields: [
    { name: 'InvoiceNo', label: 'Invoice No', type: 'string', required: true },
    { name: 'Customer.Name', label: 'Customer', type: 'string', required: false },
    { name: 'ProductName', label: 'Product', type: 'string', required: false },
    { name: 'Qty', label: 'Qty', type: 'number', required: false },
    { name: 'Rate', label: 'Rate', type: 'number', required: false },
  ],
  records: [
    { InvoiceNo: 'INV-1', 'Customer.Name': 'ABC', ProductName: 'A', Qty: 2, Rate: 100 },
    { InvoiceNo: 'INV-1', 'Customer.Name': 'ABC', ProductName: 'B', Qty: 1, Rate: 50 },
    { InvoiceNo: 'INV-2', 'Customer.Name': 'XYZ', ProductName: 'C', Qty: 4, Rate: 25 },
  ],
};

const table: TableDefinition = {
  id: 't1', name: 'Items', mode: 'dynamic',
  columns: [
    { id:'c1', key:'p', label:'Product', width:100, minWidth:40, align:'left' },
    { id:'c2', key:'q', label:'Qty', width:60, minWidth:40, align:'right' },
  ],
  headerRows: [],
  bodyRows: [{ id:'r1', kind:'body', height:30, autoHeight:true, repeatOnEveryPage:false, keepTogether:true, cells:[
    { id:'x1', type:'text', content:'', binding:'ProductName', valueMode:'binding', rowSpan:1, colSpan:1, style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'left',verticalAlign:'middle',padding:4}},
    { id:'x2', type:'text', content:'', formula:'Qty * Rate', valueMode:'formula', rowSpan:1, colSpan:1, style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
  ]}],
  customRows: [], rows: [],
  binding: { repeatSource:'Invoices', sourceId:'src-1', parentKey:'InvoiceNo', parentKeys:['InvoiceNo'] },
  pagination:{repeatHeader:true,allowRowSplit:false,keepRowsTogether:true}, borderWidth:1,borderColor:'#000',defaultPadding:4,
};

describe('current document JSON body', () => {
  it('includes external bindings, builds items and excludes formula outputs', () => {
    const result = buildCurrentDocumentJsonBody({
      source, record: source.records[0],
      pages:[{elements:[
        {id:'a',type:'text',text:'Invoice {{InvoiceNo}} for {{Customer.Name}}'},
        {id:'f',type:'formula',formulaName:'GrandTotal',formulaExpression:'Qty * Rate'},
        {id:'b',type:'text',binding:'GrandTotal'},
        {id:'t',type:'table',table},
      ]}],
    });
    expect(result.body).toMatchObject({ invoiceNo:'INV-1', customer:{name:'ABC'} });
    expect(result.body).not.toHaveProperty('GrandTotal');
    expect(result.body.items).toEqual([
      { productName:'A', qty:2, rate:100 },
      { productName:'B', qty:1, rate:50 },
    ]);
    expect(result.formulaFieldsExcluded).toEqual(['GrandTotal']);
  });

  it('creates a clean ready-to-send API request with safe field names', () => {
    const businessSource: BuilderDataSource = {
      id: 'src-business', name: 'Business', sourceType: 'json', importedAt: '2026-09-15T00:00:00Z', warnings: [],
      fields: [
        { name: 'Customer: Account Name', label: 'Customer', type: 'string', required: true },
        { name: 'GSTIN', label: 'GSTIN', type: 'string', required: false },
        { name: 'TCS %', label: 'TCS', type: 'number', required: false },
        { name: 'Product: Products Name', label: 'Product', type: 'string', required: false },
        { name: 'Unit Price', label: 'Unit Price', type: 'number', required: false },
      ],
      records: [{ 'Customer: Account Name': 'Aai Laxmi', GSTIN: '27TEST', 'TCS %': 0, 'Product: Products Name': 'Part A', 'Unit Price': 1980 }],
    };
    const businessTable: TableDefinition = {
      ...table,
      bodyRows: [{ ...table.bodyRows[0]!, cells: [
        { ...table.bodyRows[0]!.cells[0]!, binding: 'Product: Products Name', valueMode: 'binding' },
        { ...table.bodyRows[0]!.cells[1]!, binding: 'Unit Price', valueMode: 'binding', formula: undefined },
      ] }],
      binding: { repeatSource: 'items' },
    };
    const result = buildCurrentDocumentJsonBody({
      templateId: '7004e453-602e-4173-be10-7239d04b3b3d', templateName: 'Tax Invoice', source: businessSource, record: businessSource.records[0],
      pages: [{ elements: [
        { id: 'customer', type: 'text', binding: 'Customer: Account Name' },
        { id: 'gstin', type: 'text', binding: 'GSTIN' },
        { id: 'tcs', type: 'text', binding: 'TCS %' },
        { id: 'table', type: 'table', table: businessTable },
      ] }],
    });
    expect(result.body).toMatchObject({ customerAccountName: 'Aai Laxmi', gstin: '27TEST', tcsPercent: 0 });
    expect(result.body.items).toEqual([{ productProductsName: 'Part A', unitPrice: 1980 }]);
    expect(result.request).toMatchObject({
      templateId: '7004e453-602e-4173-be10-7239d04b3b3d',
      output: { format: 'pdf', fileName: 'Tax-Invoice.pdf', renderMode: 'native-auto', responseMode: 'binary' },
      data: result.body,
    });
  });

});
