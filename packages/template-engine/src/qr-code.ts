import QRCode from './qr-vendor/index.js';
import QRErrorCorrectLevel from './qr-vendor/QRErrorCorrectLevel.js';

export type QrErrorCorrection = 'L'|'M'|'Q'|'H';

export function createQrSvgDataUrl(value:string, level:QrErrorCorrection='M', margin=4):string {
  const text=String(value ?? '');
  if(!text) return '';
  const QR:any=QRCode; const qr=new QR(-1,(QRErrorCorrectLevel as Record<QrErrorCorrection,number>)[level] ?? QRErrorCorrectLevel.M);
  qr.addData(text); qr.make();
  const count=qr.getModuleCount();
  const size=count+margin*2;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,`<rect width="100%" height="100%" fill="#fff"/>`];
  for(let r=0;r<count;r++) for(let c=0;c<count;c++) if(qr.isDark(r,c)) parts.push(`<rect x="${c+margin}" y="${r+margin}" width="1" height="1" fill="#000"/>`);
  parts.push('</svg>');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(parts.join(''))}`;
}
