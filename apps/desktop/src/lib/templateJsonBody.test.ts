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

describe('DB-6B Fix10 aggregate formula request contract', () => {
  it('puts SUM formula dependencies in items instead of the document root', () => {
    const aggregateSource: BuilderDataSource = {
      id:'src-agg',name:'Agg',sourceType:'json',importedAt:'2026-09-16T00:00:00Z',warnings:[],
      fields:[
        {name:'Invoice No',label:'Invoice No',type:'string',required:true},
        {name:'Final Amount',label:'Final Amount',type:'number',required:false},
        {name:'Total GST',label:'Total GST',type:'number',required:false},
      ],
      records:[
        {'Invoice No':'INV-1','Final Amount':100,'Total GST':18},
        {'Invoice No':'INV-1','Final Amount':200,'Total GST':36},
      ],
    };
    const result=buildCurrentDocumentJsonBody({
      source:aggregateSource,record:aggregateSource.records[0],
      pages:[{elements:[
        {id:'invoice',type:'text',binding:'Invoice No'},
        {id:'net',type:'formula',formulaName:'NET PAYABLE AMOUNT',formulaExpression:'SUM([Final Amount])'},
        {id:'gst',type:'formula',formulaName:'TOTAL GST',formulaExpression:'SUM([Total GST])'},
      ]}],
    });
    expect(result.body).toMatchObject({invoiceNo:'INV-1'});
    expect(result.body).not.toHaveProperty('finalAmount');
    expect(result.body).not.toHaveProperty('totalGST');
    expect(result.body.items).toEqual([
      {finalAmount:100,totalGst:18},
      {finalAmount:200,totalGst:36},
    ]);
  });
});

