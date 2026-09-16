import { toApiSafePath, type DocumentGroup, type NormalizedRecord, type TemplateDefinition } from '@document-tool/contracts';

type FormulaSpec={id?:string;name:string;alias:string;expression:string};

function formulaSpecs(template:TemplateDefinition):FormulaSpec[]{
  const raw=template.metadata?.desktopFormulaFields;
  if(!Array.isArray(raw))return[];
  return raw.filter((v):v is FormulaSpec=>!!v&&typeof v==='object'&&typeof (v as FormulaSpec).name==='string'&&typeof (v as FormulaSpec).alias==='string'&&typeof (v as FormulaSpec).expression==='string');
}
function directPath(root:unknown,path:string):unknown{
  let cur:unknown=root; for(const part of path.split('.')){if(!cur||typeof cur!=='object'||Array.isArray(cur)||!Object.prototype.hasOwnProperty.call(cur,part))return undefined;cur=(cur as Record<string,unknown>)[part];}return cur;
}
function valueFor(root:NormalizedRecord,path:string):unknown{
  const raw=path.trim(); if(!raw)return undefined;
  const direct=directPath(root,raw); if(direct!==undefined)return direct;
  const safe=toApiSafePath(raw); if(safe&&safe!==raw){const v=directPath(root,safe);if(v!==undefined)return v;}
  const match=Object.keys(root).find((key)=>key.toLocaleLowerCase()===raw.toLocaleLowerCase()||toApiSafePath(key)===safe); return match?root[match]:undefined;
}
function numeric(value:unknown):number|null{if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value==='boolean')return value?1:0;if(value==null||value==='')return null;const n=Number(String(value).trim().replace(/,/g,'').replace(/[%₹$€£]/g,''));return Number.isFinite(n)?n:null;}
function aggregate(rows:NormalizedRecord[],field:string,op:'SUM'|'COUNT'|'AVG'|'MIN'|'MAX'):number{
  if(op==='COUNT'&&!field)return rows.length;const values=rows.map((row)=>valueFor(row,field)).filter((v)=>v!==undefined&&v!==null&&v!=='');if(op==='COUNT')return values.length;const nums=values.map(numeric).filter((v):v is number=>v!=null);if(op==='SUM')return nums.reduce((a,b)=>a+b,0);if(op==='AVG')return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;if(op==='MIN')return nums.length?Math.min(...nums):0;return nums.length?Math.max(...nums):0;
}
const ONES=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function below100(n:number){return n<20?(ONES[n]??''):`${TENS[Math.floor(n/10)]}${n%10?`-${ONES[n%10]}`:''}`;}
function below1000(n:number){if(n<=0)return'';if(n<100)return below100(n);return`${ONES[Math.floor(n/100)]} Hundred${n%100?` ${below100(n%100)}`:''}`;}
function intWords(input:number):string{const value=Math.trunc(Math.abs(input));if(value===0)return'Zero';const scales=[{v:10_000_000,l:'Crore'},{v:100_000,l:'Lakh'},{v:1_000,l:'Thousand'}] as const;let r=value;const parts:string[]=[];for(const s of scales){if(r>=s.v){const g=Math.floor(r/s.v);parts.push(`${g<1000?below1000(g):intWords(g)} ${s.l}`);r%=s.v;}}if(r>0)parts.push(below1000(r));return parts.join(' ');}
function amountWords(input:number){const rounded=Math.round(Math.abs(input)*100);const rupees=Math.floor(rounded/100),paise=rounded%100;return`${input<0?'Minus ':''}${intWords(rupees)} Rupee${rupees===1?'':'s'}${paise?` and ${intWords(paise)} Paise`:''} Only`;}
function unwrapFunction(expression:string,names:string[]){const t=expression.trim(),open=t.indexOf('(');if(open<=0||!t.endsWith(')'))return null;const name=t.slice(0,open).trim().toUpperCase();if(!names.includes(name))return null;let depth=0;for(let i=open;i<t.length;i++){if(t[i]==='(')depth++;if(t[i]===')')depth--;if(depth===0&&i!==t.length-1)return null;if(depth<0)return null;}return depth===0?t.slice(open+1,-1).trim():null;}

