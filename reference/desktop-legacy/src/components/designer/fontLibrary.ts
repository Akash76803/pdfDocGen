export const DESIGN_FONT_GROUPS = [
  { label:'Adobe / Creative Suite', fonts:['Myriad Pro','Minion Pro','Acumin Pro','Source Sans 3','Source Serif 4','Source Code Pro','Adobe Garamond Pro','Trajan Pro 3'] },
  { label:'Modern Sans', fonts:['Arial','Helvetica','Helvetica Neue','Inter','Roboto','Montserrat','Poppins','Lato','Open Sans','Nunito','Avenir Next','Century Gothic','Futura','Gill Sans','Franklin Gothic Medium'] },
  { label:'Serif / Editorial', fonts:['Georgia','Times New Roman','Baskerville','Garamond','Palatino Linotype','Book Antiqua','Didot','Bodoni 72','Playfair Display','Merriweather','Libre Baskerville'] },
  { label:'Display / Poster', fonts:['Impact','Arial Black','Bebas Neue','Oswald','Anton','Rockwell','Copperplate','Cooper Black','Haettenschweiler','Algerian'] },
  { label:'Condensed', fonts:['Roboto Condensed','Arial Narrow','DIN Condensed','Avenir Next Condensed','Franklin Gothic Condensed','Barlow Condensed','PT Sans Narrow'] },
  { label:'Script / Handwritten', fonts:['Brush Script MT','Segoe Script','Lucida Handwriting','Dancing Script','Pacifico','Great Vibes','Lobster','Sacramento'] },
  { label:'Monospace', fonts:['Courier New','Consolas','Menlo','Monaco','Roboto Mono','JetBrains Mono','Source Code Pro','Lucida Console'] },
  { label:'UI / System', fonts:['Verdana','Trebuchet MS','Tahoma','Segoe UI','Calibri','Cambria','Candara','Optima'] },
] as const;

export const DESIGN_FONT_FAMILIES = Array.from(new Set(DESIGN_FONT_GROUPS.flatMap(group=>group.fonts)));

export const FONT_WEIGHT_OPTIONS = [
  {value:100,label:'Thin'},
  {value:200,label:'Extra Light'},
  {value:300,label:'Light'},
  {value:400,label:'Regular'},
  {value:500,label:'Medium'},
  {value:600,label:'Semi Bold'},
  {value:700,label:'Bold'},
  {value:800,label:'Extra Bold'},
  {value:900,label:'Black'},
] as const;

export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,application/font-sfnt';
export const FONT_FILE_EXTENSIONS = ['ttf','otf','woff','woff2'] as const;

export function isSupportedFontFile(file: Pick<File,'name'|'type'>): boolean {
  const ext=file.name.toLowerCase().split('.').pop()??'';
  return (FONT_FILE_EXTENSIONS as readonly string[]).includes(ext) || /^font\/(ttf|otf|woff2?)$/i.test(file.type);
}

export function fontMimeType(fileName:string, supplied?:string): string {
  if(supplied&&/^font\//i.test(supplied)) return supplied;
  const ext=fileName.toLowerCase().split('.').pop();
  if(ext==='ttf')return'font/ttf';
  if(ext==='otf')return'font/otf';
  if(ext==='woff')return'font/woff';
  if(ext==='woff2')return'font/woff2';
  return supplied||'application/octet-stream';
}

export function inferFontFamilyFromFilename(fileName:string): string {
  const base=fileName.replace(/\.(ttf|otf|woff2?)$/i,'').replace(/[_]+/g,' ').trim();
  const withoutStyle=base.replace(/[\s-]+(thin|extralight|extra light|light|regular|book|medium|semibold|semi bold|demibold|bold|extrabold|extra bold|black|heavy|italic|oblique)([\s-]+italic)?$/i,'').trim();
  return withoutStyle||base||'Custom Font';
}
