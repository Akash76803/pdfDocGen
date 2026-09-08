import type { DocumentGroup, NormalizedRecord, NormalizedValue } from '@document-tool/contracts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function DocumentGroupPreview({ group }: { group: DocumentGroup }) {
  return <div className="group-preview-card">
    <div className="group-preview-title">
      <div><span>Selected Group</span><h3>{group.key}</h3></div>
      <span className={group.valid ? 'group-status valid' : 'group-status conflict'}>{group.valid ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {group.valid ? 'Valid' : 'Conflict'}</span>
    </div>
    {group.warnings.length > 0 && <div className="group-conflicts">{group.warnings.map((warning, index) => <div key={`${warning.code}-${index}`}><AlertTriangle size={14}/><span>{warning.message}{warning.conflictingValues?.length ? ` Values: ${warning.conflictingValues.map(displayValue).join(' / ')}` : ''}{warning.sourceRowIndexes?.length ? ` (rows ${warning.sourceRowIndexes.join(', ')})` : ''}</span></div>)}</div>}
    <h4>Header Fields</h4>
    <div className="header-field-grid">{flatten(group.header).map(([path, value]) => <div key={path}><span>{path}</span><strong>{displayValue(value)}</strong></div>)}{Object.keys(group.header).length === 0 && <em>No header fields mapped.</em>}</div>
    <h4>Line Items <span className="muted-copy">({group.items.length})</span></h4>
    {group.items.length > 0 ? <div className="group-items-table"><table><thead><tr><th>#</th>{collectColumns(group.items).map((col)=><th key={col}>{col}</th>)}</tr></thead><tbody>{group.items.map((item,index)=><tr key={index}><td>{index+1}</td>{collectColumns(group.items).map((col)=><td key={col}>{displayValue(getPath(item,col))}</td>)}</tr>)}</tbody></table></div> : <p className="muted-copy">No line-item fields mapped.</p>}
    <div className="source-row-note">Source rows: {group.sourceRowIndexes.join(', ')}</div>
  </div>;
}

function flatten(record: NormalizedRecord, prefix=''): [string, NormalizedValue][] { const out:[string,NormalizedValue][]=[]; for(const [key,value] of Object.entries(record)){const path=prefix?`${prefix}.${key}`:key;if(value && !Array.isArray(value) && typeof value==='object') out.push(...flatten(value,path)); else out.push([path,value]);} return out; }
function collectColumns(items: NormalizedRecord[]): string[]{ const set=new Set<string>(); items.forEach((item)=>flatten(item).forEach(([path])=>set.add(path))); return [...set]; }
function getPath(record:NormalizedRecord,path:string):NormalizedValue|undefined{let current:NormalizedValue|undefined=record;for(const part of path.split('.')){if(!current||Array.isArray(current)||typeof current!=='object')return undefined;current=current[part];}return current;}
function displayValue(value: NormalizedValue | undefined): string { if(value==null)return '—'; if(typeof value==='object')return JSON.stringify(value); return String(value); }
