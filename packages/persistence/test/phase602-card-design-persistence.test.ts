import {describe,expect,it} from 'vitest';
import type {DesignTemplate} from '@document-tool/contracts';
import {createBlankArtboard} from '@document-tool/design-engine';
import {LocalStorageDesignTemplateRepository,type StringStorage} from '../src/index.js';
class MemoryStorage implements StringStorage{private data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
const design=():DesignTemplate=>({kind:'CARD_DESIGN',schemaVersion:1,id:'design-1',name:'Front / Back',version:1,status:'DRAFT',sharedAssets:[],artboards:[createBlankArtboard({id:'front',name:'Front',order:0,widthMm:90,heightMm:50}),createBlankArtboard({id:'back',name:'Back',order:1,widthMm:85.6,heightMm:53.98,displayUnit:'IN'})]});
describe('Phase 6.0.2 card design persistence',()=>{
it('saves and reopens multi-artboard design through shared versioned persistence',async()=>{const storage=new MemoryStorage();const first=new LocalStorageDesignTemplateRepository(storage);await first.save(design());const second=new LocalStorageDesignTemplateRepository(storage);expect(await second.getById('design-1')).toEqual(design());expect(await second.getActiveId()).toBe('design-1');});
it('serializes rapid card saves so last edit wins',async()=>{const repo=new LocalStorageDesignTemplateRepository(new MemoryStorage());const base=design();await Promise.all([repo.save({...base,name:'A'}),repo.save({...base,name:'B'}),repo.save({...base,name:'C'})]);expect((await repo.list())[0]?.name).toBe('C');});
});
