import { describe, expect, it } from 'vitest';
import type { TemplateDefinition } from '@document-tool/contracts';
import {
  contentTypeForFormat,
  ExactDocxUnavailableError,
  ExactRenderUnavailableError,
  HeadlessDocumentGenerationService,
  TemplateNotFoundError,
  type TemplateRepository,
  UnconfiguredDocumentGenerationService,
} from '../src/index.ts';

const template: TemplateDefinition = {
  id:'invoice-v1', name:'Invoice', version:1,
  page:{size:'A4',orientation:'PORTRAIT',margins:{top:10,right:10,bottom:10,left:10}},
  header:{blocks:[{id:'h',type:'TEXT',text:'INVOICE'}]},
  body:{blocks:[
    {id:'f',type:'FIELD',label:'No',path:'invoiceNo'},
    {id:'c',type:'FIELD',label:'Customer',path:'customer.name'},
    {id:'tb',type:'TABLE',sourcePath:'items',columns:[{id:'p',label:'Product',path:'product'},{id:'q',label:'Qty',path:'qty'}]},
  ]},
  footer:{blocks:[{id:'ft',type:'TEXT',text:'Thanks'}]},
};

class MemoryRepository implements TemplateRepository {
  async getTemplate(id:string, version?:number) { return id === template.id && (version === undefined || version === template.version) ? template : null; }
}

const data={invoiceNo:'INV-001',customer:{name:'ABC'},items:[{product:'Widget',qty:2}]};

describe('generation core contract', () => {
  it('maps supported formats to content types', () => {
    expect(contentTypeForFormat('pdf')).toBe('application/pdf');
    expect(contentTypeForFormat('docx-editable')).toContain('wordprocessingml.document');
  });
  it('fails explicitly when no runtime adapter is configured', async () => {
    await expect(new UnconfiguredDocumentGenerationService().generate({ templateId:'x', output:{format:'pdf'}, data:{} })).rejects.toMatchObject({ code:'GENERATION_SERVICE_UNAVAILABLE' });
  });
  it('renders a real headless PDF from raw API data', async () => {
    const service=new HeadlessDocumentGenerationService(new MemoryRepository());
    const result=await service.generate({templateId:'invoice-v1',output:{format:'pdf',fileName:'INV-001'},data});
    expect(result.contentType).toBe('application/pdf');
    expect(result.fileName).toBe('INV-001.pdf');
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(new TextDecoder().decode(result.bytes.slice(0,8))).toContain('%PDF-');
  });
  it('renders a real editable DOCX from the same raw API data', async () => {
    const service=new HeadlessDocumentGenerationService(new MemoryRepository());
    const result=await service.generate({templateId:'invoice-v1',output:{format:'docx-editable',fileName:'INV-001'},data});
    expect(result.contentType).toContain('wordprocessingml.document');
    expect(result.fileName).toBe('INV-001.docx');
    expect(result.pageCount).toBe(1);
    expect(Array.from(result.bytes.slice(0,4))).toEqual([0x50,0x4b,0x03,0x04]);
    const raw=new TextDecoder().decode(result.bytes);
    expect(raw).toContain('INV-001');
    expect(raw).toContain('Widget');
  });
  it('returns a typed missing-template error', async () => {
    const service=new HeadlessDocumentGenerationService(new MemoryRepository());
    await expect(service.generate({templateId:'missing',output:{format:'pdf'},data:{}})).rejects.toBeInstanceOf(TemplateNotFoundError);
  });
  it('rejects exact PDF mode instead of silently downgrading fidelity', async () => {
    const service=new HeadlessDocumentGenerationService(new MemoryRepository());
    await expect(service.generate({templateId:'invoice-v1',output:{format:'pdf',renderMode:'exact'},data:{}})).rejects.toBeInstanceOf(ExactRenderUnavailableError);
  });
  it('rejects DOCX Exact instead of silently returning editable DOCX', async () => {
    const service=new HeadlessDocumentGenerationService(new MemoryRepository());
    await expect(service.generate({templateId:'invoice-v1',output:{format:'docx-exact'},data:{}})).rejects.toBeInstanceOf(ExactDocxUnavailableError);
  });
});

