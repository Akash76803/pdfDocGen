import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Barcode, ChevronLeft, ChevronRight, Circle,
  Copy, Eye, Image, Minus, MousePointer2, QrCode, Save, ScanLine, Signature, Table2, Trash2,
  Type, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { RecordPicker } from '../components/RecordPicker.tsx';
import { DATA_EVENT, activeRecord, activeSource, displayValue, loadDataState, loadDataStateAsync, saveDataSelection, valueForField, type BuilderDataState } from '../lib/dataSourceStore.ts';
import { loadImageAsset, saveImageAsset } from '../lib/imageAssetStore.ts';
import { TableCreateModal } from '../components/TableCreateModal.tsx';
import { TableCanvas } from '../components/TableCanvas.tsx';
import { addCustomSummaryRow, addTableColumn, addTableRow, deleteTableColumn, deleteTableRow, duplicateTableRow, findTableCell, findTableCellLocation, moveTableColumn, moveTableRow, recommendedParentKey, recommendedRowKey, tableHasMergedColumns, updateTableCell, updateTableColumn, updateTableRow, type TableDefinition, type TableCellType } from '../lib/tableModel.ts';

type ToolType = 'text' | 'image' | 'table' | 'shape' | 'qr' | 'barcode' | 'signature' | 'divider';
type InspectorTab = 'properties' | 'binding' | 'formatting' | 'conditions';
type TextAlign = 'left' | 'center' | 'right';

type BuilderElement = {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  textAlign: TextAlign;
  fill: string;
  color: string;
  binding?: string;
  imageSource?: string;
  imageAssetId?: string;
  imageFit?: 'contain' | 'cover' | 'fill';
  table?: TableDefinition;
};

type SavedTemplate = {
  name: string;
  pageSize: 'A4' | 'Letter';
  orientation: 'Portrait' | 'Landscape';
  elements: BuilderElement[];
  updatedAt: string;
};

const STORAGE_KEY = 'document-builder.template.db2.v1';
const tools: Array<{ label: string; type: ToolType; icon: typeof Type }> = [
  { label: 'Text', type: 'text', icon: Type },
  { label: 'Image', type: 'image', icon: Image },
  { label: 'Table', type: 'table', icon: Table2 },
  { label: 'Shape', type: 'shape', icon: Circle },
  { label: 'QR Code', type: 'qr', icon: QrCode },
  { label: 'Barcode', type: 'barcode', icon: Barcode },
  { label: 'Signature', type: 'signature', icon: Signature },
  { label: 'Divider', type: 'divider', icon: Minus },
];

