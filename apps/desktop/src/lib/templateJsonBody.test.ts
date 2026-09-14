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
    expect(result.body).toMatchObject({ InvoiceNo:'INV-1', Customer:{Name:'ABC'} });
    expect(result.body).not.toHaveProperty('GrandTotal');
    expect(result.body.items).toEqual([
      { ProductName:'A', Qty:2, Rate:100 },
      { ProductName:'B', Qty:1, Rate:50 },
    ]);
    expect(result.formulaFieldsExcluded).toEqual(['GrandTotal']);
  });
});
