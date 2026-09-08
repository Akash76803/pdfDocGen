import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ImportDataService, MappingGroupingService } from '@document-tool/core';
import type { FileInspectionResult, SourceFileInput } from '@document-tool/datasource-sdk';
import type { DocumentGroup, GroupingMode, GroupingResult, MappingDefinition, MappingProfile, NormalizedData } from '@document-tool/contracts';
import { suggestMapping } from '@document-tool/mapping-engine';
import { DataPreviewTable } from '../components/data/DataPreviewTable.tsx';
import { MappingConfigurator } from '../components/data/MappingConfigurator.tsx';
import { DocumentGroupPreview } from '../components/data/DocumentGroupPreview.tsx';
import { FileSpreadsheet, UploadCloud, RefreshCw, CheckCircle2, AlertCircle, Layers3, Database, Trash2, FileText } from 'lucide-react';
import { clearImportWorkspace, getActiveImportWorkspaceId, hydrateWorkspaceGroup, listImportWorkspaceMetadata, loadImportWorkspace, saveImportWorkspace, type ImportWorkspaceMetadata } from '../services/workspaceStore.ts';

const MAX_PREVIEW_ROWS = 100;
const importService = new ImportDataService();
const groupingService = new MappingGroupingService();

export const Generate: React.FC<{ onGroupsChange?: (groups: DocumentGroup[]) => void; onOpenTemplates?: () => void }> = ({ onGroupsChange, onOpenTemplates }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceFile, setSourceFile] = useState<SourceFileInput | null>(null);
  const [inspection, setInspection] = useState<FileInspectionResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [dataPreview, setDataPreview] = useState<NormalizedData | null>(null);
  const [mappings, setMappings] = useState<MappingDefinition[]>([]);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('GROUP_BY_FIELD');
  const [groupingResult, setGroupingResult] = useState<GroupingResult | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [groupingLoading, setGroupingLoading] = useState(false);
  const [groupPage, setGroupPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceCreatedAt, setWorkspaceCreatedAt] = useState('');
  const [restoreSource, setRestoreSource] = useState<ImportWorkspaceMetadata | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const isExcel = inspection?.sourceType === 'excel';
  const fileInfo = useMemo(() => sourceFile ? `${sourceFile.name} • ${formatBytes(sourceFile.size ?? sourceFile.bytes.byteLength)}` : '', [sourceFile]);
  const selectedGroupBase = groupingResult?.groups.find((group) => group.id === selectedGroupId) ?? groupingResult?.groups[0];
  const selectedGroup = useMemo(() => hydrateWorkspaceGroup(
    dataPreview ? { id: workspaceId || 'active', sourceFile, dataPreview, groups: groupingResult?.groups ?? [], updatedAt: '' } : null,
    selectedGroupBase,
  ) ?? selectedGroupBase, [selectedGroupBase, dataPreview, workspaceId, sourceFile, groupingResult?.groups]);

  useEffect(() => {
    // Keep Generate navigation instant. Read only tiny metadata on mount; a large
    // workspace is restored explicitly so IndexedDB does not clone 10k+ rows
    // while the page is trying to paint.
    void Promise.all([listImportWorkspaceMetadata(), getActiveImportWorkspaceId()]).then(([metadata, activeId]) => {
      const candidate = (activeId ? metadata.find((item) => item.id === activeId) : undefined) ?? metadata[0] ?? null;
      setRestoreSource(candidate);
    }).catch(() => undefined);
  }, []);

  const restoreLastSource = async () => {
    if (!restoreSource || restoreLoading) return;
    setRestoreLoading(true);
    setWorkspaceMessage(`Loading ${restoreSource.sourceName}…`);
    // Yield once so the loading state paints before IndexedDB clones the source.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const workspace = await loadImportWorkspace(restoreSource.id);
      if (!workspace) { setWorkspaceMessage('Saved source is unavailable.'); return; }
      setWorkspaceId(workspace.id);
      setWorkspaceCreatedAt(workspace.createdAt ?? workspace.updatedAt);
      setSourceFile(workspace.sourceFile);
      setInspection(workspace.inspection ?? null);
      setSelectedSheet(workspace.selectedSheet ?? '');
      setHeaderRow(workspace.headerRow ?? 1);
      setDataPreview(workspace.dataPreview ?? null);
      setMappings(workspace.mappings ?? []);
      setGroupingMode(workspace.groupingMode ?? 'GROUP_BY_FIELD');
      setGroupingResult(workspace.groupingResult ?? null);
      const groups = workspace.groupingResult?.groups ?? workspace.groups ?? [];
      setSelectedGroupId(groups[0]?.id ?? '');
      onGroupsChange?.(groups);
      setWorkspaceMessage(`Restored ${workspace.sourceFile?.name ?? restoreSource.sourceName} from local workspace.`);
    } catch (err) { setWorkspaceMessage(toFriendlyMessage(err)); }
    finally { setRestoreLoading(false); }
  };

  const persistImportedSnapshot = async (args: {
    source: SourceFileInput; info: FileInspectionResult; sheet: string; header: number; data: NormalizedData; nextMappings: MappingDefinition[]; result?: GroupingResult | null; mode?: GroupingMode; id?: string; createdAt?: string;
  }) => {
    const now = new Date().toISOString();
    const id = args.id || workspaceId || makeSourceId(args.source.name);
    const createdAt = args.createdAt || workspaceCreatedAt || now;
    if (!workspaceId) setWorkspaceId(id);
    if (!workspaceCreatedAt) setWorkspaceCreatedAt(createdAt);
    await saveImportWorkspace({
      id, sourceFile: args.source, inspection: args.info, selectedSheet: args.sheet, headerRow: args.header,
      dataPreview: args.data, mappings: args.nextMappings, groupingMode: args.mode ?? groupingMode,
      groupingResult: args.result ?? null, groups: args.result?.groups ?? [], createdAt, updatedAt: now,
    });
  };

  const processBrowserFile = async (file: File) => {
    setError(null); setDataPreview(null); setGroupingResult(null); setGroupPage(0); setLoading(true);
    try {
      const source = await toSourceFileInput(file);
      const info = importService.inspectFile(source);
      const now = new Date().toISOString();
      const id = makeSourceId(source.name);
      const nextSheet = info.defaultSheetName ?? '';
      const nextHeaderRow = info.suggestedHeaderRow || 1;
      setWorkspaceId(id); setWorkspaceCreatedAt(now);
      setSourceFile(source); setInspection(info); setSelectedSheet(nextSheet); setHeaderRow(nextHeaderRow);
      const data = await importService.loadData(source, { sheetName: nextSheet || undefined, headerRow: nextHeaderRow });
      const nextMappings = createSuggestedMappings(data);
      applyImportedData(data, nextMappings);
      setWorkspaceMessage(`Saving ${source.name} locally…`);
      await persistImportedSnapshot({ source, info, sheet: nextSheet, header: nextHeaderRow, data, nextMappings, id, createdAt: now });
      setWorkspaceMessage(`Source workspace saved locally • ${source.name}`);
    } catch (err) { resetImportedState(false); setError(toFriendlyMessage(err)); } finally { setLoading(false); }
  };

  const applyImportedData = (data: NormalizedData, nextMappings = createSuggestedMappings(data)) => {
    setDataPreview(data);
    setMappings(nextMappings);
    setGroupingResult(null); setSelectedGroupId(''); setGroupPage(0); onGroupsChange?.([]);
  };

  const reloadPreview = async (sheetName = selectedSheet, nextHeaderRow = headerRow) => {
    if (!sourceFile || !inspection) return; setError(null); setLoading(true);
    try {
      const data = await importService.loadData(sourceFile, { sheetName: sheetName || undefined, headerRow: nextHeaderRow });
      const nextMappings = createSuggestedMappings(data);
      applyImportedData(data, nextMappings);
      await persistImportedSnapshot({ source: sourceFile, info: inspection, sheet: sheetName, header: nextHeaderRow, data, nextMappings });
      setWorkspaceMessage(`Source preview saved locally • ${sourceFile.name}`);
    } catch (err) { setDataPreview(null); setGroupingResult(null); setError(toFriendlyMessage(err)); } finally { setLoading(false); }
  };

  const buildGroups = async () => {
    if (!dataPreview || groupingLoading) return;
    setGroupingLoading(true);
    setError(null);
    // Let React paint the busy state before the CPU-bound grouping step begins.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      const groupMapping = mappings.find((mapping) => mapping.role === 'GROUP_KEY');
      const profile: MappingProfile = {
        id: 'runtime-import-profile', name: 'Runtime Import Mapping', sourceType: String(dataPreview.metadata?.sourceType ?? 'file'), mappings,
        groupDefinition: { mode: groupingMode, groupKey: groupingMode === 'GROUP_BY_FIELD' ? { sourceField: groupMapping?.sourceField, targetPath: groupMapping?.targetPath } : undefined },
      };
      const validation = groupingService.validate(dataPreview, profile);
      if (!validation.valid) { setGroupingResult(null); onGroupsChange?.([]); setError(validation.errors.map((item) => item.message).join(' ')); return; }
      const result = groupingService.buildGroups(dataPreview, profile);
      setGroupingResult(result); setGroupPage(0);
      setSelectedGroupId(result.groups[0]?.id ?? '');
      onGroupsChange?.(result.groups);
      setError(result.errors.length ? result.errors.map((item)=>item.message).join(' ') : null);

      if (sourceFile && inspection) {
        setWorkspaceMessage(`Saving ${result.groups.length.toLocaleString()} groups locally…`);
        await persistImportedSnapshot({ source: sourceFile, info: inspection, sheet: selectedSheet, header: headerRow, data: dataPreview, nextMappings: mappings, result, mode: groupingMode });
        setWorkspaceMessage(`Mapped source + ${result.groups.length.toLocaleString()} groups saved locally • ${sourceFile.name}`);
      }
    } catch (err) {
      setError(toFriendlyMessage(err));
      setWorkspaceMessage('Groups are available only if grouping completed successfully.');
    } finally { setGroupingLoading(false); }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { const file=event.target.files?.[0]; if(file) void processBrowserFile(file); event.target.value=''; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const file=event.dataTransfer.files?.[0]; if(file) void processBrowserFile(file); };
  const resetImportedState = (removeSaved = true) => { const sourceIdToRemove = workspaceId; setWorkspaceId(''); setWorkspaceCreatedAt(''); setSourceFile(null); setInspection(null); setSelectedSheet(''); setHeaderRow(1); setDataPreview(null); setMappings([]); setGroupingResult(null); setSelectedGroupId(''); setWorkspaceMessage(''); onGroupsChange?.([]); if (removeSaved) void clearImportWorkspace(sourceIdToRemove || undefined); };

  return <div className="generate-container animated-fade-in">
    <div className="page-header"><div><h2>Generate Document</h2><p>Import data, map fields, and organize rows into document-ready groups.</p></div><span className="phase-badge">Phase 3</span></div>

    <div className="import-step-card"><div className="panel-header"><span className="step-badge">1</span><h3>Choose Excel / CSV File</h3></div>
      <div className={`file-drop-zone ${sourceFile?'has-source':''} ${loading?'disabled':''}`} onDragOver={(e)=>e.preventDefault()} onDrop={onDrop} onClick={()=>!loading&&fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e)=>{if((e.key==='Enter'||e.key===' ')&&!loading)fileInputRef.current?.click();}}>
        <UploadCloud size={34}/><strong>{loading?'Reading file…':'Choose file or drag it here'}</strong><span>XLSX and CSV • Processing stays on this device</span><input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={onFileChange} hidden/>
      </div>
      {!sourceFile && restoreSource && <div className="workspace-restore-row"><div><strong>Saved source available</strong><span>{restoreSource.sourceName} • {restoreSource.rowCount.toLocaleString()} rows • {restoreSource.groupCount.toLocaleString()} groups</span></div><button className="btn-secondary" onClick={(event)=>{event.stopPropagation();void restoreLastSource();}} disabled={restoreLoading}>{restoreLoading ? <RefreshCw size={15} className="spin"/> : <Database size={15}/>} {restoreLoading ? 'Loading…' : 'Restore Saved Source'}</button></div>}
      {sourceFile&&<><div className="selected-file-summary"><div className="file-summary-icon"><FileSpreadsheet size={20}/></div><div><strong>{sourceFile.name}</strong><span>{fileInfo}</span></div><CheckCircle2 size={18} className="success-text"/><button className="source-clear-button" onClick={(event)=>{event.stopPropagation();resetImportedState();}} title="Clear saved source workspace"><Trash2 size={15}/></button></div>{workspaceMessage&&<div className="workspace-saved-note"><Database size={14}/>{workspaceMessage}</div>}</>}
    </div>

    {inspection&&sourceFile&&<div className="import-step-card"><div className="panel-header"><span className="step-badge">2</span><h3>Configure Source</h3></div><div className="import-config-grid">
      {isExcel&&<div className="form-group"><label>Sheet</label><select value={selectedSheet} onChange={(e)=>{setSelectedSheet(e.target.value);void reloadPreview(e.target.value,headerRow);}} disabled={loading}>{inspection.sheets?.map((sheet)=><option key={sheet.name} value={sheet.name}>{sheet.name}{sheet.hidden?' (Hidden)':''}</option>)}</select></div>}
      <div className="form-group"><label>Header Row</label><input className="number-input" type="number" min={1} value={headerRow} onChange={(e)=>setHeaderRow(Math.max(1,Number(e.target.value)||1))} onBlur={()=>void reloadPreview(selectedSheet,headerRow)} disabled={loading}/><small>1-based row number.</small></div>
      <div className="form-group refresh-control"><label>Preview</label><button className="btn-secondary" onClick={()=>void reloadPreview()} disabled={loading}><RefreshCw size={15}/>{loading?'Refreshing…':'Refresh Preview'}</button></div>
    </div></div>}

    {error&&<div className="error-card"><AlertCircle size={18}/><div><strong>Action required</strong><p>{error}</p></div></div>}

    {dataPreview&&<><div className="import-step-card preview-step-card"><div className="panel-header"><span className="step-badge">3</span><h3>Normalized Preview</h3></div><DataPreviewTable data={dataPreview} maxRows={MAX_PREVIEW_ROWS}/></div>
      <div className="import-step-card"><div className="panel-header"><span className="step-badge">4</span><h3>Map Fields & Group Records</h3></div><div className="phase2-content"><MappingConfigurator fields={dataPreview.schema.fields} mappings={mappings} mode={groupingMode} onModeChange={(mode)=>{setGroupingMode(mode);setGroupingResult(null);onGroupsChange?.([]); if(mode!=='GROUP_BY_FIELD') setMappings((current)=>current.map((m)=>m.role==='GROUP_KEY'?{...m,role:'HEADER_FIELD'}:m));}} onChange={(next)=>{setMappings(next);setGroupingResult(null);onGroupsChange?.([]);}}/>
      <div className="group-action-row"><div><strong>Ready to organize {dataPreview.records.length.toLocaleString()} rows</strong><span>Grouping only prepares data. No PDF/DOCX is generated in this phase.</span></div><button className="btn-primary" onClick={() => void buildGroups()} disabled={groupingLoading}>{groupingLoading ? <RefreshCw size={16} className="spin"/> : <Layers3 size={16}/>} {groupingLoading ? 'Building Groups…' : 'Build Document Groups'}</button></div></div></div></>}

    {groupingResult&&<div className="import-step-card"><div className="panel-header"><span className="step-badge">5</span><h3>Document Group Preview</h3></div><div className="phase2-content">
      <div className="group-stats"><Stat label="Source Rows" value={groupingResult.statistics.sourceRowCount}/><Stat label="Groups" value={groupingResult.statistics.groupCount}/><Stat label="Valid" value={groupingResult.statistics.validGroupCount}/><Stat label="Conflicts" value={groupingResult.statistics.invalidGroupCount}/><Stat label="Skipped" value={groupingResult.statistics.skippedRowCount}/></div>
      {groupingResult.warnings.length>0&&<div className="warning-list phase2-warnings">{groupingResult.warnings.slice(0,50).map((warning,index)=><div className="warning-item" key={`${warning.code}-${index}`}>{warning.message}</div>)}{groupingResult.warnings.length>50&&<div className="warning-overflow-note">Showing first 50 of {groupingResult.warnings.length.toLocaleString()} warnings. Remaining warnings are not rendered to keep the screen responsive.</div>}</div>}
      <div className="group-preview-layout"><div className="group-list"><div className="group-list-head">Group Key <span>Rows / Status</span></div>{groupingResult.groups.slice(groupPage*100, groupPage*100+100).map((group)=><button key={group.id} className={`group-list-item ${selectedGroup?.id===group.id?'active':''}`} onClick={()=>setSelectedGroupId(group.id)}><strong>{group.key}</strong><span>{group.sourceRowIndexes.length} • {group.valid?'Valid':'Conflict'}</span></button>)}<div className="group-pagination"><button className="btn-secondary compact-button" disabled={groupPage===0} onClick={()=>setGroupPage((page)=>Math.max(0,page-1))}>Previous</button><span>{Math.min(groupPage*100+1, groupingResult.groups.length).toLocaleString()}–{Math.min((groupPage+1)*100, groupingResult.groups.length).toLocaleString()} of {groupingResult.groups.length.toLocaleString()}</span><button className="btn-secondary compact-button" disabled={(groupPage+1)*100>=groupingResult.groups.length} onClick={()=>setGroupPage((page)=>page+1)}>Next</button></div></div>{selectedGroup&&<div className="selected-group-preview-shell"><div className="production-pdf-handoff"><div><strong>Selected group ready for document generation</strong><span>{selectedGroup.key} • choose a template, verify preview, then Print / Save PDF.</span></div><button className="btn-primary" onClick={onOpenTemplates}><FileText size={15}/> Open in Templates / PDF</button></div><DocumentGroupPreview group={selectedGroup}/></div>}</div>
    </div></div>}
  </div>;
};

function Stat({label,value}:{label:string;value:number}){return <div className="group-stat"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>}
async function toSourceFileInput(file:File):Promise<SourceFileInput>{const extension=file.name.includes('.')?file.name.split('.').pop()!.toLowerCase():'';return{name:file.name,extension,size:file.size,bytes:await file.arrayBuffer()};}
function formatBytes(bytes:number):string{if(bytes<1024)return`${bytes} B`;if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/(1024*1024)).toFixed(1)} MB`;}
function toFriendlyMessage(error:unknown):string{return error instanceof Error?error.message:'Unexpected error. Please try again.';}
function createSuggestedMappings(data:NormalizedData):MappingDefinition[]{let assignedGroup=false;return data.schema.fields.map((field,index)=>{const suggestion=suggestMapping(field.name,assignedGroup);if(suggestion.role==='GROUP_KEY')assignedGroup=true;return{id:`map-${index}`,sourceField:field.name,targetPath:suggestion.path,role:suggestion.role,summaryAggregation:suggestion.summaryAggregation};});}

function makeSourceId(name:string):string{return `source-${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'file'}`;}
