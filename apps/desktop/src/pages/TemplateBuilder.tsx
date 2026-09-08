import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Barcode, ChevronLeft, ChevronRight, Circle,
  Copy, Eye, Image, Minus, MousePointer2, QrCode, Save, ScanLine, Signature, Table2, Trash2,
  Type, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';

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

  function addElement(type: ToolType) {
    const count = elements.length;
    const defaults = defaultElement(type, count);
    setElements((current) => [...current, defaults]);
    setSelectedId(defaults.id);
    setTab(type === 'text' ? 'formatting' : 'properties');
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
                <CanvasElement key={item.id} item={item} selected={item.id === selectedId} zoom={zoom} onSelect={() => setSelectedId(item.id)} onChange={(patch) => { setElements((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry)); setStatus('Unsaved changes'); }}/>
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
          <Inspector tab={tab} selected={selected} pageSize={pageSize} orientation={orientation} onPageSize={setPageSize} onOrientation={setOrientation} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected}/>
        </aside>
      </div>
    </div>
  );
}

function CanvasElement({ item, selected, zoom, onSelect, onChange }: { item: BuilderElement; selected: boolean; zoom: number; onSelect: () => void; onChange: (patch: Partial<BuilderElement>) => void }) {
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
    <ElementContent item={item}/>
    {selected && <><span className="resize-handle" data-resize="true" onPointerDown={startResize}/><span className="selection-label">{labelFor(item.type)}</span></>}
  </div>;
}

function ElementContent({ item }: { item: BuilderElement }) {
  if (item.type === 'image') return <><Image size={26}/><span>{item.text}</span></>;
  if (item.type === 'table') return <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>Sample item</td><td>1</td><td>0.00</td></tr><tr><td>Another item</td><td>2</td><td>0.00</td></tr></tbody></table>;
  if (item.type === 'qr') return <><QrCode size={52}/><small>{item.text}</small></>;
  if (item.type === 'barcode') return <><Barcode size={72}/><small>{item.text}</small></>;
  if (item.type === 'signature') return <><Signature size={36}/><span>{item.text}</span></>;
  if (item.type === 'divider') return <span className="divider-line"/>;
  if (item.type === 'shape') return null;
  return <span className="text-content">{item.text}</span>;
}

function Inspector({ tab, selected, pageSize, orientation, onPageSize, onOrientation, onUpdate, onDelete, onDuplicate }: {
  tab: InspectorTab; selected: BuilderElement | null; pageSize: 'A4' | 'Letter'; orientation: 'Portrait' | 'Landscape';
  onPageSize: (value: 'A4' | 'Letter') => void; onOrientation: (value: 'Portrait' | 'Landscape') => void;
  onUpdate: (patch: Partial<BuilderElement>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  if (tab === 'binding') return <div className="inspector-body"><h3>Dynamic Field</h3><p>{selected ? 'Bind this element to Excel, CSV or API data.' : 'Select an element to configure data binding.'}</p><label>Source field<input disabled={!selected} value={selected?.binding ?? ''} placeholder="e.g. customer.name" onChange={(e) => onUpdate({ binding: e.target.value })}/></label>{selected?.binding && <div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div>}</div>;
  if (tab === 'formatting') return <div className="inspector-body"><h3>Formatting</h3>{!selected ? <p>Select an element to edit document-safe formatting.</p> : <><label>Font size<input type="number" min="8" max="96" value={selected.fontSize} onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 12 })}/></label><label>Text color<input type="color" value={selected.color} onChange={(e) => onUpdate({ color: e.target.value })}/></label>{selected.type === 'shape' && <label>Fill<input type="color" value={selected.fill} onChange={(e) => onUpdate({ fill: e.target.value })}/></label>}<div className="align-actions"><button className={selected.textAlign === 'left' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'left' })}><AlignLeft size={16}/></button><button className={selected.textAlign === 'center' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter size={16}/></button><button className={selected.textAlign === 'right' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight size={16}/></button></div></>}</div>;
  if (tab === 'conditions') return <div className="inspector-body"><h3>Conditions</h3><p>Condition rules will be fully wired in DB-3. The selected element remains schema-ready for them.</p><button className="secondary" disabled={!selected}>Add condition</button></div>;
  return <div className="inspector-body"><h3>Properties</h3>{selected ? <><div className="property-grid"><label>X<input type="number" value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label><label>Width<input type="number" min="20" value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label><label>Height<input type="number" min="4" value={Math.round(selected.height)} onChange={(e) => onUpdate({ height: Math.max(4, Number(e.target.value) || 4) })}/></label></div>{selected.type !== 'shape' && selected.type !== 'divider' && <label>Content<textarea value={selected.text} onChange={(e) => onUpdate({ text: e.target.value })}/></label>}<div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></> : <><p>Page settings. Select an element to edit element properties.</p><label>Page size<select value={pageSize} onChange={(e) => onPageSize(e.target.value as 'A4'|'Letter')}><option>A4</option><option>Letter</option></select></label><label>Orientation<select value={orientation} onChange={(e) => onOrientation(e.target.value as 'Portrait'|'Landscape')}><option>Portrait</option><option>Landscape</option></select></label></>}</div>;
}

function defaultElement(type: ToolType, index: number): BuilderElement {
  const position = 70 + (index % 6) * 18;
  const common = { id: crypto.randomUUID(), type, x: position, y: position, fontSize: 18, textAlign: 'left' as TextAlign, fill: '#eaf1ff', color: '#18212f' };
  switch (type) {
    case 'text': return { ...common, width: 260, height: 44, text: 'Double-click style text' };
    case 'image': return { ...common, width: 180, height: 130, text: 'Image placeholder' };
    case 'table': return { ...common, width: 430, height: 150, text: 'Table' };
    case 'shape': return { ...common, width: 180, height: 100, text: '' };
    case 'qr': return { ...common, width: 110, height: 120, text: 'QR value' };
    case 'barcode': return { ...common, width: 190, height: 90, text: '1234567890' };
    case 'signature': return { ...common, width: 190, height: 80, text: 'Signature' };
    case 'divider': return { ...common, width: 360, height: 12, text: '' };
  }
}

function labelFor(type: ToolType) {
  return tools.find((tool) => tool.type === type)?.label ?? type;
}
