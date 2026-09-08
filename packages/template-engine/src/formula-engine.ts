import type { FormulaFieldBinding } from '@document-tool/contracts';
import { resolvePath } from './path-resolver.js';

export type FormulaContext = {
  rows: unknown[];
  rawRows?: unknown[];
  defaultSourcePath?: string;
  /** Optional document root used by Phase 4.13 named calculations (for calc.* and document fields). */
  root?: Record<string, unknown>;
};

type Token = { kind:'number'; value:number } | { kind:'ref'; id:string } | { kind:'name'; value:string } | { kind:'op'; value:'+'|'-'|'*'|'/' } | { kind:'lparen'|'rparen'|'comma' };

export function validateFormulaExpression(expression:string, bindings:FormulaFieldBinding[] = []): string | null {
  try {
    const parser = new FormulaParser(tokenize(expression), bindings, { rows: [] }, true);
    parser.parse();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid formula.';
  }
}

export function evaluateFormula(expression:string, bindings:FormulaFieldBinding[], context:FormulaContext): number {
  const parser = new FormulaParser(tokenize(expression), bindings, context, false);
  const value = parser.parse();
  if (!Number.isFinite(value)) throw new Error('Formula result is not a finite number.');
  return value;
}

function tokenize(input:string):Token[] {
  const tokens:Token[]=[]; let i=0;
  while(i<input.length){
    const ch=input[i]!;
    if(/\s/.test(ch)){i++;continue;}
    if(ch==='{' && input[i+1]==='{'){
      const end=input.indexOf('}}',i+2); if(end<0) throw new Error('Formula field token is not closed.');
      const id=input.slice(i+2,end).trim(); if(!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid formula field token.');
      tokens.push({kind:'ref',id}); i=end+2; continue;
    }
    if(/[0-9.]/.test(ch)){
      let j=i+1; while(j<input.length && /[0-9.]/.test(input[j]!))j++;
      const n=Number(input.slice(i,j)); if(!Number.isFinite(n)) throw new Error('Invalid number in formula.');
      tokens.push({kind:'number',value:n}); i=j; continue;
    }
    if(/[A-Za-z_]/.test(ch)){
      let j=i+1; while(j<input.length && /[A-Za-z0-9_]/.test(input[j]!))j++;
      tokens.push({kind:'name',value:input.slice(i,j).toUpperCase()}); i=j; continue;
    }
    if('+-*/'.includes(ch)){tokens.push({kind:'op',value:ch as any});i++;continue;}
    if(ch==='('){tokens.push({kind:'lparen'});i++;continue;}
    if(ch===')'){tokens.push({kind:'rparen'});i++;continue;}
    if(ch===','){tokens.push({kind:'comma'});i++;continue;}
    throw new Error(`Unsupported formula character "${ch}".`);
  }
  return tokens;
}

class FormulaParser {
  private pos=0;
  constructor(private tokens:Token[], private bindings:FormulaFieldBinding[], private context:FormulaContext, private validationOnly:boolean){}
  parse(){ if(!this.tokens.length) throw new Error('Formula expression is required.'); const v=this.expr(); if(this.pos!==this.tokens.length) throw new Error('Unexpected token in formula.'); return v; }
  private expr(){ let v=this.term(); while(this.isOp('+')||this.isOp('-')){const op=(this.take() as any).value;const r=this.term();v=op==='+'?v+r:v-r;} return v; }
  private term(){ let v=this.factor(); while(this.isOp('*')||this.isOp('/')){const op=(this.take() as any).value;const r=this.factor();if(op==='/'&&r===0&&!this.validationOnly)throw new Error('Division by zero.');v=op==='*'?v*r:v/r;} return v; }
  private factor():number {
    if(this.isOp('-')){this.take();return -this.factor();}
    const t=this.peek(); if(!t) throw new Error('Unexpected end of formula.');
    if(t.kind==='number'){this.take();return t.value;}
    if(t.kind==='ref'){this.take();return this.resolveBinding(t.id,'FIRST');}
    if(t.kind==='lparen'){this.take();const v=this.expr();this.expect('rparen');return v;}
    if(t.kind==='name') return this.func();
    throw new Error('Expected a number, field, function, or parentheses.');
  }
  private func(){
    const name=(this.take() as Extract<Token,{kind:'name'}>).value;
    const allowed=['SUM','AVG','MIN','MAX','COUNT','FIRST','ROUND']; if(!allowed.includes(name)) throw new Error(`Unsupported formula function ${name}.`);
    this.expect('lparen');
    if(name==='ROUND'){
      const value=this.expr(); let digits=0;
      if(this.peek()?.kind==='comma'){this.take();digits=Math.max(0,Math.min(8,Math.trunc(this.expr())));}
      this.expect('rparen'); const f=10**digits; return Math.round((value+Number.EPSILON)*f)/f;
    }
    const ref=this.take(); if(!ref || ref.kind!=='ref') throw new Error(`${name} requires a field token.`);
    this.expect('rparen'); return this.resolveBinding(ref.id,name as any);
  }
  private resolveBinding(id:string, op:'SUM'|'AVG'|'MIN'|'MAX'|'COUNT'|'FIRST'){
    const binding=this.bindings.find(b=>b.id===id); if(!binding) throw new Error(`Unknown formula field ${id}.`);
    if(this.validationOnly) return 0;
    let vals=this.context.rows.map((row,index)=>resolveFormulaBinding(row,this.context.rawRows?.[index],binding,this.context.defaultSourcePath)).filter(r=>r.found).map(r=>r.value);
    // Named document calculations can reference already-resolved calc.* or header fields.
    // Only fall back to root when the active row collection did not provide a value, so
    // aggregate semantics over collection fields remain unchanged.
    if(vals.length===0 && this.context.root){
      const rootResult=resolveFormulaBinding(this.context.root,undefined,binding,undefined);
      if(rootResult.found) vals=[rootResult.value];
    }
    if(op==='COUNT') return vals.length;
    if(op==='FIRST') return toNumber(vals[0]);
    const nums=vals.map(toNumber).filter(Number.isFinite);
    if(op==='SUM') return nums.reduce((a,b)=>a+b,0);
    if(op==='AVG') return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;
    if(op==='MIN') return nums.length?Math.min(...nums):0;
    return nums.length?Math.max(...nums):0;
  }
  private peek(){return this.tokens[this.pos];} private take(){return this.tokens[this.pos++];}
  private expect(kind:Token['kind']){const t=this.take();if(!t||t.kind!==kind)throw new Error(`Expected ${kind}.`);}
  private isOp(op:string){const t=this.peek();return t?.kind==='op'&&t.value===op;}
}

function resolveFormulaBinding(row:unknown, rawRow:unknown, binding:FormulaFieldBinding, defaultSourcePath?:string){
  const paths=Array.from(new Set([binding.path,binding.targetPath].filter(Boolean) as string[]));
  for(const path of paths){
    for(const candidate of candidatePaths(path,binding.sourcePath??defaultSourcePath)){
      const r=resolvePath(row,candidate); if(r.found)return r;
    }
  }
  if(binding.sourceField && rawRow && typeof rawRow==='object'){
    const direct=(rawRow as Record<string,unknown>)[binding.sourceField]; if(direct!==undefined)return {found:true,value:direct};
    const r=resolvePath(rawRow,binding.sourceField); if(r.found)return r;
  }
  return {found:false,value:undefined};
}
function candidatePaths(path:string, sourcePath?:string){const s=new Set<string>([path]);if(sourcePath&&path.startsWith(sourcePath+'.'))s.add(path.slice(sourcePath.length+1));const parts=path.split('.').filter(Boolean);if(parts.length>1)s.add(parts.at(-1)!);return [...s];}
function toNumber(v:unknown){if(typeof v==='number')return v;if(typeof v==='boolean')return v?1:0;if(typeof v==='string'){const n=Number(v.replace(/,/g,'').trim());return Number.isFinite(n)?n:0;}return 0;}
