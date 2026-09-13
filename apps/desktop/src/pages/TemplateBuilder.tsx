import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Barcode, ChevronLeft, ChevronRight, Circle,
  Copy, Eye, Image, Minus, MousePointer2, QrCode, Save, Signature, Table2, Trash2, Calculator,
  Type, ZoomIn, ZoomOut, Plus, FileText, Undo2, Redo2, Download,
} from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { RecordPicker } from '../components/RecordPicker.tsx';
import { DATA_EVENT, activeRecord, activeSource, displayValue, loadDataState, loadDataStateAsync, saveDataSelection, valueForField, type BuilderDataState } from '../lib/dataSourceStore.ts';
import { loadImageAsset, saveImageAsset } from '../lib/imageAssetStore.ts';
import { TableCreateModal } from '../components/TableCreateModal.tsx';
import { TableCanvas } from '../components/TableCanvas.tsx';
import { defaultPageSettings, normalizePageSettings, contentBoundsPx, headerBoundsPx, footerBoundsPx, repeatModeShows, mmToPx, mmToUnit, pagePixelSize, pageSizeMm, unitToMm, type PageSettings, type PagePreset, type PageOrientation, type PageUnit, type PageRepeatMode } from '../lib/pageModel.ts';
import { addCustomSummaryRow, addTableColumn, addTableRow, deleteTableColumn, deleteTableRow, duplicateTableRow, findTableCell, findTableCellLocation, moveTableColumn, moveTableRow, recommendedParentKey, recommendedRowKey, tableHasMergedColumns, updateTableCell, equalizeTableColumnWidths, resetTableColumnAutoWidth, setTableColumnManualWidth, updateTableColumn, updateTableRow, formulaColumnReferences, summaryFieldOptions, summaryValueReferences, dynamicRows, paginateDynamicTable, evaluateTableFormula, type TableAggregateOperation, type TableDataFormat, type TableDataType, type TableDefinition, type TableCellType, type TableValueMode } from '../lib/tableModel.ts';
import { matchTemplateTokenField, resolveTemplateTokens, templateHasTokens, tokenForField, type TemplateTokenField } from '../lib/templateTokens.ts';
import { insertFlowElementByVisualY, layoutBodyFlow, materializeBodyFlowPages, newFlowRowId, shouldCommitMeasuredFlowHeight, synchronizeFlowRowHeights, flowRowKey, type BodyLayoutMode, type BodyFlowAlign, type BodyFlowWidth } from '../lib/bodyFlow.ts';
import { buildMaterializedRenderDocument, type MaterializedRenderPage } from '../lib/materializedRenderModel.ts';
import { buildExactPreviewPdf, downloadPdf } from '../lib/exactPdfExport.ts';

type ToolType = 'text' | 'image' | 'table' | 'shape' | 'qr' | 'barcode' | 'signature' | 'divider' | 'formula';
type InspectorTab = 'properties' | 'binding' | 'formatting' | 'conditions' | 'header' | 'footer';
type TextAlign = 'left' | 'center' | 'right';
type PageRegion = 'body' | 'header' | 'footer';

