/** Safe deterministic binding path for an imported source header. */
export function rawSourceBindingPath(sourceField:string):string {
  return `source.${rawSourceFieldKey(sourceField)}`;
}

export function rawSourceFieldKey(sourceField:string):string {
  const words=sourceField.trim().replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const [first='field',...rest]=words;
  const slug=(first.toLowerCase().replace(/^[^a-z_]+/,'')+rest.map((word)=>word.charAt(0).toUpperCase()+word.slice(1).toLowerCase()).join('')).replace(/[^A-Za-z0-9_]/g,'') || 'field';
  let hash=2166136261;
  for(const char of sourceField){hash^=char.codePointAt(0) ?? 0;hash=Math.imul(hash,16777619);}
  return `${/^[A-Za-z_]/.test(slug)?slug:`field${slug}`}_${(hash>>>0).toString(36)}`;
}

export function buildRawSourceContext(rawRow:unknown):Record<string,unknown> {
  if(!rawRow || typeof rawRow!=='object' || Array.isArray(rawRow)) return {};
  const result:Record<string,unknown>={};
  for(const [key,value] of Object.entries(rawRow as Record<string,unknown>)) result[rawSourceFieldKey(key)]=value;
  return result;
}