it('evaluates desktop formula fields before rendering', async () => {
  const formulaTemplate: TemplateDefinition = {
    id:'formula-template',name:'Formula Template',version:1,
    page:{size:'A4',orientation:'PORTRAIT',margins:{top:0,right:0,bottom:0,left:0}},
    header:{blocks:[]},footer:{blocks:[]},
    body:{blocks:[{id:'grand',type:'FIELD',path:'calc.grandTotal',layout:{positionMode:'ABSOLUTE',xMm:25.4,yMm:25.4,widthMm:50,heightMm:10,pageIndex:0}}]},
    metadata:{desktopAbsoluteLayout:true,builderPageCount:1,desktopFormulaFields:[{id:'f1',name:'Grand Total',alias:'grandTotal',expression:'[Final Amount] + 100'}]},
  };
  const service=new HeadlessDocumentGenerationService({async getTemplate(){return formulaTemplate;}});
  const result=await service.generate({templateId:'formula-template',output:{format:'pdf'},data:{finalAmount:1869.12}});
  const raw=new TextDecoder().decode(result.bytes);
  expect(raw).toContain('(1969.12)');
});

it('materializes desktop table formulas before grouped summaries', async () => {
  const parityTemplate: TemplateDefinition = {
    id:'parity-template',name:'Parity Template',version:1,
    page:{size:'A4',orientation:'PORTRAIT',margins:{top:0,right:0,bottom:0,left:0}},
    header:{blocks:[]},footer:{blocks:[]},
    body:{blocks:[{
      id:'items-table',type:'TABLE',sourcePath:'items',
      columns:[
        {id:'basic',label:'Basic Value',path:'basicValue'},
        {id:'rate',label:'Total Discount',path:'totalDiscount'},
        {id:'discount',label:'Discount',path:'discount',kind:'FORMULA',formulaExpression:'{{b0}} * {{b1}}',formulaBindings:[
          {id:'b0',label:'Basic Value',path:'basicValue',sourceField:'basicValue',targetPath:'basicValue',sourcePath:'items'},
          {id:'b1',label:'Total Discount',path:'totalDiscount',sourceField:'totalDiscount',targetPath:'totalDiscount',sourcePath:'items'},
        ]},
        {id:'taxable',label:'Taxable',path:'taxable',kind:'FORMULA',formulaExpression:'{{b0}} - {{b1}}',formulaBindings:[
          {id:'b0',label:'Basic Value',path:'basicValue',sourceField:'basicValue',targetPath:'basicValue',sourcePath:'items'},
          {id:'b1',label:'Discount',path:'discount',sourceField:'discount',targetPath:'discount',sourcePath:'items'},
        ]},
      ],
    } as any]},
    metadata:{desktopGroupedTables:[{
      tableId:'hsn-summary',sourcePath:'__db5g_group_hsn',groupBy:['hsn'],columns:[
        {field:'hsn',operation:'group',outputKey:'__grouped_0',label:'HSN'},
        {field:'taxable',operation:'sum',outputKey:'__grouped_1',label:'Taxable'},
        {field:'gstPercent',operation:'avg',outputKey:'__grouped_2',label:'GST %'},
        {field:'totalGST',operation:'sum',outputKey:'__grouped_3',label:'Total GST'},
        {operation:'formula',outputKey:'__grouped_7',label:'TOTAL',formula:'[Total GST] + [Taxable]'},
      ],
    }]},
  };
  const { applyDesktopResolvedDocumentParity } = await import('../src/index.ts');
  const group = applyDesktopResolvedDocumentParity(parityTemplate, {
    id:'d',key:'d',header:{},items:[
      {basicValue:1980,totalDiscount:0.2,hsn:'73201020',gstPercent:0.18,totalGST:285.12},
      {basicValue:2170,totalDiscount:0.2,hsn:'73201020',gstPercent:0.18,totalGST:312.48},
    ],sourceItems:[],itemDetails:[],sourceRowIndexes:[0,1],warnings:[],valid:true,
  });
  expect(group.items[0]).toMatchObject({discount:396,taxable:1584});
  expect(group.items[1]).toMatchObject({discount:434,taxable:1736});
  expect(group.header.__db5g_group_hsn).toEqual([expect.objectContaining({
    __grouped_0:'73201020',__grouped_1:3320,__grouped_2:0.18,__grouped_3:597.6,__grouped_7:3917.6,
  })]);
});

