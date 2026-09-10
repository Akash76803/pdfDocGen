import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Barcode, ChevronLeft, ChevronRight, Circle,
  Copy, Eye, Image, Minus, MousePointer2, QrCode, Save, Signature, Table2, Trash2,
  Type, ZoomIn, ZoomOut, Plus, FileText, Undo2, Redo2,
} from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { RecordPicker } from '../components/RecordPicker.tsx';
import { DATA_EVENT, activeRecord, activeSource, displayValue, loadDataState, loadDataStateAsync, saveDataSelection, valueForField, type BuilderDataState } from '../lib/dataSourceStore.ts';
import { loadImageAsset, saveImageAsset } from '../lib/imageAssetStore.ts';
import { TableCreateModal } from '../components/TableCreateModal.tsx';
import { TableCanvas } from '../components/TableCanvas.tsx';
import { defaultPageSettings, contentBoundsPx, mmToPx, mmToUnit, pagePixelSize, pageSizeMm, unitToMm, type PageSettings, type PagePreset, type PageOrientation, type PageUnit } from '../lib/pageModel.ts';
import { addCustomSummaryRow, addTableColumn, addTableRow, deleteTableColumn, deleteTableRow, duplicateTableRow, findTableCell, findTableCellLocation, moveTableColumn, moveTableRow, recommendedParentKey, recommendedRowKey, tableHasMergedColumns, updateTableCell, equalizeTableColumnWidths, resetTableColumnAutoWidth, setTableColumnManualWidth, updateTableColumn, updateTableRow, formulaColumnReferences, summaryFieldOptions, summaryValueReferences, dynamicRows, paginateDynamicTable, type TableAggregateOperation, type TableDataFormat, type TableDataType, type TableDefinition, type TableCellType, type TableValueMode } from '../lib/tableModel.ts';

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

type BuilderPage = { id: string; name: string; settings: PageSettings; elements: BuilderElement[] };

type EditorSnapshot = { name: string; pages: BuilderPage[]; activePageId: string };

