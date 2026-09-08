import { FileNamingService } from './export-framework.js';

export interface FileDeliveryRequest { suggestedFileName:string; mimeType:string; bytes:Uint8Array; }
export interface FileDeliveryResult { status:'SAVED'|'CANCELLED'|'FAILED'; path?:string; bytesWritten?:number; error?:string; }
export interface MultiFileDeliveryRequest { files:FileDeliveryRequest[]; }
export interface MultiFileDeliveryResult { status:'SAVED'|'CANCELLED'|'FAILED'; files:FileDeliveryResult[]; error?:string; }
export interface PlatformFileAdapter {
  deliver(request:FileDeliveryRequest):Promise<FileDeliveryResult>;
  deliverMany(request:MultiFileDeliveryRequest):Promise<MultiFileDeliveryResult>;
}

export class FileDeliveryService {
  private readonly naming=new FileNamingService();
  constructor(private readonly adapter:PlatformFileAdapter){}
  deliver(request:FileDeliveryRequest){return this.adapter.deliver(this.safe(request));}
  deliverMany(request:MultiFileDeliveryRequest){return this.adapter.deliverMany({files:request.files.map(file=>this.safe(file))});}
  private safe(request:FileDeliveryRequest):FileDeliveryRequest {
    if(!request.bytes.byteLength)throw new Error('Cannot save an empty export file.');
    return {...request,suggestedFileName:this.naming.sanitize(request.suggestedFileName)};
  }
}

export class BrowserDownloadAdapter implements PlatformFileAdapter {
  async deliver(request:FileDeliveryRequest):Promise<FileDeliveryResult>{
    const url=URL.createObjectURL(new Blob([new Uint8Array(request.bytes).buffer],{type:request.mimeType}));
    try{const anchor=document.createElement('a');anchor.href=url;anchor.download=request.suggestedFileName;anchor.style.display='none';document.body.appendChild(anchor);anchor.click();anchor.remove();return{status:'SAVED',bytesWritten:request.bytes.byteLength};}
    catch(error){return{status:'FAILED',error:error instanceof Error?error.message:'Browser download failed.'};}
    finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  async deliverMany(request:MultiFileDeliveryRequest):Promise<MultiFileDeliveryResult>{
    const files:FileDeliveryResult[]=[];for(const file of request.files){const result=await this.deliver(file);files.push(result);if(result.status!=='SAVED')return{status:result.status,files,error:result.error};}return{status:'SAVED',files};
  }
}
