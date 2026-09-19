import { describe, expect, it } from 'vitest';
import { adaptDesktopTemplateEntry } from './desktop-template-adapter.js';

const basePage=(watermarkText:string)=>({
  id:'page-1',
  name:'Page 1',
  settings:{
    preset:'A4',orientation:'Portrait',customWidthMm:210,customHeightMm:297,
    marginsMm:{top:15,right:15,bottom:15,left:15},
    background:'#ffffff',borderColor:'#d2d8e0',borderWidth:0,borderOffsetMm:0,
    header:{enabled:false},footer:{enabled:false},
    watermark:{enabled:true,type:'text',text:watermarkText,opacity:20,rotation:-45,fontSize:56,color:'#64748B',position:'center',scale:60,customXPercent:50,customYPercent:50,applyTo:'all',layer:'behind'},
  },
  elements:[],
});

describe('UX-7 Fix1 global watermark adapter',()=>{
  it('prefers the template-level watermark over legacy page-level values',()=>{
    const template=adaptDesktopTemplateEntry({
      id:'global-wm',
      name:'Global Watermark',
      version:1,
      payload:{
        watermark:{enabled:true,type:'text',text:'GLOBAL',opacity:35,rotation:15,fontSize:72,color:'#123456',position:'top-right',scale:70,customXPercent:50,customYPercent:50,applyTo:'first',layer:'above'},
        pages:[basePage('LEGACY-PAGE')],
      },
    });
    expect(template.page.watermark).toMatchObject({
      enabled:true,type:'TEXT',text:'GLOBAL',opacity:.35,rotation:15,color:'#123456',position:'TOP_RIGHT',applyTo:'FIRST_PAGE',layer:'ABOVE',
    });
  });

  it('migrates the first page watermark when no explicit global value exists',()=>{
    const template=adaptDesktopTemplateEntry({
      id:'legacy-wm',
      name:'Legacy Watermark',
      version:1,
      payload:{pages:[basePage('LEGACY-PAGE')]},
    });
    expect(template.page.watermark).toMatchObject({
      enabled:true,type:'TEXT',text:'LEGACY-PAGE',applyTo:'ALL',layer:'BEHIND',
    });
  });
});
