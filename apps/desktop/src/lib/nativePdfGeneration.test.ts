import { describe, expect, it } from 'vitest';
import { analyzeNativePdfCompatibility, renderNativeSinglePdf } from './nativePdfGeneration.ts';

const pageSettings = {
  preset:'A4', orientation:'Portrait', unit:'mm', customWidthMm:210, customHeightMm:297,
  marginsMm:{top:15,right:15,bottom:15,left:15}, bleedMm:{top:0,right:0,bottom:0,left:0}, safeAreaMm:5,
  background:'#ffffff', borderColor:'#d2d8e0', borderWidth:0, borderAlignment:'inside', borderOffsetMm:0, showGuides:false,
  header:{enabled:false,heightMm:20,gapMm:5,repeat:'every'}, footer:{enabled:false,heightMm:15,gapMm:5,repeat:'every'},
};

function element(id:string,type:string,extra:Record<string,unknown>={}) {
  return { id,type,x:0,y:0,width:180,height:30,text:'',fontSize:11,fontFamily:'Arial',fontWeight:400,textAlign:'left',fill:'transparent',color:'#111827',region:'body',layoutMode:'flow',...extra };
}

const source:any = {
  id:'src-1',name:'Invoices',sourceType:'json',fields:[],warnings:[],importedAt:'2026-09-14T00:00:00Z',
  records:[{InvoiceNo:'INV-001',Amount:1234.5}],
};

describe('DB-5G native renderer coverage', () => {
  it('keeps QR, barcode, multi-page builder pages and amount-in-words in Native compatibility', () => {
    const saved={name:'DB5G',pages:[
      {id:'p1',name:'One',settings:pageSettings,elements:[
        element('formula','formula',{formulaName:'AmountWords',formulaExpression:'NUMBER_TO_WORDS([Amount])'}),
        element('qr','qr',{text:'{{InvoiceNo}}'}),
        element('barcode','barcode',{text:'{{InvoiceNo}}'}),
      ]},
      {id:'p2',name:'Two',settings:{...pageSettings,header:{...pageSettings.header,enabled:true,repeat:'exceptFirst'}},elements:[element('t','text',{text:'Second page {{InvoiceNo}}'})]},
    ]};
    const result=analyzeNativePdfCompatibility(JSON.stringify(saved),source);
    expect(result.supported).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('renders QR/barcode and a precomputed NUMBER_TO_WORDS formula without the Exact DOM path', async () => {
    const saved={name:'NativeMedia',pages:[{id:'p1',name:'One',settings:pageSettings,elements:[
      element('formula','formula',{formulaName:'AmountWords',formulaExpression:'NUMBER_TO_WORDS([Amount])'}),
      element('words','text',{binding:'AmountWords',y:10}),
      element('qr','qr',{text:'{{InvoiceNo}}',y:40,width:80,height:80}),
      element('barcode','barcode',{text:'{{InvoiceNo}}',y:130,width:180,height:50}),
    ]}]};
    const result=await renderNativeSinglePdf({savedTemplateRaw:JSON.stringify(saved),source,recordIndex:0,fileName:'db5g-smoke'});
    const pdf=new TextDecoder('latin1').decode(result.bytes);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Page');
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    // Vector QR/barcode modules are emitted as PDF rectangle fills, not full-page raster captures.
    expect((pdf.match(/ re f/g)||[]).length).toBeGreaterThan(10);
  });
});