type SavedTemplate = {
  name: string;
  pages?: BuilderPage[];
  activePageId?: string;
  pageSize?: 'A4' | 'Letter';
  orientation?: 'Portrait' | 'Landscape';
  elements?: BuilderElement[];
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
  const initialPage: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings: defaultPageSettings(), elements: [] };
  const [pages, setPages] = useState<BuilderPage[]>([initialPage]);
  const [activePageId, setActivePageId] = useState(initialPage.id);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const pageSettings = activePage?.settings ?? defaultPageSettings();
  const elements = activePage?.elements ?? [];
  const setElementsRaw = (updater: BuilderElement[] | ((current: BuilderElement[]) => BuilderElement[])) => setPages((currentPages) => currentPages.map((page) => page.id !== activePageId ? page : { ...page, elements: typeof updater === 'function' ? updater(page.elements) : updater }));
  const setElements = (updater: BuilderElement[] | ((current: BuilderElement[]) => BuilderElement[])) => { recordHistory(); setElementsRaw(updater); };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState(0);
  const [status, setStatus] = useState('Draft');
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const historyGestureRef = useRef<EditorSnapshot | null>(null);
  const historyGestureDirtyRef = useRef(false);
  const pagesRef = useRef(pages);
  const activePageIdRef = useRef(activePageId);
  const nameRef = useRef(name);
  const [, setHistoryVersion] = useState(0);
  pagesRef.current = pages; activePageIdRef.current = activePageId; nameRef.current = name;

  const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => typeof structuredClone === 'function' ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot)) as EditorSnapshot;
  const currentSnapshot = (): EditorSnapshot => cloneSnapshot({ name: nameRef.current, pages: pagesRef.current, activePageId: activePageIdRef.current });
  const refreshHistoryUi = () => setHistoryVersion((value) => value + 1);
  const recordHistory = () => {
    if (historyGestureRef.current) { historyGestureDirtyRef.current = true; return; }
    undoStackRef.current.push(currentSnapshot());
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
    refreshHistoryUi();
  };
  const beginHistoryGesture = () => {
    if (historyGestureRef.current) return;
    historyGestureRef.current = currentSnapshot();
    historyGestureDirtyRef.current = false;
  };
  const endHistoryGesture = () => {
    const before = historyGestureRef.current;
    const dirty = historyGestureDirtyRef.current;
    historyGestureRef.current = null;
    historyGestureDirtyRef.current = false;
    if (!before || !dirty) return;
    undoStackRef.current.push(before);
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
    refreshHistoryUi();
  };
  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    const next = cloneSnapshot(snapshot);
    setName(next.name); setPages(next.pages); setActivePageId(next.activePageId); setSelectedId(null); setStatus('Unsaved changes');
  };
  const undo = () => {
    endHistoryGesture();
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(currentSnapshot());
    restoreSnapshot(previous); refreshHistoryUi();
  };
  const redo = () => {
    endHistoryGesture();
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(currentSnapshot());
    restoreSnapshot(next); refreshHistoryUi();
  };
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
      if ((Array.isArray(saved.pages) && saved.pages.length) || Array.isArray(saved.elements)) {
        setName(saved.name || 'Untitled Document');
        if (Array.isArray(saved.pages) && saved.pages.length) {
          setPages(saved.pages);
          setActivePageId(saved.activePageId && saved.pages.some((p) => p.id === saved.activePageId) ? saved.activePageId : saved.pages[0].id);
        } else {
          const legacy = defaultPageSettings(); legacy.preset = saved.pageSize || 'A4'; legacy.orientation = saved.orientation || 'Portrait';
          const migrated: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings: legacy, elements: saved.elements || [] };
          setPages([migrated]); setActivePageId(migrated.id);
        }
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (!command) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((key === 'y') || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
    const bounds = contentBoundsPx(pageSettings);
    const tableElement: BuilderElement = { ...defaults, x: bounds.x, y: bounds.y, table, width: bounds.width, height: table.mode === 'custom' ? Math.max(120, table.rows.length * 34) : 180 };
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

  function updatePageSettings(patch: Partial<PageSettings>) {
    recordHistory();
    setPages((current) => current.map((page) => {
      if (page.id !== activePageId) return page;
      const settings = { ...page.settings, ...patch };
      const geometryChanged = Boolean(
        patch.marginsMm || patch.preset || patch.orientation ||
        patch.customWidthMm != null || patch.customHeightMm != null
      );
      if (!geometryChanged) return { ...page, settings };
      const bounds = contentBoundsPx(settings);
      const nextElements = page.elements.map((element) => {
        if (element.type !== 'table') return element;
        return { ...element, x: bounds.x, width: bounds.width };
      });
      return { ...page, settings, elements: nextElements };
    }));
    setStatus('Unsaved changes');
  }

  function addPage() {
    recordHistory();
    const page: BuilderPage = { id: crypto.randomUUID(), name: `Page ${pages.length + 1}`, settings: { ...defaultPageSettings(), ...pageSettings, marginsMm: { ...pageSettings.marginsMm }, bleedMm: { ...pageSettings.bleedMm } }, elements: [] };
    setPages((current) => [...current, page]); setActivePageId(page.id); setSelectedId(null); setStatus('Unsaved changes');
  }
  function duplicatePage() { if (!activePage) return; recordHistory(); const page: BuilderPage = { ...activePage, id: crypto.randomUUID(), name: `${activePage.name} Copy`, settings: { ...activePage.settings, marginsMm: { ...activePage.settings.marginsMm }, bleedMm: { ...activePage.settings.bleedMm } }, elements: activePage.elements.map((e) => ({ ...e, id: crypto.randomUUID() })) }; setPages((c) => [...c, page]); setActivePageId(page.id); setSelectedId(null); setStatus('Unsaved changes'); }
  function deletePage() { if (pages.length <= 1) return; recordHistory(); const next = pages.filter((p) => p.id !== activePageId); setPages(next); setActivePageId(next[0].id); setSelectedId(null); setStatus('Unsaved changes'); }
  function movePage(direction: -1 | 1) { const index = pages.findIndex((p) => p.id === activePageId); const target = index + direction; if (index < 0 || target < 0 || target >= pages.length) return; recordHistory(); const next = [...pages]; [next[index], next[target]] = [next[target], next[index]]; setPages(next); setStatus('Unsaved changes'); }
  function renamePage(value: string) { recordHistory(); setPages((c) => c.map((p) => p.id === activePageId ? { ...p, name: value } : p)); setStatus('Unsaved changes'); }

  function saveTemplate() {
    const payload: SavedTemplate = { name, pages, activePageId, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus('Saved locally');
  }

  const contentBounds = contentBoundsPx(pageSettings);
  const virtualPageCounts = new Map<string, number>();
  for (const item of elements) {
    if (item.type !== 'table' || !item.table || item.table.mode !== 'dynamic' || item.table.pagination?.enabled === false) continue;
    const tableSource = dataState.sources.find((candidate) => candidate.id === item.table?.binding?.sourceId) ?? source;
    const runtimeRows = dynamicRows(item.table, record, tableSource, source);
    const firstPageHeight = Math.max(80, contentBounds.y + contentBounds.height - item.y);
    const continuationHeight = Math.max(80, contentBounds.height);
    virtualPageCounts.set(item.id, paginateDynamicTable(item.table, runtimeRows, firstPageHeight, continuationHeight).length);
  }
  const virtualPageCount = Math.max(1, ...virtualPageCounts.values());
  const previewPagePixels = pagePixelSize(pageSettings);
  useEffect(() => { setActivePreviewPageIndex((index) => Math.min(index, Math.max(0, virtualPageCount - 1))); }, [virtualPageCount, activePageId]);
  const focusPreviewPage = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, virtualPageCount - 1));
    setActivePreviewPageIndex(safeIndex);
    requestAnimationFrame(() => document.querySelector(`[data-virtual-page-index="${safeIndex}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const previewScale = zoom / 100;

  return (
    <div className={`builder-page ${!leftOpen ? 'left-collapsed' : ''} ${!rightOpen ? 'right-collapsed' : ''}`}>
      <header className="builder-topbar">
        <button className="icon-text compact-action" onClick={() => onNavigate('dashboard')}><ArrowLeft size={17}/>Back</button>
        <div className="template-title">
          <input aria-label="Template name" value={name} onChange={(event) => { recordHistory(); setName(event.target.value); setStatus('Unsaved changes'); }}/>
          <span>{status} • {pageSettings.preset} {pageSettings.orientation.toLowerCase()} • {pages.length} builder page{pages.length === 1 ? '' : 's'}{virtualPageCount > 1 ? ` • ${virtualPageCount} preview pages` : ''}</span>
        </div>
        <div className="builder-actions">
          <button className="secondary" title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStackRef.current.length === 0}><Undo2 size={16}/><span>Undo</span></button>
          <button className="secondary" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={redo} disabled={redoStackRef.current.length === 0}><Redo2 size={16}/><span>Redo</span></button>
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
          <div className="section-title document-tree"><span>Pages</span><button className="page-add-mini" onClick={addPage} title="Add page"><Plus size={14}/></button></div>
          <div className="page-tree">{pages.map((page, index) => <button key={page.id} className={page.id === activePageId ? "tree-row selected" : "tree-row"} onClick={() => { setActivePageId(page.id); setSelectedId(null); setActivePreviewPageIndex(0); }}><FileText size={15}/><span>{page.name}</span><small>{page.settings.preset}</small></button>)}</div>
          <div className="page-tree-actions"><button onClick={duplicatePage} title="Duplicate page">⧉</button><button onClick={() => movePage(-1)} title="Move page up">↑</button><button onClick={() => movePage(1)} title="Move page down">↓</button><button className="danger-lite" onClick={deletePage} disabled={pages.length <= 1} title="Delete page">×</button></div>
          <div className="section-title document-tree"><span>Elements</span></div>
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
          <div className="page-wrap virtual-page-stack">
            {Array.from({ length: virtualPageCount }, (_, virtualPageIndex) => (
              <div className={`virtual-page-frame${activePreviewPageIndex === virtualPageIndex ? ' active-preview-page' : ''}`} data-virtual-page-index={virtualPageIndex} key={`virtual-page-${virtualPageIndex}`} style={{ width: previewPagePixels.width * previewScale, height: previewPagePixels.height * previewScale }} onPointerDown={() => setActivePreviewPageIndex(virtualPageIndex)}>
                <div className="virtual-page-label">{activePage?.name || 'Page'}{virtualPageIndex > 0 ? ` · Continuation ${virtualPageIndex + 1}` : ''}<span>{virtualPageIndex + 1} / {virtualPageCount}</span></div>
                <div className="document-page" style={{ ...pageCanvasStyle(pageSettings), transform: `scale(${zoom / 100})` }} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
                  {pageSettings.showGuides && <PageGuides settings={pageSettings}/>} 
                  {virtualPageIndex === 0 && elements.length === 0 && <div className="page-empty"><span>{pageSettings.preset} DOCUMENT</span><strong>Start building your template</strong><small>Click an element from the left panel. You can then move, resize and edit it.</small></div>}
                  {elements.map((item) => {
                    const paginationCount = virtualPageCounts.get(item.id) ?? 1;
                    const isPaginatedTable = paginationCount > 1 && item.type === 'table' && item.table?.mode === 'dynamic';
                    if (virtualPageIndex > 0 && !isPaginatedTable) return null;
                    if (virtualPageIndex >= paginationCount) return null;
                    return <CanvasElement key={`${item.id}:vp:${virtualPageIndex}`} item={item} selected={item.id === selectedId} zoom={zoom} pageSettings={pageSettings} record={record} source={source} sources={dataState.sources} virtualPageIndex={virtualPageIndex} virtualPageMode={isPaginatedTable} onSelect={() => setSelectedId(item.id)} onHistoryStart={beginHistoryGesture} onHistoryEnd={endHistoryGesture} onSelectionChange={(table) => { setElementsRaw((current) => current.map((entry) => entry.id === item.id ? { ...entry, table } : entry)); }} onLayoutChange={(patch) => { if (virtualPageIndex === 0) setElementsRaw((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry)); }} onChange={(patch) => { setElements((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry)); setStatus('Unsaved changes'); }}/>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {!rightOpen && <button className="panel-expand expand-right" title="Open inspector" onClick={() => setRightOpen(true)}><ChevronLeft size={16}/></button>}
        <aside className="builder-right">
          <button className="panel-collapse right" title="Collapse inspector" onClick={() => setRightOpen(false)}><ChevronRight size={15}/></button>
          <div className="inspector-tabs">
            {(['properties', 'binding', 'formatting', 'conditions'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'binding' ? 'Dynamic Field' : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <Inspector tab={tab} selected={selected} source={source} record={record} dataState={dataState} onDataState={setDataState} pageSettings={pageSettings} pageName={activePage?.name || 'Page'} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={focusPreviewPage} onPageSettings={updatePageSettings} onPageName={renamePage} onAddPage={addPage} onDuplicatePage={duplicatePage} onDeletePage={deletePage} onMovePage={movePage} onSelectPage={(pageId) => { setActivePageId(pageId); setSelectedId(null); setActivePreviewPageIndex(0); }} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected}/>
        </aside>
      </div>
    </div>
  );
}

function CanvasElement({ item, selected, zoom, pageSettings, record, source, sources, virtualPageIndex = 0, virtualPageMode = false, onSelect, onChange, onLayoutChange, onSelectionChange, onHistoryStart, onHistoryEnd }: { item: BuilderElement; selected: boolean; zoom: number; pageSettings: PageSettings; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; virtualPageIndex?: number; virtualPageMode?: boolean; onSelect: () => void; onChange: (patch: Partial<BuilderElement>) => void; onLayoutChange: (patch: Partial<BuilderElement>) => void; onSelectionChange: (table: TableDefinition) => void; onHistoryStart: () => void; onHistoryEnd: () => void }) {
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; width: number; height: number } | null>(null);
  const scale = zoom / 100;

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.resize === 'true') return;
    if (virtualPageMode && virtualPageIndex > 0) { event.stopPropagation(); onSelect(); return; }
    event.stopPropagation(); onSelect(); onHistoryStart();
    drag.current = { sx: event.clientX, sy: event.clientY, x: item.x, y: item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (resize.current) {
      const dx = (event.clientX - resize.current.sx) / scale;
      const dy = (event.clientY - resize.current.sy) / scale;
      onChange(item.type === 'table' ? { width: Math.max(30, resize.current.width + dx) } : { width: Math.max(30, resize.current.width + dx), height: Math.max(item.type === 'divider' ? 4 : 20, resize.current.height + dy) });
      return;
    }
    if (!drag.current) return;
    const dx = (event.clientX - drag.current.sx) / scale;
    const dy = (event.clientY - drag.current.sy) / scale;
    onChange({ x: Math.max(0, drag.current.x + dx), y: Math.max(0, drag.current.y + dy) });
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null; resize.current = null; onHistoryEnd();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>) {
    event.stopPropagation(); onSelect(); onHistoryStart();
    resize.current = { sx: event.clientX, sy: event.clientY, width: item.width, height: item.height };
    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
  }

  const continuationTop = contentBoundsPx(pageSettings).y;
  const renderedTop = virtualPageMode && virtualPageIndex > 0 ? continuationTop : item.y;
  return <div className={`canvas-element ${selected ? 'selected' : ''} element-${item.type} ${virtualPageMode ? 'virtual-continuation-element' : ''}`} style={{ left: item.x, top: renderedTop, width: item.width, height: item.height, color: item.color, background: item.type === 'shape' ? item.fill : undefined, fontSize: item.fontSize, textAlign: item.textAlign }} onPointerDown={startDrag} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <ElementContent item={item} pageSettings={pageSettings} record={record} source={source} sources={sources} virtualPageIndex={virtualPageIndex} virtualPageMode={virtualPageMode} onElementSelect={onSelect} onTableChange={(table) => onChange({ table })} onTableSelectionChange={onSelectionChange} onTableHistoryStart={onHistoryStart} onTableHistoryEnd={onHistoryEnd} onTableHeightChange={(height) => { if (Math.abs(item.height - height) >= 1) onLayoutChange({ height }); }}/>
    {selected && (!virtualPageMode || virtualPageIndex === 0) && <><span className="resize-handle" data-resize="true" onPointerDown={startResize}/><span className="selection-label">{labelFor(item.type)}</span></>}
  </div>;
}

function ElementContent({ item, pageSettings, record, source, sources, virtualPageIndex = 0, virtualPageMode = false, onElementSelect, onTableChange, onTableSelectionChange, onTableHistoryStart, onTableHistoryEnd, onTableHeightChange }: { item: BuilderElement; pageSettings: PageSettings; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; virtualPageIndex?: number; virtualPageMode?: boolean; onElementSelect: () => void; onTableChange: (table: TableDefinition) => void; onTableSelectionChange: (table: TableDefinition) => void; onTableHistoryStart: () => void; onTableHistoryEnd: () => void; onTableHeightChange: (height: number) => void }) {
  const bound = item.binding ? valueForField(record, item.binding) : undefined;
  const rendered = item.binding && bound !== undefined ? displayValue(bound) : item.text;
  if (item.type === 'image' || item.type === 'signature') return <ImageBackedContent item={item} bound={bound}/>;
  if (item.type === 'table' && item.table) {
    const tableSource = sources.find((candidate) => candidate.id === item.table?.binding?.sourceId) ?? source;
    const bounds = contentBoundsPx(pageSettings);
    const availableHeight = Math.max(80, bounds.y + bounds.height - item.y);
    return <TableCanvas table={item.table} record={record} source={tableSource} documentSource={source} availableHeight={availableHeight} continuationAvailableHeight={Math.max(80, bounds.height)} fragmentIndex={virtualPageMode ? virtualPageIndex : undefined} virtualPageMode={virtualPageMode} onChange={(table) => { onElementSelect(); onTableChange(table); }} onSelectionChange={(table) => { onElementSelect(); onTableSelectionChange(table); }} onInteractionStart={onTableHistoryStart} onInteractionEnd={onTableHistoryEnd} onHeightChange={onTableHeightChange}/>;
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


function pageCanvasStyle(settings: PageSettings) {
  const size = pagePixelSize(settings);
  return { width: `${size.width}px`, height: `${size.height}px`, background: settings.background, borderColor: settings.borderColor, borderWidth: `${settings.borderWidth}px` };
}

function PageGuides({ settings }: { settings: PageSettings }) {
  const m = settings.marginsMm, bleed = settings.bleedMm;
  return <>
    <div className="page-margin-guide" style={{ top: mmToPx(m.top), right: mmToPx(m.right), bottom: mmToPx(m.bottom), left: mmToPx(m.left) }}/>
    <div className="page-safe-guide" style={{ top: mmToPx(m.top + settings.safeAreaMm), right: mmToPx(m.right + settings.safeAreaMm), bottom: mmToPx(m.bottom + settings.safeAreaMm), left: mmToPx(m.left + settings.safeAreaMm) }}/>
    {(bleed.top || bleed.right || bleed.bottom || bleed.left) ? <div className="page-bleed-guide" style={{ top: -mmToPx(bleed.top), right: -mmToPx(bleed.right), bottom: -mmToPx(bleed.bottom), left: -mmToPx(bleed.left) }}/> : null}
  </>;
}

function PageProperties({ settings, pageName, pages, activePageId, virtualPageCount, activePreviewPageIndex, onFocusPreviewPage, onChange, onName, onAddPage, onDuplicatePage, onDeletePage, onMovePage, onSelectPage }: { settings: PageSettings; pageName: string; pages: BuilderPage[]; activePageId: string; virtualPageCount: number; activePreviewPageIndex: number; onFocusPreviewPage: (index: number) => void; onChange: (patch: Partial<PageSettings>) => void; onName: (value: string) => void; onAddPage: () => void; onDuplicatePage: () => void; onDeletePage: () => void; onMovePage: (direction: -1 | 1) => void; onSelectPage: (pageId: string) => void }) {
  const [linkMargins, setLinkMargins] = useState(false);
  const [linkBleed, setLinkBleed] = useState(true);
  const size = pageSizeMm(settings);
  const unit = settings.unit;
  const updateEdges = (key: 'marginsMm'|'bleedMm', side: keyof typeof settings.marginsMm, display: number, linked: boolean) => {
    const mm = Math.max(0, unitToMm(display || 0, unit));
    const current = settings[key];
    onChange({ [key]: linked ? { top:mm,right:mm,bottom:mm,left:mm } : { ...current, [side]: mm } } as Partial<PageSettings>);
  };
  const presets: PagePreset[] = ['A3','A4','A5','Letter','Legal','Tabloid','Executive','Custom'];
  return <div className="page-properties-stack">
    <section className="inspector-card page-manager-card">
      <div className="inspector-card-title"><span>▤ Pages</span><button type="button" className="mini-toggle active" onClick={onAddPage}>＋ Add</button></div>
      <div className="page-manager-list">{pages.map((page, index) => <div key={page.id} className="page-manager-group"><button type="button" className={page.id === activePageId && activePreviewPageIndex === 0 ? 'page-manager-row active' : 'page-manager-row'} onClick={() => { onSelectPage(page.id); if (page.id === activePageId) onFocusPreviewPage(0); }}><span>{index + 1}</span><strong>{page.name}</strong><small>{page.settings.preset}</small></button>{page.id === activePageId && Array.from({ length: Math.max(0, virtualPageCount - 1) }, (_, continuationIndex) => { const previewIndex = continuationIndex + 1; return <button type="button" key={`${page.id}:auto:${previewIndex}`} className={activePreviewPageIndex === previewIndex ? 'page-manager-row auto-page active' : 'page-manager-row auto-page'} onClick={() => onFocusPreviewPage(previewIndex)} title="Automatically generated by table overflow"><span>{index + 1}.{previewIndex + 1}</span><strong>{page.name} · Continuation {previewIndex + 1}</strong><small><b className="auto-page-badge">Auto</b></small></button>; })}</div>)}</div>
      <div className="page-manager-actions"><button type="button" onClick={onDuplicatePage} disabled={activePreviewPageIndex > 0} title={activePreviewPageIndex > 0 ? "Auto continuation pages cannot be duplicated" : "Duplicate page"}>⧉ Duplicate</button><button type="button" onClick={() => onMovePage(-1)} disabled={activePreviewPageIndex > 0} title={activePreviewPageIndex > 0 ? "Auto continuation pages cannot be reordered" : "Move page up"}>↑ Up</button><button type="button" onClick={() => onMovePage(1)} disabled={activePreviewPageIndex > 0} title={activePreviewPageIndex > 0 ? "Auto continuation pages cannot be reordered" : "Move page down"}>↓ Down</button><button type="button" className="danger-lite" onClick={onDeletePage} disabled={pages.length <= 1 || activePreviewPageIndex > 0} title={activePreviewPageIndex > 0 ? "Auto continuation pages disappear when overflow is removed" : "Delete page"}>× Delete</button></div>{activePreviewPageIndex > 0 ? <div className="auto-page-note">Auto continuation page · generated from table overflow</div> : null}
    </section>
    <section className="inspector-card"><div className="inspector-card-title">📄 Page</div>
      <label>Page name<input value={pageName} onChange={(e) => onName(e.target.value)}/></label>
      <label>Page size<select value={settings.preset} onChange={(e) => onChange({ preset: e.target.value as PagePreset })}>{presets.map((p) => <option key={p}>{p}</option>)}</select></label>
      <div className="property-grid"><label>Orientation<select value={settings.orientation} onChange={(e) => onChange({ orientation: e.target.value as PageOrientation })}><option>Portrait</option><option>Landscape</option></select></label><label>Units<select value={unit} onChange={(e) => onChange({ unit: e.target.value as PageUnit })}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inch</option></select></label></div>
      {settings.preset === 'Custom' ? <div className="property-grid"><label>Width<input type="number" min="20" step="0.1" value={Number(mmToUnit(settings.customWidthMm, unit).toFixed(2))} onChange={(e) => onChange({ customWidthMm: unitToMm(Number(e.target.value)||20,unit) })}/></label><label>Height<input type="number" min="20" step="0.1" value={Number(mmToUnit(settings.customHeightMm, unit).toFixed(2))} onChange={(e) => onChange({ customHeightMm: unitToMm(Number(e.target.value)||20,unit) })}/></label></div> : <div className="page-size-readout">{mmToUnit(size.widthMm,unit).toFixed(1)} × {mmToUnit(size.heightMm,unit).toFixed(1)} {unit === 'in' ? 'in' : unit}</div>}
    </section>
    <section className="inspector-card"><div className="inspector-card-title"><span>↔ Margins</span><button className={linkMargins?'mini-toggle active':'mini-toggle'} onClick={() => setLinkMargins(!linkMargins)}>{linkMargins?'Linked':'Independent'}</button></div><div className="edge-grid">{(['top','right','bottom','left'] as const).map((side) => <label key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.marginsMm[side],unit).toFixed(2))} onChange={(e) => updateEdges('marginsMm',side,Number(e.target.value),linkMargins)}/></label>)}</div></section>
    <section className="inspector-card"><div className="inspector-card-title"><span>✂ Bleed</span><button className={linkBleed?'mini-toggle active':'mini-toggle'} onClick={() => setLinkBleed(!linkBleed)}>{linkBleed?'Linked':'Unlinked'}</button></div><div className="edge-grid">{(['top','right','bottom','left'] as const).map((side) => <label key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.bleedMm[side],unit).toFixed(2))} onChange={(e) => updateEdges('bleedMm',side,Number(e.target.value),linkBleed)}/></label>)}</div></section>
    <section className="inspector-card"><div className="inspector-card-title">▱ Safe Area & Appearance</div><label>Safe area inset<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.safeAreaMm,unit).toFixed(2))} onChange={(e) => onChange({ safeAreaMm: unitToMm(Number(e.target.value)||0,unit) })}/></label><div className="property-grid"><label>Background<input type="color" value={settings.background} onChange={(e) => onChange({ background:e.target.value })}/></label><label>Border color<input type="color" value={settings.borderColor} onChange={(e) => onChange({ borderColor:e.target.value })}/></label></div><label>Border width<input type="number" min="0" max="10" value={settings.borderWidth} onChange={(e) => onChange({ borderWidth:Math.max(0,Number(e.target.value)||0) })}/></label><label className="check-row"><input type="checkbox" checked={settings.showGuides} onChange={(e) => onChange({ showGuides:e.target.checked })}/> Show margin / safe / bleed guides</label></section>
  </div>;
}

function Inspector({ tab, selected, source, record, dataState, onDataState, pageSettings, pageName, pages, activePageId, virtualPageCount, activePreviewPageIndex, onFocusPreviewPage, onPageSettings, onPageName, onAddPage, onDuplicatePage, onDeletePage, onMovePage, onSelectPage, onUpdate, onDelete, onDuplicate }: {
  tab: InspectorTab; selected: BuilderElement | null; source: ReturnType<typeof activeSource>; record: ReturnType<typeof activeRecord>; dataState: BuilderDataState; onDataState: (state: BuilderDataState) => void; pageSettings: PageSettings; pageName: string; pages: BuilderPage[]; activePageId: string; virtualPageCount: number; activePreviewPageIndex: number; onFocusPreviewPage: (index: number) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void; onPageName: (value: string) => void; onAddPage: () => void; onDuplicatePage: () => void; onDeletePage: () => void; onMovePage: (direction: -1 | 1) => void; onSelectPage: (pageId: string) => void;
  onUpdate: (patch: Partial<BuilderElement>) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const activeInspectorPage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const documentIdentityTable = source ? activeInspectorPage?.elements.find((item) => {
    if (item.type !== 'table' || item.table?.mode !== 'dynamic' || item.table.binding?.sourceId !== source.id) return false;
    const parentKeys = item.table.binding.parentKeys?.filter(Boolean) ?? (item.table.binding.parentKey ? [item.table.binding.parentKey] : []);
    return parentKeys.length > 0;
  }) : undefined;
  const documentIdentityKeys = documentIdentityTable?.table?.binding?.parentKeys?.filter(Boolean)
    ?? (documentIdentityTable?.table?.binding?.parentKey ? [documentIdentityTable.table.binding.parentKey] : []);
  const documentPicker = source && documentIdentityKeys.length > 0 ? (() => {
    const seen = new Map<string, { value: number; label: string }>();
    source.records.forEach((sourceRecord, index) => {
      const values = documentIdentityKeys.map((key) => displayValue(valueForField(sourceRecord, key)).trim());
      const composite = values.join('\u241F');
      if (!composite || values.every((value) => !value) || seen.has(composite)) return;
      const fieldLabels = documentIdentityKeys.map((key) => source.fields.find((field) => field.name === key)?.label || key);
      const label = documentIdentityKeys.length === 1
        ? `${fieldLabels[0]}: ${values[0]}`
        : `${fieldLabels.join(' + ')}: ${values.join(' · ')}`;
      seen.set(composite, { value: index, label });
    });
    const currentValues = record ? documentIdentityKeys.map((key) => displayValue(valueForField(record, key)).trim()) : [];
    const currentComposite = currentValues.join('\u241F');
    const selectedOption = currentComposite ? seen.get(currentComposite) : undefined;
    return { options: Array.from(seen.values()), value: selectedOption?.value ?? dataState.activeRecordIndex };
  })() : null;

  if (tab === 'binding') return <div className="inspector-body"><h3>Dynamic Field</h3><p>{selected ? (source ? `Bind this element to ${source.name}.` : 'Import a Data Source first, then choose a field.') : 'Select an element to configure data binding.'}</p>{source && <label>{documentPicker ? 'Preview document' : 'Preview record'}<RecordPicker count={source.records.length} value={documentPicker?.value ?? dataState.activeRecordIndex} options={documentPicker?.options} disabled={source.records.length === 0} compactLabel={documentPicker ? 'Document' : 'Record'} onChange={(index) => { const next = { ...dataState, activeRecordIndex: index }; onDataState(next); saveDataSelection(next); }}/></label>}<label>Source field<select disabled={!selected || !source} value={selected?.binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value || undefined })}><option value="">No binding</option>{source?.fields.map((field) => <option key={field.name} value={field.name}>{field.label} ({field.type})</option>)}</select></label>{selected?.binding && <><div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{displayValue(valueForField(record, selected.binding)) || 'Empty / null'}</strong></div></>}</div>;
  if (tab === 'formatting') return <div className="inspector-body"><h3>Formatting</h3>{!selected ? <p>Select an element to edit document-safe formatting.</p> : <><label>Font size<input type="number" min="8" max="96" value={selected.fontSize} onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 12 })}/></label><label>Text color<input type="color" value={selected.color} onChange={(e) => onUpdate({ color: e.target.value })}/></label>{selected.type === 'shape' && <label>Fill<input type="color" value={selected.fill} onChange={(e) => onUpdate({ fill: e.target.value })}/></label>}<div className="align-actions"><button className={selected.textAlign === 'left' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'left' })}><AlignLeft size={16}/></button><button className={selected.textAlign === 'center' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter size={16}/></button><button className={selected.textAlign === 'right' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight size={16}/></button></div></>}</div>;
  if (tab === 'conditions') return <div className="inspector-body"><h3>Conditions</h3><p>Condition rules are planned for a later phase. The selected element remains schema-ready for them.</p><button className="secondary" disabled={!selected}>Add condition</button></div>;
  return <div className="inspector-body"><h3>Properties</h3>{selected ? <><div className="property-grid"><label>X<input type="number" value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label><label>Width<input type="number" min="20" value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label><label>Height<input type={selected.type === 'table' ? 'text' : 'number'} min={selected.type === 'table' ? undefined : '4'} disabled={selected.type === 'table'} value={selected.type === 'table' ? `Auto · ${Math.round(selected.height)}px` : Math.round(selected.height)} onChange={(e) => { if (selected.type !== 'table') onUpdate({ height: Math.max(4, Number(e.target.value) || 4) }); }}/></label></div>{selected.type === 'table' && selected.table ? <TableProperties table={selected.table} sources={dataState.sources} activeSourceId={dataState.activeSourceId} onUpdate={(table) => onUpdate({ table })}/> : (selected.type === 'image' || selected.type === 'signature') ? <ImageProperties selected={selected} onUpdate={onUpdate}/> : selected.type !== 'shape' && selected.type !== 'divider' ? <label>Content<textarea value={selected.text} onChange={(e) => onUpdate({ text: e.target.value })}/></label> : null}<div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></> : <PageProperties settings={pageSettings} pageName={pageName} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={onFocusPreviewPage} onChange={onPageSettings} onName={onPageName} onAddPage={onAddPage} onDuplicatePage={onDuplicatePage} onDeletePage={onDeletePage} onMovePage={onMovePage} onSelectPage={onSelectPage}/>}</div>;
}


function TableProperties({ table, sources, activeSourceId, onUpdate }: { table: TableDefinition; sources: BuilderDataState['sources']; activeSourceId?: string; onUpdate: (table: TableDefinition) => void }) {
  const cell = findTableCell(table, table.selectedCellId);
  const cellLocation = findTableCellLocation(table, table.selectedCellId);
  const selectedColumn = cellLocation ? table.columns[Math.min(cellLocation.columnIndex, table.columns.length - 1)] ?? null : null;
  const selectedDynamicBodyCell = table.mode === 'dynamic' && cellLocation
    ? (table.bodyRows[0]?.cells[Math.min(cellLocation.columnIndex, Math.max(0, table.columns.length - 1))] ?? null)
    : null;
  const rowStructureLocked = Boolean(table.mode === 'dynamic' && cellLocation?.section === 'bodyRows');
  const mergedColumns = tableHasMergedColumns(table);
  const bindingSource = table.mode === 'dynamic'
    ? (sources.find((item) => item.id === table.binding?.sourceId) ?? null)
    : (sources.find((item) => item.id === activeSourceId) ?? sources[0] ?? null);
  const patchCell = (patch: Parameters<typeof updateTableCell>[2]) => {
    if (!cell) return;
    onUpdate(updateTableCell(table, cell.id, patch));
  };
  const patchDynamicBodyCell = (patch: Parameters<typeof updateTableCell>[2]) => {
    if (!selectedDynamicBodyCell) return;
    onUpdate(updateTableCell(table, selectedDynamicBodyCell.id, patch));
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
      <section className="table-inspector-card pagination-card">
        <div className="table-inspector-card-head"><span className="table-inspector-heading"><span className="table-inspector-icon">↧</span><span>Pagination</span></span><small className="table-inspector-badge">DB-4.4</small></div>
        <label className="check-row"><input type="checkbox" checked={table.pagination.enabled !== false} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, enabled: e.target.checked } })}/>Automatic overflow pages</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.repeatHeader} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, repeatHeader: e.target.checked } })}/>Repeat header on each page</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.keepRowsTogether} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, keepRowsTogether: e.target.checked } })}/>Keep repeated row together</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.keepSummaryTogether !== false} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, keepSummaryTogether: e.target.checked } })}/>Keep summary block together</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.allowRowSplit} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, allowRowSplit: e.target.checked } })}/>Allow oversized row split (renderer foundation)</label>
        <div className="table-cell-help">Overflow is calculated from the table's Y position to the page bottom margin. Summary rows move to the final continuation page when needed.</div>
      </section>
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
        <label className="check-row"><input type="checkbox" checked={Boolean(cellLocation.row.pageBreakBefore)} onChange={(e) => onUpdate(updateTableRow(table, cellLocation.row.id, { pageBreakBefore: e.target.checked }))}/>Page break before this row</label>
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
        <div className="property-grid"><label>Width<input type="number" min="30" max="1000" value={selectedColumn.width} onChange={(e) => onUpdate(setTableColumnManualWidth(table, selectedColumn.id, Math.max(30, Number(e.target.value) || 120)))}/></label><label>Min width<input type="number" min="20" max="1000" value={selectedColumn.minWidth} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { minWidth: Math.max(20, Number(e.target.value) || 40) }))}/></label></div>
        <div className="column-sizing-actions">
          <button type="button" className="secondary compact" onClick={() => onUpdate(resetTableColumnAutoWidth(table, selectedColumn.id))}>↔ Fit Content</button>
          <button type="button" className="secondary compact" onClick={() => onUpdate(equalizeTableColumnWidths(table))}>≡ Equal Width</button>
          <button type="button" className="secondary compact" onClick={() => onUpdate(resetTableColumnAutoWidth(table))}>↺ Reset Auto</button>
        </div>
        <p className="table-cell-help">Tip: drag a header column divider directly on the canvas. Total table width stays inside the page.</p>
        <label>Alignment<select value={selectedColumn.align} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { align: e.target.value as 'left'|'center'|'right' }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <div className="table-data-format-card">
          <div className="section-title"><span>Data &amp; Format</span><small>Column default</small></div>
          {table.mode === 'dynamic' && selectedDynamicBodyCell && <>
            <label>Body value type<select value={selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')} onChange={(e) => patchDynamicBodyCell({ valueMode: e.target.value as TableValueMode })}><option value="binding">Field binding</option><option value="formula">Formula</option><option value="custom">Custom value</option></select></label>
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'binding' && <TableCellBindingPicker source={bindingSource} value={selectedDynamicBodyCell.binding} onChange={(binding) => patchDynamicBodyCell({ binding, valueMode: 'binding' })}/>}
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'formula' && <div className="table-formula-editor"><label>Formula<input value={selectedDynamicBodyCell.formula ?? ''} placeholder="Quantity * Rate - Discount" onChange={(e) => patchDynamicBodyCell({ formula: e.target.value, valueMode: 'formula' })}/></label><p className="table-cell-help">Formula applies to every repeated body row in this column.</p><FormulaFieldPicker source={bindingSource} table={table} currentColumnId={selectedColumn.id} onInsert={(fieldRef) => patchDynamicBodyCell({ formula: `${selectedDynamicBodyCell.formula ?? ''}${selectedDynamicBodyCell.formula ? ' ' : ''}${fieldRef}`, valueMode: 'formula' })}/></div>}
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'custom' && <label>Body custom value<input value={selectedDynamicBodyCell.content ?? ''} onChange={(e) => patchDynamicBodyCell({ content: e.target.value, valueMode: 'custom' })}/></label>}
          </>}
          <label>Data type<select value={selectedColumn.dataType ?? 'text'} onChange={(e) => onUpdate(updateTableColumn(table, selectedColumn.id, { dataType: e.target.value as TableDataType }))}>{TABLE_DATA_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <TableDataFormatEditor dataType={selectedColumn.dataType ?? 'text'} value={selectedColumn.format ?? {}} onChange={(format) => onUpdate(updateTableColumn(table, selectedColumn.id, { format }))}/>
        </div>
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
        {table.mode === 'dynamic' && cellLocation?.section === 'customRows' ? <SummaryCellEditor table={table} cell={cell} source={bindingSource} onPatch={patchCell}/> : <>
        <label>Value mode<select value={cell.valueMode ?? (cell.binding ? 'binding' : 'custom')} onChange={(e) => patchCell({ valueMode: e.target.value as TableValueMode })}><option value="custom">Custom value</option><option value="binding">Field binding</option><option value="formula" disabled={cellLocation?.row.kind === 'header'}>Formula</option></select></label>
        {cellLocation?.row.kind === 'header' && table.mode === 'dynamic' && <p className="table-cell-help">Header cells are labels. Set this column's repeated Field Binding / Formula from Column Structure → Body value type.</p>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'custom' && <label>Content<textarea value={cell.content} onChange={(e) => patchCell({ content: e.target.value })}/></label>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'binding' && <TableCellBindingPicker source={bindingSource} value={cell.binding} onChange={(binding) => patchCell({ binding, valueMode: 'binding' })}/>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'formula' && <div className="table-formula-editor"><label>Formula<input value={cell.formula ?? ''} placeholder="Quantity * Rate - Discount" onChange={(e) => patchCell({ formula: e.target.value, valueMode: 'formula' })}/></label><p className="table-cell-help">Use imported fields with +, -, *, / and parentheses. Fields containing spaces are inserted safely as [Basic Value].</p><FormulaFieldPicker source={bindingSource} table={table} currentColumnId={selectedColumn?.id} onInsert={(fieldRef) => patchCell({ formula: `${cell.formula ?? ''}${cell.formula ? ' ' : ''}${fieldRef}`, valueMode: 'formula' })}/></div>}
        </>}
        <div className="table-data-format-card">
          <div className="section-title"><span>Data &amp; Format</span><small>Cell override</small></div>
          <label>Data type<select value={cell.dataType ?? selectedColumn?.dataType ?? 'text'} onChange={(e) => patchCell({ dataType: e.target.value as TableDataType })}>{TABLE_DATA_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <TableDataFormatEditor dataType={cell.dataType ?? selectedColumn?.dataType ?? 'text'} value={cell.format ?? selectedColumn?.format ?? {}} onChange={(format) => patchCell({ format })}/>
        </div>
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



function SummaryCellEditor({ table, cell, source, onPatch }: { table: TableDefinition; cell: NonNullable<ReturnType<typeof findTableCell>>; source: BuilderDataState['sources'][number] | null; onPatch: (patch: Parameters<typeof updateTableCell>[2]) => void }) {
  const mode = cell.summaryMode ?? 'custom';
  const fieldOptions = summaryFieldOptions(table, source);
  const summaryRefs = summaryValueReferences(table, cell.id);
  const [insertValue, setInsertValue] = useState('');
  const append = (token: string) => onPatch({ summaryFormula: `${cell.summaryFormula ?? ''}${cell.summaryFormula ? ' ' : ''}${token}`, summaryMode: 'formula' });
  return <div className="table-summary-cell-editor">
    <div className="section-title"><span>Summary Value</span><small>Document group</small></div>
    <label>Summary mode<select value={mode} onChange={(e) => onPatch({ summaryMode: e.target.value as 'custom'|'aggregate'|'formula' })}><option value="custom">Custom value</option><option value="aggregate">Aggregate</option><option value="formula">Formula</option></select></label>
    {mode === 'custom' && <label>Content<textarea value={cell.content} onChange={(e) => onPatch({ content: e.target.value, summaryMode: 'custom' })}/></label>}
    {mode === 'aggregate' && <>
      <label>Aggregate<select value={cell.aggregate?.operation ?? 'sum'} onChange={(e) => onPatch({ summaryMode: 'aggregate', aggregate: { operation: e.target.value as TableAggregateOperation, field: cell.aggregate?.field ?? '' } })}><option value="sum">SUM</option><option value="count">COUNT</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option></select></label>
      <label>Field / formula column<select value={cell.aggregate?.field ?? ''} onChange={(e) => onPatch({ summaryMode: 'aggregate', aggregate: { operation: cell.aggregate?.operation ?? 'sum', field: e.target.value } })}><option value="">Select field…</option><optgroup label="Imported Fields">{fieldOptions.filter((item) => item.kind === 'field').map((item) => <option key={`sf:${item.value}`} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="Formula Columns">{fieldOptions.filter((item) => item.kind === 'formula').map((item) => <option key={`sc:${item.value}`} value={item.value}>{item.label}</option>)}</optgroup></select></label>
    </>}
    {mode === 'formula' && <>
      <label>Summary formula<input value={cell.summaryFormula ?? ''} placeholder="SUM([Net Value]) * 0.18" onChange={(e) => onPatch({ summaryFormula: e.target.value, summaryMode: 'formula' })}/></label>
      <label>Insert reference<select value={insertValue} onChange={(e) => { const value = e.target.value; if (!value) return; if (value.startsWith('agg:')) append(value.slice(4)); else if (value.startsWith('summary:')) append(value.slice(8)); setInsertValue(''); }}><option value="">Select aggregate or summary…</option><optgroup label="Aggregates">{fieldOptions.map((item) => { const ref = formulaFieldReference(item.value); return ['SUM','COUNT','AVG','MIN','MAX'].map((fn) => <option key={`${fn}:${item.kind}:${item.value}`} value={`agg:${fn}(${ref})`}>{fn}({item.label})</option>); })}</optgroup>{summaryRefs.length > 0 && <optgroup label="Previous Summary Values">{summaryRefs.map((item) => <option key={item.name} value={`summary:${item.reference}`}>{item.name}</option>)}</optgroup>}</select></label>
      <p className="table-cell-help">Aggregates use only the currently selected Parent / Document group. Previous named summary values can be chained.</p>
    </>}
    {(mode === 'aggregate' || mode === 'formula') && <label>Summary name<input value={cell.summaryName ?? ''} placeholder="Subtotal / Tax Amount" onChange={(e) => onPatch({ summaryName: e.target.value })}/></label>}
  </div>;
}

const TABLE_DATA_TYPE_OPTIONS: Array<{ value: TableDataType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'currency', label: 'Currency' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date Time' },
  { value: 'time', label: 'Time' },
  { value: 'checkbox', label: 'Checkbox / Boolean' },
];

function TableDataFormatEditor({ dataType, value, onChange }: { dataType: TableDataType; value: TableDataFormat; onChange: (format: TableDataFormat) => void }) {
  const patch = (next: Partial<TableDataFormat>) => onChange({ ...value, ...next });
  if (dataType === 'text') return <p className="table-cell-help">Text keeps the original value without numeric/date conversion.</p>;
  if (dataType === 'number' || dataType === 'decimal' || dataType === 'currency' || dataType === 'percentage') return <>
    {dataType !== 'number' && <label>Decimals<input type="number" min="0" max="8" value={value.decimals ?? 2} onChange={(e) => patch({ decimals: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })}/></label>}
    <label className="check-row"><input type="checkbox" checked={value.thousandsSeparator !== false} onChange={(e) => patch({ thousandsSeparator: e.target.checked })}/>Thousands separator</label>
    {dataType === 'currency' && <div className="property-grid"><label>Currency code<input value={value.currencyCode ?? 'INR'} maxLength={3} onChange={(e) => patch({ currencyCode: e.target.value.toUpperCase() })}/></label><label>Symbol<input value={value.currencySymbol ?? '₹'} maxLength={4} onChange={(e) => patch({ currencySymbol: e.target.value })}/></label></div>}
    {dataType === 'percentage' && <label>Input interpretation<select value={value.percentInputMode ?? 'fraction'} onChange={(e) => patch({ percentInputMode: e.target.value as 'fraction'|'whole' })}><option value="fraction">0.18 → 18%</option><option value="whole">18 → 18%</option></select></label>}
  </>;
  if (dataType === 'date' || dataType === 'datetime' || dataType === 'time') return <>
    {dataType !== 'time' && <label>Date format<select value={value.dateFormat ?? 'dd/MM/yyyy'} onChange={(e) => patch({ dateFormat: e.target.value as NonNullable<TableDataFormat['dateFormat']> })}><option value="dd/MM/yyyy">DD/MM/YYYY</option><option value="MM/dd/yyyy">MM/DD/YYYY</option><option value="yyyy-MM-dd">YYYY-MM-DD</option><option value="dd MMM yyyy">DD MMM YYYY</option></select></label>}
    {dataType !== 'date' && <label>Time format<select value={value.timeFormat ?? '12h'} onChange={(e) => patch({ timeFormat: e.target.value as '12h'|'24h' })}><option value="12h">12 hour (AM/PM)</option><option value="24h">24 hour</option></select></label>}
  </>;
  if (dataType === 'checkbox') return <>
    <label>Display<select value={value.checkboxStyle ?? 'checkbox'} onChange={(e) => patch({ checkboxStyle: e.target.value as 'checkbox'|'labels' })}><option value="checkbox">☑ / ☐</option><option value="labels">Custom labels</option></select></label>
    {(value.checkboxStyle ?? 'checkbox') === 'labels' && <div className="property-grid"><label>True label<input value={value.trueValue ?? 'Yes'} onChange={(e) => patch({ trueValue: e.target.value })}/></label><label>False label<input value={value.falseValue ?? 'No'} onChange={(e) => patch({ falseValue: e.target.value })}/></label></div>}
  </>;
  return null;
}

function formulaFieldReference(fieldName: string) {
  return /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(fieldName) ? fieldName : `[${fieldName}]`;
}

function FormulaFieldPicker({ source, table, currentColumnId, onInsert }: { source: BuilderDataState['sources'][number] | null; table?: TableDefinition; currentColumnId?: string; onInsert: (fieldRef: string) => void }) {
  const [selectedField, setSelectedField] = useState('');
  const formulaColumns = table ? formulaColumnReferences(table, currentColumnId) : [];
  if (!source && formulaColumns.length === 0) return <p className="table-cell-help">Load/select a Data Source or create another formula column to insert references.</p>;
  return <label className="formula-field-picker">Insert field
    <select value={selectedField} onChange={(e) => {
      const value = e.target.value;
      if (!value) return;
      if (value.startsWith('source:')) onInsert(formulaFieldReference(value.slice(7)));
      if (value.startsWith('formula:')) {
        const match = formulaColumns.find((column) => column.columnId === value.slice(8));
        if (match) onInsert(match.reference);
      }
      setSelectedField('');
    }}>
      <option value="">Select field or formula column…</option>
      {source && <optgroup label={`Imported Fields — ${source.name}`}>
        {source.fields.map((field) => <option key={`source:${field.name}`} value={`source:${field.name}`}>{field.label || field.name} ({field.type})</option>)}
      </optgroup>}
      {formulaColumns.length > 0 && <optgroup label="Formula Columns">
        {formulaColumns.map((column) => <option key={`formula:${column.columnId}`} value={`formula:${column.columnId}`}>{column.label} ({column.dataType})</option>)}
      </optgroup>}
    </select>
    <small>{source?.fields.length ?? 0} imported fields{formulaColumns.length ? ` + ${formulaColumns.length} formula column${formulaColumns.length === 1 ? '' : 's'}` : ''}. Self-reference is excluded; circular dependencies remain blank.</small>
  </label>;
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
