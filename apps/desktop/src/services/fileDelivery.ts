import { open, save } from '@tauri-apps/api/dialog';
import { exists, readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import { BrowserDownloadAdapter, FileDeliveryService, type ExportedFile, type FileDeliveryRequest, type FileDeliveryResult, type MultiFileDeliveryRequest, type MultiFileDeliveryResult, type PlatformFileAdapter } from '@document-tool/renderer-sdk';

const isTauriRuntime=()=>typeof window!=='undefined'&&'__TAURI__' in window;
const extension=(name:string)=>name.includes('.')?name.split('.').pop()!.toLowerCase():'';

export class DesktopNativeFileAdapter implements PlatformFileAdapter {
  async deliver(request:FileDeliveryRequest):Promise<FileDeliveryResult>{
    try{const path=await save({title:'Save exported document',defaultPath:request.suggestedFileName,filters:[{name:'Exported document',extensions:[extension(request.suggestedFileName)]}]});if(!path)return{status:'CANCELLED'};return await this.writeAndVerify(path,request.bytes);}
    catch(error){return{status:'FAILED',error:message(error)};}
  }
  async deliverMany(request:MultiFileDeliveryRequest):Promise<MultiFileDeliveryResult>{
    try{const folder=await open({title:'Choose export folder',directory:true,multiple:false});if(!folder||Array.isArray(folder))return{status:'CANCELLED',files:[]};const files:FileDeliveryResult[]=[];for(const file of request.files){const result=await this.writeAndVerify(await join(folder,file.suggestedFileName),file.bytes);files.push(result);if(result.status==='FAILED')return{status:'FAILED',files,error:result.error};}return{status:'SAVED',files};}
    catch(error){return{status:'FAILED',files:[],error:message(error)};}
  }
  private async writeAndVerify(path:string,bytes:Uint8Array):Promise<FileDeliveryResult>{
    await writeBinaryFile(path,bytes);if(!(await exists(path)))return{status:'FAILED',path,error:'Saved file could not be verified.'};const written=await readBinaryFile(path);if(written.byteLength!==bytes.byteLength)return{status:'FAILED',path,bytesWritten:written.byteLength,error:`Expected ${bytes.byteLength} bytes but verified ${written.byteLength}.`};return{status:'SAVED',path,bytesWritten:written.byteLength};
  }
}

export function createFileDeliveryService(){return new FileDeliveryService(isTauriRuntime()?new DesktopNativeFileAdapter():new BrowserDownloadAdapter());}
export async function deliverExportedFiles(files:ExportedFile[]){
  const delivery=createFileDeliveryService();
  const requests=files.map(file=>({suggestedFileName:file.fileName,mimeType:file.mimeType,bytes:file.bytes}));
  return requests.length===1?delivery.deliver(requests[0]!):delivery.deliverMany({files:requests});
}
function message(error:unknown){return error instanceof Error?error.message:String(error||'Native file operation failed.');}
