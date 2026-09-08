import { describe, expect, it } from 'vitest';
import { LocalStorageUserAssetLibraryRepository, type UserAssetLibraryItem } from '../src/asset-library-repository.js';

class MemoryStorage {
  private values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
}

describe('TEXT6B-FONT2 custom font library persistence',()=>{
  it('persists font assets without treating them as image assets',async()=>{
    const storage=new MemoryStorage();
    const repo=new LocalStorageUserAssetLibraryRepository(storage as any,'font-test');
    const now='2026-09-05T00:00:00.000Z';
    const font:UserAssetLibraryItem={
      id:'font-1',name:'Wedding Script',kind:'OTHER',sourceType:'DATA_URL',source:'data:font/woff2;base64,AA==',mimeType:'font/woff2',
      metadata:{userLibrary:true,createdAt:now,updatedAt:now,userUploaded:true,fontAsset:true,fontFamily:'Wedding Script',fontFormat:'WOFF2',originalFileName:'WeddingScript-Regular.woff2',category:'FONT'}
    };
    await repo.save(font);
    const list=await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('OTHER');
    expect(list[0]?.metadata.fontAsset).toBe(true);
    expect(list[0]?.metadata.fontFamily).toBe('Wedding Script');
  });
});
