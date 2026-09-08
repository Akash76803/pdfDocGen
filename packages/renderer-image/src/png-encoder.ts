function table():Uint32Array{const out=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;out[n]=c>>>0;}return out;}
const CRC_TABLE=table();
function crc32(bytes:Uint8Array):number{let c=0xffffffff;for(const byte of bytes)c=CRC_TABLE[(c^byte)&255]!^(c>>>8);return(c^0xffffffff)>>>0;}
function u32(value:number):Uint8Array{return new Uint8Array([(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255]);}
function join(parts:Uint8Array[]):Uint8Array{const length=parts.reduce((sum,p)=>sum+p.length,0);const out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
function chunk(name:string,data:Uint8Array):Uint8Array{const type=new TextEncoder().encode(name);return join([u32(data.length),type,data,u32(crc32(join([type,data])))]);}
function adler32(bytes:Uint8Array):number{let a=1,b=0;for(const byte of bytes){a=(a+byte)%65521;b=(b+a)%65521;}return((b<<16)|a)>>>0;}
function deflateStored(bytes:Uint8Array):Uint8Array{const parts:Uint8Array[]=[new Uint8Array([0x78,0x01])];for(let offset=0;offset<bytes.length;){const length=Math.min(65535,bytes.length-offset);const final=offset+length>=bytes.length?1:0;parts.push(new Uint8Array([final,length&255,(length>>>8)&255,(~length)&255,((~length)>>>8)&255]),bytes.subarray(offset,offset+length));offset+=length;}parts.push(u32(adler32(bytes)));return join(parts);}
export function encodePngRgba(width:number,height:number,rgba:Uint8Array):Uint8Array{if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw new Error('Invalid RGBA page.');const scan=new Uint8Array(height*(1+width*4));for(let y=0;y<height;y++)scan.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(1+width*4)+1);const ihdr=join([u32(width),u32(height),new Uint8Array([8,6,0,0,0])]);return join([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateStored(scan)),chunk('IEND',new Uint8Array())]);}

export interface PngEncoder{encode(width:number,height:number,rgba:Uint8Array):Promise<Uint8Array>;}
export class DeterministicPngEncoder implements PngEncoder{async encode(width:number,height:number,rgba:Uint8Array):Promise<Uint8Array>{return encodePngRgba(width,height,rgba);}}
export class BrowserPngEncoder implements PngEncoder{
  async encode(width:number,height:number,rgba:Uint8Array):Promise<Uint8Array>{
    const canvas=document.createElement('canvas');
    canvas.width=width;
    canvas.height=height;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Canvas 2D is unavailable.');
    const image=context.createImageData(width,height);
    image.data.set(rgba);
    context.putImageData(image,0,0);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG encoding failed.')),'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
}
export function defaultPngEncoder():PngEncoder{
  // Always prefer BrowserPngEncoder if in a browser-like environment to get native compression
  return typeof document !== 'undefined' ? new BrowserPngEncoder() : new DeterministicPngEncoder();
}