type Token={type:'number'|'op'|'paren';value:string};
function arithmetic(expression:string,context:NormalizedRecord):number|null{
  let expanded=expression.replace(/\[([^\]]+)\]/g,(_m,name:string)=>{const n=numeric(valueFor(context,name.trim()));return n==null?'NaN':String(n);});
  // Bare safe identifiers are supported for modern Copy Request paths and formula aliases.
  const keys=Object.keys(context).sort((a,b)=>b.length-a.length);for(const key of keys){const n=numeric(context[key]);if(n==null)continue;expanded=expanded.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'g'),String(n));}
  const tokens:Token[]=[];const re=/\s*(\d+(?:\.\d+)?|[()+\-*/])\s*/gy;let index=0;while(index<expanded.length){re.lastIndex=index;const m=re.exec(expanded);if(!m||m.index!==index)return null;const v=m[1]!;tokens.push({type:/^\d/.test(v)?'number':v==='('||v===')'?'paren':'op',value:v});index=re.lastIndex;}
  let cursor=0;const factor=():number=>{const t=tokens[cursor++];if(!t)throw Error();if(t.type==='op'&&(t.value==='+'||t.value==='-')){const v=factor();return t.value==='-'?-v:v;}if(t.type==='paren'&&t.value==='('){const v=expr();if(tokens[cursor++]?.value!==')')throw Error();return v;}if(t.type==='number')return Number(t.value);throw Error();};const term=():number=>{let v=factor();while(tokens[cursor]?.type==='op'&&['*','/'].includes(tokens[cursor]!.value)){const op=tokens[cursor++]!.value,r=factor();if(op==='/'&&r===0)throw Error();v=op==='*'?v*r:v/r;}return v;};const expr=():number=>{let v=term();while(tokens[cursor]?.type==='op'&&['+','-'].includes(tokens[cursor]!.value)){const op=tokens[cursor++]!.value,r=term();v=op==='+'?v+r:v-r;}return v;};try{const result=expr();return cursor===tokens.length&&Number.isFinite(result)?result:null;}catch{return null;}
}
function evaluate(expression:string,context:NormalizedRecord,rows:NormalizedRecord[]):string|number|null{
  const words=unwrapFunction(expression,['NUMBER_TO_WORDS','AMOUNT_IN_WORDS','INR_WORDS']);if(words){const v=evaluate(words,context,rows);return typeof v==='number'?amountWords(v):null;}
  const replaced=expression.replace(/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:\[([^\]]+)\]|([A-Za-z_$][A-Za-z0-9_.$]*))?\s*\)/gi,(_m,opRaw,bracket,bare)=>String(aggregate(rows,String(bracket||bare||'').trim(),String(opRaw).toUpperCase() as 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX')));
  return arithmetic(replaced,context);
}
export function applyDesktopFormulaFields(template:TemplateDefinition,group:DocumentGroup):DocumentGroup{
  const specs=formulaSpecs(template);if(!specs.length)return group;const context:NormalizedRecord={...group.header};const calc:NormalizedRecord={};const unresolved=new Set(specs.map((s)=>s.id??s.alias));
  for(let pass=0;pass<specs.length&&unresolved.size;pass++){let progressed=false;for(const spec of specs){const id=spec.id??spec.alias;if(!unresolved.has(id))continue;const value=evaluate(spec.expression,context,group.items);if(value==null)continue;context[spec.name]=value;context[spec.alias]=value;calc[spec.alias]=value;unresolved.delete(id);progressed=true;}if(!progressed)break;}
  return {...group,header:{...group.header,calc}};
}
