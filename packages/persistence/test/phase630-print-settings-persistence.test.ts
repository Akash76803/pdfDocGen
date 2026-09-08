import {describe,expect,it} from 'vitest';
import type {DesignTemplate} from '@document-tool/contracts';
import {createBlankArtboard,resolvePrintSettings} from '@document-tool/design-engine';
import {LocalStorageDesignTemplateRepository} from '../src/index.js';

class MemoryStorage implements Storage {
  private readonly values=new Map<string,string>();
  get length(){return this.values.size;}
  clear(){this.values.clear();}
  getItem(key:string){return this.values.get(key)??null;}
  key(index:number){return [...this.values.keys()][index]??null;}
  removeItem(key:string){this.values.delete(key);}
  setItem(key:string,value:string){this.values.set(key,String(value));}
}

const design=():DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'print-template',name:'Print Template',version:1,status:'DRAFT',sharedAssets:[],artboards:[{...createBlankArtboard({id:'front',name:'Front',order:0,widthMm:90,heightMm:50}),print:{...resolvePrintSettings(),bleed:{topMm:2,rightMm:3,bottomMm:4,leftMm:5},safeArea:{topMm:6,rightMm:7,bottomMm:8,leftMm:9},minimumRasterDpi:175,preferredRasterDpi:350,cropMarksEnabledForExport:true,showBleedInEditor:true,showSafeAreaInEditor:false,showCropMarksInEditor:true}}]});

describe('Phase 6.3 print settings persistence',()=>{
  it('round-trips print and intentional editor preferences',async()=>{const repository=new LocalStorageDesignTemplateRepository(new MemoryStorage()),source=design();await repository.save(source);const loaded=await repository.getById(source.id);expect(loaded?.artboards[0]?.print).toEqual(source.artboards[0]!.print);});
  it('loads legacy settings without destructive migration',async()=>{const repository=new LocalStorageDesignTemplateRepository(new MemoryStorage()),source=design();delete source.artboards[0]!.print.minimumRasterDpi;delete source.artboards[0]!.print.preferredRasterDpi;delete source.artboards[0]!.print.cropMarksEnabledForExport;delete source.artboards[0]!.print.showBleedInEditor;const snapshot=JSON.stringify(source);await repository.save(source);const loaded=await repository.getById(source.id);expect(JSON.stringify(loaded)).toBe(snapshot);expect(resolvePrintSettings(loaded?.artboards[0]?.print).minimumRasterDpi).toBe(150);expect(resolvePrintSettings(loaded?.artboards[0]?.print).preferredRasterDpi).toBe(300);});
});
