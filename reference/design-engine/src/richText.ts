import type { TextDesignElement, TextStyleRun, TextStyleRunStyle } from '@document-tool/contracts';

export interface RichTextSegment {
  start:number;
  end:number;
  text:string;
  style:TextStyleRunStyle;
}

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function normalizeTextStyleRuns(text:string,runs:TextStyleRun[]|undefined):TextStyleRun[]{
  if(!runs?.length||!text.length)return [];
  return runs
    .map((run,index)=>({
      ...run,
      id:run.id||`text-run-${index}`,
      start:clamp(Math.floor(run.start),0,text.length),
      end:clamp(Math.floor(run.end),0,text.length),
      style:{...run.style},
    }))
    .filter(run=>run.end>run.start&&Object.keys(run.style).length>0)
    .sort((a,b)=>a.start-b.start||a.end-b.end);
}

export function applyTextStyleRun(text:string,runs:TextStyleRun[]|undefined,start:number,end:number,patch:TextStyleRunStyle,id:string):TextStyleRun[]{
  const a=clamp(Math.min(start,end),0,text.length),b=clamp(Math.max(start,end),0,text.length);
  if(b<=a)return normalizeTextStyleRuns(text,runs);
  const next:TextStyleRun[]=[];
  for(const run of normalizeTextStyleRuns(text,runs)){
    if(run.end<=a||run.start>=b){next.push(run);continue;}
    if(run.start<a)next.push({...run,end:a});
    if(run.end>b)next.push({...run,start:b});
  }
  next.push({id,start:a,end:b,style:{...patch}});
  return normalizeTextStyleRuns(text,next);
}

export function clearTextStyleRuns(text:string,runs:TextStyleRun[]|undefined,start?:number,end?:number):TextStyleRun[]{
  if(start===undefined||end===undefined)return [];
  const a=clamp(Math.min(start,end),0,text.length),b=clamp(Math.max(start,end),0,text.length);
  if(b<=a)return normalizeTextStyleRuns(text,runs);
  const next:TextStyleRun[]=[];
  for(const run of normalizeTextStyleRuns(text,runs)){
    if(run.end<=a||run.start>=b){next.push(run);continue;}
    if(run.start<a)next.push({...run,end:a});
    if(run.end>b)next.push({...run,start:b});
  }
  return normalizeTextStyleRuns(text,next);
}

export function buildRichTextSegments(text:string,runs:TextStyleRun[]|undefined):RichTextSegment[]{
  const normalized=normalizeTextStyleRuns(text,runs);
  if(!normalized.length)return [{start:0,end:text.length,text,style:{}}];
  const boundaries=new Set<number>([0,text.length]);
  for(const run of normalized){boundaries.add(run.start);boundaries.add(run.end);}
  const points=[...boundaries].sort((a,b)=>a-b);
  const segments:RichTextSegment[]=[];
  for(let i=0;i<points.length-1;i++){
    const start=points[i]!,end=points[i+1]!;
    if(end<=start)continue;
    const style:TextStyleRunStyle={};
    for(const run of normalized)if(run.start<=start&&run.end>=end)Object.assign(style,run.style);
    segments.push({start,end,text:text.slice(start,end),style});
  }
  return segments;
}

/** Remaps source-text style ranges after {{field}} tokens expand at runtime. */
export function remapTextStyleRunsForTemplate(sourceText:string,resolvedText:string,runs:TextStyleRun[]|undefined,resolveToken:(path:string)=>string):TextStyleRun[]{
  const normalized=normalizeTextStyleRuns(sourceText,runs);
  if(!normalized.length||sourceText===resolvedText)return normalized;
  const map=new Array<number>(sourceText.length+1).fill(0);
  let src=0,out=0;
  const regex=/\{\{([^}]+)\}\}/g;
  let match:RegExpExecArray|null;
  while((match=regex.exec(sourceText))){
    const start=match.index,end=start+match[0].length;
    while(src<start){map[src]=out;src++;out++;}
    const replacement=resolveToken(match[1]?.trim()??'');
    for(let i=start;i<end;i++)map[i]=out;
    src=end;out+=replacement.length;map[end]=out;
  }
  while(src<sourceText.length){map[src]=out;src++;out++;}
  map[sourceText.length]=out;
  return normalized.map(run=>({...run,start:map[run.start]??0,end:map[run.end]??resolvedText.length})).filter(run=>run.end>run.start);
}

export function hasRichTextRuns(element:TextDesignElement):boolean{return (element.style.runs?.length??0)>0;}

/** Keeps rich-text ranges stable for ordinary insert/delete edits using a prefix/suffix diff. */
export function rebaseTextStyleRunsOnEdit(oldText:string,newText:string,runs:TextStyleRun[]|undefined):TextStyleRun[]{
  const normalized=normalizeTextStyleRuns(oldText,runs);
  if(!normalized.length||oldText===newText)return normalizeTextStyleRuns(newText,normalized);
  let prefix=0;
  while(prefix<oldText.length&&prefix<newText.length&&oldText[prefix]===newText[prefix])prefix++;
  let oldSuffix=oldText.length,newSuffix=newText.length;
  while(oldSuffix>prefix&&newSuffix>prefix&&oldText[oldSuffix-1]===newText[newSuffix-1]){oldSuffix--;newSuffix--;}
  const delta=(newSuffix-prefix)-(oldSuffix-prefix);
  const next:TextStyleRun[]=[];
  for(const run of normalized){
    if(run.end<=prefix){next.push(run);continue;}
    if(run.start>=oldSuffix){next.push({...run,start:run.start+delta,end:run.end+delta});continue;}
    const start=Math.min(run.start,prefix);
    const end=Math.max(start,Math.min(newText.length,run.end+delta));
    if(end>start)next.push({...run,start,end});
  }
  return normalizeTextStyleRuns(newText,next);
}
