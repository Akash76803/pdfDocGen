import { describe, expect, it } from 'vitest';
import { FileDeliveryService, type FileDeliveryRequest, type PlatformFileAdapter } from '../src/file-delivery.js';

function harness(result:'SAVED'|'CANCELLED'|'FAILED'='SAVED'){
  const requests:FileDeliveryRequest[]=[];const adapter:PlatformFileAdapter={
    async deliver(request){requests.push(request);return result==='SAVED'?{status:'SAVED' as const,bytesWritten:request.bytes.byteLength}:{status:result,error:result==='FAILED'?'permission denied':undefined};},
    async deliverMany(){throw new Error('PDF delivery must be a single file');}
  };return{requests,service:new FileDeliveryService(adapter)};
}

describe('Phase 5.0 PDF delivery',()=>{
  it('forwards Engine PDF bytes, filename and MIME unchanged',async()=>{const h=harness();const bytes=new Uint8Array([0x25,0x50,0x44,0x46]);const result=await h.service.deliver({suggestedFileName:'invoice.pdf',mimeType:'application/pdf',bytes});expect(result.status).toBe('SAVED');expect(h.requests[0]).toMatchObject({suggestedFileName:'invoice.pdf',mimeType:'application/pdf',bytes});});
  it('delivers one Combined PDF once',async()=>{const h=harness();await h.service.deliver({suggestedFileName:'Combined.pdf',mimeType:'application/pdf',bytes:new Uint8Array([1,2,3])});expect(h.requests).toHaveLength(1);});
  it.each(['CANCELLED','FAILED'] as const)('surfaces %s without success',async status=>{const h=harness(status);expect((await h.service.deliver({suggestedFileName:'x.pdf',mimeType:'application/pdf',bytes:new Uint8Array([1])})).status).toBe(status);});
  it('rejects an empty PDF before delivery',()=>{const h=harness();expect(()=>h.service.deliver({suggestedFileName:'x.pdf',mimeType:'application/pdf',bytes:new Uint8Array()})).toThrow('empty');expect(h.requests).toHaveLength(0);});
});