describe('DB-6B Fix12 clean external input contract', () => {
  it('includes only leaf source inputs and excludes calculated/table/summary/grouped/system outputs', () => {
    const contractSource: BuilderDataSource = {
      id:'src-contract',name:'Contract',sourceType:'json',importedAt:'2026-09-16T00:00:00Z',warnings:[],
      fields:[
        {name:'Invoice No',label:'Invoice No',type:'string',required:true},
        {name:'Basic Value',label:'Basic Value',type:'number',required:false},
        {name:'Total Discount',label:'Total Discount',type:'number',required:false},
        {name:'Discount',label:'Discount',type:'number',required:false},
        {name:'Taxable Value',label:'Taxable Value',type:'number',required:false},
        {name:'HSN',label:'HSN',type:'string',required:false},
        {name:'GST %',label:'GST %',type:'number',required:false},
        {name:'Total GST',label:'Total GST',type:'number',required:false},
      ],
      records:[{'Invoice No':'INV-1','Basic Value':1980,'Total Discount':0.2,Discount:396,'Taxable Value':1584,HSN:'73201020','GST %':0.18,'Total GST':285.12}],
    };
    const cleanTable: TableDefinition = {
      id:'clean-table',name:'Items',mode:'dynamic',
      columns:[
        {id:'c1',key:'Basic Value',label:'Basic Value',width:80,minWidth:40,align:'right'},
        {id:'c2',key:'Total Discount',label:'Total Discount',width:80,minWidth:40,align:'right'},
        {id:'c3',key:'calc-discount',label:'Discount',width:80,minWidth:40,align:'right'},
        {id:'c4',key:'calc-taxable',label:'Taxable',width:80,minWidth:40,align:'right'},
      ],
      headerRows:[],
      bodyRows:[{id:'body',kind:'body',height:30,autoHeight:true,repeatOnEveryPage:false,keepTogether:true,cells:[
        {id:'b1',type:'text',content:'',binding:'Basic Value',valueMode:'binding',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'b2',type:'text',content:'',binding:'Total Discount',valueMode:'binding',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'b3',type:'text',content:'',formula:'[Basic Value] * [Total Discount]',valueMode:'formula',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'b4',type:'text',content:'',formula:'[Basic Value] - [Discount]',valueMode:'formula',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
      ]}],
      customRows:[{id:'summary',kind:'custom',height:30,autoHeight:true,repeatOnEveryPage:false,keepTogether:true,cells:[
        {id:'s1',type:'text',content:'',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'s2',type:'text',content:'',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'s3',type:'text',content:'',summaryMode:'aggregate',aggregate:{operation:'sum',field:'Discount'},summaryName:'Discount Total',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'s4',type:'text',content:'',summaryMode:'aggregate',aggregate:{operation:'sum',field:'Taxable Value'},summaryName:'Taxable Total',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
      ]}],
      rows:[],
      binding:{repeatSource:'items',parentKey:'Invoice No',parentKeys:['Invoice No']},
      pagination:{repeatHeader:true,allowRowSplit:false,keepRowsTogether:true},borderWidth:1,borderColor:'#000',defaultPadding:4,
    };
    const groupedTable: TableDefinition = {
      ...cleanTable,id:'grouped',name:'Grouped',columns:[
        {id:'g1',key:'__grouped_0',label:'HSN',width:80,minWidth:40,align:'left'},
        {id:'g2',key:'__grouped_1',label:'Taxable',width:80,minWidth:40,align:'right'},
        {id:'g3',key:'__grouped_2',label:'TOTAL',width:80,minWidth:40,align:'right'},
      ],
      bodyRows:[{id:'gb',kind:'body',height:30,autoHeight:true,repeatOnEveryPage:false,keepTogether:true,cells:[
        {id:'gb1',type:'text',content:'',binding:'__grouped_0',valueMode:'binding',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'left',verticalAlign:'middle',padding:4}},
        {id:'gb2',type:'text',content:'',binding:'__grouped_1',valueMode:'binding',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
        {id:'gb3',type:'text',content:'',binding:'__grouped_2',valueMode:'binding',rowSpan:1,colSpan:1,style:{background:'#fff',color:'#000',fontSize:10,bold:false,align:'right',verticalAlign:'middle',padding:4}},
      ]}],customRows:[],
      binding:{repeatSource:'items',grouping:{groupBy:['HSN'],columns:[
        {label:'HSN',field:'HSN',operation:'group',outputKey:'__grouped_0'},
        {label:'Taxable',field:'Taxable Value',operation:'sum',outputKey:'__grouped_1'},
        {label:'TOTAL',field:'',operation:'formula',formula:'[Taxable] + [Total GST]',outputKey:'__grouped_2'},
      ]}},
    };

    const result=buildCurrentDocumentJsonBody({
      templateId:'invoice',source:contractSource,record:contractSource.records[0],
      pages:[{elements:[
        {id:'invoice',type:'text',text:'{{Invoice No}} {{pageNumber}} / {{totalPages}}'},
        {id:'table',type:'table',table:cleanTable},
        {id:'grouped',type:'table',table:groupedTable},
        {id:'net',type:'formula',formulaName:'NET PAYABLE',formulaExpression:'SUM([Taxable Value]) + SUM([Total GST])'},
        {id:'words',type:'formula',formulaName:'WORDS',formulaExpression:'NUMBER_TO_WORDS([NET PAYABLE])'},
        {id:'show-words',type:'text',binding:'WORDS'},
      ]}],
    });

    expect(result.body).toMatchObject({invoiceNo:'INV-1'});
    expect(result.body.items).toEqual([{basicValue:1980,hsn:'73201020',totalDiscount:0.2,totalGst:285.12}]);
    expect(result.body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({discount:expect.anything()})]));
    expect(result.body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({taxableValue:expect.anything()})]));
    expect(result.requestJson).not.toContain('pageNumber');
    expect(result.requestJson).not.toContain('totalPages');
    expect(result.requestJson).not.toContain('__grouped_');
    expect(result.calculatedFieldsExcluded).toEqual(expect.arrayContaining(['Discount','Taxable','NET PAYABLE','WORDS','TOTAL']));
    expect(result.itemFields).toEqual(['Basic Value','HSN','Total Discount','Total GST']);
  });
});
