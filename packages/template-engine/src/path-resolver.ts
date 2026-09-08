const BLOCKED = new Set(['__proto__','prototype','constructor']);
export interface ResolveResult { found:boolean; value:unknown; }
export function resolvePath(input:unknown,path:string,maxDepth=10):ResolveResult {
  const parts=path.split('.').filter(Boolean);
  if(!path || parts.length===0 || parts.length>maxDepth || parts.some((p)=>BLOCKED.has(p))) return {found:false,value:undefined};
  let current:unknown=input;
  for(const part of parts){
    if(current===null || typeof current!=='object' || Array.isArray(current)) return {found:false,value:undefined};
    if(!Object.prototype.hasOwnProperty.call(current,part)) return {found:false,value:undefined};
    current=(current as Record<string,unknown>)[part];
  }
  return {found:true,value:current};
}
export function isSafePath(path:string,maxDepth=10):boolean { const parts=path.split('.').filter(Boolean); return !!path && parts.length<=maxDepth && parts.every((p)=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)&&!BLOCKED.has(p)); }