export function TemplateBuilder({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const [zoom, setZoom] = useState(92);
  const [tab, setTab] = useState<InspectorTab>('properties');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [name, setName] = useState('Untitled Document');
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'Portrait' | 'Landscape'>('Portrait');
  const [elements, setElements] = useState<BuilderElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('Draft');
  const [dataState, setDataState] = useState<BuilderDataState>(() => loadDataState());
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const source = activeSource(dataState);
  const record = activeRecord(dataState);
  const selected = elements.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedTemplate;
      if (Array.isArray(saved.elements)) {
        setName(saved.name || 'Untitled Document');
        setPageSize(saved.pageSize || 'A4');
        setOrientation(saved.orientation || 'Portrait');
        setElements(saved.elements);
        setStatus('Saved locally');
      }
    } catch {
      // Ignore invalid legacy/local data and continue with a clean template.
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void loadDataStateAsync().then(setDataState).catch(() => setDataState(loadDataState())); };
    refresh();
    window.addEventListener(DATA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(DATA_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  function addElement(type: ToolType) {
    if (type === 'table') { setTableModalOpen(true); return; }
    const count = elements.length;
    const defaults = defaultElement(type, count);
    setElements((current) => [...current, defaults]);
    setSelectedId(defaults.id);
    setTab(type === 'text' ? 'formatting' : 'properties');
    setStatus('Unsaved changes');
  }


  function addTableElement(table: TableDefinition) {
    const defaults = defaultElement('table', elements.length);
    const tableElement: BuilderElement = { ...defaults, table, width: Math.max(430, table.columns.length * 100), height: table.mode === 'custom' ? Math.max(120, table.rows.length * 34) : 180 };
    setElements((current) => [...current, tableElement]);
    setSelectedId(tableElement.id);
    setTab('properties');
    setTableModalOpen(false);
    setStatus('Unsaved changes');
  }

  function updateSelected(patch: Partial<BuilderElement>) {
    if (!selectedId) return;
    setElements((current) => current.map((item) => item.id === selectedId ? { ...item, ...patch } : item));
    setStatus('Unsaved changes');
  }

  function deleteSelected() {
    if (!selectedId) return;
    setElements((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
    setStatus('Unsaved changes');
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: BuilderElement = { ...selected, id: crypto.randomUUID(), x: selected.x + 18, y: selected.y + 18 };
    setElements((current) => [...current, copy]);
    setSelectedId(copy.id);
    setStatus('Unsaved changes');
  }

  function saveTemplate() {
    const payload: SavedTemplate = { name, pageSize, orientation, elements, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus('Saved locally');
  }

  return (
    <div className={`builder-page ${!leftOpen ? 'left-collapsed' : ''} ${!rightOpen ? 'right-collapsed' : ''}`}>
      <header className="builder-topbar">
        <button className="icon-text compact-action" onClick={() => onNavigate('dashboard')}><ArrowLeft size={17}/>Back</button>
        <div className="template-title">
          <input aria-label="Template name" value={name} onChange={(event) => { setName(event.target.value); setStatus('Unsaved changes'); }}/>
          <span>{status} • {pageSize} {orientation.toLowerCase()}</span>
        </div>
        <div className="builder-actions">
          <button className="secondary"><Eye size={16}/><span>Preview</span></button>
          <button className="secondary" onClick={saveTemplate}><Save size={16}/><span>Save</span></button>
          <button className="primary" onClick={() => onNavigate('generate')}>Generate</button>
        </div>
      </header>

      {tableModalOpen && <TableCreateModal sources={dataState.sources} activeSourceId={dataState.activeSourceId} onCancel={() => setTableModalOpen(false)} onCreate={addTableElement}/>}

      <div className="builder-grid">
        <aside className="builder-left">
          <button className="panel-collapse left" title="Collapse elements panel" onClick={() => setLeftOpen(false)}><ChevronLeft size={15}/></button>
          <div className="section-title"><span>Elements</span><small>Click to add</small></div>
          <div className="tool-grid">
            {tools.map(({ label, type, icon: Icon }) => (
              <button key={label} className="tool-card" onClick={() => addElement(type)} title={`Add ${label}`}><Icon size={19}/><span>{label}</span></button>
            ))}
          </div>
          <div className="section-title document-tree"><span>Document</span></div>
          <div className="tree-row selected"><ScanLine size={16}/>Page 1 <small>{pageSize}</small></div>
          <div className="element-tree">
            {elements.map((item, index) => <button key={item.id} className={item.id === selectedId ? 'element-row active' : 'element-row'} onClick={() => setSelectedId(item.id)}><span>{index + 1}</span>{labelFor(item.type)}</button>)}
          </div>
        </aside>
        {!leftOpen && <button className="panel-expand expand-left" title="Open elements panel" onClick={() => setLeftOpen(true)}><ChevronRight size={16}/></button>}

        <section className="canvas-stage" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <div className="canvas-toolbar">
            <button title="Select"><MousePointer2 size={16}/></button><span className="separator"/>
            <button title="Zoom out" onClick={() => setZoom(Math.max(45, zoom - 10))}><ZoomOut size={16}/></button>
            <strong>{zoom}%</strong>
            <button title="Zoom in" onClick={() => setZoom(Math.min(160, zoom + 10))}><ZoomIn size={16}/></button>
            <button onClick={() => setZoom(92)}>Fit</button>
          </div>
          <div className="page-wrap">
            <div className={`document-page ${pageSize.toLowerCase()} ${orientation.toLowerCase()}`} style={{ transform: `scale(${zoom / 100})` }} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
              <div className="page-safe-guide" />
              {elements.length === 0 && <div className="page-empty"><span>{pageSize} DOCUMENT</span><strong>Start building your template</strong><small>Click an element from the left panel. You can then move, resize and edit it.</small></div>}
              {elements.map((item) => (
                <CanvasElement key={item.id} item={item} selected={item.id === selectedId} zoom={zoom} record={record} source={source} sources={dataState.sources} onSelect={() => setSelectedId(item.id)} onChange={(patch) => { setElements((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry)); setStatus('Unsaved changes'); }}/>
              ))}
            </div>
          </div>
        </section>

        {!rightOpen && <button className="panel-expand expand-right" title="Open inspector" onClick={() => setRightOpen(true)}><ChevronLeft size={16}/></button>}
        <aside className="builder-right">
          <button className="panel-collapse right" title="Collapse inspector" onClick={() => setRightOpen(false)}><ChevronRight size={15}/></button>
          <div className="inspector-tabs">
            {(['properties', 'binding', 'formatting', 'conditions'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'binding' ? 'Dynamic Field' : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <Inspector tab={tab} selected={selected} source={source} record={record} dataState={dataState} onDataState={setDataState} pageSize={pageSize} orientation={orientation} onPageSize={setPageSize} onOrientation={setOrientation} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected}/>
        </aside>
      </div>
    </div>
  );
}

function CanvasElement({ item, selected, zoom, record, source, sources, onSelect, onChange }: { item: BuilderElement; selected: boolean; zoom: number; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; onSelect: () => void; onChange: (patch: Partial<BuilderElement>) => void }) {
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; width: number; height: number } | null>(null);
  const scale = zoom / 100;

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.resize === 'true') return;
    event.stopPropagation(); onSelect();
    drag.current = { sx: event.clientX, sy: event.clientY, x: item.x, y: item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (resize.current) {
      const dx = (event.clientX - resize.current.sx) / scale;
      const dy = (event.clientY - resize.current.sy) / scale;
      onChange({ width: Math.max(30, resize.current.width + dx), height: Math.max(item.type === 'divider' ? 4 : 20, resize.current.height + dy) });
      return;
    }
    if (!drag.current) return;
    const dx = (event.clientX - drag.current.sx) / scale;
    const dy = (event.clientY - drag.current.sy) / scale;
    onChange({ x: Math.max(0, drag.current.x + dx), y: Math.max(0, drag.current.y + dy) });
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null; resize.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>) {
    event.stopPropagation(); onSelect();
    resize.current = { sx: event.clientX, sy: event.clientY, width: item.width, height: item.height };
    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
  }

  return <div className={`canvas-element ${selected ? 'selected' : ''} element-${item.type}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height, color: item.color, background: item.type === 'shape' ? item.fill : undefined, fontSize: item.fontSize, textAlign: item.textAlign }} onPointerDown={startDrag} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <ElementContent item={item} record={record} source={source} sources={sources} onElementSelect={onSelect} onTableChange={(table) => onChange({ table })}/>
    {selected && <><span className="resize-handle" data-resize="true" onPointerDown={startResize}/><span className="selection-label">{labelFor(item.type)}</span></>}
  </div>;
}

function ElementContent({ item, record, source, sources, onElementSelect, onTableChange }: { item: BuilderElement; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; onElementSelect: () => void; onTableChange: (table: TableDefinition) => void }) {
  const bound = item.binding ? valueForField(record, item.binding) : undefined;
  const rendered = item.binding && bound !== undefined ? displayValue(bound) : item.text;
  if (item.type === 'image' || item.type === 'signature') return <ImageBackedContent item={item} bound={bound}/>;
  if (item.type === 'table' && item.table) {
    const tableSource = sources.find((candidate) => candidate.id === item.table?.binding?.sourceId) ?? source;
    return <TableCanvas table={item.table} record={record} source={tableSource} documentSource={source} onChange={(table) => { onElementSelect(); onTableChange(table); }}/>;
  }
  if (item.type === 'table') return <div className="db-table-empty-placeholder">Table schema missing</div>;
  if (item.type === 'qr') return <><QrCode size={52}/><small>{rendered}</small></>;
  if (item.type === 'barcode') return <><Barcode size={72}/><small>{rendered}</small></>;
  if (item.type === 'divider') return <span className="divider-line"/>;
  if (item.type === 'shape') return null;
  return <span className="text-content">{rendered}</span>;
}

function ImageBackedContent({ item, bound }: { item: BuilderElement; bound: unknown }) {
  const [assetUrl, setAssetUrl] = useState('');
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    if (!item.imageAssetId) { setAssetUrl(''); return; }
    void loadImageAsset(item.imageAssetId).then((blob) => {
      if (!blob || cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setAssetUrl(objectUrl);
    }).catch(() => setAssetUrl(''));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.imageAssetId]);

  const boundSrc = typeof bound === 'string' && isImageSource(bound) ? bound : '';
  const manualSrc = item.imageSource && isImageSource(item.imageSource) ? item.imageSource : '';
  const src = boundSrc || assetUrl || manualSrc;
  if (src) return <img className="bound-image" src={src} alt={item.type === 'signature' ? 'Signature' : 'Image'} style={{ objectFit: item.imageFit ?? 'contain' }}/>;
  const Icon = item.type === 'signature' ? Signature : Image;
  return <><Icon size={item.type === 'signature' ? 36 : 26}/><span>{item.type === 'signature' ? 'Signature image' : 'Image'}</span></>;
}

function isImageSource(value: string) {
  return /^data:image\//i.test(value.trim()) || /^https?:\/\//i.test(value.trim()) || /^blob:/i.test(value.trim());
}

function Inspector({ tab, selected, source, record, dataState, onDataState, pageSize, orientation, onPageSize, onOrientation, onUpdate, onDelete, onDuplicate }: {
  tab: InspectorTab; selected: BuilderElement | null; source: ReturnType<typeof activeSource>; record: ReturnType<typeof activeRecord>; dataState: BuilderDataState; onDataState: (state: BuilderDataState) => void; pageSize: 'A4' | 'Letter'; orientation: 'Portrait' | 'Landscape';
  onPageSize: (value: 'A4' | 'Letter') => void; onOrientation: (value: 'Portrait' | 'Landscape') => void;
  onUpdate: (patch: Partial<BuilderElement>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  if (tab === 'binding') return <div className="inspector-body"><h3>Dynamic Field</h3><p>{selected ? (source ? `Bind this element to ${source.name}.` : 'Import a Data Source first, then choose a field.') : 'Select an element to configure data binding.'}</p>{source && <label>Preview record<RecordPicker count={source.records.length} value={dataState.activeRecordIndex} disabled={source.records.length === 0} compactLabel="Record" onChange={(index) => { const next = { ...dataState, activeRecordIndex: index }; onDataState(next); saveDataSelection(next); }}/></label>}<label>Source field<select disabled={!selected || !source} value={selected?.binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value || undefined })}><option value="">No binding</option>{source?.fields.map((field) => <option key={field.name} value={field.name}>{field.label} ({field.type})</option>)}</select></label>{selected?.binding && <><div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{displayValue(valueForField(record, selected.binding)) || 'Empty / null'}</strong></div></>}</div>;
  if (tab === 'formatting') return <div className="inspector-body"><h3>Formatting</h3>{!selected ? <p>Select an element to edit document-safe formatting.</p> : <><label>Font size<input type="number" min="8" max="96" value={selected.fontSize} onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 12 })}/></label><label>Text color<input type="color" value={selected.color} onChange={(e) => onUpdate({ color: e.target.value })}/></label>{selected.type === 'shape' && <label>Fill<input type="color" value={selected.fill} onChange={(e) => onUpdate({ fill: e.target.value })}/></label>}<div className="align-actions"><button className={selected.textAlign === 'left' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'left' })}><AlignLeft size={16}/></button><button className={selected.textAlign === 'center' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter size={16}/></button><button className={selected.textAlign === 'right' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight size={16}/></button></div></>}</div>;
  if (tab === 'conditions') return <div className="inspector-body"><h3>Conditions</h3><p>Condition rules are planned for a later phase. The selected element remains schema-ready for them.</p><button className="secondary" disabled={!selected}>Add condition</button></div>;
  return <div className="inspector-body"><h3>Properties</h3>{selected ? <><div className="property-grid"><label>X<input type="number" value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label><label>Width<input type="number" min="20" value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label><label>Height<input type="number" min="4" value={Math.round(selected.height)} onChange={(e) => onUpdate({ height: Math.max(4, Number(e.target.value) || 4) })}/></label></div>{selected.type === 'table' && selected.table ? <TableProperties table={selected.table} sources={dataState.sources} activeSourceId={dataState.activeSourceId} onUpdate={(table) => onUpdate({ table })}/> : (selected.type === 'image' || selected.type === 'signature') ? <ImageProperties selected={selected} onUpdate={onUpdate}/> : selected.type !== 'shape' && selected.type !== 'divider' ? <label>Content<textarea value={selected.text} onChange={(e) => onUpdate({ text: e.target.value })}/></label> : null}<div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></> : <><p>Page settings. Select an element to edit element properties.</p><label>Page size<select value={pageSize} onChange={(e) => onPageSize(e.target.value as 'A4'|'Letter')}><option>A4</option><option>Letter</option></select></label><label>Orientation<select value={orientation} onChange={(e) => onOrientation(e.target.value as 'Portrait'|'Landscape')}><option>Portrait</option><option>Landscape</option></select></label></>}</div>;
}


function TableProperties({ table, sources, activeSourceId, onUpdate }: { table: TableDefinition; sources: BuilderDataState['sources']; activeSourceId?: string; onUpdate: (table: TableDefinition) => void }) {
  const cell = findTableCell(table, table.selectedCellId);
  const cellLocation = findTableCellLocation(table, table.selectedCellId);
  const selectedColumn = cellLocation ? table.columns[Math.min(cellLocation.columnIndex, table.columns.length - 1)] ?? null : null;
  const rowStructureLocked = Boolean(table.mode === 'dynamic' && cellLocation?.section === 'bodyRows');
  const mergedColumns = tableHasMergedColumns(table);
  const bindingSource = table.mode === 'dynamic'
    ? (sources.find((item) => item.id === table.binding?.sourceId) ?? null)
    : (sources.find((item) => item.id === activeSourceId) ?? sources[0] ?? null);
  const patchCell = (patch: Parameters<typeof updateTableCell>[2]) => {
    if (!cell) return;
    onUpdate(updateTableCell(table, cell.id, patch));
  };
  return <div className="table-properties">
    <div className="table-summary"><strong>{table.name}</strong><small>{table.mode === 'dynamic' ? `Dynamic • ${table.binding?.repeatSource || 'items'}` : `Custom • ${table.rows.length} rows × ${table.columns.length} cols`}</small></div>
    <label>Table name<input value={table.name} onChange={(e) => onUpdate({ ...table, name: e.target.value })}/></label>
    {table.mode === 'dynamic' && (() => {
      const selectedSource = sources.find((item) => item.id === table.binding?.sourceId) ?? null;
      return <>
      <label>Repeat source<select value={table.binding?.sourceId ?? ''} onChange={(e) => {
        const nextSource = sources.find((item) => item.id === e.target.value) ?? null;
        onUpdate({ ...table, binding: { ...table.binding!, sourceId: nextSource?.id, repeatSource: nextSource?.name ?? '', rowKey: recommendedRowKey(nextSource?.fields ?? []) || undefined } });
      }}><option value="">Select Data Source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}</select></label>
      <label>Row key<select value={table.binding?.rowKey ?? ''} disabled={!selectedSource} onChange={(e) => onUpdate({ ...table, binding: { ...table.binding!, rowKey: e.target.value || undefined } })}><option value="">Index fallback</option>{selectedSource?.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
      {selectedSource && (() => {
        const parentKeys = table.binding?.parentKeys?.length ? table.binding.parentKeys : (table.binding?.parentKey ? [table.binding.parentKey] : []);
        const rowKeys = table.binding?.rowKeys?.length ? table.binding.rowKeys : (table.binding?.rowKey ? [table.binding.rowKey] : []);
        const updateParentKey = (index: number, value: string) => {
          const next = [...(parentKeys.length ? parentKeys : [''])]; next[index] = value;
          const clean = next.filter(Boolean);
          onUpdate({ ...table, binding: { ...table.binding!, parentKey: clean[0], parentKeys: clean } });
        };
        const updateRowKey = (index: number, value: string) => {
          const next = [...(rowKeys.length ? rowKeys : [''])]; next[index] = value;
          const clean = next.filter(Boolean);
          onUpdate({ ...table, binding: { ...table.binding!, rowKey: clean[0], rowKeys: clean } });
        };
        return <div className="table-relation-editor">
          <div className="section-title"><span>Document / Row Identity</span><small>Same Data Source</small></div>
          <label>Parent / Document ID<select value={parentKeys[0] ?? ''} onChange={(e) => updateParentKey(0, e.target.value)}><option value="">Select parent field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
          {parentKeys.slice(1).map((key, i) => <label key={`parent-extra-${i}`}>Parent key {i + 2}<select value={key} onChange={(e) => updateParentKey(i + 1, e.target.value)}><option value="">Select field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>)}
          <button type="button" className="secondary compact" onClick={() => onUpdate({ ...table, binding: { ...table.binding!, parentKeys: [...parentKeys, ''] } })}>+ Parent key field</button>
          <label>Child / Row ID<select value={rowKeys[0] ?? ''} onChange={(e) => updateRowKey(0, e.target.value)}><option value="">Index fallback</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
          {rowKeys.slice(1).map((key, i) => <label key={`row-extra-${i}`}>Row key {i + 2}<select value={key} onChange={(e) => updateRowKey(i + 1, e.target.value)}><option value="">Select field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>)}
          <button type="button" className="secondary compact" onClick={() => onUpdate({ ...table, binding: { ...table.binding!, rowKeys: [...rowKeys, ''] } })}>+ Row key field</button>
          <div className="table-schema-note"><span>Grouping</span><code>{(parentKeys.filter(Boolean).join(' + ') || recommendedParentKey(selectedSource.fields) || '?')} → rows; {(rowKeys.filter(Boolean).join(' + ') || recommendedRowKey(selectedSource.fields) || 'index')} → row identity</code></div>
        </div>;
      })()}
      <label className="check-row"><input type="checkbox" checked={table.pagination.repeatHeader} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, repeatHeader: e.target.checked } })}/>Repeat header on each page</label>
      <button className="secondary table-add-summary" onClick={() => onUpdate(addCustomSummaryRow(table))}>+ Add custom total / summary row</button>
      </>;
    })()}
    <div className="table-schema-note"><span>Table ID</span><code>{table.id}</code></div>
    {cellLocation && <div className="table-structure-editor">
      <section className="table-inspector-card">
        <div className="table-inspector-card-head">
          <span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">☷</span><span>Row Structure</span></span>
          <small className="table-inspector-badge">{cellLocation.row.kind}</small>
        </div>
        <details className="table-tech-details"><summary>Technical ID</summary><code title={cellLocation.row.id}>{cellLocation.row.id}</code></details>
        <div className="property-grid"><label>Height<input type="number" min="18" max="400" disabled={cellLocation.row.autoHeight} value={cellLocation.row.height} onChange={(e) => onUpdate(updateTableRow(table, cellLocation.row.id, { height: Math.max(18, Number(e.target.value) || 30) }))}/></label><label className="check-row table-auto-height"><input type="checkbox" checked={cellLocation.row.autoHeight} onChange={(e) => onUpdate(updateTableRow(table, cellLocation.row.id, { autoHeight: e.target.checked }))}/>Auto height</label></div>
        <label className="check-row"><input type="checkbox" checked={cellLocation.row.keepTogether} onChange={(e) => onUpdate(updateTableRow(table, cellLocation.row.id, { keepTogether: e.target.checked }))}/>Keep row together</label>
        {cellLocation.row.kind === 'header' && <label className="check-row"><input type="checkbox" checked={cellLocation.row.repeatOnEveryPage} onChange={(e) => onUpdate(updateTableRow(table, cellLocation.row.id, { repeatOnEveryPage: e.target.checked }))}/>Repeat this header row</label>}
        {rowStructureLocked ? <div className="table-cell-help">Dynamic body rows are data-driven. Edit columns or add custom summary rows instead of manually adding body rows.</div> : <div className="table-structure-actions compact-actions">
          <button type="button" className="secondary compact" title="Add row above" onClick={() => onUpdate(addTableRow(table, cellLocation.cell.id, 'above'))}><span aria-hidden="true">＋↑</span><span>Above</span></button>
          <button type="button" className="secondary compact" title="Add row below" onClick={() => onUpdate(addTableRow(table, cellLocation.cell.id, 'below'))}><span aria-hidden="true">＋↓</span><span>Below</span></button>
          <button type="button" className="secondary compact" title="Duplicate row" onClick={() => onUpdate(duplicateTableRow(table, cellLocation.cell.id))}><span aria-hidden="true">⧉</span><span>Duplicate</span></button>
          <button type="button" className="secondary compact" title="Move row up" onClick={() => onUpdate(moveTableRow(table, cellLocation.cell.id, -1))}><span aria-hidden="true">↑</span><span>Move</span></button>
          <button type="button" className="secondary compact" title="Move row down" onClick={() => onUpdate(moveTableRow(table, cellLocation.cell.id, 1))}><span aria-hidden="true">↓</span><span>Move</span></button>
          <button type="button" className="secondary compact danger" title="Delete row" onClick={() => onUpdate(deleteTableRow(table, cellLocation.cell.id))}><span aria-hidden="true">×</span><span>Delete</span></button>
        </div>}
      </section>

      {selectedColumn && <section className="table-inspector-card">
        <div className="table-inspector-card-head">
          <span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▥</span><span>Column Structure</span></span>
          <small className="table-inspector-badge">{cellLocation.columnIndex + 1} / {table.columns.length}</small>
        </div>
        <details className="table-tech-details"><summary>Technical ID</summary><code title={selectedColumn.id}>{selectedColumn.id}</code></details>
        <label>Header / Label<input value={selectedColumn.label} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { label: e.target.value }))}/></label>
        <div className="property-grid"><label>Width<input type="number" min="30" max="1000" value={selectedColumn.width} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { width: Math.max(30, Number(e.target.value) || 120) }))}/></label><label>Min width<input type="number" min="20" max="1000" value={selectedColumn.minWidth} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { minWidth: Math.max(20, Number(e.target.value) || 40) }))}/></label></div>
        <label>Alignment<select value={selectedColumn.align} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { align: e.target.value as 'left'|'center'|'right' }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <div className="table-structure-actions compact-actions">
          <button type="button" className="secondary compact" title="Add column left" onClick={() => onUpdate(addTableColumn(table, cellLocation.cell.id, 'left'))}><span aria-hidden="true">＋←</span><span>Left</span></button>
          <button type="button" className="secondary compact" title="Add column right" onClick={() => onUpdate(addTableColumn(table, cellLocation.cell.id, 'right'))}><span aria-hidden="true">＋→</span><span>Right</span></button>
          <button type="button" className="secondary compact" title="Duplicate column" onClick={() => onUpdate(addTableColumn(table, cellLocation.cell.id, 'right', true))}><span aria-hidden="true">⧉</span><span>Duplicate</span></button>
          <button type="button" className="secondary compact" disabled={mergedColumns} title={mergedColumns ? 'Split merged cells before reordering columns.' : 'Move column left'} onClick={() => onUpdate(moveTableColumn(table, cellLocation.cell.id, -1))}><span aria-hidden="true">←</span><span>Move</span></button>
          <button type="button" className="secondary compact" disabled={mergedColumns} title={mergedColumns ? 'Split merged cells before reordering columns.' : 'Move column right'} onClick={() => onUpdate(moveTableColumn(table, cellLocation.cell.id, 1))}><span aria-hidden="true">→</span><span>Move</span></button>
          <button type="button" className="secondary compact danger" disabled={table.columns.length <= 1} title="Delete column" onClick={() => onUpdate(deleteTableColumn(table, cellLocation.cell.id))}><span aria-hidden="true">×</span><span>Delete</span></button>
        </div>
        {mergedColumns && <div className="table-cell-help">Column move is disabled while colSpan merges exist. Add/delete remains span-aware.</div>}
      </section>}
    </div>}
    {cell ? <div className="table-cell-editor">
      <div className="table-inspector-card-head selected-cell-head"><span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▣</span><span>Selected Cell</span></span><small className="table-inspector-badge">{cell.type}</small></div>
      <details className="table-tech-details"><summary>Technical ID</summary><code title={cell.id}>{cell.id}</code></details>
      <label>Cell type<select value={cell.type} onChange={(e) => { const nextType = e.target.value as TableCellType; patchCell({ type: nextType, ...(nextType === 'image' && !cell.imageFit ? { imageFit: 'cover' as const } : {}) }); }}><option value="text">Text</option><option value="image">Image</option><option value="qr">QR Code</option><option value="barcode">Barcode</option></select></label>
      {cell.type === 'text' ? <>
        <label>Content<textarea value={cell.content} onChange={(e) => patchCell({ content: e.target.value })}/></label>
        <TableCellBindingPicker source={bindingSource} value={cell.binding} onChange={(binding) => patchCell({ binding })}/>
      </> : cell.type === 'image' ? <TableCellImageProperties cell={cell} source={bindingSource} onPatch={patchCell}/> : <>
        <label>{cell.type === 'qr' ? 'Custom QR value' : 'Custom barcode value'}<input value={cell.content} placeholder={cell.type === 'qr' ? 'https://... or any text' : 'SKU-001 / 1234567890'} onChange={(e) => patchCell({ content: e.target.value })}/></label>
        <TableCellBindingPicker source={bindingSource} value={cell.binding} onChange={(binding) => patchCell({ binding })}/>
        <p className="table-cell-help">Field binding overrides the custom value during preview/generation.</p>
      </>}
      <div className="property-grid"><label>Row span<input type="number" min="1" max="50" value={cell.rowSpan} onChange={(e) => patchCell({ rowSpan: Math.max(1, Number(e.target.value) || 1) })}/></label><label>Col span<input type="number" min="1" max={Math.max(1, table.columns.length)} value={cell.colSpan} onChange={(e) => patchCell({ colSpan: Math.max(1, Math.min(table.columns.length, Number(e.target.value) || 1)) })}/></label></div>
      <div className="property-grid"><label>Padding<input type="number" min="0" max="40" value={cell.style.padding} onChange={(e) => patchCell({ style: { ...cell.style, padding: Math.max(0, Number(e.target.value) || 0) } })}/></label><label>Font size<input type="number" min="8" max="72" value={cell.style.fontSize} onChange={(e) => patchCell({ style: { ...cell.style, fontSize: Math.max(8, Number(e.target.value) || 11) } })}/></label></div>
      <label>Alignment<select value={cell.style.align} onChange={(e) => patchCell({ style: { ...cell.style, align: e.target.value as 'left'|'center'|'right' } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Background<input type="color" value={cell.style.background} onChange={(e) => patchCell({ style: { ...cell.style, background: e.target.value } })}/></label>
    </div> : <p className="table-cell-hint">Click a table cell on the canvas to edit its content, binding, type, row span and column span.</p>}
  </div>;
}

function TableCellBindingPicker({ source, value, onChange }: { source: BuilderDataState['sources'][number] | null; value?: string; onChange: (value?: string) => void }) {
  return <label>Field binding<select disabled={!source} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
    <option value="">{source ? 'No binding / use custom value' : 'Import/select a Data Source first'}</option>
    {source?.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.type})</option>)}
  </select></label>;
}

function TableCellImageProperties({ cell, source, onPatch }: { cell: NonNullable<ReturnType<typeof findTableCell>>; source: BuilderDataState['sources'][number] | null; onPatch: (patch: Parameters<typeof updateTableCell>[2]) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const id = await saveImageAsset(file);
      onPatch({ imageAssetId: id, imageSource: undefined });
      setMessage(`${file.name} selected`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load image.');
    }
  }

  function removeImage() {
    onPatch({ imageAssetId: undefined, imageSource: undefined });
    setMessage('Image removed');
  }

  return <div className="table-cell-media-editor">
    <TableCellBindingPicker source={source} value={cell.binding} onChange={(binding) => onPatch({ binding })}/>
    <div className="table-cell-help">Field binding can contain an image URL or data:image Base64 value. Binding overrides the manual image.</div>
    <input ref={inputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={upload}/>
    <div className="image-action-row">
      <button className="secondary" type="button" onClick={() => inputRef.current?.click()}>{cell.imageAssetId || cell.imageSource ? 'Replace image' : 'Choose image file'}</button>
      <button className="secondary" type="button" onClick={removeImage} disabled={!cell.imageAssetId && !cell.imageSource}>Remove</button>
    </div>
    <label>Image URL / data URL<input value={cell.imageSource ?? ''} placeholder="https://... or data:image/..." onChange={(e) => onPatch({ imageSource: e.target.value || undefined, imageAssetId: e.target.value ? undefined : cell.imageAssetId })}/></label>
    <label>Fit<select value={cell.imageFit ?? 'cover'} onChange={(e) => onPatch({ imageFit: e.target.value as 'contain'|'cover'|'fill' })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></label>
    {message && <div className="image-message">{message}</div>}
  </div>;
}


function ImageProperties({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const id = await saveImageAsset(file);
      onUpdate({ imageAssetId: id, imageSource: undefined });
      setMessage(`${file.name} selected`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load image.');
    }
  }

  function removeImage() {
    onUpdate({ imageAssetId: undefined, imageSource: undefined });
    setMessage('Image removed');
  }

  return <div className="image-properties">
    <input ref={inputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={upload}/>
    <div className="image-action-row">
      <button className="secondary" type="button" onClick={() => inputRef.current?.click()}>{selected.imageAssetId || selected.imageSource ? 'Replace image' : 'Upload image'}</button>
      <button className="secondary" type="button" onClick={removeImage} disabled={!selected.imageAssetId && !selected.imageSource}>Remove</button>
    </div>
    <label>Image URL / data URL<input type="text" placeholder="https://... or data:image/..." value={selected.imageSource ?? ''} onChange={(e) => onUpdate({ imageSource: e.target.value || undefined, imageAssetId: e.target.value ? undefined : selected.imageAssetId })}/></label>
    <label>Fit<select value={selected.imageFit ?? 'contain'} onChange={(e) => onUpdate({ imageFit: e.target.value as 'contain'|'cover'|'fill' })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></label>
    <p className="image-help">{selected.type === 'signature' ? 'Use a PNG/WebP with transparent background for the cleanest signature.' : 'Upload a local image or use an image URL. Dynamic Field binding overrides this manual image during preview.'}</p>
    {message && <div className="image-message">{message}</div>}
  </div>;
}

function defaultElement(type: ToolType, index: number): BuilderElement {
  const position = 70 + (index % 6) * 18;
  const common = { id: crypto.randomUUID(), type, x: position, y: position, fontSize: 18, textAlign: 'left' as TextAlign, fill: '#eaf1ff', color: '#18212f' };
  switch (type) {
    case 'text': return { ...common, width: 260, height: 44, text: 'Double-click style text' };
    case 'image': return { ...common, width: 180, height: 130, text: '', imageFit: 'contain' };
    case 'table': return { ...common, width: 430, height: 150, text: 'Table' };
    case 'shape': return { ...common, width: 180, height: 100, text: '' };
    case 'qr': return { ...common, width: 110, height: 120, text: 'QR value' };
    case 'barcode': return { ...common, width: 190, height: 90, text: '1234567890' };
    case 'signature': return { ...common, width: 190, height: 80, text: '', imageFit: 'contain' };
    case 'divider': return { ...common, width: 360, height: 12, text: '' };
  }
}

function labelFor(type: ToolType) {
  return tools.find((tool) => tool.type === type)?.label ?? type;
}
