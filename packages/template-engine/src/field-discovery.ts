import type { DiscoveredFieldPaths, DocumentGroup } from '@document-tool/contracts';
const BLOCKED=new Set(['__proto__','prototype','constructor']);
export function discoverFieldPaths(group:DocumentGroup,maxDepth=5):DiscoveredFieldPaths {
  const scalar=new Set<string>(); const collections=new Map<string,Set<string>>(); const seen=new WeakSet<object>();
  const root:Record<string,unknown>={...group.header,items:group.items};
  const walkObject=(value:unknown,path:string,depth:number,inCollection=false):void=>{
    if(depth>maxDepth||value===null||value===undefined)return;
    if(Array.isArray(value)){
      const fields=collections.get(path)??new Set<string>();collections.set(path,fields);
      for(const item of value.slice(0,10)) if(item&&typeof item==='object'&&!Array.isArray(item)) for(const [k,v] of Object.entries(item as Record<string,unknown>)){if(BLOCKED.has(k))continue;fields.add(`${path}.${k}`);if(v&&typeof v==='object'&&!Array.isArray(v))walkObject(v,`${path}.${k}`,depth+1,true);}
      return;
    }
    if(typeof value==='object'){
      if(seen.has(value as object))return;seen.add(value as object);
      for(const [k,v] of Object.entries(value as Record<string,unknown>)){if(BLOCKED.has(k))continue;const next=path?`${path}.${k}`:k;if(v!==null&&typeof v==='object')walkObject(v,next,depth+1,inCollection);else if(!inCollection)scalar.add(next);}
      return;
    }
    if(path&&!inCollection)scalar.add(path);
  };
  walkObject(root,'',0);
  return {scalarFields:[...scalar].sort(),collections:[...collections.entries()].map(([path,fields])=>({path,fields:[...fields].sort()})).sort((a,b)=>a.path.localeCompare(b.path))};
}
