import { describe, expect, it } from 'vitest';
import { FileDeliveryService, type PlatformFileAdapter } from '../src/file-delivery.js';

describe('Phase 5.0 native-neutral file delivery contract',()=>{
  it('sanitizes traversal and delegates non-empty bytes',async()=>{
    let captured='';const adapter:PlatformFileAdapter={
      async deliver(request){captured=request.suggestedFileName;return{status:'SAVED',bytesWritten:request.bytes.byteLength};},
      async deliverMany(){return{status:'SAVED',files:[]};}
    };
    const result=await new FileDeliveryService(adapter).deliver({suggestedFileName:'../bad:name?.png',mimeType:'image/png',bytes:new Uint8Array([1,2])});
    expect(result).toEqual({status:'SAVED',bytesWritten:2});expect(captured).toBe('bad_name_.png');
  });
  it('rejects empty output before opening a platform dialog',async()=>{
    const adapter:PlatformFileAdapter={async deliver(){throw new Error('must not run');},async deliverMany(){throw new Error('must not run');}};
    expect(()=>new FileDeliveryService(adapter).deliver({suggestedFileName:'x.pdf',mimeType:'application/pdf',bytes:new Uint8Array()})).toThrow('empty');
  });
  it('preserves cancellation and failed delivery states',async()=>{
    const adapter:PlatformFileAdapter={async deliver(){return{status:'CANCELLED'};},async deliverMany(){return{status:'FAILED',files:[],error:'permission denied'};}};
    const service=new FileDeliveryService(adapter);expect((await service.deliver({suggestedFileName:'x.pdf',mimeType:'application/pdf',bytes:new Uint8Array([1])})).status).toBe('CANCELLED');
    expect((await service.deliverMany({files:[{suggestedFileName:'x.png',mimeType:'image/png',bytes:new Uint8Array([1])}]})).status).toBe('FAILED');
  });
});
