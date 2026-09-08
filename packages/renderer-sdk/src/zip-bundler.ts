import type { ExportedFile } from './export-framework.js';

export interface ZipBundleOptions { fileName?:string; }

/**
 * Renderer-independent ZIP bundler. Exported images/PDFs are already compressed,
 * so STORE entries avoid wasteful recompression while producing a standard,
 * deterministic ZIP archive with UTF-8 filenames and CRC validation.
 */
export class ZipBundler {
  bundle(files:readonly ExportedFile[],options:ZipBundleOptions={}):ExportedFile {
    if(!files.length)throw new Error('Cannot create an empty ZIP bundle.');
    const encoder=new TextEncoder();const locals:Uint8Array[]=[];const centrals:Uint8Array[]=[];let offset=0;
    for(const file of files){const safeName=safeEntryName(file.fileName);const name=encoder.encode(safeName);const crc=crc32(file.bytes);const local=concat([u32le(0x04034b50),u16le(20),u16le(0x0800),u16le(0),u16le(0),u16le(0x21),u32le(crc),u32le(file.bytes.length),u32le(file.bytes.length),u16le(name.length),u16le(0),name,file.bytes]);locals.push(local);
      centrals.push(concat([u32le(0x02014b50),u16le(20),u16le(20),u16le(0x0800),u16le(0),u16le(0),u16le(0x21),u32le(crc),u32le(file.bytes.length),u32le(file.bytes.length),u16le(name.length),u16le(0),u16le(0),u16le(0),u16le(0),u32le(0),u32le(offset),name]));offset+=local.length;
    }
    const central=concat(centrals);const end=concat([u32le(0x06054b50),u16le(0),u16le(0),u16le(files.length),u16le(files.length),u32le(central.length),u32le(offset),u16le(0)]);const requested=options.fileName?.trim()||'Documents.zip';const leaf=requested.replace(/\\/g,'/').split('/').pop()||'Documents.zip';const withExtension=leaf.toLowerCase().endsWith('.zip')?leaf:`${leaf}.zip`;const fileName=withExtension.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/\.{2,}/g,'_');return{fileName:fileName||'Documents.zip',mimeType:'application/zip',bytes:concat([...locals,central,end])};
  }
}

function safeEntryName(value:string):string{const leaf=value.replace(/\\/g,'/').split('/').pop()||'file';return leaf.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/\.{2,}/g,'_').replace(/[. ]+$/g,'')||'file';}
function u16le(value:number):Uint8Array{return new Uint8Array([value&255,(value>>>8)&255]);}
function u32le(value:number):Uint8Array{return new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);}
function concat(parts:readonly Uint8Array[]):Uint8Array{const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;table[index]=value>>>0;}return table;})();
function crc32(bytes:Uint8Array):number{let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&255]!^(value>>>8);return(value^0xffffffff)>>>0;}