it('derives omitted Total GST and Final Amount before grouped/document formulas', async () => {
  const parityTemplate: TemplateDefinition = {
    id:'tax-parity-template',name:'Tax Parity Template',version:1,
    page:{size:'A4',orientation:'PORTRAIT',margins:{top:0,right:0,bottom:0,left:0}},
    header:{blocks:[]},footer:{blocks:[]},
    body:{blocks:[{
      id:'items-table',type:'TABLE',sourcePath:'items',
      columns:[
        {id:'basic',label:'Basic Value',path:'basicValue'},
        {id:'rate',label:'Total Discount',path:'totalDiscount'},
        {id:'discount',label:'Discount',path:'discount',kind:'FORMULA',formulaExpression:'{{b0}} * {{b1}}',formulaBindings:[
          {id:'b0',label:'Basic Value',path:'basicValue',sourceField:'basicValue',targetPath:'basicValue',sourcePath:'items'},
          {id:'b1',label:'Total Discount',path:'totalDiscount',sourceField:'totalDiscount',targetPath:'totalDiscount',sourcePath:'items'},
        ]},
        {id:'taxable',label:'Taxable',path:'taxableValue',kind:'FORMULA',formulaExpression:'{{b0}} - {{b1}}',formulaBindings:[
          {id:'b0',label:'Basic Value',path:'basicValue',sourceField:'basicValue',targetPath:'basicValue',sourcePath:'items'},
          {id:'b1',label:'Discount',path:'discount',sourceField:'discount',targetPath:'discount',sourcePath:'items'},
        ]},
      ],
    } as any]},
    metadata:{
      desktopFormulaFields:[
        {id:'gst',name:'TOTAL GST',alias:'totalGst',expression:'SUM([Total GST])'},
        {id:'payable',name:'NET PAYABLE AMOUNT',alias:'netPayableAmount',expression:'SUM([Final Amount])'},
        {id:'words',name:'FINAL AMOUNT IN WORD',alias:'finalAmountInWord',expression:'NUMBER_TO_WORDS([NET PAYABLE AMOUNT])'},
      ],
      desktopGroupedTables:[{
        tableId:'hsn-summary',sourcePath:'__db5g_group_hsn',groupBy:['HSN'],columns:[
          {field:'HSN',operation:'group',outputKey:'__grouped_0',label:'HSN'},
          {field:'Taxable Value',operation:'sum',outputKey:'__grouped_1',label:'Taxable'},
          {field:'GST %',operation:'avg',outputKey:'__grouped_2',label:'GST %'},
          {field:'Total GST',operation:'sum',outputKey:'__grouped_3',label:'Total GST'},
          {field:'CGST Amount',operation:'sum',outputKey:'__grouped_4',label:'CGST Amount'},
          {field:'SGST Amount',operation:'sum',outputKey:'__grouped_5',label:'SGST Amount'},
          {field:'IGST Amount',operation:'sum',outputKey:'__grouped_6',label:'IGST Amount'},
          {operation:'formula',outputKey:'__grouped_7',label:'TOTAL',formula:'[Total GST] + [Taxable]'},
        ],
      }],
    },
  };
  const { applyDesktopResolvedDocumentParity } = await import('../src/index.ts');
  const { applyDesktopFormulaFields } = await import('../src/desktop-formulas.ts');
  const input = {
    id:'d',key:'d',header:{},items:[
      {basicValue:1980,totalDiscount:0.2,HSN:'73201020',gstPercent:0.18,cgstAmount:142.56,sgstAmount:142.56,igstAmount:0},
      {basicValue:2170,totalDiscount:0.2,HSN:'73201020',gstPercent:0.18,cgstAmount:156.24,sgstAmount:156.24,igstAmount:0},
      {basicValue:5620,totalDiscount:0.2,HSN:'73201020',gstPercent:0.18,cgstAmount:404.64,sgstAmount:404.64,igstAmount:0},
    ],sourceItems:[],itemDetails:[],sourceRowIndexes:[0,1,2],warnings:[],valid:true,
  } as any;
  const parity = applyDesktopResolvedDocumentParity(parityTemplate, input);
  expect(parity.items[0]).toMatchObject({discount:396,taxableValue:1584,totalGst:285.12,finalAmount:1869.12});
  expect(parity.items[1]).toMatchObject({discount:434,taxableValue:1736,totalGst:312.48,finalAmount:2048.48});
  expect(parity.items[2]).toMatchObject({discount:1124,taxableValue:4496,totalGst:809.28,finalAmount:5305.28});
  expect(parity.header.__db5g_group_hsn).toEqual([expect.objectContaining({
    __grouped_1:7816,__grouped_3:1406.88,__grouped_4:703.44,__grouped_5:703.44,__grouped_6:0,
  })]);
  expect((parity.header.__db5g_group_hsn as any)[0].__grouped_2).toBeCloseTo(0.18, 4);
  expect((parity.header.__db5g_group_hsn as any)[0].__grouped_7).toBeCloseTo(9222.88, 2);
  const resolved = applyDesktopFormulaFields(parityTemplate, parity);
  expect(resolved.header.calc).toMatchObject({totalGst:1406.88,netPayableAmount:9222.88});
  expect(String((resolved.header.calc as any).finalAmountInWord)).toContain('Nine Thousand Two Hundred Twenty-Two Rupees');
});