type BuilderElement = {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  lineHeight?: number;
  textAlign: TextAlign;
  fill: string;
  color: string;
  binding?: string;
  imageSource?: string;
  imageAssetId?: string;
  imageFit?: 'contain' | 'cover' | 'fill';
  table?: TableDefinition;
  region?: PageRegion;
  layoutMode?: BodyLayoutMode;
  flowRowId?: string;
  flowWidthPercent?: number;
  flowGapBeforeMm?: number;
  flowGapAfterMm?: number;
  flowColumnGapMm?: number;
  flowAlign?: BodyFlowAlign;
  flowWidth?: BodyFlowWidth;
  flowRowHeightPx?: number;
  /** DB-4F reusable document formula field. The formula name becomes a Dynamic Field token. */
  formulaName?: string;
  formulaExpression?: string;
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
  { label: 'Formula Field', type: 'formula', icon: Calculator },
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
  const masterPage = pages[0];
  const masterHeader = masterPage?.settings.header ?? defaultPageSettings().header;
  const masterFooter = masterPage?.settings.footer ?? defaultPageSettings().footer;
  const pageSettings = activePage ? { ...activePage.settings, header: { ...masterHeader }, footer: { ...masterFooter } } : defaultPageSettings();
  const formulaElements = pages.flatMap((page) => page.elements).filter((item) => item.type === 'formula' && item.formulaName?.trim());
  const masterBandElements = (masterPage?.elements ?? []).filter((item) => (item.region ?? 'body') === 'header' || (item.region ?? 'body') === 'footer');
  const rawActiveBodyElements = (activePage?.elements ?? []).filter((item) => (item.region ?? 'body') === 'body' && item.type !== 'formula');
  const activeBodyElements = layoutBodyFlow(rawActiveBodyElements, pageSettings);
  const projectedMasterBands = activePageId === masterPage?.id ? masterBandElements : masterBandElements.map((item) => reflowRegionElement(item, { ...masterPage.settings, header: { ...masterHeader }, footer: { ...masterFooter } }, pageSettings));
  const elements = activePageId === masterPage?.id ? [...activeBodyElements, ...masterBandElements, ...formulaElements] : [...activeBodyElements, ...projectedMasterBands, ...formulaElements];
  const selectedIsMasterBand = (id: string | null) => Boolean(id && masterBandElements.some((item) => item.id === id));
  const setElementsRaw = (updater: BuilderElement[] | ((current: BuilderElement[]) => BuilderElement[])) => setPages((currentPages) => currentPages.map((page, index) => {
    const targetMaster = selectedIsMasterBand(selectedId);
    const isTarget = targetMaster ? index === 0 : page.id === activePageId;
    if (!isTarget) return page;
    return { ...page, elements: typeof updater === 'function' ? updater(page.elements) : updater };
  }));
  const setElements = (updater: BuilderElement[] | ((current: BuilderElement[]) => BuilderElement[])) => { recordHistory(); setElementsRaw(updater); };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState(0);
  const [status, setStatus] = useState('Draft');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportProgress, setPdfExportProgress] = useState('');
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
  const [tableEditorElementId, setTableEditorElementId] = useState<string | null>(null);
  const [activeInsertRegion, setActiveInsertRegion] = useState<PageRegion>('body');
  const source = activeSource(dataState);
  const record = activeRecord(dataState);
  const formulaAggregateRows = source ? documentFormulaAggregateRows(source, record, pages.flatMap((page) => page.elements)) : [];
  const formulaTokenFields: TemplateTokenField[] = formulaElements.map((item) => ({ name: item.formulaName!.trim(), label: item.formulaName!.trim() }));
  const dynamicTokenFields: TemplateTokenField[] = [...(source?.fields ?? []), ...formulaTokenFields.filter((formula) => !(source?.fields ?? []).some((field) => field.name.toLocaleLowerCase() === formula.name.toLocaleLowerCase()))];
  const selected = formulaElements.find((item) => item.id === selectedId) ?? masterBandElements.find((item) => item.id === selectedId) ?? elements.find((item) => item.id === selectedId) ?? null;
  const globalDocumentPicker = source ? buildDocumentPreviewPicker(source, record, dataState.activeRecordIndex, activePage?.elements ?? []) : null;
  const selectPreviewRecord = (index: number) => {
    const next = { ...dataState, activeRecordIndex: index };
    setDataState(next);
    saveDataSelection(next);
    setActivePreviewPageIndex(0);
  };

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedTemplate;
      if ((Array.isArray(saved.pages) && saved.pages.length) || Array.isArray(saved.elements)) {
        setName(saved.name || 'Untitled Document');
        if (Array.isArray(saved.pages) && saved.pages.length) {
          const normalizedPages = saved.pages.map((page) => ({ ...page, settings: normalizePageSettings(page.settings), elements: (page.elements ?? []).map((element) => ({ ...element, region: element.region ?? 'body', fontFamily: element.fontFamily ?? 'Arial', fontWeight: element.fontWeight ?? 400, italic: element.italic ?? false, underline: element.underline ?? false, lineHeight: element.lineHeight ?? 1.25, layoutMode: element.layoutMode ?? 'floating', flowRowId: element.flowRowId ?? (element.layoutMode === 'flow' ? `legacy-row-${element.id}` : undefined), flowWidthPercent: element.flowWidthPercent ?? (element.layoutMode === 'flow' ? 100 : undefined), flowGapBeforeMm: element.flowGapBeforeMm ?? 0, flowGapAfterMm: element.flowGapAfterMm ?? 4, flowColumnGapMm: element.flowColumnGapMm ?? 4, flowAlign: element.flowAlign ?? 'left', flowWidth: element.flowWidth ?? 'full' })) }));
          const globalHeader = normalizedPages[0].settings.header;
          const globalFooter = normalizedPages[0].settings.footer;
          const masterHeaderIds = new Set(normalizedPages[0].elements.filter((element) => (element.region ?? 'body') !== 'body').map((element) => element.id));
          const migratedPages = normalizedPages.map((page, index) => ({
            ...page,
            settings: { ...page.settings, header: { ...globalHeader }, footer: { ...globalFooter } },
            elements: index === 0 ? page.elements : page.elements.filter((element) => (element.region ?? 'body') === 'body' || masterHeaderIds.has(element.id)),
          }));
          setPages(migratedPages);
          setActivePageId(saved.activePageId && migratedPages.some((p) => p.id === saved.activePageId) ? saved.activePageId : migratedPages[0].id);
        } else {
          const legacy = defaultPageSettings(); legacy.preset = saved.pageSize || 'A4'; legacy.orientation = saved.orientation || 'Portrait';
          const migrated: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings: legacy, elements: (saved.elements || []).map((element) => ({ ...element, region: element.region ?? 'body', fontFamily: element.fontFamily ?? 'Arial', fontWeight: element.fontWeight ?? 400, italic: element.italic ?? false, underline: element.underline ?? false, lineHeight: element.lineHeight ?? 1.25, layoutMode: element.layoutMode ?? 'floating', flowRowId: element.flowRowId ?? (element.layoutMode === 'flow' ? `legacy-row-${element.id}` : undefined), flowWidthPercent: element.flowWidthPercent ?? (element.layoutMode === 'flow' ? 100 : undefined), flowGapBeforeMm: element.flowGapBeforeMm ?? 0, flowGapAfterMm: element.flowGapAfterMm ?? 4, flowColumnGapMm: element.flowColumnGapMm ?? 4, flowAlign: element.flowAlign ?? 'left', flowWidth: element.flowWidth ?? 'full' })) };
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
    if (type === 'formula') {
      const formulaCount = formulaElements.length;
      const defaults = defaultElement('formula', formulaCount);
      recordHistory();
      setPages((currentPages) => currentPages.map((page, index) => index === 0 ? { ...page, elements: [...page.elements, defaults] } : page));
      setSelectedId(defaults.id);
      setTab('properties');
      setStatus('Unsaved changes');
      return;
    }
    if (type === 'table') { setActiveInsertRegion('body'); setTableEditorElementId(null); setTableModalOpen(true); return; }
    let targetRegion = activeInsertRegion;
    let effectiveSettings = pageSettings;
    if (targetRegion === 'header' && !pageSettings.header.enabled) {
      effectiveSettings = { ...pageSettings, header: { ...pageSettings.header, enabled: true } };
      updatePageSettings({ header: effectiveSettings.header });
    } else if (targetRegion === 'footer' && !pageSettings.footer.enabled) {
      effectiveSettings = { ...pageSettings, footer: { ...pageSettings.footer, enabled: true } };
      updatePageSettings({ footer: effectiveSettings.footer });
    }
    const count = elements.length;
    const baseElement = defaultElement(type, count);
    const defaults = targetRegion === 'body'
      ? prepareNewFlowElement(baseElement, rawActiveBodyElements, effectiveSettings)
      : placeElementInRegion(baseElement, targetRegion, effectiveSettings, count);
    recordHistory();
    if (targetRegion === 'body') {
      setPages((currentPages) => currentPages.map((page) => page.id === activePageId ? { ...page, elements: [...page.elements, defaults] } : page));
    } else {
      setPages((currentPages) => currentPages.map((page, index) => index === 0 ? { ...page, elements: [...page.elements, defaults] } : page));
    }
    setSelectedId(defaults.id);
    setTab(type === 'text' ? 'formatting' : 'properties');
    setStatus('Unsaved changes');
  }


  function addTableElement(table: TableDefinition) {
    const defaults = defaultElement('table', elements.length);
    const bounds = contentBoundsPx(pageSettings);
    const tableHeight = table.mode === 'custom' ? Math.max(120, table.rows.length * 34) : 180;
    const tableElement = prepareNewFlowElement({ ...defaults, table, width: bounds.width, height: tableHeight, region: 'body', flowWidth: 'full', flowWidthPercent: 100 }, rawActiveBodyElements, pageSettings);
    recordHistory();
    setPages((currentPages) => currentPages.map((page) => page.id === activePageId ? { ...page, elements: [...page.elements, tableElement] } : page));
    setSelectedId(tableElement.id);
    setTab('properties');
    setTableModalOpen(false);
    setStatus('Unsaved changes');
  }

  function saveTableConfiguration(table: TableDefinition) {
    if (!tableEditorElementId) { addTableElement(table); return; }
    recordHistory();
    setPages((currentPages) => currentPages.map((page) => page.id === activePageId
      ? { ...page, elements: page.elements.map((entry) => entry.id === tableEditorElementId ? { ...entry, table } : entry) }
      : page));
    setSelectedId(tableEditorElementId);
    setTableEditorElementId(null);
    setTableModalOpen(false);
    setStatus('Unsaved changes');
  }

  function updateSelected(patch: Partial<BuilderElement>) {
    if (!selectedId || !selected) return;
    if (selected.type === 'formula') {
      recordHistory();
      setPages((currentPages) => currentPages.map((page, index) => index === 0 ? { ...page, elements: page.elements.map((entry) => entry.id === selectedId ? { ...entry, ...patch } : entry) } : page));
      setStatus('Unsaved changes');
      return;
    }
    recordHistory();
    const currentRegion = selected.region ?? 'body';
    let normalizedPatch = patch;
    if (patch.text != null && (selected.type === 'text' || selected.type === 'shape') && currentRegion === 'body' && (selected.layoutMode ?? 'floating') === 'flow') {
      const lineCount = Math.max(1, patch.text.split(/\r?\n/).length);
      const lineHeightPx = (selected.fontSize || 18) * (selected.lineHeight ?? 1.25);
      normalizedPatch = { ...patch, height: Math.max(32, Math.ceil(lineCount * lineHeightPx + 16)) };
    }
    patch = normalizedPatch;
    const requestedRegion = selected.type === 'table' ? 'body' : (patch.region ?? currentRegion);
    const convertingExistingBodyBlockToFlow = requestedRegion === 'body'
      && currentRegion === 'body'
      && (selected.layoutMode ?? 'floating') !== 'flow'
      && patch.layoutMode === 'flow';

    if (convertingExistingBodyBlockToFlow) {
      const converted = constrainElementToRegion({
        ...selected,
        ...patch,
        region: 'body',
        layoutMode: 'flow',
        // A legacy/free-position block becomes its own row first. Users can
        // explicitly join rows afterwards for 50/50, 33/67, etc. layouts.
        flowRowId: newFlowRowId(),
        flowWidthPercent: patch.flowWidthPercent ?? selected.flowWidthPercent ?? 100,
        flowGapBeforeMm: patch.flowGapBeforeMm ?? selected.flowGapBeforeMm ?? 0,
        flowGapAfterMm: patch.flowGapAfterMm ?? selected.flowGapAfterMm ?? 4,
        flowColumnGapMm: patch.flowColumnGapMm ?? selected.flowColumnGapMm ?? 4,
        flowAlign: patch.flowAlign ?? selected.flowAlign ?? 'left',
        flowWidth: patch.flowWidth ?? selected.flowWidth ?? 'full',
      }, pageSettings);
      setPages((currentPages) => currentPages.map((page) => {
        if (page.id !== activePageId) return page;
        return { ...page, elements: insertFlowElementByVisualY(page.elements, converted, pageSettings) };
      }));
    } else if ((requestedRegion === 'header' || requestedRegion === 'footer') && currentRegion === 'body') {
      const targetSettings = requestedRegion === 'header'
        ? { ...pageSettings, header: { ...pageSettings.header, enabled: true } }
        : { ...pageSettings, footer: { ...pageSettings.footer, enabled: true } };
      updateGlobalBandSettings(requestedRegion, targetSettings[requestedRegion]);
      const moved = constrainElementToRegion({ ...selected, ...patch, region: requestedRegion }, targetSettings);
      setPages((currentPages) => currentPages.map((page, index) => {
        if (page.id === activePageId) return { ...page, elements: page.elements.filter((item) => item.id !== selectedId) };
        if (index === 0) return { ...page, elements: [...page.elements.filter((item) => item.id !== selectedId), moved] };
        return page;
      }));
    } else if (currentRegion !== 'body' && requestedRegion === 'body') {
      const moved = constrainElementToRegion({ ...selected, ...patch, region: 'body', layoutMode: 'flow', flowRowId: selected.flowRowId ?? newFlowRowId(), flowWidthPercent: selected.flowWidthPercent ?? 100, flowGapBeforeMm: selected.flowGapBeforeMm ?? 0, flowGapAfterMm: selected.flowGapAfterMm ?? 4, flowColumnGapMm: selected.flowColumnGapMm ?? 4, flowAlign: selected.flowAlign ?? 'left' }, pageSettings);
      setPages((currentPages) => currentPages.map((page, index) => {
        if (index === 0) return { ...page, elements: page.elements.filter((item) => item.id !== selectedId) };
        if (page.id === activePageId) return { ...page, elements: [...page.elements.filter((item) => item.id !== selectedId), moved] };
        return page;
      }));
    } else {
      const next = constrainElementToRegion({ ...selected, ...patch, region: requestedRegion }, pageSettings);
      const targetMaster = requestedRegion !== 'body';
      const flowRowPatch = requestedRegion === 'body' && (selected.layoutMode ?? 'floating') === 'flow' && (patch.flowAlign != null || patch.flowColumnGapMm != null);
      const selectedRowId = flowRowKey(selected);
      setPages((currentPages) => currentPages.map((page, index) => {
        if (!((targetMaster && index === 0) || (!targetMaster && page.id === activePageId))) return page;
        const nextElements = page.elements.map((item) => {
          if (item.id === selectedId) return next;
          if (flowRowPatch && (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow' && flowRowKey(item) === selectedRowId) {
            return { ...item, ...(patch.flowAlign != null ? { flowAlign: patch.flowAlign } : {}), ...(patch.flowColumnGapMm != null ? { flowColumnGapMm: patch.flowColumnGapMm } : {}) };
          }
          return item;
        });
        return { ...page, elements: synchronizeFlowRowHeights(nextElements) };
      }));
    }
    setStatus('Unsaved changes');
  }

  function updateCanvasElement(item: BuilderElement, patch: Partial<BuilderElement>) {
    recordHistory();
    const region = item.region ?? 'body';
    const targetMaster = region !== 'body';
    setPages((currentPages) => currentPages.map((page, index) => {
      const isTarget = targetMaster ? index === 0 : page.id === activePageId;
      if (!isTarget) return page;
      const effectiveSettings = targetMaster ? { ...page.settings, header: { ...masterHeader }, footer: { ...masterFooter } } : pageSettings;
      let normalizedPatch = patch;
      if (targetMaster && activePageId !== masterPage?.id && (patch.x != null || patch.y != null)) {
        const activeBounds = regionBoundsPx(region, pageSettings);
        const masterBounds = regionBoundsPx(region, effectiveSettings);
        normalizedPatch = {
          ...patch,
          ...(patch.x != null ? { x: masterBounds.x + (patch.x - activeBounds.x) } : {}),
          ...(patch.y != null ? { y: masterBounds.y + (patch.y - activeBounds.y) } : {}),
        };
      }
      const nextElements = page.elements.map((entry) => {
        if (entry.id !== item.id) return entry;
        const isBodyFlow = (entry.region ?? 'body') === 'body' && (entry.layoutMode ?? 'floating') === 'flow';
        const safePatch = isBodyFlow ? Object.fromEntries(Object.entries(normalizedPatch).filter(([key]) => key !== 'x' && key !== 'y')) as Partial<BuilderElement> : normalizedPatch;
        return constrainElementToRegion({ ...entry, ...safePatch }, effectiveSettings);
      });
      return { ...page, elements: synchronizeFlowRowHeights(nextElements) };
    }));
    setStatus('Unsaved changes');
  }

  function deleteSelected() {
    if (!selectedId || !selected) return;
    recordHistory();
    if (selected.type === 'formula') {
      setPages((currentPages) => currentPages.map((page) => ({ ...page, elements: page.elements.filter((item) => item.id !== selectedId) })));
      setSelectedId(null); setStatus('Unsaved changes'); return;
    }
    const targetMaster = (selected.region ?? 'body') !== 'body';
    setPages((currentPages) => currentPages.map((page, index) => ((targetMaster && index === 0) || (!targetMaster && page.id === activePageId)) ? { ...page, elements: synchronizeFlowRowHeights(page.elements.filter((item) => item.id !== selectedId)) } : page));
    setSelectedId(null);
    setStatus('Unsaved changes');
  }

  function duplicateSelected() {
    if (!selected) return;
    recordHistory();
    if (selected.type === 'formula') {
      const copy: BuilderElement = { ...selected, id: crypto.randomUUID(), formulaName: `${selected.formulaName || 'Formula'}Copy` };
      setPages((currentPages) => currentPages.map((page, index) => index === 0 ? { ...page, elements: [...page.elements, copy] } : page));
      setSelectedId(copy.id); setStatus('Unsaved changes'); return;
    }
    const region = selected.region ?? 'body';
    const copy: BuilderElement = constrainElementToRegion({ ...selected, id: crypto.randomUUID(), x: selected.x + 18, y: selected.y + 18, ...((selected.region ?? 'body') === 'body' && (selected.layoutMode ?? 'floating') === 'flow' ? { flowRowId: newFlowRowId(), flowRowHeightPx: undefined } : {}) }, pageSettings);
    setPages((currentPages) => currentPages.map((page, index) => ((region !== 'body' && index === 0) || (region === 'body' && page.id === activePageId)) ? { ...page, elements: [...page.elements, copy] } : page));
    setSelectedId(copy.id);
    setStatus('Unsaved changes');
  }

  function arrangeSelected(action: 'front' | 'forward' | 'backward' | 'back') {
    if (!selectedId || !selected) return;
    recordHistory();
    const region = selected.region ?? 'body';
    setPages((currentPages) => currentPages.map((page, index) => {
      const targetsMaster = region !== 'body';
      if (!((targetsMaster && index === 0) || (!targetsMaster && page.id === activePageId))) return page;
      const items = [...page.elements];
      const from = items.findIndex((item) => item.id === selectedId);
      if (from < 0) return page;
      const [item] = items.splice(from, 1);
      let to = from;
      if (action === 'front') to = items.length;
      else if (action === 'forward') to = Math.min(items.length, from + 1);
      else if (action === 'backward') to = Math.max(0, from - 1);
      else if (action === 'back') to = 0;
      items.splice(to, 0, item);
      return { ...page, elements: items };
    }));
    setStatus('Unsaved changes');
  }

  function moveFlowSelected(direction: -1 | 1) {
    if (!selectedId || !selected || (selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') !== 'flow') return;
    recordHistory();
    setPages((currentPages) => currentPages.map((page) => {
      if (page.id !== activePageId) return page;
      const items = [...page.elements];
      const bodyFlowIndexes = items.map((item, index) => ({ item, index })).filter(({ item }) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow');
      const flowIndex = bodyFlowIndexes.findIndex(({ item }) => item.id === selectedId);
      const targetFlowIndex = flowIndex + direction;
      if (flowIndex < 0 || targetFlowIndex < 0 || targetFlowIndex >= bodyFlowIndexes.length) return page;
      const from = bodyFlowIndexes[flowIndex].index;
      const to = bodyFlowIndexes[targetFlowIndex].index;
      [items[from], items[to]] = [items[to], items[from]];
      return { ...page, elements: items };
    }));
    setStatus('Unsaved changes');
  }


  function updateFlowRowSelected(action: 'newRow' | 'joinPrevious' | 'joinNext' | 'left' | 'right') {
    if (!selectedId || !selected || (selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') !== 'flow') return;
    recordHistory();
    setPages((currentPages) => currentPages.map((page) => {
      if (page.id !== activePageId) return page;
      const items = [...page.elements];
      const flows = items.filter((item) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow');
      const at = flows.findIndex((item) => item.id === selectedId);
      if (at < 0) return page;
      const target = action === 'joinPrevious' ? flows[at - 1] : action === 'joinNext' ? flows[at + 1] : null;
      if ((action === 'joinPrevious' || action === 'joinNext') && !target) return page;
      if (action === 'left' || action === 'right') {
        const rowId = selected.flowRowId;
        const rowIds = items.map((item, index) => ({ item, index })).filter(({ item }) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow' && flowRowKey(item) === flowRowKey(selected));
        const rowAt = rowIds.findIndex(({ item }) => item.id === selectedId);
        const swapWith = action === 'left' ? rowAt - 1 : rowAt + 1;
        if (rowAt < 0 || swapWith < 0 || swapWith >= rowIds.length) return page;
        const a = rowIds[rowAt].index, b = rowIds[swapWith].index;
        [items[a], items[b]] = [items[b], items[a]];
        return { ...page, elements: synchronizeFlowRowHeights(items) };
      }
      const rowId = action === 'newRow' ? newFlowRowId() : flowRowKey(target!);
      return { ...page, elements: synchronizeFlowRowHeights(items.map((item) => item.id === selectedId ? { ...item, flowRowId: rowId } : item)) };
    }));
    setStatus('Unsaved changes');
  }

  function updateGlobalBandSettings(region: 'header' | 'footer', value: PageSettings[typeof region]) {
    recordHistory();
    setPages((currentPages) => currentPages.map((page) => {
      const previousSettings = { ...page.settings, header: { ...masterHeader }, footer: { ...masterFooter } };
      const settings = { ...page.settings, [region]: { ...value } } as PageSettings;
      const nextElements = page.elements.map((element) => reflowRegionElement(element, previousSettings, settings));
      return { ...page, settings, elements: nextElements };
    }));
    setStatus('Unsaved changes');
  }

  function updatePageSettings(patch: Partial<PageSettings>) {
    if (patch.header) { updateGlobalBandSettings('header', { ...pageSettings.header, ...patch.header }); return; }
    if (patch.footer) { updateGlobalBandSettings('footer', { ...pageSettings.footer, ...patch.footer }); return; }
    recordHistory();
    setPages((current) => current.map((page) => {
      if (page.id !== activePageId) return page;
      const settings = { ...page.settings, ...patch, header: { ...masterHeader }, footer: { ...masterFooter } };
      const geometryChanged = Boolean(
        patch.marginsMm || patch.preset || patch.orientation ||
        patch.customWidthMm != null || patch.customHeightMm != null || patch.header || patch.footer
      );
      if (!geometryChanged) return { ...page, settings };
      const bounds = contentBoundsPx(settings);
      const nextElements = page.elements.map((element) => {
        if (element.type === 'table') return { ...element, x: bounds.x, y: Math.max(element.y, bounds.y), width: bounds.width, region: 'body' as PageRegion };
        return reflowRegionElement(element, page.settings, settings);
      });
      return { ...page, settings, elements: nextElements };
    }));
    setStatus('Unsaved changes');
  }

  function addPage() {
    recordHistory();
    const page: BuilderPage = { id: crypto.randomUUID(), name: `Page ${pages.length + 1}`, settings: { ...normalizePageSettings(pageSettings), marginsMm: { ...pageSettings.marginsMm }, bleedMm: { ...pageSettings.bleedMm }, header: { ...pageSettings.header }, footer: { ...pageSettings.footer } }, elements: [] };
    setPages((current) => [...current, page]); setActivePageId(page.id); setSelectedId(null); setStatus('Unsaved changes');
  }
  function duplicatePage() { if (!activePage) return; recordHistory(); const page: BuilderPage = { ...activePage, id: crypto.randomUUID(), name: `${activePage.name} Copy`, settings: { ...normalizePageSettings(activePage.settings), marginsMm: { ...activePage.settings.marginsMm }, bleedMm: { ...activePage.settings.bleedMm }, header: { ...activePage.settings.header }, footer: { ...activePage.settings.footer } }, elements: activePage.elements.filter((e) => (e.region ?? 'body') === 'body').map((e) => ({ ...e, id: crypto.randomUUID() })) }; setPages((c) => [...c, page]); setActivePageId(page.id); setSelectedId(null); setStatus('Unsaved changes'); }
  function deletePage() { if (pages.length <= 1) return; recordHistory(); const next = pages.filter((p) => p.id !== activePageId); setPages(next); setActivePageId(next[0].id); setSelectedId(null); setStatus('Unsaved changes'); }
  function movePage(direction: -1 | 1) { const index = pages.findIndex((p) => p.id === activePageId); const target = index + direction; if (index < 0 || target < 0 || target >= pages.length) return; recordHistory(); const next = [...pages]; [next[index], next[target]] = [next[target], next[index]]; setPages(next); setStatus('Unsaved changes'); }
  function renamePage(value: string) { recordHistory(); setPages((c) => c.map((p) => p.id === activePageId ? { ...p, name: value } : p)); setStatus('Unsaved changes'); }

  function saveTemplate() {
    const payload: SavedTemplate = { name, pages, activePageId, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus('Saved locally');
  }

  async function exportPreviewPdf() {
    if (pdfExporting) return;
    const originalPageId = activePageId;
    const originalPreviewPage = activePreviewPageIndex;
    const originalSelectedId = selectedId;
    setPdfExporting(true);
    setPdfExportProgress('Preparing render model…');
    setSelectedId(null);
    try {
      const counts = pages.map((page) => {
        const effectiveSettings = { ...page.settings, header: { ...masterHeader }, footer: { ...masterFooter } };
        return buildBodyMaterialization(page.elements, effectiveSettings).pageCount;
      });
      const model = buildMaterializedRenderDocument(name, pages.map((page, index) => ({
        id: page.id,
        name: page.name,
        settings: { ...page.settings, header: { ...masterHeader }, footer: { ...masterFooter } },
        outputPageCount: counts[index] ?? 1,
      })));
      const resolvePageNode = async (renderPage: MaterializedRenderPage) => {
        if (activePageIdRef.current !== renderPage.builderPageId) {
          setActivePageId(renderPage.builderPageId);
          setActivePreviewPageIndex(0);
          await waitForBuilderPaint();
          await waitForBuilderPaint();
        } else {
          await waitForBuilderPaint();
        }
        const node = document.querySelector<HTMLElement>(`.document-page[data-builder-page-id="${renderPage.builderPageId}"][data-continuation-index="${renderPage.continuationIndex}"]`);
        if (!node) throw new Error(`Preview output page ${renderPage.documentPageIndex + 1} is unavailable.`);
        return node;
      };
      const bytes = await buildExactPreviewPdf(model, resolvePageNode, {
        dpi: 192,
        quality: 0.96,
        onProgress: ({ current, total }) => setPdfExportProgress(`Rendering PDF ${current} / ${total}`),
      });
      downloadPdf(bytes, sanitizeExportFileName(name || 'Document'));
      setStatus('PDF generated');
      setPdfExportProgress(`PDF ready • ${model.totalPages} page${model.totalPages === 1 ? '' : 's'}`);
    } catch (error) {
      console.error('DB-4.5 exact PDF export failed', error);
      setStatus('PDF export failed');
      setPdfExportProgress(error instanceof Error ? error.message : 'Unable to generate PDF');
    } finally {
      setActivePageId(originalPageId);
      setActivePreviewPageIndex(originalPreviewPage);
      setSelectedId(originalSelectedId);
      await waitForBuilderPaint();
      setPdfExporting(false);
    }
  }

  const contentBounds = contentBoundsPx(pageSettings);

  function buildBodyMaterialization(pageElements: BuilderElement[], settings: PageSettings) {
    const body = pageElements.filter((item) => (item.region ?? 'body') === 'body');
    const tablePlans = new Map<string, ReturnType<typeof paginateDynamicTable>>();
    const materialized = materializeBodyFlowPages(body, settings, (item, _pageIndex, _y, availableHeightPx, continuationHeightPx) => {
      if (item.type !== 'table' || !item.table || item.table.mode !== 'dynamic' || item.table.pagination?.enabled === false) return undefined;
      const tableSource = dataState.sources.find((candidate) => candidate.id === item.table?.binding?.sourceId) ?? source;
      const runtimeRows = dynamicRows(item.table, record, tableSource, source);
      const plan = paginateDynamicTable(
        item.table,
        runtimeRows,
        Math.max(40, availableHeightPx),
        Math.max(40, continuationHeightPx),
        Math.max(80, item.width),
      );
      tablePlans.set(item.id, plan);
      const finalPage = plan[plan.length - 1];
      return {
        pageCount: Math.max(1, plan.length),
        lastPageUsedHeightPx: Math.max(0, finalPage?.usedHeightPx ?? item.height),
      };
    });
    return { ...materialized, tablePlans };
  }

  // DB-4.4 Phase 3 Fix2: Body Flow is materialized across the complete output
  // span. A block after a multi-page Dynamic Table is placed after the FINAL
  // table fragment, not after the fragment visible on builder page 1.
  const activeBodyMaterialization = buildBodyMaterialization(rawActiveBodyElements, pageSettings);
  const virtualPageCounts = new Map<string, number>();
  for (const [tableId, plan] of activeBodyMaterialization.tablePlans) virtualPageCounts.set(tableId, Math.max(1, plan.length));
  const virtualPageCount = Math.max(1, activeBodyMaterialization.pageCount);

  const outputCountsByBuilderPage = pages.map((page) => {
    const effectiveSettings = { ...page.settings, header: { ...masterHeader }, footer: { ...masterFooter } };
    return buildBodyMaterialization(page.elements, effectiveSettings).pageCount;
  });
  const activeBuilderPageIndex = Math.max(0, pages.findIndex((page) => page.id === activePageId));
  const documentPageOffset = outputCountsByBuilderPage.slice(0, activeBuilderPageIndex).reduce((sum, value) => sum + value, 0);
  const documentOutputPageCount = outputCountsByBuilderPage.reduce((sum, value) => sum + value, 0);
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
          <span>{status} • {pageSettings.preset} {pageSettings.orientation.toLowerCase()} • {pages.length} builder page{pages.length === 1 ? '' : 's'}{documentOutputPageCount > 1 ? ` • ${documentOutputPageCount} output pages` : ''}</span>
        </div>
        <div className="builder-actions">
          {source ? <div className="global-preview-picker"><span>{globalDocumentPicker ? 'Preview document' : 'Preview record'}</span><RecordPicker count={source.records.length} value={globalDocumentPicker?.value ?? dataState.activeRecordIndex} options={globalDocumentPicker?.options} disabled={source.records.length === 0} compactLabel={globalDocumentPicker ? 'Document' : 'Record'} searchable searchPlaceholder={globalDocumentPicker ? 'Search document ID…' : 'Search record…'} onChange={selectPreviewRecord}/></div> : null}
          <button className="secondary" title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStackRef.current.length === 0}><Undo2 size={16}/><span>Undo</span></button>
          <button className="secondary" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={redo} disabled={redoStackRef.current.length === 0}><Redo2 size={16}/><span>Redo</span></button>
          <button className="secondary"><Eye size={16}/><span>Preview</span></button>
          <button className="secondary" onClick={exportPreviewPdf} disabled={pdfExporting} title="DB-4.5 exact Preview → PDF"><Download size={16}/><span>{pdfExporting ? pdfExportProgress || 'PDF…' : 'PDF'}</span></button>
          <button className="secondary" onClick={saveTemplate}><Save size={16}/><span>Save</span></button>
          <button className="primary" onClick={() => onNavigate('generate')}>Generate</button>
        </div>
      </header>

      {tableModalOpen && <TableCreateModal
        sources={dataState.sources}
        activeSourceId={dataState.activeSourceId}
        initialTable={tableEditorElementId ? (activePage?.elements.find((item) => item.id === tableEditorElementId)?.table) : undefined}
        onCancel={() => { setTableModalOpen(false); setTableEditorElementId(null); }}
        onCreate={saveTableConfiguration}
      />}

      <div className="builder-grid">
        <aside className="builder-left">
          <button className="panel-collapse left" title="Collapse elements panel" onClick={() => setLeftOpen(false)}><ChevronLeft size={15}/></button>
          <div className="section-title"><span>Elements</span><small>Click to add</small></div>
          <div className="insert-region-card">
            <small>Add new content to</small>
            <div className="insert-region-actions">
              {(['body','header','footer'] as PageRegion[]).map((region) => <button type="button" key={region} className={activeInsertRegion === region ? 'active' : ''} onClick={() => {
                setActiveInsertRegion(region);
                if (region === 'header' && !pageSettings.header.enabled) updatePageSettings({ header: { ...pageSettings.header, enabled: true } });
                if (region === 'footer' && !pageSettings.footer.enabled) updatePageSettings({ footer: { ...pageSettings.footer, enabled: true } });
              }}>{region === 'body' ? 'Body' : region === 'header' ? 'Header' : 'Footer'}</button>)}
            </div>
            <span>{activeInsertRegion === 'body' ? 'Normal page content' : `${activeInsertRegion === 'header' ? 'Header' : 'Footer'} content repeats with the zone repeat rule.`}</span>
          </div>
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
            {elements.map((item, index) => <button key={item.id} className={item.id === selectedId ? 'element-row active' : 'element-row'} onClick={() => setSelectedId(item.id)}><span>{index + 1}</span><b>{item.type === 'formula' ? `Formula · ${item.formulaName || 'Unnamed'}` : labelFor(item.type)}</b>{(item.region ?? 'body') !== 'body' ? <small className={`region-badge ${(item.region ?? 'body')}`}>{(item.region ?? 'body') === 'header' ? 'H' : 'F'}</small> : null}</button>)}
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
                <div className="document-page" data-export-page="true" data-builder-page-id={activePage?.id} data-continuation-index={virtualPageIndex} data-document-page-index={documentPageOffset + virtualPageIndex} style={{ ...pageCanvasStyle(pageSettings), transform: `scale(${zoom / 100})` }} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
                  {pageSettings.showGuides && <PageGuides settings={pageSettings}/>} 
                  {virtualPageIndex === 0 && elements.length === 0 && <div className="page-empty"><span>{pageSettings.preset} DOCUMENT</span><strong>Start building your template</strong><small>Click an element from the left panel. You can then move, resize and edit it.</small></div>}
                  {elements.map((item) => {
                    if (item.type === 'formula') return null;
                    const region = item.region ?? 'body';
                    const runtimePageIndex = documentPageOffset + virtualPageIndex;
                    const isHeader = region === 'header' && pageSettings.header.enabled && repeatModeShows(pageSettings.header.repeat, runtimePageIndex);
                    const isFooter = region === 'footer' && pageSettings.footer.enabled && repeatModeShows(pageSettings.footer.repeat, runtimePageIndex);
                    const isBody = region === 'body';
                    let renderItem = item;
                    let tableFragmentIndex = virtualPageIndex;
                    let isPaginatedTable = false;

                    if (isBody) {
                      const isFlow = (item.layoutMode ?? 'floating') === 'flow';
                      if (!isFlow) {
                        // Floating Body content belongs only to the persistent builder page.
                        if (virtualPageIndex > 0) return null;
                      } else {
                        const placement = activeBodyMaterialization.placements.get(item.id);
                        if (!placement) return null;
                        const tablePlan = activeBodyMaterialization.tablePlans.get(item.id);
                        if (item.type === 'table' && item.table?.mode === 'dynamic' && tablePlan) {
                          if (virtualPageIndex < placement.pageIndex || virtualPageIndex > placement.endPageIndex) return null;
                          tableFragmentIndex = virtualPageIndex - placement.pageIndex;
                          isPaginatedTable = tablePlan.length > 1;
                          // DB-4.4 Phase 3 Fix5: a paginated Dynamic Table is one logical
                          // Flow block, but every output page renders only one physical fragment.
                          // Never reuse the persisted/logical table height as the fragment hit-box:
                          // on short continuation pages that created a large white selected overlay
                          // which covered otherwise-correct blocks below the table. Keep the logical
                          // placement, while sizing the canvas wrapper to this page's materialized
                          // table fragment only.
                          const fragmentPlan = tablePlan[tableFragmentIndex];
                          const fragmentHeight = Math.max(32, Math.ceil(fragmentPlan?.usedHeightPx ?? item.height));
                          renderItem = { ...item, y: placement.y, height: fragmentHeight };
                        } else {
                          if (virtualPageIndex !== placement.pageIndex) return null;
                          renderItem = { ...item, y: placement.y };
                        }
                      }
                    } else if (!isHeader && !isFooter) {
                      return null;
                    }

                    return <CanvasElement key={`${item.id}:vp:${virtualPageIndex}`} item={renderItem} selected={item.id === selectedId} zoom={zoom} pageSettings={pageSettings} record={record} source={source} sources={dataState.sources} formulaElements={formulaElements} formulaAggregateRows={formulaAggregateRows} virtualPageIndex={isPaginatedTable ? tableFragmentIndex : virtualPageIndex} virtualPageCount={virtualPageCount} runtimePageIndex={runtimePageIndex} runtimePageCount={documentOutputPageCount} virtualPageMode={isPaginatedTable} repeatedBandElement={(activePageId !== masterPage?.id || virtualPageIndex > 0) && (isHeader || isFooter)} onSelect={() => setSelectedId(item.id)} onHistoryStart={beginHistoryGesture} onHistoryEnd={endHistoryGesture} onSelectionChange={(table) => { setElementsRaw((current) => current.map((entry) => entry.id === item.id ? { ...entry, table } : entry)); }} onLayoutChange={(patch) => { if (shouldCommitMeasuredFlowHeight(virtualPageIndex, isPaginatedTable)) setElementsRaw((current) => synchronizeFlowRowHeights(current.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry))); }} onChange={(patch) => updateCanvasElement(item, patch)}/>;
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
            {(['properties', 'binding', 'formatting', 'conditions', 'header', 'footer'] as const).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'binding' ? 'Dynamic Field' : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <Inspector tab={tab} selected={selected} source={source} record={record} formulaElements={formulaElements} formulaAggregateRows={formulaAggregateRows} dynamicTokenFields={dynamicTokenFields} dataState={dataState} pageSettings={pageSettings} pageName={activePage?.name || 'Page'} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={focusPreviewPage} onPageSettings={updatePageSettings} onPageName={renamePage} onAddPage={addPage} onDuplicatePage={duplicatePage} onDeletePage={deletePage} onMovePage={movePage} onSelectPage={(pageId) => { setActivePageId(pageId); setSelectedId(null); setActivePreviewPageIndex(0); }} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected} onArrange={arrangeSelected} onMoveFlow={moveFlowSelected} onFlowRowAction={updateFlowRowSelected} relativeElements={activeBodyElements} onSetInsertRegion={(region) => setActiveInsertRegion(region)} onEditTableConfiguration={(elementId) => { setTableEditorElementId(elementId); setTableModalOpen(true); }}/>
        </aside>
      </div>
    </div>
  );
}

function waitForBuilderPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function sanitizeExportFileName(value: string) {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  return cleaned || 'Document';
}

function CanvasElement({ item, selected, zoom, pageSettings, record, source, sources, formulaElements, formulaAggregateRows, virtualPageIndex = 0, virtualPageCount = 1, runtimePageIndex = virtualPageIndex, runtimePageCount = virtualPageCount, virtualPageMode = false, repeatedBandElement = false, onSelect, onChange, onLayoutChange, onSelectionChange, onHistoryStart, onHistoryEnd }: { item: BuilderElement; selected: boolean; zoom: number; pageSettings: PageSettings; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; formulaElements: BuilderElement[]; formulaAggregateRows: Array<Record<string, unknown>>; virtualPageIndex?: number; virtualPageCount?: number; runtimePageIndex?: number; runtimePageCount?: number; virtualPageMode?: boolean; repeatedBandElement?: boolean; onSelect: () => void; onChange: (patch: Partial<BuilderElement>) => void; onLayoutChange: (patch: Partial<BuilderElement>) => void; onSelectionChange: (table: TableDefinition) => void; onHistoryStart: () => void; onHistoryEnd: () => void }) {
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; width: number; height: number } | null>(null);
  const scale = zoom / 100;
  const region = item.region ?? 'body';
  const regionBounds = region === 'header' ? headerBoundsPx(pageSettings) : region === 'footer' ? footerBoundsPx(pageSettings) : contentBoundsPx(pageSettings);
  const bandConstrained = region === 'header' || region === 'footer';
  const regionConstrained = region === 'body' || bandConstrained;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).dataset.resize === 'true') return;
    if (virtualPageMode && virtualPageIndex > 0 && region === 'body') { event.stopPropagation(); onSelect(); return; }
    if (region === 'body' && (item.layoutMode ?? 'floating') === 'flow') { event.stopPropagation(); onSelect(); return; }
    event.stopPropagation(); onSelect(); onHistoryStart();
    drag.current = { sx: event.clientX, sy: event.clientY, x: item.x, y: item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (resize.current) {
      const dx = (event.clientX - resize.current.sx) / scale;
      const dy = (event.clientY - resize.current.sy) / scale;
      if (item.type === 'table') {
        onChange({ width: Math.max(30, resize.current.width + dx) });
      } else if (regionConstrained) {
        const maxWidth = Math.max(20, regionBounds.x + regionBounds.width - item.x);
        const maxHeight = Math.max(item.type === 'divider' ? 4 : 20, regionBounds.y + regionBounds.height - item.y);
        onChange({
          width: clamp(resize.current.width + dx, 20, maxWidth),
          height: clamp(resize.current.height + dy, item.type === 'divider' ? 4 : 20, maxHeight),
        });
      } else {
        onChange({ width: Math.max(30, resize.current.width + dx), height: Math.max(item.type === 'divider' ? 4 : 20, resize.current.height + dy) });
      }
      return;
    }
    if (!drag.current) return;
    const dx = (event.clientX - drag.current.sx) / scale;
    const dy = (event.clientY - drag.current.sy) / scale;
    if (regionConstrained) {
      const maxX = regionBounds.x + regionBounds.width - item.width;
      const maxY = regionBounds.y + regionBounds.height - item.height;
      onChange({
        x: clamp(drag.current.x + dx, regionBounds.x, maxX),
        y: clamp(drag.current.y + dy, regionBounds.y, maxY),
      });
    } else {
      onChange({ x: Math.max(0, drag.current.x + dx), y: Math.max(0, drag.current.y + dy) });
    }
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
  return <div data-page-region={region} data-repeated-projection={repeatedBandElement ? 'true' : 'false'} className={`canvas-element ${selected ? 'selected' : ''} element-${item.type} region-${region} ${virtualPageMode ? 'virtual-continuation-element' : ''} ${repeatedBandElement ? 'repeated-region-projection' : ''}`} style={{ left: item.x, top: renderedTop, width: item.width, height: item.height, color: item.color, background: item.type === 'shape' ? item.fill : undefined, fontSize: item.fontSize, fontFamily: item.fontFamily ?? 'Arial', fontWeight: item.fontWeight ?? 400, fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none', lineHeight: item.lineHeight ?? 1.25, textAlign: item.textAlign }} onPointerDown={startDrag} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <ElementContent item={item} pageSettings={pageSettings} record={record} source={source} sources={sources} formulaElements={formulaElements} formulaAggregateRows={formulaAggregateRows} virtualPageIndex={virtualPageIndex} virtualPageCount={virtualPageCount} runtimePageIndex={runtimePageIndex} runtimePageCount={runtimePageCount} virtualPageMode={virtualPageMode} onElementSelect={onSelect} onTableChange={(table) => onChange({ table })} onTableSelectionChange={onSelectionChange} onTableHistoryStart={onHistoryStart} onTableHistoryEnd={onHistoryEnd} onTableHeightChange={virtualPageMode ? undefined : (height) => { if (Math.abs(item.height - height) >= 1) onLayoutChange({ height }); }}/>
    {selected && (!virtualPageMode || virtualPageIndex === 0 || bandConstrained) && <>{!(region === 'body' && (item.layoutMode ?? 'floating') === 'flow') ? <span className="resize-handle" data-resize="true" onPointerDown={startResize}/> : null}<span className="selection-label">{repeatedBandElement ? `Global ${region === 'header' ? 'Header' : 'Footer'}` : labelFor(item.type)}</span></>}
  </div>;
}

function ElementContent({ item, pageSettings, record, source, sources, formulaElements, formulaAggregateRows, virtualPageIndex = 0, virtualPageCount = 1, runtimePageIndex = virtualPageIndex, runtimePageCount = virtualPageCount, virtualPageMode = false, onElementSelect, onTableChange, onTableSelectionChange, onTableHistoryStart, onTableHistoryEnd, onTableHeightChange }: { item: BuilderElement; pageSettings: PageSettings; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; formulaElements: BuilderElement[]; formulaAggregateRows: Array<Record<string, unknown>>; virtualPageIndex?: number; virtualPageCount?: number; runtimePageIndex?: number; runtimePageCount?: number; virtualPageMode?: boolean; repeatedBandElement?: boolean; onElementSelect: () => void; onTableChange: (table: TableDefinition) => void; onTableSelectionChange: (table: TableDefinition) => void; onTableHistoryStart: () => void; onTableHistoryEnd: () => void; onTableHeightChange?: (height: number) => void }) {
  const resolveBuilderField = (field: string) => valueForBuilderField(record, source?.fields ?? [], formulaElements, field, formulaAggregateRows);
  const bound = item.binding ? resolveBuilderField(item.binding) : undefined;
  const hasMixedTokens = templateHasTokens(item.text);
  const rawRendered = !hasMixedTokens && item.binding && bound !== undefined ? displayValue(bound) : item.text;
  const rendered = resolveTemplateTokens(rawRendered, resolveBuilderField, { pageNumber: runtimePageIndex + 1, totalPages: runtimePageCount, preserveUnknown: !record });
  if (item.type === 'formula') {
    const result = evaluateDocumentFormulaElement(item, record, formulaElements, formulaAggregateRows);
    return <span className="text-content formula-field-result">{result == null ? '—' : displayValue(result)}</span>;
  }
  if (item.type === 'image' || item.type === 'signature') return <ImageBackedContent item={item} bound={bound}/>;
  if (item.type === 'table' && item.table) {
    const tableSource = sources.find((candidate) => candidate.id === item.table?.binding?.sourceId) ?? source;
    const bounds = contentBoundsPx(pageSettings);
    const availableHeight = Math.max(80, bounds.y + bounds.height - item.y);
    return <TableCanvas table={item.table} record={record} source={tableSource} documentSource={source} globalFormulaValues={documentFormulaValues(record, formulaElements, formulaAggregateRows)} availableHeight={availableHeight} continuationAvailableHeight={Math.max(80, bounds.height)} availableWidth={Math.max(80, item.width)} fragmentIndex={virtualPageMode ? virtualPageIndex : undefined} virtualPageMode={virtualPageMode} onChange={(table) => { onElementSelect(); onTableChange(table); }} onSelectionChange={(table) => { onElementSelect(); onTableSelectionChange(table); }} onInteractionStart={onTableHistoryStart} onInteractionEnd={onTableHistoryEnd} onHeightChange={onTableHeightChange}/>;
  }
  if (item.type === 'table') return <div className="db-table-empty-placeholder">Table schema missing</div>;
  if (item.type === 'qr') return <><QrCode size={52}/><small>{rendered}</small></>;
  if (item.type === 'barcode') return <><Barcode size={72}/><small>{rendered}</small></>;
  if (item.type === 'divider') return <span className="divider-line"/>;
  if (item.type === 'shape') return rendered ? <span className="text-content shape-text-content">{rendered}</span> : null;
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
    {settings.header.enabled ? <div className="page-band-guide header-band-guide" style={{ left: mmToPx(m.left), right: mmToPx(m.right), top: mmToPx(m.top), height: mmToPx(settings.header.heightMm) }}><span>HEADER</span></div> : null}
    {settings.footer.enabled ? <div className="page-band-guide footer-band-guide" style={{ left: mmToPx(m.left), right: mmToPx(m.right), bottom: mmToPx(m.bottom), height: mmToPx(settings.footer.heightMm) }}><span>FOOTER</span></div> : null}
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
    <section className="inspector-card page-band-card"><div className="inspector-card-title"><span>⇥ Header Zone</span><button type="button" className={settings.header.enabled?'mini-toggle active':'mini-toggle'} onClick={() => onChange({ header: { ...settings.header, enabled: !settings.header.enabled } })}>{settings.header.enabled?'Enabled':'Disabled'}</button></div>
      <div className="property-grid"><label>Height<input type="number" min="0" step="0.5" disabled={!settings.header.enabled} value={Number(mmToUnit(settings.header.heightMm,unit).toFixed(2))} onChange={(e) => onChange({ header: { ...settings.header, heightMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label><label>Content gap<input type="number" min="0" step="0.5" disabled={!settings.header.enabled} value={Number(mmToUnit(settings.header.gapMm,unit).toFixed(2))} onChange={(e) => onChange({ header: { ...settings.header, gapMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label></div>
      <label>Repeat<select disabled={!settings.header.enabled} value={settings.header.repeat} onChange={(e) => onChange({ header: { ...settings.header, repeat: e.target.value as PageRepeatMode } })}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label>
      <div className="table-cell-help">Header is a content container. Text, Image, Shape, QR, Barcode, Signature and Divider elements assigned here repeat together according to this rule. Body/table content starts after Header height + gap.</div>
    </section>
    <section className="inspector-card page-band-card"><div className="inspector-card-title"><span>⇤ Footer Zone</span><button type="button" className={settings.footer.enabled?'mini-toggle active':'mini-toggle'} onClick={() => onChange({ footer: { ...settings.footer, enabled: !settings.footer.enabled } })}>{settings.footer.enabled?'Enabled':'Disabled'}</button></div>
      <div className="property-grid"><label>Height<input type="number" min="0" step="0.5" disabled={!settings.footer.enabled} value={Number(mmToUnit(settings.footer.heightMm,unit).toFixed(2))} onChange={(e) => onChange({ footer: { ...settings.footer, heightMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label><label>Content gap<input type="number" min="0" step="0.5" disabled={!settings.footer.enabled} value={Number(mmToUnit(settings.footer.gapMm,unit).toFixed(2))} onChange={(e) => onChange({ footer: { ...settings.footer, gapMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label></div>
      <label>Repeat<select disabled={!settings.footer.enabled} value={settings.footer.repeat} onChange={(e) => onChange({ footer: { ...settings.footer, repeat: e.target.value as PageRepeatMode } })}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label>
      <div className="table-cell-help">Footer is a content container and repeats all assigned elements together. Use a Text element with <b>{'{{pageNumber}}'}</b> and <b>{'{{totalPages}}'}</b> for Page X of Y.</div>
    </section>
    <section className="inspector-card"><div className="inspector-card-title"><span>✂ Bleed</span><button className={linkBleed?'mini-toggle active':'mini-toggle'} onClick={() => setLinkBleed(!linkBleed)}>{linkBleed?'Linked':'Unlinked'}</button></div><div className="edge-grid">{(['top','right','bottom','left'] as const).map((side) => <label key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.bleedMm[side],unit).toFixed(2))} onChange={(e) => updateEdges('bleedMm',side,Number(e.target.value),linkBleed)}/></label>)}</div></section>
    <section className="inspector-card"><div className="inspector-card-title">▱ Safe Area & Appearance</div><label>Safe area inset<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.safeAreaMm,unit).toFixed(2))} onChange={(e) => onChange({ safeAreaMm: unitToMm(Number(e.target.value)||0,unit) })}/></label><div className="property-grid"><label>Background<input type="color" value={settings.background} onChange={(e) => onChange({ background:e.target.value })}/></label><label>Border color<input type="color" value={settings.borderColor} onChange={(e) => onChange({ borderColor:e.target.value })}/></label></div><label>Border width<input type="number" min="0" max="10" value={settings.borderWidth} onChange={(e) => onChange({ borderWidth:Math.max(0,Number(e.target.value)||0) })}/></label><label className="check-row"><input type="checkbox" checked={settings.showGuides} onChange={(e) => onChange({ showGuides:e.target.checked })}/> Show margin / safe / bleed guides</label></section>
  </div>;
}

function buildDocumentPreviewPicker(source: NonNullable<ReturnType<typeof activeSource>>, record: ReturnType<typeof activeRecord>, activeRecordIndex: number, pageElements: BuilderElement[]) {
  const identityTable = pageElements.find((item) => {
    if (item.type !== 'table' || item.table?.mode !== 'dynamic' || item.table.binding?.sourceId !== source.id) return false;
    const parentKeys = item.table.binding.parentKeys?.filter(Boolean) ?? (item.table.binding.parentKey ? [item.table.binding.parentKey] : []);
    return parentKeys.length > 0;
  });
  const identityKeys = identityTable?.table?.binding?.parentKeys?.filter(Boolean)
    ?? (identityTable?.table?.binding?.parentKey ? [identityTable.table.binding.parentKey] : []);
  if (identityKeys.length === 0) return null;

  const seen = new Map<string, { value: number; label: string }>();
  source.records.forEach((sourceRecord, index) => {
    const values = identityKeys.map((key) => displayValue(valueForField(sourceRecord, key)).trim());
    const composite = values.join('\u241F');
    if (!composite || values.every((value) => !value) || seen.has(composite)) return;
    const fieldLabels = identityKeys.map((key) => source.fields.find((field) => field.name === key)?.label || key);
    const label = identityKeys.length === 1
      ? `${fieldLabels[0]}: ${values[0]}`
      : `${fieldLabels.join(' + ')}: ${values.join(' · ')}`;
    seen.set(composite, { value: index, label });
  });
  const currentValues = record ? identityKeys.map((key) => displayValue(valueForField(record, key)).trim()) : [];
  const currentComposite = currentValues.join('\u241F');
  const selectedOption = currentComposite ? seen.get(currentComposite) : undefined;
  return { options: Array.from(seen.values()), value: selectedOption?.value ?? activeRecordIndex };
}

function Inspector({ tab, selected, source, record, formulaElements, formulaAggregateRows, dynamicTokenFields, dataState, pageSettings, pageName, pages, activePageId, virtualPageCount, activePreviewPageIndex, onFocusPreviewPage, onPageSettings, onPageName, onAddPage, onDuplicatePage, onDeletePage, onMovePage, onSelectPage, onUpdate, onDelete, onDuplicate, onArrange, onMoveFlow, onFlowRowAction, relativeElements, onSetInsertRegion, onEditTableConfiguration }: {
  tab: InspectorTab; selected: BuilderElement | null; source: ReturnType<typeof activeSource>; record: ReturnType<typeof activeRecord>; formulaElements: BuilderElement[]; formulaAggregateRows: Array<Record<string, unknown>>; dynamicTokenFields: TemplateTokenField[]; dataState: BuilderDataState; pageSettings: PageSettings; pageName: string; pages: BuilderPage[]; activePageId: string; virtualPageCount: number; activePreviewPageIndex: number; onFocusPreviewPage: (index: number) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void; onPageName: (value: string) => void; onAddPage: () => void; onDuplicatePage: () => void; onDeletePage: () => void; onMovePage: (direction: -1 | 1) => void; onSelectPage: (pageId: string) => void;
  onUpdate: (patch: Partial<BuilderElement>) => void; onDelete: () => void; onDuplicate: () => void; onArrange: (action: 'front' | 'forward' | 'backward' | 'back') => void; onMoveFlow: (direction: -1 | 1) => void; onFlowRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void; relativeElements: BuilderElement[]; onSetInsertRegion: (region: PageRegion) => void; onEditTableConfiguration: (elementId: string) => void;
}) {

  const assignRegion = (region: PageRegion) => {
    if (!selected || selected.type === 'table') return;
    let effectiveSettings = pageSettings;
    if (region === 'header' && !pageSettings.header.enabled) {
      effectiveSettings = { ...pageSettings, header: { ...pageSettings.header, enabled: true } };
      onPageSettings({ header: effectiveSettings.header });
    } else if (region === 'footer' && !pageSettings.footer.enabled) {
      effectiveSettings = { ...pageSettings, footer: { ...pageSettings.footer, enabled: true } };
      onPageSettings({ footer: effectiveSettings.footer });
    }
    const bounds = region === 'header' ? headerBoundsPx(effectiveSettings) : region === 'footer' ? footerBoundsPx(effectiveSettings) : contentBoundsPx(effectiveSettings);
    const minHeight = selected.type === 'divider' ? 4 : 20;
    const width = Math.min(selected.width, Math.max(20, bounds.width));
    const height = region === 'body' ? selected.height : Math.min(selected.height, Math.max(minHeight, bounds.height));
    const x = Math.min(Math.max(selected.x, bounds.x), Math.max(bounds.x, bounds.x + bounds.width - width));
    const y = region === 'body'
      ? Math.max(selected.y, bounds.y)
      : Math.min(Math.max(selected.y, bounds.y), Math.max(bounds.y, bounds.y + bounds.height - height));
    onUpdate({ region, x, y, width, height });
  };
  const selectedBand = selected?.region === 'header' ? 'header' : selected?.region === 'footer' ? 'footer' : null;
  const selectedContentPreview = selected ? resolveTemplateTokens(selected.text, (field) => valueForBuilderField(record, source?.fields ?? [], formulaElements, field, formulaAggregateRows), { pageNumber: activePreviewPageIndex + 1, totalPages: Math.max(1, virtualPageCount), preserveUnknown: !record }) : '';
  const selectedFormulaPreview = selected?.type === 'formula' ? evaluateDocumentFormulaElement(selected, record, formulaElements, formulaAggregateRows) : null;

  if (tab === 'header') return <GlobalBandEditor region="header" settings={pageSettings} onPageSettings={onPageSettings} onSetInsertRegion={onSetInsertRegion}/>;
  if (tab === 'footer') return <GlobalBandEditor region="footer" settings={pageSettings} onPageSettings={onPageSettings} onSetInsertRegion={onSetInsertRegion}/>;
  if (tab === 'binding') return <div className="inspector-body"><h3>Dynamic Field</h3><p>{selected ? 'Pick an imported field or reusable Formula Field. Formula Fields are available everywhere in the document.' : 'Select an element to use a Dynamic Field.'}</p><label>Whole element binding<select disabled={!selected || dynamicTokenFields.length === 0 || selected.type === 'formula'} value={selected?.binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value || undefined })}><option value="">No whole-element binding</option>{source?.fields.length ? <optgroup label="Imported Fields">{source.fields.map((field) => <option key={`src:${field.name}`} value={field.name}>{field.label} ({field.type})</option>)}</optgroup> : null}{formulaTokenFieldsForElements(formulaElements).length ? <optgroup label="Formula Fields">{formulaTokenFieldsForElements(formulaElements).map((field) => <option key={`formula:${field.name}`} value={field.name}>{field.label}</option>)}</optgroup> : null}</select></label>{selected?.binding && <><div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{displayValue(valueForBuilderField(record, source?.fields ?? [], formulaElements, selected.binding, formulaAggregateRows)) || 'Empty / null'}</strong></div></>}{selected && selected.type !== 'table' && selected.type !== 'image' && selected.type !== 'signature' && selected.type !== 'divider' && selected.type !== 'formula' ? <TokenInsertPanel fields={dynamicTokenFields} value={selected.text} onChange={(text) => onUpdate({ text })}/> : null}</div>;
  if (tab === 'formatting') return <div className="inspector-body"><h3>Formatting</h3>{!selected ? <p>Select an element to edit document-safe formatting.</p> : <><label>Font family<select value={selected.fontFamily ?? 'Arial'} onChange={(e) => onUpdate({ fontFamily: e.target.value })}><option>Arial</option><option>Helvetica</option><option>Verdana</option><option>Tahoma</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option></select></label><div className="property-grid"><label>Font size<input type="number" min="6" max="144" value={selected.fontSize} onChange={(e) => onUpdate({ fontSize: Math.max(6, Number(e.target.value) || 12) })}/></label><label>Line height<input type="number" min="0.8" max="3" step="0.05" value={selected.lineHeight ?? 1.25} onChange={(e) => onUpdate({ lineHeight: Math.min(3, Math.max(0.8, Number(e.target.value) || 1.25)) })}/></label></div><div className="text-style-actions"><button type="button" className={(selected.fontWeight ?? 400) >= 700 ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ fontWeight: (selected.fontWeight ?? 400) >= 700 ? 400 : 700 })}><b>B</b></button><button type="button" className={selected.italic ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ italic: !selected.italic })}><i>I</i></button><button type="button" className={selected.underline ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ underline: !selected.underline })}><u>U</u></button></div><label>Text color<input type="color" value={selected.color} onChange={(e) => onUpdate({ color: e.target.value })}/></label>{selected.type === 'shape' && <label>Fill<input type="color" value={selected.fill} onChange={(e) => onUpdate({ fill: e.target.value })}/></label>}<div className="align-actions"><button className={selected.textAlign === 'left' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'left' })}><AlignLeft size={16}/></button><button className={selected.textAlign === 'center' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter size={16}/></button><button className={selected.textAlign === 'right' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight size={16}/></button></div><p className="table-cell-help">Typography applies to static text and every resolved dynamic token in this content block.</p></>}</div>;
  if (tab === 'properties' && selected?.type === 'formula') return <div className="inspector-body"><h3>Formula Field</h3><FormulaFieldProperties selected={selected} source={source} formulaElements={formulaElements} preview={selectedFormulaPreview} onUpdate={onUpdate}/><div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></div>;
  if (tab === 'conditions') return <div className="inspector-body"><h3>Conditions</h3><p>Condition rules are planned for a later phase. The selected element remains schema-ready for them.</p><button className="secondary" disabled={!selected}>Add condition</button></div>;
  return <div className="inspector-body"><h3>Properties</h3>{selected ? <><section className="inspector-card element-zone-card"><div className="inspector-card-title">Page Zone</div><label>Region<select value={selected.region ?? 'body'} disabled={selected.type === 'table'} onChange={(e) => assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>{selected.type === 'table' ? <div className="table-cell-help">Tables belong to the Body zone and paginate between Header/Footer-aware content bounds.</div> : <>{selectedBand ? <label>{selectedBand === 'header' ? 'Header' : 'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e) => onPageSettings({ [selectedBand]: { ...pageSettings[selectedBand], enabled: true, repeat: e.target.value as PageRepeatMode } } as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label> : null}<div className="table-cell-help">Header/Footer are global document masters. All assigned Text/Image/Shape/QR/Barcode/Signature/Divider elements repeat across builder pages and overflow continuations using the master repeat rule. Dragging/resizing any projected copy edits the one global master, so all pages stay synchronized.</div></>}</section><div className="property-grid"><label>X<input type="number" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow'} value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label><label>Y<input type="number" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow'} value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label><label>Width<input type="number" min="20" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow' && (selected.flowWidth ?? (selected.type === 'table' ? 'full' : 'custom')) === 'full'} value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label><label>Height<input type={selected.type === 'table' ? 'text' : 'number'} min={selected.type === 'table' ? undefined : '4'} disabled={selected.type === 'table'} value={selected.type === 'table' ? `Auto · ${Math.round(selected.height)}px` : Math.round(selected.height)} onChange={(e) => { if (selected.type !== 'table') onUpdate({ height: Math.max(4, Number(e.target.value) || 4) }); }}/></label></div>{selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <><BodyFlowControls selected={selected} elements={relativeElements} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction}/>{(selected.layoutMode ?? 'floating') === 'floating' ? <><BodyPositionControls selected={selected} settings={pageSettings} onUpdate={onUpdate}/><RelativePlacementControls selected={selected} elements={relativeElements} settings={pageSettings} onUpdate={onUpdate}/></> : null}</>}{selected.type === 'table' && selected.table ? <TableProperties table={selected.table} sources={dataState.sources} activeSourceId={dataState.activeSourceId} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={(table) => onUpdate({ table })} onEditConfiguration={() => onEditTableConfiguration(selected.id)}/> : selected.type === 'formula' ? <FormulaFieldProperties selected={selected} source={source} formulaElements={formulaElements} preview={selectedFormulaPreview} onUpdate={onUpdate}/> : (selected.type === 'image' || selected.type === 'signature') ? <ImageProperties selected={selected} onUpdate={onUpdate}/> : selected.type !== 'divider' ? <MixedContentEditor label="Content" value={selected.text} fields={dynamicTokenFields} previewValue={selectedContentPreview} onChange={(text) => onUpdate({ text })}/> : null}{((selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') === 'floating') ? <section className="inspector-card arrange-card"><div className="inspector-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={() => onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={() => onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={() => onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={() => onArrange('back')}>Send Back</button></div><p className="table-cell-help">Smart Insert only avoids accidental overlap when an element is first created. Manual drag may overlap any existing block. Use these layer controls when the moved element needs to stay above or below a table, image, or shape.</p></section> : null}<div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></> : <PageProperties settings={pageSettings} pageName={pageName} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={onFocusPreviewPage} onChange={onPageSettings} onName={onPageName} onAddPage={onAddPage} onDuplicatePage={onDuplicatePage} onDeletePage={onDeletePage} onMovePage={onMovePage} onSelectPage={onSelectPage}/>}</div>;
}



function insertTokenAtSelection(current: string, token: string, textarea: HTMLTextAreaElement | null) {
  if (!textarea) return `${current}${current && !current.endsWith(' ') ? ' ' : ''}${token}`;
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? start;
  return `${current.slice(0, start)}${token}${current.slice(end)}`;
}

function TokenInsertPanel({ fields, value, onChange }: { fields: TemplateTokenField[]; value: string; onChange: (value: string) => void }) {
  const [field, setField] = useState(fields[0]?.name ?? '');
  useEffect(() => { if (field && fields.some((item) => item.name === field)) return; setField(fields[0]?.name ?? ''); }, [fields, field]);
  const append = (token: string) => onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}${token}`);
  return <section className="inspector-card mixed-token-card"><div className="inspector-card-title">Mixed static + dynamic content</div><p className="table-cell-help">Example: <b>Invoice No: {'{{InvoiceNo}}'}</b>. Static text and any number of field tokens can be combined.</p><div className="token-insert-row"><select value={field} disabled={!fields.length} onChange={(e) => setField(e.target.value)}><option value="">Select field…</option>{fields.map((item) => <option key={item.name} value={item.name}>{item.label || item.name}</option>)}</select><button type="button" className="secondary compact" disabled={!field} onClick={() => field && append(tokenForField(field))}>Insert field</button></div><div className="token-quick-actions"><button type="button" className="secondary compact" onClick={() => append('{{pageNumber}}')}>Page #</button><button type="button" className="secondary compact" onClick={() => append('{{totalPages}}')}>Total pages</button></div></section>;
}

function MixedContentEditor({ label, value, fields, onChange, compact = false, previewValue }: { label: string; value: string; fields: TemplateTokenField[]; onChange: (value: string) => void; compact?: boolean; previewValue?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [field, setField] = useState(fields[0]?.name ?? '');
  useEffect(() => { if (field && fields.some((item) => item.name === field)) return; setField(fields[0]?.name ?? ''); }, [fields, field]);
  const insert = (token: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const next = insertTokenAtSelection(value, token, textarea);
    onChange(next);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      const caret = start + token.length;
      target.setSelectionRange(caret, caret);
    });
  };
  return <div className={`mixed-content-editor${compact ? ' compact' : ''}`}><label>{label}<textarea ref={textareaRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Static text + {{DynamicField}}"/></label><div className="token-insert-row"><select value={field} disabled={!fields.length} onChange={(e) => setField(e.target.value)}><option value="">Dynamic field…</option>{fields.map((item) => <option key={item.name} value={item.name}>{item.label || item.name}</option>)}</select><button type="button" className="secondary compact" disabled={!field} onClick={() => field && insert(tokenForField(field))}>+ Insert</button></div><div className="token-quick-actions"><button type="button" className="secondary compact" onClick={() => insert('{{pageNumber}}')}>Page #</button><button type="button" className="secondary compact" onClick={() => insert('{{totalPages}}')}>Total pages</button></div><p className="table-cell-help">Tokens can be combined with static text anywhere this Content editor is available.</p>{previewValue !== undefined && templateHasTokens(value) ? <div className="binding-value mixed-content-preview"><small>Resolved preview</small><strong>{previewValue || 'Empty / null'}</strong></div> : null}</div>;
}

function elementDisplayName(element: BuilderElement) {
  const typeLabel = element.type === 'table' ? 'Table' : element.type === 'formula' ? `Formula Field${element.formulaName ? ` · ${element.formulaName}` : ''}` : element.type.charAt(0).toUpperCase() + element.type.slice(1);
  const raw = (element.text || '').replace(/\s+/g, ' ').trim();
  const suffix = raw ? ` · ${raw.slice(0, 28)}${raw.length > 28 ? '…' : ''}` : '';
  return `${typeLabel}${suffix}`;
}

function BodyFlowControls({ selected, elements, onUpdate, onMove, onRowAction }: { selected: BuilderElement; elements: BuilderElement[]; onUpdate: (patch: Partial<BuilderElement>) => void; onMove: (direction: -1 | 1) => void; onRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void }) {
  const mode = selected.layoutMode ?? 'floating';
  if ((selected.region ?? 'body') !== 'body') return null;
  const isFlow = mode === 'flow';
  const widthPct = Math.round(selected.flowWidthPercent ?? 100);
  const rowMembers = isFlow ? elements.filter((item) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow' && flowRowKey(item) === flowRowKey(selected)) : [];
  const reservedRowHeight = rowMembers.length ? Math.max(...rowMembers.map((item) => Math.max(item.height, item.flowRowHeightPx ?? 0))) : selected.height;
  return <section className="inspector-card body-flow-card"><div className="inspector-card-title">Body Block Layout</div>
    <div className="layout-mode-toggle"><button type="button" className={isFlow ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ layoutMode: 'flow', flowRowId: selected.flowRowId ?? newFlowRowId(), flowWidthPercent: selected.flowWidthPercent ?? 100, flowGapBeforeMm: selected.flowGapBeforeMm ?? 0, flowGapAfterMm: selected.flowGapAfterMm ?? 4, flowColumnGapMm: selected.flowColumnGapMm ?? 4, flowAlign: selected.flowAlign ?? 'left', flowWidth: 'full' })}>Flow Block</button><button type="button" className={!isFlow ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ layoutMode: 'floating' })}>Floating</button></div>
    {isFlow ? <>
      <p className="table-cell-help"><strong>Simple document flow:</strong> Body starts at the usable top. Every new block gets a new row by default. Row height follows its tallest block; when Text/Table grows, every following row shifts automatically.</p>
      {rowMembers.length > 1 ? <div className="flow-row-status"><strong>Shared row</strong><span>{rowMembers.length} blocks · selected measures {Math.round(selected.height)}px · tallest reserves {Math.round(reservedRowHeight)}px</span></div> : <div className="flow-row-status"><strong>Measured height</strong><span>{Math.round(selected.height)}px</span></div>}
      <div className="property-grid"><label>Width (%)<input type="number" min="5" max="100" step="1" value={widthPct} onChange={(e) => onUpdate({ flowWidthPercent: Math.min(100, Math.max(5, Number(e.target.value) || 100)), flowWidth: 'custom' })}/></label><label>Row gap after (mm)<input type="number" min="0" step="0.5" value={selected.flowGapAfterMm ?? 4} onChange={(e) => onUpdate({ flowGapAfterMm: Math.max(0, Number(e.target.value) || 0) })}/></label></div>
      <div className="property-grid"><label>Gap before (mm)<input type="number" min="0" step="0.5" value={selected.flowGapBeforeMm ?? 0} onChange={(e) => onUpdate({ flowGapBeforeMm: Math.max(0, Number(e.target.value) || 0) })}/></label><label>Block gap in row (mm)<input type="number" min="0" step="0.5" value={selected.flowColumnGapMm ?? 4} onChange={(e) => onUpdate({ flowColumnGapMm: Math.max(0, Number(e.target.value) || 0) })}/></label></div>
      <label>Row alignment<select value={selected.flowAlign ?? 'left'} onChange={(e) => onUpdate({ flowAlign: e.target.value as BodyFlowAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onMove(-1)}>↑ Move Up</button><button type="button" className="secondary compact" onClick={() => onMove(1)}>↓ Move Down</button></div>
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onRowAction('joinPrevious')}>Join Previous Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('joinNext')}>Join Next Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('newRow')}>New Row</button></div>
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onRowAction('left')}>← In Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('right')}>In Row →</button></div>
      <p className="table-cell-help">Default width is 100%. Set 50% + 50%, 33% + 67%, etc. and use Join Previous/Next Row to place blocks on the same horizontal line. Flow owns X/Y; use Floating only for intentional overlays.</p>
    </> : <p className="table-cell-help">Floating is an explicit escape hatch for watermarks, stamps, decorative overlays and free X/Y placement. Switch back to Flow Block to rejoin automatic document flow.</p>}
  </section>;
}

function RelativePlacementControls({ selected, elements, settings, onUpdate }: { selected: BuilderElement; elements: BuilderElement[]; settings: PageSettings; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const candidates = elements.filter((item) => item.id !== selected.id && (item.region ?? 'body') === 'body');
  const [referenceId, setReferenceId] = useState(candidates[0]?.id ?? '');
  const [gapMm, setGapMm] = useState(4);
  useEffect(() => { if (referenceId && candidates.some((item) => item.id === referenceId)) return; setReferenceId(candidates[0]?.id ?? ''); }, [referenceId, candidates.map((item) => item.id).join('|')]);
  const reference = candidates.find((item) => item.id === referenceId) ?? null;
  if (!reference) return null;
  const bounds = contentBoundsPx(settings);
  const gap = mmToPx(Math.max(0, gapMm));
  const clampX = (x: number, width = selected.width) => Math.min(Math.max(x, bounds.x), Math.max(bounds.x, bounds.x + bounds.width - width));
  const clampY = (y: number, height = selected.height) => Math.min(Math.max(y, bounds.y), Math.max(bounds.y, bounds.y + bounds.height - height));
  const placeAbove = () => onUpdate({ x: clampX(reference.x), y: clampY(reference.y - gap - selected.height) });
  const placeBelow = () => onUpdate({ x: clampX(reference.x), y: clampY(reference.y + reference.height + gap) });
  const alignLeft = () => onUpdate({ x: clampX(reference.x) });
  const alignCenter = () => onUpdate({ x: clampX(reference.x + (reference.width - selected.width) / 2) });
  const alignRight = () => onUpdate({ x: clampX(reference.x + reference.width - selected.width) });
  const matchWidth = () => { const width = Math.min(Math.max(20, reference.width), bounds.width); onUpdate({ width, x: clampX(reference.x, width) }); };
  return <section className="inspector-card relative-placement-card"><div className="inspector-card-title">Relative Placement</div><label>Reference block<select value={referenceId} onChange={(e) => setReferenceId(e.target.value)}>{candidates.map((item) => <option key={item.id} value={item.id}>{elementDisplayName(item)}</option>)}</select></label><label>Gap (mm)<input type="number" min="0" step="0.5" value={gapMm} onChange={(e) => setGapMm(Math.max(0, Number(e.target.value) || 0))}/></label><div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={placeAbove}>Place Above</button><button type="button" className="secondary compact" onClick={placeBelow}>Place Below</button></div><div className="band-position-actions"><button type="button" className="secondary compact" onClick={alignLeft}>Align Left</button><button type="button" className="secondary compact" onClick={alignCenter}>Align Center</button><button type="button" className="secondary compact" onClick={alignRight}>Align Right</button></div><button type="button" className="secondary compact full-width" onClick={matchWidth}>Match Reference Width</button><p className="table-cell-help">Use this when a block must sit directly above or below another block. Gap is preserved in physical mm. Manual drag and overlap remain available after placement.</p></section>;
}

function BodyPositionControls({ selected, settings, onUpdate }: { selected: BuilderElement; settings: PageSettings; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const bounds = contentBoundsPx(settings);
  const left = () => onUpdate({ x: bounds.x });
  const center = () => onUpdate({ x: bounds.x + Math.max(0, (bounds.width - selected.width) / 2) });
  const right = () => onUpdate({ x: bounds.x + Math.max(0, bounds.width - selected.width) });
  const top = () => onUpdate({ y: bounds.y });
  const middle = () => onUpdate({ y: bounds.y + Math.max(0, (bounds.height - selected.height) / 2) });
  const bottom = () => onUpdate({ y: bounds.y + Math.max(0, bounds.height - selected.height) });
  return <section className="inspector-card band-position-card body-position-card"><div className="inspector-card-title">Position in Body / Content</div><div className="band-position-actions"><button type="button" className="secondary compact" onClick={left}>Left</button><button type="button" className="secondary compact" onClick={center}>Center</button><button type="button" className="secondary compact" onClick={right}>Right</button></div><div className="band-position-actions"><button type="button" className="secondary compact" onClick={top}>Top</button><button type="button" className="secondary compact" onClick={middle}>Middle</button><button type="button" className="secondary compact" onClick={bottom}>Bottom</button></div><p className="table-cell-help">Alignment uses the usable Body area after margins, Header and Footer. New Body elements use Smart Insert to avoid accidental overlap; manual overlap is still allowed when you drag elements.</p></section>;
}

function BandPositionControls({ selected, region, settings, onUpdate }: { selected: BuilderElement; region: 'header'|'footer'; settings: PageSettings; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const bounds = region === 'header' ? headerBoundsPx(settings) : footerBoundsPx(settings);
  const left = () => onUpdate({ x: bounds.x });
  const center = () => onUpdate({ x: bounds.x + Math.max(0, (bounds.width - selected.width) / 2) });
  const right = () => onUpdate({ x: bounds.x + Math.max(0, bounds.width - selected.width) });
  const top = () => onUpdate({ y: bounds.y });
  const middle = () => onUpdate({ y: bounds.y + Math.max(0, (bounds.height - selected.height) / 2) });
  const bottom = () => onUpdate({ y: bounds.y + Math.max(0, bounds.height - selected.height) });
  return <section className="inspector-card band-position-card"><div className="inspector-card-title">Position in {region === 'header' ? 'Header' : 'Footer'}</div><div className="band-position-actions"><button type="button" className="secondary compact" onClick={left}>Left</button><button type="button" className="secondary compact" onClick={center}>Center</button><button type="button" className="secondary compact" onClick={right}>Right</button></div><div className="band-position-actions"><button type="button" className="secondary compact" onClick={top}>Top</button><button type="button" className="secondary compact" onClick={middle}>Middle</button><button type="button" className="secondary compact" onClick={bottom}>Bottom</button></div><p className="table-cell-help">You can also drag/resize this global master directly on any page projection. The change is synchronized to every output page.</p></section>;
}


function GlobalBandEditor({ region, settings, onPageSettings, onSetInsertRegion }: { region: 'header'|'footer'; settings: PageSettings; onPageSettings: (patch: Partial<PageSettings>) => void; onSetInsertRegion: (region: PageRegion) => void }) {
  const band = settings[region];
  const label = region === 'header' ? 'Header' : 'Footer';
  const patchBand = (patch: Partial<typeof band>) => onPageSettings({ [region]: { ...band, ...patch } } as Partial<PageSettings>);
  return <div className="inspector-body global-band-editor">
    <h3>{label} Master</h3>
    <p>{label} is global for the generated document. Its content projects to manual builder pages and automatic overflow continuation pages according to the repeat rule.</p>
    <section className="inspector-card page-band-card">
      <div className="inspector-card-title"><span>{label} Zone</span><button type="button" className={band.enabled?'mini-toggle active':'mini-toggle'} onClick={() => patchBand({ enabled: !band.enabled })}>{band.enabled?'Enabled':'Disabled'}</button></div>
      <div className="property-grid"><label>Height (mm)<input type="number" min="0" value={band.heightMm} onChange={(e) => patchBand({ heightMm: Math.max(0, Number(e.target.value) || 0) })}/></label><label>Content gap (mm)<input type="number" min="0" value={band.gapMm} onChange={(e) => patchBand({ gapMm: Math.max(0, Number(e.target.value) || 0) })}/></label></div>
      <label>Repeat<select value={band.repeat} onChange={(e) => patchBand({ repeat: e.target.value as PageRepeatMode })}><option value="every">Every output page</option><option value="first">First output page only</option><option value="exceptFirst">Except first output page</option></select></label>
      <button className="secondary global-band-add" type="button" onClick={() => { if (!band.enabled) patchBand({ enabled: true }); onSetInsertRegion(region); }}>Add new content to {label}</button>
      <div className="table-cell-help">Use the Elements panel to add Text, Image, Shape, QR, Barcode, Signature or Divider. Tables remain Body-only. Page-number tokens such as Page {'{{pageNumber}}'} of {'{{totalPages}}'} resolve against the complete document output page count.</div>
    </section>
  </div>;
}

function TableProperties({ table, sources, activeSourceId, formulaFields, onUpdate, onEditConfiguration }: { table: TableDefinition; sources: BuilderDataState['sources']; activeSourceId?: string; formulaFields: TemplateTokenField[]; onUpdate: (table: TableDefinition) => void; onEditConfiguration: () => void }) {
  const cell = findTableCell(table, table.selectedCellId);
  const cellLocation = findTableCellLocation(table, table.selectedCellId);
  const selectedColumn = cellLocation ? table.columns[Math.min(cellLocation.columnIndex, table.columns.length - 1)] ?? null : null;
  const selectedDynamicBodyCell = table.mode === 'dynamic' && cellLocation
    ? (table.bodyRows[0]?.cells[Math.min(cellLocation.columnIndex, Math.max(0, table.columns.length - 1))] ?? null)
    : null;
  const rowStructureLocked = Boolean(table.mode === 'dynamic' && cellLocation?.section === 'bodyRows');
  const groupedSummary = Boolean(table.binding?.grouping?.groupBy?.length);
  const mergedColumns = tableHasMergedColumns(table);
  const bindingSource = table.mode === 'dynamic'
    ? (sources.find((item) => item.id === table.binding?.sourceId) ?? null)
    : (sources.find((item) => item.id === activeSourceId) ?? sources[0] ?? null);
  const tableContentFields: TemplateTokenField[] = [...(bindingSource?.fields ?? []), ...formulaFields.filter((formula) => !(bindingSource?.fields ?? []).some((field) => field.name.toLocaleLowerCase() === formula.name.toLocaleLowerCase()))];
  const patchCell = (patch: Parameters<typeof updateTableCell>[2]) => {
    if (!cell) return;
    onUpdate(updateTableCell(table, cell.id, patch));
  };
  const patchDynamicBodyCell = (patch: Parameters<typeof updateTableCell>[2]) => {
    if (!selectedDynamicBodyCell) return;
    onUpdate(updateTableCell(table, selectedDynamicBodyCell.id, patch));
  };
  return <div className="table-properties">
    <div className="table-summary"><strong>{table.name}</strong><small>{table.mode === 'dynamic' ? `${table.binding?.grouping ? `Grouped Summary • ${table.binding.grouping.groupBy.join(' + ')}` : 'Dynamic'} • ${table.binding?.repeatSource || 'items'}` : `Custom • ${table.rows.length} rows × ${table.columns.length} cols`}</small></div>
    <label>Table name<input value={table.name} onChange={(e) => onUpdate({ ...table, name: e.target.value })}/></label>
    <section className="table-inspector-card table-border-card">
      <div className="table-inspector-card-head"><span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▦</span><span>Table Border</span></span><small className="table-inspector-badge">Style</small></div>
      <div className="property-grid">
        <label>Style<select value={table.borderStyle ?? 'solid'} onChange={(e) => onUpdate({ ...table, borderStyle: e.target.value as 'solid'|'dashed'|'dotted'|'double'|'none' })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option><option value="none">None</option></select></label>
        <label>Width<input type="number" min="0" max="10" step="0.5" disabled={(table.borderStyle ?? 'solid') === 'none'} value={table.borderWidth} onChange={(e) => onUpdate({ ...table, borderWidth: Math.max(0, Number(e.target.value) || 0) })}/></label>
      </div>
      <label>Color<input type="color" disabled={(table.borderStyle ?? 'solid') === 'none'} value={table.borderColor} onChange={(e) => onUpdate({ ...table, borderColor: e.target.value })}/></label>
      <div className="table-border-preview" style={{ borderWidth: (table.borderStyle ?? 'solid') === 'none' ? 0 : Math.max(1, table.borderWidth), borderStyle: table.borderStyle ?? 'solid', borderColor: table.borderColor }}><span>Border preview</span></div>
    </section>
    {groupedSummary && <button type="button" className="secondary table-edit-configuration" onClick={onEditConfiguration}>Edit Grouped Summary Configuration</button>}
    {table.mode === 'dynamic' && (() => {
      const selectedSource = sources.find((item) => item.id === table.binding?.sourceId) ?? null;
      return <>
      <label>Repeat source<select value={table.binding?.sourceId ?? ''} disabled={groupedSummary} onChange={(e) => {
        const nextSource = sources.find((item) => item.id === e.target.value) ?? null;
        onUpdate({ ...table, binding: { ...table.binding!, sourceId: nextSource?.id, repeatSource: nextSource?.name ?? '', rowKey: recommendedRowKey(nextSource?.fields ?? []) || undefined } });
      }}><option value="">Select Data Source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}</select></label>
      {groupedSummary ? <div className="table-schema-note"><span>Group By</span><code>{table.binding?.grouping?.groupBy.join(' + ')}</code></div> : <label>Row key<select value={table.binding?.rowKey ?? ''} disabled={!selectedSource} onChange={(e) => onUpdate({ ...table, binding: { ...table.binding!, rowKey: e.target.value || undefined } })}><option value="">Index fallback</option>{selectedSource?.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>}
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
          {!groupedSummary && <><label>Child / Row ID<select value={rowKeys[0] ?? ''} onChange={(e) => updateRowKey(0, e.target.value)}><option value="">Index fallback</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
          {rowKeys.slice(1).map((key, i) => <label key={`row-extra-${i}`}>Row key {i + 2}<select value={key} onChange={(e) => updateRowKey(i + 1, e.target.value)}><option value="">Select field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>)}
          <button type="button" className="secondary compact" onClick={() => onUpdate({ ...table, binding: { ...table.binding!, rowKeys: [...rowKeys, ''] } })}>+ Row key field</button></>}
          <div className="table-schema-note"><span>{groupedSummary ? 'Grouped Summary' : 'Grouping'}</span><code>{groupedSummary ? `${(parentKeys.filter(Boolean).join(' + ') || '?')} → document; ${table.binding?.grouping?.groupBy.join(' + ')} → grouped rows` : `${(parentKeys.filter(Boolean).join(' + ') || recommendedParentKey(selectedSource.fields) || '?')} → rows; ${(rowKeys.filter(Boolean).join(' + ') || recommendedRowKey(selectedSource.fields) || 'index')} → row identity`}</code></div>
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
      {!groupedSummary && <button className="secondary table-add-summary" onClick={() => onUpdate(addCustomSummaryRow(table))}>+ Add custom total / summary row</button>}
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
          {table.mode === 'dynamic' && selectedDynamicBodyCell && !groupedSummary && <>
            <label>Body value type<select value={selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')} onChange={(e) => patchDynamicBodyCell({ valueMode: e.target.value as TableValueMode })}><option value="binding">Field binding</option><option value="formula">Formula</option><option value="custom">Custom value</option></select></label>
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'binding' && <TableCellBindingPicker source={bindingSource} formulaFields={formulaFields} value={selectedDynamicBodyCell.binding} onChange={(binding) => patchDynamicBodyCell({ binding, valueMode: 'binding' })}/>}
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'formula' && <div className="table-formula-editor"><label>Formula<input value={selectedDynamicBodyCell.formula ?? ''} placeholder="Quantity * Rate - Discount" onChange={(e) => patchDynamicBodyCell({ formula: e.target.value, valueMode: 'formula' })}/></label><p className="table-cell-help">Formula applies to every repeated body row in this column.</p><FormulaFieldPicker source={bindingSource} globalFormulaFields={formulaFields} table={table} currentColumnId={selectedColumn.id} onInsert={(fieldRef) => patchDynamicBodyCell({ formula: `${selectedDynamicBodyCell.formula ?? ''}${selectedDynamicBodyCell.formula ? ' ' : ''}${fieldRef}`, valueMode: 'formula' })}/></div>}
            {(selectedDynamicBodyCell.valueMode ?? (selectedDynamicBodyCell.binding ? 'binding' : 'custom')) === 'custom' && <MixedContentEditor label="Body custom value" value={selectedDynamicBodyCell.content ?? ''} fields={tableContentFields} compact onChange={(content) => patchDynamicBodyCell({ content, valueMode: 'custom' })}/>}
          </>}
          {groupedSummary && cellLocation?.section === 'bodyRows' && <p className="table-cell-help">Grouped values are produced by the Group By + aggregate mapping configured when the table is created. You can still format the output column here.</p>}
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
        {table.mode === 'dynamic' && cellLocation?.section === 'customRows' ? <SummaryCellEditor table={table} cell={cell} source={bindingSource} formulaFields={formulaFields} onPatch={patchCell}/> : groupedSummary && cellLocation?.section === 'bodyRows' ? <p className="table-cell-help">This body cell is generated by the Grouped Summary configuration. Use Edit Grouped Summary Configuration above to change Group By, aggregate operations or formulas; formatting remains editable here.</p> : <>
        <label>Value mode<select value={cell.valueMode ?? (cell.binding ? 'binding' : 'custom')} onChange={(e) => patchCell({ valueMode: e.target.value as TableValueMode })}><option value="custom">Custom value</option><option value="binding">Field binding</option><option value="formula" disabled={cellLocation?.row.kind === 'header'}>Formula</option></select></label>
        {cellLocation?.row.kind === 'header' && table.mode === 'dynamic' && <p className="table-cell-help">Header cells are labels. Set this column's repeated Field Binding / Formula from Column Structure → Body value type.</p>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'custom' && <MixedContentEditor label="Content" value={cell.content} fields={tableContentFields} compact onChange={(content) => patchCell({ content })}/>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'binding' && <TableCellBindingPicker source={bindingSource} formulaFields={formulaFields} value={cell.binding} onChange={(binding) => patchCell({ binding, valueMode: 'binding' })}/>}
        {(cell.valueMode ?? (cell.binding ? 'binding' : 'custom')) === 'formula' && <div className="table-formula-editor"><label>Formula<input value={cell.formula ?? ''} placeholder="Quantity * Rate - Discount" onChange={(e) => patchCell({ formula: e.target.value, valueMode: 'formula' })}/></label><p className="table-cell-help">Use imported fields with +, -, *, / and parentheses. Fields containing spaces are inserted safely as [Basic Value].</p><FormulaFieldPicker source={bindingSource} globalFormulaFields={formulaFields} table={table} currentColumnId={selectedColumn?.id} onInsert={(fieldRef) => patchCell({ formula: `${cell.formula ?? ''}${cell.formula ? ' ' : ''}${fieldRef}`, valueMode: 'formula' })}/></div>}
        </>}
        <div className="table-data-format-card">
          <div className="section-title"><span>Data &amp; Format</span><small>Cell override</small></div>
          <label>Data type<select value={cell.dataType ?? selectedColumn?.dataType ?? 'text'} onChange={(e) => patchCell({ dataType: e.target.value as TableDataType })}>{TABLE_DATA_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <TableDataFormatEditor dataType={cell.dataType ?? selectedColumn?.dataType ?? 'text'} value={cell.format ?? selectedColumn?.format ?? {}} onChange={(format) => patchCell({ format })}/>
        </div>
      </> : cell.type === 'image' ? <TableCellImageProperties cell={cell} source={bindingSource} formulaFields={formulaFields} onPatch={patchCell}/> : <>
        <MixedContentEditor label={cell.type === 'qr' ? 'Custom QR value' : 'Custom barcode value'} value={cell.content} fields={tableContentFields} compact onChange={(content) => patchCell({ content })}/>
        <TableCellBindingPicker source={bindingSource} formulaFields={formulaFields} value={cell.binding} onChange={(binding) => patchCell({ binding })}/>
        <p className="table-cell-help">Field binding overrides the custom value during preview/generation.</p>
      </>}
      <div className="property-grid"><label>Row span<input type="number" min="1" max="50" value={cell.rowSpan} onChange={(e) => patchCell({ rowSpan: Math.max(1, Number(e.target.value) || 1) })}/></label><label>Col span<input type="number" min="1" max={Math.max(1, table.columns.length)} value={cell.colSpan} onChange={(e) => patchCell({ colSpan: Math.max(1, Math.min(table.columns.length, Number(e.target.value) || 1)) })}/></label></div>
      <div className="property-grid"><label>Padding<input type="number" min="0" max="40" value={cell.style.padding} onChange={(e) => patchCell({ style: { ...cell.style, padding: Math.max(0, Number(e.target.value) || 0) } })}/></label><label>Font size<input type="number" min="8" max="72" value={cell.style.fontSize} onChange={(e) => patchCell({ style: { ...cell.style, fontSize: Math.max(8, Number(e.target.value) || 11) } })}/></label></div>
      <label>Alignment<select value={cell.style.align} onChange={(e) => patchCell({ style: { ...cell.style, align: e.target.value as 'left'|'center'|'right' } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Background<input type="color" value={cell.style.background} onChange={(e) => patchCell({ style: { ...cell.style, background: e.target.value } })}/></label>
    </div> : <p className="table-cell-hint">Click a table cell on the canvas to edit its content, binding, type, row span and column span.</p>}
  </div>;
}



function SummaryCellEditor({ table, cell, source, formulaFields, onPatch }: { table: TableDefinition; cell: NonNullable<ReturnType<typeof findTableCell>>; source: BuilderDataState['sources'][number] | null; formulaFields: TemplateTokenField[]; onPatch: (patch: Parameters<typeof updateTableCell>[2]) => void }) {
  const mode = cell.summaryMode ?? 'custom';
  const fieldOptions = summaryFieldOptions(table, source);
  const summaryContentFields: TemplateTokenField[] = [...(source?.fields ?? []), ...formulaFields.filter((formula) => !(source?.fields ?? []).some((field) => field.name.toLocaleLowerCase() === formula.name.toLocaleLowerCase()))];
  const summaryRefs = summaryValueReferences(table, cell.id);
  const [insertValue, setInsertValue] = useState('');
  const append = (token: string) => onPatch({ summaryFormula: `${cell.summaryFormula ?? ''}${cell.summaryFormula ? ' ' : ''}${token}`, summaryMode: 'formula' });
  return <div className="table-summary-cell-editor">
    <div className="section-title"><span>Summary Value</span><small>Document group</small></div>
    <label>Summary mode<select value={mode} onChange={(e) => onPatch({ summaryMode: e.target.value as 'custom'|'aggregate'|'formula' })}><option value="custom">Custom value</option><option value="aggregate">Aggregate</option><option value="formula">Formula</option></select></label>
    {mode === 'custom' && <MixedContentEditor label="Content" value={cell.content} fields={summaryContentFields} compact onChange={(content) => onPatch({ content, summaryMode: 'custom' })}/>}
    {mode === 'aggregate' && <>
      <label>Aggregate<select value={cell.aggregate?.operation ?? 'sum'} onChange={(e) => onPatch({ summaryMode: 'aggregate', aggregate: { operation: e.target.value as TableAggregateOperation, field: cell.aggregate?.field ?? '' } })}><option value="sum">SUM</option><option value="count">COUNT</option><option value="avg">AVG</option><option value="min">MIN</option><option value="max">MAX</option></select></label>
      <label>Field / formula column<select value={cell.aggregate?.field ?? ''} onChange={(e) => onPatch({ summaryMode: 'aggregate', aggregate: { operation: cell.aggregate?.operation ?? 'sum', field: e.target.value } })}><option value="">Select field…</option><optgroup label="Imported Fields">{fieldOptions.filter((item) => item.kind === 'field').map((item) => <option key={`sf:${item.value}`} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="Formula Columns">{fieldOptions.filter((item) => item.kind === 'formula').map((item) => <option key={`sc:${item.value}`} value={item.value}>{item.label}</option>)}</optgroup></select></label>
    </>}
    {mode === 'formula' && <>
      <label>Summary formula<input value={cell.summaryFormula ?? ''} placeholder="SUM([Net Value]) * 0.18" onChange={(e) => onPatch({ summaryFormula: e.target.value, summaryMode: 'formula' })}/></label>
      <label>Insert reference<select value={insertValue} onChange={(e) => { const value = e.target.value; if (!value) return; if (value.startsWith('agg:')) append(value.slice(4)); else if (value.startsWith('summary:')) append(value.slice(8)); else if (value.startsWith('global:')) append(formulaFieldReference(value.slice(7))); setInsertValue(''); }}><option value="">Select aggregate, formula or summary…</option><optgroup label="Aggregates">{fieldOptions.map((item) => { const ref = formulaFieldReference(item.value); return ['SUM','COUNT','AVG','MIN','MAX'].map((fn) => <option key={`${fn}:${item.kind}:${item.value}`} value={`agg:${fn}(${ref})`}>{fn}({item.label})</option>); })}</optgroup>{formulaFields.length > 0 && <optgroup label="Global Formula Fields">{formulaFields.map((item) => <option key={`sum-global:${item.name}`} value={`global:${item.name}`}>{item.label || item.name}</option>)}</optgroup>}{summaryRefs.length > 0 && <optgroup label="Previous Summary Values">{summaryRefs.map((item) => <option key={item.name} value={`summary:${item.reference}`}>{item.name}</option>)}</optgroup>}</select></label>
      <p className="table-cell-help">Aggregates use only the currently selected Parent / Document group. Global Formula Fields and previous named summary values can be chained.</p>
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


function formulaTokenFieldsForElements(formulas: BuilderElement[]): TemplateTokenField[] {
  const seen = new Set<string>();
  return formulas.flatMap((item) => {
    const name = item.formulaName?.trim();
    if (!name) return [];
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, label: name }];
  });
}

function documentFormulaAggregateRows(source: NonNullable<ReturnType<typeof activeSource>>, record: ReturnType<typeof activeRecord>, elements: BuilderElement[]): Array<Record<string, unknown>> {
  const rows = source.records.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (!record || typeof record !== 'object') return rows;
  const identityTable = elements.find((item) => {
    if (item.type !== 'table' || item.table?.mode !== 'dynamic' || item.table.binding?.sourceId !== source.id) return false;
    const parentKeys = item.table.binding.parentKeys?.filter(Boolean) ?? (item.table.binding.parentKey ? [item.table.binding.parentKey] : []);
    return parentKeys.length > 0;
  });
  const parentKeys = identityTable?.table?.binding?.parentKeys?.filter(Boolean)
    ?? (identityTable?.table?.binding?.parentKey ? [identityTable.table.binding.parentKey] : []);
  if (parentKeys.length === 0) return rows;
  const same = (left: unknown, right: unknown) => displayValue(left).trim() === displayValue(right).trim();
  return rows.filter((row) => parentKeys.every((key) => same(valueForField(row, key), valueForField(record, key))));
}

function formulaAggregateNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null || value === '') return null;
  const normalized = String(value).trim().replace(/,/g, '').replace(/[%₹$€£]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formulaAggregateValue(rows: Array<Record<string, unknown>>, field: string, operation: 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX'): number {
  const values = rows.map((row) => valueForField(row, field)).filter((value) => value !== undefined && value !== null && value !== '');
  if (operation === 'COUNT') return values.length;
  const numeric = values.map(formulaAggregateNumericValue).filter((value): value is number => value != null);
  if (operation === 'SUM') return numeric.reduce((total, value) => total + value, 0);
  if (operation === 'AVG') return numeric.length ? numeric.reduce((total, value) => total + value, 0) / numeric.length : 0;
  if (operation === 'MIN') return numeric.length ? Math.min(...numeric) : 0;
  return numeric.length ? Math.max(...numeric) : 0;
}

function evaluateDocumentFormulaExpression(expression: string | undefined, scalarContext: Record<string, unknown>, aggregateRows: Array<Record<string, unknown>>): number | null {
  if (!expression?.trim()) return null;
  const replaced = expression.replace(/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(?:(?:\[([^\]]+)\])|([A-Za-z_$][A-Za-z0-9_.$]*))?\s*\)/gi, (_full, opRaw, bracketField, bareField) => {
    const operation = String(opRaw).toUpperCase() as 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX';
    const field = String(bracketField || bareField || '').trim();
    if (operation === 'COUNT' && !field) return String(aggregateRows.length);
    if (!field) return '0';
    return String(formulaAggregateValue(aggregateRows, field, operation));
  });
  return evaluateTableFormula(replaced, scalarContext);
}

function buildDocumentFormulaContext(record: ReturnType<typeof activeRecord>, formulas: BuilderElement[], aggregateRows: Array<Record<string, unknown>>, excludeId?: string) {
  const context: Record<string, unknown> = record && typeof record === 'object' ? { ...(record as Record<string, unknown>) } : {};
  const usable = formulas.filter((item) => item.id !== excludeId && item.formulaName?.trim() && item.formulaExpression?.trim());
  const unresolved = new Set(usable.map((item) => item.id));
  for (let pass = 0; pass < usable.length && unresolved.size; pass += 1) {
    let progressed = false;
    for (const formula of usable) {
      if (!unresolved.has(formula.id)) continue;
      const name = formula.formulaName!.trim();
      const value = evaluateDocumentFormulaExpression(formula.formulaExpression, context, aggregateRows);
      if (value == null) continue;
      context[name] = value;
      unresolved.delete(formula.id);
      progressed = true;
    }
    if (!progressed) break;
  }
  return context;
}

function evaluateDocumentFormulaElement(item: BuilderElement, record: ReturnType<typeof activeRecord>, formulas: BuilderElement[], aggregateRows: Array<Record<string, unknown>>) {
  if (item.type !== 'formula' || !item.formulaExpression?.trim()) return null;
  return evaluateDocumentFormulaExpression(item.formulaExpression, buildDocumentFormulaContext(record, formulas, aggregateRows, item.id), aggregateRows);
}

function documentFormulaValues(record: ReturnType<typeof activeRecord>, formulas: BuilderElement[], aggregateRows: Array<Record<string, unknown>>): Record<string, unknown> {
  const context = buildDocumentFormulaContext(record, formulas, aggregateRows);
  const values: Record<string, unknown> = {};
  for (const formula of formulas) {
    const name = formula.formulaName?.trim();
    if (!name) continue;
    const exact = Object.prototype.hasOwnProperty.call(context, name) ? name : Object.keys(context).find((key) => key.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (exact && context[exact] !== undefined) values[name] = context[exact];
  }
  return values;
}

function valueForBuilderField(record: ReturnType<typeof activeRecord>, sourceFields: TemplateTokenField[], formulas: BuilderElement[], field: string, aggregateRows: Array<Record<string, unknown>>) {
  const formula = formulas.find((item) => item.formulaName?.trim().toLocaleLowerCase() === field.trim().toLocaleLowerCase());
  if (formula) return evaluateDocumentFormulaElement(formula, record, formulas, aggregateRows);
  if (!record) return undefined;
  const matched = matchTemplateTokenField(sourceFields, field);
  return valueForField(record, matched?.name ?? field);
}

function FormulaFieldProperties({ selected, source, formulaElements, preview, onUpdate }: { selected: BuilderElement; source: ReturnType<typeof activeSource>; formulaElements: BuilderElement[]; preview: number | null; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const name = selected.formulaName ?? '';
  const duplicate = !!name.trim() && formulaElements.some((item) => item.id !== selected.id && item.formulaName?.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const formulaRefs = formulaTokenFieldsForElements(formulaElements.filter((item) => item.id !== selected.id));
  const [aggregateFunction, setAggregateFunction] = useState<'SUM'|'COUNT'|'AVG'|'MIN'|'MAX'>('SUM');
  const [referenceSelection, setReferenceSelection] = useState('');
  const selectedSourceField = referenceSelection.startsWith('source:') ? referenceSelection.slice(7) : '';
  const selectedFormulaField = referenceSelection.startsWith('formula:') ? referenceSelection.slice(8) : '';
  const selectedReferenceName = selectedSourceField || selectedFormulaField;
  const appendFormulaText = (text: string) => {
    if (!text) return;
    const current = selected.formulaExpression ?? '';
    onUpdate({ formulaExpression: `${current}${current && !/\s$/.test(current) ? ' ' : ''}${text}` });
  };
  const insertSelectedRef = () => {
    if (!selectedReferenceName) return;
    appendFormulaText(formulaFieldReference(selectedReferenceName));
  };
  const insertSelectedAggregate = () => {
    if (!selectedSourceField) return;
    appendFormulaText(`${aggregateFunction}(${formulaFieldReference(selectedSourceField)})`);
  };
  return <section className="inspector-card formula-field-card">
    <div className="inspector-card-title">Formula Field</div>
    <p className="table-cell-help">This is a reusable field definition (it does not print by itself). Create it once, then use it from <b>Dynamic Field</b> anywhere as <b>{name ? `{{${name}}}` : '{{FormulaName}}'}</b>.</p>
    <label>Field name<input value={name} placeholder="GrandTotal" onChange={(e) => onUpdate({ formulaName: e.target.value.replace(/[{}]/g, '') })}/></label>
    {duplicate ? <div className="formula-field-warning">Use a unique field name.</div> : null}
    <label>Formula<input value={selected.formulaExpression ?? ''} placeholder="[Taxable] + [Total GST]" onChange={(e) => onUpdate({ formulaExpression: e.target.value })}/></label>
    <label>Reference field<select value={referenceSelection} onChange={(e) => setReferenceSelection(e.target.value)}><option value="">Choose field…</option>{source?.fields.length ? <optgroup label="Imported Fields">{source.fields.map((field) => <option key={`ff-src:${field.name}`} value={`source:${field.name}`}>{field.label || field.name}</option>)}</optgroup> : null}{formulaRefs.length ? <optgroup label="Formula Fields">{formulaRefs.map((field) => <option key={`ff-formula:${field.name}`} value={`formula:${field.name}`}>{field.label}</option>)}</optgroup> : null}</select></label>
    <div className="formula-reference-actions"><button type="button" className="secondary compact" disabled={!selectedReferenceName} onClick={insertSelectedRef}>Insert field</button><div className="formula-aggregate-picker"><select value={aggregateFunction} onChange={(e) => setAggregateFunction(e.target.value as 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX')}><option value="SUM">SUM</option><option value="COUNT">COUNT</option><option value="AVG">AVG</option><option value="MIN">MIN</option><option value="MAX">MAX</option></select><button type="button" className="secondary compact" disabled={!selectedSourceField} title={selectedFormulaField ? 'Aggregate functions use imported source fields, not Formula Fields.' : undefined} onClick={insertSelectedAggregate}>Insert aggregate</button></div></div>
    {selectedFormulaField ? <p className="table-cell-help">Formula Fields can be inserted as references. Aggregate functions operate on imported source fields, so choose an Imported Field to enable Insert aggregate.</p> : null}
    <div className="binding-value"><small>Preview</small><strong>{preview == null ? 'Enter a valid formula' : displayValue(preview)}</strong></div>
    <p className="table-cell-help"><b>Aggregates:</b> SUM, COUNT, AVG, MIN, MAX. They run over rows for the active Parent / Document ID; if no parent key exists, they use all rows in the active source. Arithmetic +, −, ×, ÷ and parentheses can be mixed with aggregates.</p>
  </section>;
}

function formulaFieldReference(fieldName: string) {
  return /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(fieldName) ? fieldName : `[${fieldName}]`;
}

function FormulaFieldPicker({ source, globalFormulaFields = [], table, currentColumnId, onInsert }: { source: BuilderDataState['sources'][number] | null; globalFormulaFields?: TemplateTokenField[]; table?: TableDefinition; currentColumnId?: string; onInsert: (fieldRef: string) => void }) {
  const [selectedField, setSelectedField] = useState('');
  const formulaColumns = table ? formulaColumnReferences(table, currentColumnId) : [];
  if (!source && formulaColumns.length === 0 && globalFormulaFields.length === 0) return <p className="table-cell-help">Load/select a Data Source or create a Formula Field / formula column to insert references.</p>;
  return <label className="formula-field-picker">Insert field
    <select value={selectedField} onChange={(e) => {
      const value = e.target.value;
      if (!value) return;
      if (value.startsWith('source:')) onInsert(formulaFieldReference(value.slice(7)));
      if (value.startsWith('formula:')) {
        const match = formulaColumns.find((column) => column.columnId === value.slice(8));
        if (match) onInsert(match.reference);
      }
      if (value.startsWith('global:')) onInsert(formulaFieldReference(value.slice(7)));
      setSelectedField('');
    }}>
      <option value="">Select field or formula column…</option>
      {source && <optgroup label={`Imported Fields — ${source.name}`}>
        {source.fields.map((field) => <option key={`source:${field.name}`} value={`source:${field.name}`}>{field.label || field.name} ({field.type})</option>)}
      </optgroup>}
      {globalFormulaFields.length > 0 && <optgroup label="Global Formula Fields">{globalFormulaFields.map((field) => <option key={`global:${field.name}`} value={`global:${field.name}`}>{field.label || field.name}</option>)}</optgroup>}
      {formulaColumns.length > 0 && <optgroup label="Formula Columns">
        {formulaColumns.map((column) => <option key={`formula:${column.columnId}`} value={`formula:${column.columnId}`}>{column.label} ({column.dataType})</option>)}
      </optgroup>}
    </select>
    <small>{source?.fields.length ?? 0} imported fields{formulaColumns.length ? ` + ${formulaColumns.length} formula column${formulaColumns.length === 1 ? '' : 's'}` : ''}. Self-reference is excluded; circular dependencies remain blank.</small>
  </label>;
}

function TableCellBindingPicker({ source, formulaFields, value, onChange }: { source: BuilderDataState['sources'][number] | null; formulaFields: TemplateTokenField[]; value?: string; onChange: (value?: string) => void }) {
  const hasOptions = Boolean(source?.fields.length || formulaFields.length);
  return <label>Field binding<select disabled={!hasOptions} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
    <option value="">{hasOptions ? 'No binding / use custom value' : 'Import a Data Source or create a Formula Field first'}</option>
    {source?.fields.length ? <optgroup label="Imported Fields">{source.fields.map((field) => <option key={`tbl-src:${field.name}`} value={field.name}>{field.label || field.name} ({field.type})</option>)}</optgroup> : null}
    {formulaFields.length ? <optgroup label="Formula Fields">{formulaFields.map((field) => <option key={`tbl-formula:${field.name}`} value={field.name}>{field.label || field.name}</option>)}</optgroup> : null}
  </select></label>;
}

function TableCellImageProperties({ cell, source, formulaFields, onPatch }: { cell: NonNullable<ReturnType<typeof findTableCell>>; source: BuilderDataState['sources'][number] | null; formulaFields: TemplateTokenField[]; onPatch: (patch: Parameters<typeof updateTableCell>[2]) => void }) {
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
    <TableCellBindingPicker source={source} formulaFields={formulaFields} value={cell.binding} onChange={(binding) => onPatch({ binding })}/>
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

function regionBoundsPx(region: PageRegion, settings: PageSettings) {
  return region === 'header' ? headerBoundsPx(settings) : region === 'footer' ? footerBoundsPx(settings) : contentBoundsPx(settings);
}

function constrainElementToRegion(element: BuilderElement, settings: PageSettings): BuilderElement {
  const region: PageRegion = element.type === 'table' ? 'body' : (element.region ?? 'body');
  const bounds = regionBoundsPx(region, settings);
  if (region === 'body') {
    if (element.type === 'table') {
      const height = Math.max(40, element.height);
      const y = Math.min(Math.max(element.y, bounds.y), Math.max(bounds.y, bounds.y + bounds.height - Math.min(height, bounds.height)));
      return { ...element, region: 'body', x: bounds.x, y, width: bounds.width, height };
    }
    const minHeight = element.type === 'divider' ? 4 : 20;
    const width = Math.min(Math.max(20, element.width), Math.max(20, bounds.width));
    const height = Math.min(Math.max(minHeight, element.height), Math.max(minHeight, bounds.height));
    const x = Math.min(Math.max(element.x, bounds.x), Math.max(bounds.x, bounds.x + bounds.width - width));
    const y = Math.min(Math.max(element.y, bounds.y), Math.max(bounds.y, bounds.y + bounds.height - height));
    return { ...element, region, x, y, width, height };
  }
  const minHeight = element.type === 'divider' ? 4 : 20;
  const width = Math.min(Math.max(20, element.width), Math.max(20, bounds.width));
  const height = Math.min(Math.max(minHeight, element.height), Math.max(minHeight, bounds.height));
  const x = Math.min(Math.max(element.x, bounds.x), Math.max(bounds.x, bounds.x + bounds.width - width));
  const y = Math.min(Math.max(element.y, bounds.y), Math.max(bounds.y, bounds.y + bounds.height - height));
  return { ...element, region, x, y, width, height };
}

function placeElementInRegion(element: BuilderElement, region: PageRegion, settings: PageSettings, index = 0): BuilderElement {
  const safeRegion: PageRegion = element.type === 'table' ? 'body' : region;
  const bounds = regionBoundsPx(safeRegion, settings);
  const inset = 8 + (index % 4) * 8;
  const placed = { ...element, region: safeRegion, layoutMode: safeRegion === 'body' ? (element.layoutMode ?? 'flow') : 'floating' as BodyLayoutMode, x: bounds.x + inset, y: bounds.y + inset };
  return constrainElementToRegion(placed, settings);
}

function prepareNewFlowElement(element: BuilderElement, existingElements: BuilderElement[], settings: PageSettings): BuilderElement {
  const bounds = contentBoundsPx(settings);
  const prepared: BuilderElement = {
    ...element,
    region: 'body',
    layoutMode: 'flow',
    flowRowId: newFlowRowId(),
    flowWidthPercent: element.flowWidthPercent ?? 100,
    flowGapBeforeMm: element.flowGapBeforeMm ?? 0,
    flowGapAfterMm: element.flowGapAfterMm ?? 4,
    flowColumnGapMm: element.flowColumnGapMm ?? 4,
    flowAlign: element.flowAlign ?? 'left',
    flowWidth: 'full',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
  };
  const projected = layoutBodyFlow([...existingElements.filter((item) => (item.region ?? 'body') === 'body'), prepared], settings);
  return projected.find((item) => item.id === prepared.id) as BuilderElement ?? prepared;
}

function reflowRegionElement(element: BuilderElement, previousSettings: PageSettings, nextSettings: PageSettings): BuilderElement {
  const region: PageRegion = element.type === 'table' ? 'body' : (element.region ?? 'body');
  if (region === 'body') return constrainElementToRegion(element, nextSettings);
  const oldBounds = regionBoundsPx(region, previousSettings);
  const nextBounds = regionBoundsPx(region, nextSettings);
  const localX = element.x - oldBounds.x;
  const localY = element.y - oldBounds.y;
  return constrainElementToRegion({ ...element, region, x: nextBounds.x + localX, y: nextBounds.y + localY }, nextSettings);
}

function defaultElement(type: ToolType, index: number): BuilderElement {
  const position = 70 + (index % 6) * 18;
  const common = { id: crypto.randomUUID(), type, region: 'body' as PageRegion, layoutMode: 'flow' as BodyLayoutMode, flowRowId: newFlowRowId(), flowWidthPercent: 100, flowGapBeforeMm: 0, flowGapAfterMm: 4, flowColumnGapMm: 4, flowAlign: 'left' as BodyFlowAlign, flowWidth: 'full' as BodyFlowWidth, x: position, y: position, fontSize: 18, fontFamily: 'Arial', fontWeight: 400, italic: false, underline: false, lineHeight: 1.25, textAlign: 'left' as TextAlign, fill: '#eaf1ff', color: '#18212f' };
  switch (type) {
    case 'text': return { ...common, width: 260, height: 44, text: 'Double-click style text' };
    case 'image': return { ...common, width: 180, height: 130, text: '', imageFit: 'contain' };
    case 'table': return { ...common, width: 430, height: 150, text: 'Table' };
    case 'shape': return { ...common, width: 180, height: 100, text: '' };
    case 'qr': return { ...common, width: 110, height: 120, text: 'QR value' };
    case 'barcode': return { ...common, width: 190, height: 90, text: '1234567890' };
    case 'signature': return { ...common, width: 190, height: 80, text: '', imageFit: 'contain' };
    case 'divider': return { ...common, width: 360, height: 12, text: '' };
    case 'formula': return { ...common, width: 220, height: 44, text: '', formulaName: `Formula${index + 1}`, formulaExpression: '' };
  }
}

function labelFor(type: ToolType) {
  return tools.find((tool) => tool.type === type)?.label ?? type;
}
