import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import QRCode from 'react-qr-code';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, Barcode, ChevronLeft, ChevronRight, Circle,
  Copy, Eye, Image, Minus, MousePointer2, QrCode, Save, Signature, Table2, Trash2, Calculator,
  Type, ZoomIn, ZoomOut, Plus, FileText, Undo2, Redo2, Download, FilePlus2, Braces, Clipboard,
  ChevronDown, HelpCircle, MoreHorizontal,
} from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { RecordPicker } from '../components/RecordPicker.tsx';
import { DATA_EVENT, activeRecord, activeSource, displayValue, loadDataState, loadDataStateAsync, saveDataSelection, valueForField, type BuilderDataState, type NormalizedRecord, type NormalizedValue } from '../lib/dataSourceStore.ts';
import { loadImageAsset, saveImageAsset } from '../lib/imageAssetStore.ts';
import { TableCreateModal } from '../components/TableCreateModal.tsx';
import { NewTemplateModal } from '../components/NewTemplateModal.tsx';
import { TableCanvas } from '../components/TableCanvas.tsx';
import { defaultPageSettings, normalizePageSettings, contentBoundsPx, headerBoundsPx, footerBoundsPx, repeatModeShows, mmToPx, mmToUnit, unitLabel, pagePixelSize, pageSizeMm, unitToMm, type PageSettings, type PagePreset, type PageOrientation, type PageUnit, type PageRepeatMode } from '../lib/pageModel.ts';
import { addCustomSummaryRow, addTableColumn, addTableRow, deleteTableColumn, deleteTableRow, duplicateTableRow, findTableCell, findTableCellLocation, moveTableColumn, moveTableRow, recommendedParentKey, recommendedRowKey, tableHasMergedColumns, updateTableCell, equalizeTableColumnWidths, resetTableColumnAutoWidth, setTableColumnManualWidth, updateTableColumn, updateTableRow, formulaColumnReferences, summaryFieldOptions, summaryValueReferences, dynamicRows, paginateDynamicTable, evaluateTableFormula, type TableAggregateOperation, type TableDataFormat, type TableDataType, type TableDefinition, type TableCellType, type TableValueMode } from '../lib/tableModel.ts';
import { matchTemplateTokenField, resolveTemplateTokens, templateHasTokens, tokenForField, type TemplateTokenField } from '../lib/templateTokens.ts';
import { beginNewTemplate, consumeTemplateBuilderAction, migrateLegacyTemplateToLibrary, saveTemplateToLibrary, TEMPLATE_STORAGE_KEY, type NewTemplateRequest, type TemplateDocumentType } from '../lib/templateLibrary.ts';
import { insertFlowElementByVisualY, layoutBodyFlow, materializeBodyFlowPages, moveFlowRow, newFlowRowId, shouldCommitMeasuredFlowHeight, synchronizeFlowRowHeights, flowRowKey, type BodyLayoutMode, type BodyFlowAlign, type BodyFlowDistribution, type BodyFlowWidth } from '../lib/bodyFlow.ts';
import { buildMaterializedRenderDocument, type MaterializedRenderPage } from '../lib/materializedRenderModel.ts';
import { appendExactCombinedPdfParts, buildExactPreviewPdf, buildExactPreviewPdfParts, clearExactCombinedPdfSession, downloadPdf, finalizeExactCombinedPdf } from '../lib/exactPdfExport.ts';
import { buildExactPreviewDocx, downloadDocx } from '../lib/exactDocxExport.ts';
import { buildEditablePreviewDocx } from '../lib/editableDocxExport.ts';
import { amountToIndianWords } from '../lib/numberToWords.ts';
import { getPdfRenderProfile } from '../lib/pdfRenderProfile.ts';
import { appendGenerationHistory, clearGenerationProgress, clearGenerationRequest, GENERATION_REQUEST_EVENT, readGenerationRequest, writeGenerationProgress, type GenerationRequest } from '../lib/generationEngine.ts';
import { buildCurrentDocumentJsonBody, buildTemplateInputContract, type TemplateInputContractResult, type TemplateJsonBodyResult } from '../lib/templateJsonBody.ts';

type ToolType = 'text' | 'image' | 'table' | 'shape' | 'qr' | 'barcode' | 'signature' | 'divider' | 'formula';
type InspectorTab = 'properties' | 'content' | 'binding' | 'rows' | 'formatting' | 'conditions' | 'header' | 'footer';
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
  imageObjectPosition?: 'center'|'top'|'bottom'|'left'|'right';
  imageLockAspect?: boolean;
  imageBackground?: string;
  imageOpacity?: number;
  imageBorderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  imageBorderWidth?: number;
  imageBorderColor?: string;
  imageBorderRadius?: number;
  imageBrightness?: number;
  imageContrast?: number;
  imageSaturation?: number;
  imageGrayscale?: number;
  imageSepia?: number;
  imageBlur?: number;
  imageShadowEnabled?: boolean;
  imageShadowX?: number;
  imageShadowY?: number;
  imageShadowBlur?: number;
  imageShadowSpread?: number;
  imageShadowColor?: string;
  imageShadowOpacity?: number;
  imageBgRemoveTolerance?: number;
  imageBgRemoveSoftness?: number;
  imageBgRemoveFeather?: number;
  imageBgRemoveFringe?: number;
  imageBgRemoveNoise?: number;
  imageOriginalAssetId?: string;
  imageOriginalSource?: string;
  shapeKind?: 'rectangle' | 'rounded' | 'circle' | 'ellipse' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'pill' | 'tag' | 'priceTag' | 'ticket' | 'banner' | 'ribbon' | 'foldedRibbon' | 'flag' | 'bookmark' | 'arrowRight' | 'arrowLeft' | 'arrowUp' | 'arrowDown' | 'arrowDouble' | 'chevron' | 'bentArrow' | 'speech' | 'thought' | 'cloud' | 'cloudCallout' | 'star' | 'heart' | 'check' | 'cross' | 'plus' | 'badge' | 'seal' | 'flowProcess' | 'flowDecision' | 'flowDocument' | 'flowDatabase';
  shapeContentMode?: 'none' | 'text' | 'media' | 'text-media';
  shapeMediaBinding?: string;
  shapeMediaPosition?: 'left' | 'right' | 'top' | 'bottom' | 'background' | 'center';
  shapeMediaSizePercent?: number;
  shapeContentGap?: number;
  shapePadding?: number;
  shapeOpacity?: number;
  shapeLockAspect?: boolean;
  shapeFillType?: 'solid' | 'linear' | 'radial' | 'none';
  shapeFillColor2?: string;
  shapeFillAngle?: number;
  shapeStrokeStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  shapeStrokeWidth?: number;
  shapeStrokeColor?: string;
  shapeStrokeAlignment?: 'inside' | 'center' | 'outside';
  shapeCornerRadius?: number;
  shapeTextVerticalAlign?: 'top' | 'middle' | 'bottom';
  shapeClipMedia?: boolean;
  shapeMediaOverlayOpacity?: number;
  shapeShadowEnabled?: boolean;
  shapeShadowX?: number;
  shapeShadowY?: number;
  shapeShadowBlur?: number;
  shapeShadowSpread?: number;
  shapeShadowColor?: string;
  shapeShadowOpacity?: number;
  shapeGlowEnabled?: boolean;
  shapeGlowBlur?: number;
  shapeGlowColor?: string;
  shapeGlowOpacity?: number;
  conditionEnabled?: boolean;
  conditionField?: string;
  conditionOperator?: 'equals'|'notEquals'|'contains'|'notContains'|'isEmpty'|'isNotEmpty'|'greaterThan'|'lessThan';
  conditionValue?: string;
  qrForeground?: string;
  qrBackground?: string;
  qrQuietZone?: number;
  qrErrorCorrection?: 'L'|'M'|'Q'|'H';
  qrShowValue?: boolean;
  barcodeFormat?: 'code39';
  barcodeForeground?: string;
  barcodeBackground?: string;
  barcodeShowText?: boolean;
  barcodeTextSize?: number;
  barcodeBarHeight?: number;
  barcodeQuietZone?: number;
  signatureShowPlaceholder?: boolean;
  table?: TableDefinition;
  region?: PageRegion;
  layoutMode?: BodyLayoutMode;
  flowRowId?: string;
  flowWidthPercent?: number;
  flowGapBeforeMm?: number;
  flowGapAfterMm?: number;
  flowColumnGapMm?: number;
  flowAlign?: BodyFlowAlign;
  flowDistribution?: BodyFlowDistribution;
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
  documentType?: TemplateDocumentType;
  status?: 'Draft' | 'Saved';
};

const STORAGE_KEY = TEMPLATE_STORAGE_KEY;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState(0);
  const [status, setStatus] = useState('Draft');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportProgress, setPdfExportProgress] = useState('');
  const [docxExporting, setDocxExporting] = useState(false);
  const [docxExportProgress, setDocxExportProgress] = useState('');
  const [editableDocxExporting, setEditableDocxExporting] = useState(false);
  const [editableDocxExportProgress, setEditableDocxExportProgress] = useState('');
  const [templateHydrated, setTemplateHydrated] = useState(false);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateUnsavedOpen, setNewTemplateUnsavedOpen] = useState(false);
  const [jsonBodyResult, setJsonBodyResult] = useState<TemplateJsonBodyResult | null>(null);
  const [inputContractResult, setInputContractResult] = useState<TemplateInputContractResult | null>(null);
  const [jsonBodyCopied, setJsonBodyCopied] = useState(false);
  const [inputContractCopied, setInputContractCopied] = useState(false);
  const [documentType, setDocumentType] = useState<TemplateDocumentType>('Document');
  const generationRunningRef = useRef(false);
  const [generationRequestVersion, setGenerationRequestVersion] = useState(0);
  const lastRendererErrorRef = useRef<string | null>(null);
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
  useEffect(() => {
    if (!selected && (tab === 'content' || tab === 'binding' || tab === 'formatting' || tab === 'conditions' || tab === 'rows')) setTab('properties');
    if (selected?.type === 'text' && (tab === 'binding' || tab === 'content' || tab === 'rows')) setTab('properties');
    if (selected?.type === 'image' && (tab === 'content' || tab === 'binding' || tab === 'rows')) setTab('properties');
    if ((selected?.type === 'shape' || selected?.type === 'qr' || selected?.type === 'barcode' || selected?.type === 'signature') && (tab === 'binding' || tab === 'rows')) setTab(selected.type === 'shape' || selected.type === 'qr' || selected.type === 'barcode' || selected.type === 'signature' ? 'content' : 'properties');
    if (tab === 'content' && !(['shape','qr','barcode','signature'] as ToolType[]).includes(selected?.type as ToolType)) setTab('properties');
    if (tab === 'rows' && selected?.type !== 'table') setTab('properties');
  }, [selected, tab]);
  const globalDocumentPicker = source ? buildDocumentPreviewPicker(source, record, dataState.activeRecordIndex, activePage?.elements ?? []) : null;
  const selectPreviewRecord = (index: number) => {
    const next = { ...dataState, activeRecordIndex: index };
    setDataState(next);
    saveDataSelection(next);
    setActivePreviewPageIndex(0);
  };

  const openCurrentDocumentJsonBody = () => {
    const result = buildCurrentDocumentJsonBody({ pages, source, record });
    const contract = buildTemplateInputContract({ pages, source, record, templateName: name });
    setJsonBodyResult(result);
    setInputContractResult(contract);
    setJsonBodyCopied(false);
    setInputContractCopied(false);
  };
  const copyCurrentDocumentJsonBody = async () => {
    if (!jsonBodyResult) return;
    try {
      await navigator.clipboard.writeText(jsonBodyResult.json);
      setJsonBodyCopied(true);
      window.setTimeout(() => setJsonBodyCopied(false), 1800);
    } catch {
      setJsonBodyCopied(false);
    }
  };
  const downloadCurrentDocumentJsonBody = () => {
    if (!jsonBodyResult) return;
    const blob = new Blob([jsonBodyResult.json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeExportFileName(name || 'Document')}-input-body.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const copyTemplateInputContract = async () => {
    if (!inputContractResult) return;
    try {
      await navigator.clipboard.writeText(inputContractResult.json);
      setInputContractCopied(true);
      window.setTimeout(() => setInputContractCopied(false), 1800);
    } catch {
      setInputContractCopied(false);
    }
  };
  const downloadTemplateInputContract = () => {
    if (!inputContractResult) return;
    const blob = new Blob([inputContractResult.json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeExportFileName(name || 'Document')}-input-contract.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    // DB-2 Fix2 Template Library: New Template must start with a truly blank
    // document; opening an existing library card first syncs that item into
    // the legacy active-template key so all existing Builder/Generate logic
    // stays backward compatible.
    const builderAction = consumeTemplateBuilderAction(window.localStorage);
    if (builderAction) {
      const settings = defaultPageSettings();
      settings.preset = builderAction.pageSize;
      settings.orientation = builderAction.orientation;
      const starterElements = buildStarterElements(builderAction.starter, settings);
      const page: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings, elements: starterElements };
      setName(builderAction.name);
      setDocumentType(builderAction.documentType);
      setPages([page]);
      setActivePageId(page.id);
      setSelectedId(null);
      setStatus('Draft');
      setTemplateHydrated(true);
      return;
    }
    migrateLegacyTemplateToLibrary(window.localStorage);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) { setTemplateHydrated(true); return; }
    try {
      const saved = JSON.parse(raw) as SavedTemplate;
      if ((Array.isArray(saved.pages) && saved.pages.length) || Array.isArray(saved.elements)) {
        setName(saved.name || 'Untitled Document');
        setDocumentType(saved.documentType ?? 'Document');
        if (Array.isArray(saved.pages) && saved.pages.length) {
          const normalizedPages = saved.pages.map((page) => ({ ...page, settings: normalizePageSettings(page.settings), elements: (page.elements ?? []).map((element) => ({ ...element, region: element.region ?? 'body', fontFamily: element.fontFamily ?? 'Arial', fontWeight: element.fontWeight ?? 400, italic: element.italic ?? false, underline: element.underline ?? false, lineHeight: element.lineHeight ?? 1.25, layoutMode: element.layoutMode ?? 'floating', flowRowId: element.flowRowId ?? (element.layoutMode === 'flow' ? `legacy-row-${element.id}` : undefined), flowWidthPercent: element.flowWidthPercent ?? (element.layoutMode === 'flow' ? 100 : undefined), flowGapBeforeMm: element.flowGapBeforeMm ?? 0, flowGapAfterMm: element.flowGapAfterMm ?? 4, flowColumnGapMm: element.flowColumnGapMm ?? 4, flowAlign: element.flowAlign ?? 'left', flowDistribution: element.flowDistribution ?? 'packed', flowWidth: element.flowWidth ?? 'full' })) }));
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
          const migrated: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings: legacy, elements: (saved.elements || []).map((element) => ({ ...element, region: element.region ?? 'body', fontFamily: element.fontFamily ?? 'Arial', fontWeight: element.fontWeight ?? 400, italic: element.italic ?? false, underline: element.underline ?? false, lineHeight: element.lineHeight ?? 1.25, layoutMode: element.layoutMode ?? 'floating', flowRowId: element.flowRowId ?? (element.layoutMode === 'flow' ? `legacy-row-${element.id}` : undefined), flowWidthPercent: element.flowWidthPercent ?? (element.layoutMode === 'flow' ? 100 : undefined), flowGapBeforeMm: element.flowGapBeforeMm ?? 0, flowGapAfterMm: element.flowGapAfterMm ?? 4, flowColumnGapMm: element.flowColumnGapMm ?? 4, flowAlign: element.flowAlign ?? 'left', flowDistribution: element.flowDistribution ?? 'packed', flowWidth: element.flowWidth ?? 'full' })) };
          setPages([migrated]); setActivePageId(migrated.id);
        }
        setStatus('Saved locally');
      }
    } catch {
      // Ignore invalid legacy/local data and continue with a clean template.
    } finally {
      setTemplateHydrated(true);
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
    const onGenerationRequest = () => setGenerationRequestVersion((value) => value + 1);
    window.addEventListener(GENERATION_REQUEST_EVENT, onGenerationRequest);
    return () => window.removeEventListener(GENERATION_REQUEST_EVENT, onGenerationRequest);
  }, []);

  useEffect(() => {
    if (!templateHydrated || generationRunningRef.current || pdfExporting || docxExporting || editableDocxExporting) return;
    const request = readGenerationRequest(window.localStorage);
    if (!request) return;
    if (dataState.activeSourceId !== request.sourceId || dataState.activeRecordIndex !== request.activeRecordIndex) return;
    generationRunningRef.current = true;
    writeGenerationProgress(window.localStorage, { requestId: request.id, percent: 4, message: 'Preparing your document…' });
    setStatus('Generating requested document…');
    setSelectedId(null);
    setActivePreviewPageIndex(0);
    const run = async (generationRequest: GenerationRequest) => {
      await waitForBuilderPaint();
      await waitForBuilderPaint();
      let success = false;
      let error: string | undefined;
      try {
        if (generationRequest.format === 'pdf' && generationRequest.combinedPdf) {
          const combined = generationRequest.combinedPdf;
          setPdfExporting(true);
          setPdfExportProgress(`Combined PDF ${combined.index + 1} / ${combined.total} · preparing ${generationRequest.documentLabel}`);
          writeGenerationProgress(window.localStorage, { requestId: generationRequest.id, percent: 8, message: `Preparing ${generationRequest.documentLabel}…` });
          try {
            const model = await waitForStableRenderModel();
            const pdfProfile = getPdfRenderProfile(generationRequest.pdfRenderProfile);
            const parts = await buildExactPreviewPdfParts(model, resolveMaterializedPageNode, {
              dpi: pdfProfile.dpi,
              quality: pdfProfile.jpegQuality,
              onProgress: ({ current, total }) => {
                setPdfExportProgress(`Combined PDF ${combined.index + 1} / ${combined.total} · page ${current} / ${total}`);
                writeGenerationProgress(window.localStorage, { requestId: generationRequest.id, percent: 10 + Math.round((current / Math.max(1, total)) * 85), current, total, message: `Rendering page ${current} of ${total}…` });
              },
            }, `DB5C_${combined.batchId}_${combined.index + 1}_`);
            const progress = appendExactCombinedPdfParts(combined.batchId, generationRequest.id, combined.total, parts);
            if (combined.index === combined.total - 1) {
              const bytes = finalizeExactCombinedPdf(combined.batchId);
              downloadPdf(bytes, sanitizeExportFileName(combined.finalFileName || 'Combined_Invoices'));
              setPdfExportProgress(`Combined PDF ready · ${progress.completedDocuments} documents · ${progress.totalPages} pages`);
              setStatus('Combined PDF generated');
            } else {
              setPdfExportProgress(`Captured ${combined.index + 1} / ${combined.total} documents`);
              setStatus('Invoice added to combined PDF');
            }
            success = true;
          } finally {
            setPdfExporting(false);
          }
        } else if (generationRequest.format === 'pdf') success = await exportPreviewPdf(generationRequest.fileName, generationRequest.pdfRenderProfile);
        else if (generationRequest.format === 'docx-exact') success = await exportPreviewDocx(generationRequest.fileName);
        else success = await exportEditableDocx(generationRequest.fileName);
        if (!success) error = lastRendererErrorRef.current || 'Renderer reported a generation failure.';
      } catch (caught) {
        if (generationRequest.combinedPdf) clearExactCombinedPdfSession(generationRequest.combinedPdf.batchId);
        error = caught instanceof Error ? caught.message : 'Unable to generate document.';
      } finally {
        clearGenerationRequest(window.localStorage);
        clearGenerationProgress(window.localStorage);
        appendGenerationHistory(window.localStorage, {
          ...generationRequest,
          status: success ? 'success' : 'failed',
          completedAt: new Date().toISOString(),
          error,
        });
        generationRunningRef.current = false;
        onNavigate('generate');
      }
    };
    void run(request);
  }, [templateHydrated, dataState.activeSourceId, dataState.activeRecordIndex, pdfExporting, docxExporting, editableDocxExporting, generationRequestVersion]);

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
      const moved = constrainElementToRegion({ ...selected, ...patch, region: 'body', layoutMode: 'flow', flowRowId: selected.flowRowId ?? newFlowRowId(), flowWidthPercent: selected.flowWidthPercent ?? 100, flowGapBeforeMm: selected.flowGapBeforeMm ?? 0, flowGapAfterMm: selected.flowGapAfterMm ?? 4, flowColumnGapMm: selected.flowColumnGapMm ?? 4, flowAlign: selected.flowAlign ?? 'left', flowDistribution: selected.flowDistribution ?? 'packed' }, pageSettings);
      setPages((currentPages) => currentPages.map((page, index) => {
        if (index === 0) return { ...page, elements: page.elements.filter((item) => item.id !== selectedId) };
        if (page.id === activePageId) return { ...page, elements: [...page.elements.filter((item) => item.id !== selectedId), moved] };
        return page;
      }));
    } else {
      const next = constrainElementToRegion({ ...selected, ...patch, region: requestedRegion }, pageSettings);
      const targetMaster = requestedRegion !== 'body';
      const flowRowPatch = requestedRegion === 'body' && (selected.layoutMode ?? 'floating') === 'flow' && (patch.flowAlign != null || patch.flowColumnGapMm != null || patch.flowDistribution != null);
      const selectedRowId = flowRowKey(selected);
      setPages((currentPages) => currentPages.map((page, index) => {
        if (!((targetMaster && index === 0) || (!targetMaster && page.id === activePageId))) return page;
        const nextElements = page.elements.map((item) => {
          if (item.id === selectedId) return next;
          if (flowRowPatch && (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow' && flowRowKey(item) === selectedRowId) {
            return { ...item, ...(patch.flowAlign != null ? { flowAlign: patch.flowAlign } : {}), ...(patch.flowColumnGapMm != null ? { flowColumnGapMm: patch.flowColumnGapMm } : {}), ...(patch.flowDistribution != null ? { flowDistribution: patch.flowDistribution } : {}) };
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
      return { ...page, elements: moveFlowRow(page.elements, selectedId, direction) };
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
        const rowIds = items.map((item, index) => ({ item, index })).filter(({ item }) => (item.region ?? 'body') === 'body' && (item.layoutMode ?? 'floating') === 'flow' && flowRowKey(item) === flowRowKey(selected));
        const rowAt = rowIds.findIndex(({ item }) => item.id === selectedId);
        const swapWith = action === 'left' ? rowAt - 1 : rowAt + 1;
        if (rowAt < 0 || swapWith < 0 || swapWith >= rowIds.length) return page;
        const a = rowIds[rowAt].index, b = rowIds[swapWith].index;
        [items[a], items[b]] = [items[b], items[a]];
        return { ...page, elements: synchronizeFlowRowHeights(items) };
      }
      const rowId = action === 'newRow' ? newFlowRowId() : flowRowKey(target!);
      const targetRowSettings = target ? {
        flowAlign: target.flowAlign ?? 'left' as BodyFlowAlign,
        flowDistribution: target.flowDistribution ?? 'packed' as BodyFlowDistribution,
        flowColumnGapMm: target.flowColumnGapMm ?? 4,
        flowGapBeforeMm: target.flowGapBeforeMm ?? 0,
        flowGapAfterMm: target.flowGapAfterMm ?? 4,
      } : {};
      return { ...page, elements: synchronizeFlowRowHeights(items.map((item) => item.id === selectedId ? { ...item, flowRowId: rowId, ...(action === 'newRow' ? {} : targetRowSettings) } : item)) };
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

  function requestNewTemplate() {
    if (status === 'Unsaved changes') {
      setNewTemplateUnsavedOpen(true);
      return;
    }
    setNewTemplateOpen(true);
  }

  function createNewTemplate(request: NewTemplateRequest) {
    beginNewTemplate(window.localStorage, request);
    // This Builder instance applies the request immediately; consume the one-shot
    // action so reopening Builder later cannot reset the draft a second time.
    consumeTemplateBuilderAction(window.localStorage);
    const settings = defaultPageSettings();
    settings.preset = request.pageSize;
    settings.orientation = request.orientation;
    const page: BuilderPage = { id: crypto.randomUUID(), name: 'Page 1', settings, elements: buildStarterElements(request.starter, settings) };
    recordHistory();
    setName(request.name);
    setDocumentType(request.documentType);
    setPages([page]);
    setActivePageId(page.id);
    setSelectedId(null);
    setStatus('Draft');
    setNewTemplateOpen(false);
  }

  function saveTemplate() {
    const payload: SavedTemplate = { name, pages, activePageId, documentType, status: 'Saved', updatedAt: new Date().toISOString() };
    saveTemplateToLibrary(window.localStorage, payload);
    setStatus('Saved locally');
  }

  async function waitForStableRenderModel(): Promise<ReturnType<typeof buildMaterializedRenderDocument>> {
    // DB-5B Fix2: auto-height Body Flow blocks can still update persisted
    // element heights for a few paints after Generate opens Builder. If the
    // render manifest is frozen before those commits settle, it can request a
    // continuation page that React has already collapsed away (for example,
    // manifest says page 2 while the settled Preview has only page 1). Build
    // the manifest from the latest page refs only after output-page counts
    // remain stable across several observations.
    // DB-5D Fix1: keep generation fast and make the DOM the final authority.
    // The old 5s/4-observation guard could spend several seconds per invoice
    // and still freeze a stale model count (for example model=2 while React
    // had already settled to one physical Preview page).
    const deadline = Date.now() + 1800;
    let previousSignature = '';
    let stableObservations = 0;
    let latestCounts: number[] = [];

    while (Date.now() < deadline) {
      await waitForBuilderPaint();
      const currentPages = pagesRef.current;
      latestCounts = currentPages.map((page, _index) => {
        const currentMaster = currentPages[0];
        const header = currentMaster?.settings.header ?? page.settings.header;
        const footer = currentMaster?.settings.footer ?? page.settings.footer;
        const effectiveSettings = { ...page.settings, header: { ...header }, footer: { ...footer } };
        return buildBodyMaterialization(page.elements, effectiveSettings).pageCount;
      });
      const signature = latestCounts.join(',');
      if (signature === previousSignature) stableObservations += 1;
      else { previousSignature = signature; stableObservations = 1; }

      // Two matching observations plus real DOM agreement are enough here: the
      // hidden render host already stays mounted and each observation spans a
      // paint. Before freezing the manifest, verify that React has
      // actually materialized the same number of physical Preview pages for
      // every builder page. This closes the stale-manifest gap where model
      // math still said 2 pages but the settled DOM had already collapsed to 1.
      if (stableObservations >= 2) {
        let domMatchesManifest = true;
        for (let pageIndex = 0; pageIndex < currentPages.length; pageIndex += 1) {
          const page = currentPages[pageIndex]!;
          if (activePageIdRef.current !== page.id) {
            setActivePageId(page.id);
            setActivePreviewPageIndex(0);
            await waitForBuilderPaint();
          }
          await waitForBuilderPaint();
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(`.document-page[data-builder-page-id="${page.id}"]`));
          const expected = latestCounts[pageIndex] ?? 1;
          const measurableNodes = nodes.filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
          if (measurableNodes.length !== expected) {
            domMatchesManifest = false;
            break;
          }
        }
        if (domMatchesManifest) break;
        stableObservations = 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    const currentPages = pagesRef.current;

    // DB-5D Fix1: final reconciliation. If model math and the settled Preview
    // disagree at timeout, export what is actually materialized in the DOM.
    // This prevents a stale phantom continuation page from poisoning the PDF
    // manifest and removes the recurring "Preview output page 2" failure.
    const reconciledCounts: number[] = [];
    for (let pageIndex = 0; pageIndex < currentPages.length; pageIndex += 1) {
      const page = currentPages[pageIndex]!;
      if (activePageIdRef.current !== page.id) {
        setActivePageId(page.id);
        setActivePreviewPageIndex(0);
        await waitForBuilderPaint();
      }
      const measurableNodes = Array.from(document.querySelectorAll<HTMLElement>(`.document-page[data-builder-page-id="${page.id}"]`))
        .filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
      reconciledCounts[pageIndex] = Math.max(1, measurableNodes.length || latestCounts[pageIndex] || 1);
    }
    latestCounts = reconciledCounts;

    if (latestCounts.length !== currentPages.length) {
      latestCounts = currentPages.map((page) => {
        const currentMaster = currentPages[0];
        const header = currentMaster?.settings.header ?? page.settings.header;
        const footer = currentMaster?.settings.footer ?? page.settings.footer;
        return buildBodyMaterialization(page.elements, { ...page.settings, header: { ...header }, footer: { ...footer } }).pageCount;
      });
    }
    return buildMaterializedRenderDocument(nameRef.current, currentPages.map((page, index) => ({
      id: page.id,
      name: page.name,
      settings: {
        ...page.settings,
        header: { ...(currentPages[0]?.settings.header ?? page.settings.header) },
        footer: { ...(currentPages[0]?.settings.footer ?? page.settings.footer) },
      },
      outputPageCount: latestCounts[index] ?? 1,
    })));
  }

  async function resolveMaterializedPageNode(renderPage: MaterializedRenderPage): Promise<HTMLElement> {
    if (activePageIdRef.current !== renderPage.builderPageId) {
      setActivePageId(renderPage.builderPageId);
      setActivePreviewPageIndex(0);
    }

    // DB-5B Fix1: Generation is launched from another route. Large/multi-page
    // documents can need more than two animation frames for Flow/table
    // measurement and continuation-page projection to settle. Poll for the
    // exact materialized page instead of failing immediately while React is
    // still committing the selected document context.
    const selector = `.document-page[data-builder-page-id="${renderPage.builderPageId}"][data-continuation-index="${renderPage.continuationIndex}"]`;
    const deadline = Date.now() + 1800;
    let lastNode: HTMLElement | null = null;
    while (Date.now() < deadline) {
      await waitForBuilderPaint();
      const node = document.querySelector<HTMLElement>(selector);
      if (node) {
        lastNode = node;
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // One extra paint lets auto-height/table measurements that were
          // triggered by the current commit settle before html2canvas reads it.
          await waitForBuilderPaint();
          return node;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (lastNode) return lastNode;
    throw new Error(`Preview output page ${renderPage.documentPageIndex + 1} is unavailable after waiting for layout.`);
  }

  async function exportPreviewPdf(fileNameOverride?: string, requestedProfile?: GenerationRequest['pdfRenderProfile']): Promise<boolean> {
    if (pdfExporting) return false;
    const originalPageId = activePageId;
    const originalPreviewPage = activePreviewPageIndex;
    const originalSelectedId = selectedId;
    lastRendererErrorRef.current = null;
    setPdfExporting(true);
    setPdfExportProgress('Preparing render model…');
    setSelectedId(null);
    try {
      const model = await waitForStableRenderModel();
      const resolvePageNode = resolveMaterializedPageNode;
      const pdfProfile = getPdfRenderProfile(requestedProfile);
      const bytes = await buildExactPreviewPdf(model, resolvePageNode, {
        dpi: pdfProfile.dpi,
        quality: pdfProfile.jpegQuality,
        onProgress: ({ current, total }) => {
          setPdfExportProgress(`Rendering PDF ${current} / ${total}`);
          const request = readGenerationRequest(window.localStorage);
          if (request) writeGenerationProgress(window.localStorage, { requestId: request.id, percent: 10 + Math.round((current / Math.max(1, total)) * 85), current, total, message: `Rendering PDF page ${current} of ${total}…` });
        },
      });
      downloadPdf(bytes, sanitizeExportFileName(fileNameOverride || name || 'Document'));
      setStatus('PDF generated');
      setPdfExportProgress(`PDF ready • ${model.totalPages} page${model.totalPages === 1 ? '' : 's'}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to generate PDF';
      lastRendererErrorRef.current = detail;
      console.error('DB-4.5 exact PDF export failed', error);
      setStatus('PDF export failed');
      setPdfExportProgress(detail);
      return false;
    } finally {
      setActivePageId(originalPageId);
      setActivePreviewPageIndex(originalPreviewPage);
      setSelectedId(originalSelectedId);
      await waitForBuilderPaint();
      setPdfExporting(false);
    }
  }

  async function exportPreviewDocx(fileNameOverride?: string): Promise<boolean> {
    if (docxExporting) return false;
    const originalPageId = activePageId;
    const originalPreviewPage = activePreviewPageIndex;
    const originalSelectedId = selectedId;
    lastRendererErrorRef.current = null;
    setDocxExporting(true);
    setDocxExportProgress('Preparing render model…');
    setSelectedId(null);
    try {
      const model = await waitForStableRenderModel();
      const resolvePageNode = resolveMaterializedPageNode;
      const bytes = await buildExactPreviewDocx(model, resolvePageNode, {
        dpi: 192,
        quality: 0.96,
        onProgress: ({ current, total }) => {
          setDocxExportProgress(`Rendering DOCX ${current} / ${total}`);
          const request = readGenerationRequest(window.localStorage);
          if (request) writeGenerationProgress(window.localStorage, { requestId: request.id, percent: 10 + Math.round((current / Math.max(1, total)) * 85), current, total, message: `Rendering DOCX page ${current} of ${total}…` });
        },
      });
      downloadDocx(bytes, sanitizeExportFileName(fileNameOverride || name || 'Document'));
      setStatus('DOCX generated');
      setDocxExportProgress(`DOCX ready • ${model.totalPages} page${model.totalPages === 1 ? '' : 's'}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to generate DOCX';
      lastRendererErrorRef.current = detail;
      console.error('DB-4.5C exact DOCX export failed', error);
      setStatus('DOCX export failed');
      setDocxExportProgress(detail);
      return false;
    } finally {
      setActivePageId(originalPageId);
      setActivePreviewPageIndex(originalPreviewPage);
      setSelectedId(originalSelectedId);
      await waitForBuilderPaint();
      setDocxExporting(false);
    }
  }


  async function exportEditableDocx(fileNameOverride?: string): Promise<boolean> {
    if (editableDocxExporting) return false;
    const originalPageId = activePageId;
    const originalPreviewPage = activePreviewPageIndex;
    const originalSelectedId = selectedId;
    lastRendererErrorRef.current = null;
    setEditableDocxExporting(true);
    setEditableDocxExportProgress('Preparing editable render model…');
    setSelectedId(null);
    try {
      const model = await waitForStableRenderModel();
      const resolvePageNode = resolveMaterializedPageNode;
      const bytes = await buildEditablePreviewDocx(model, resolvePageNode, {
        onProgress: ({ current, total }) => {
          setEditableDocxExportProgress(`Building editable DOCX ${current} / ${total}`);
          const request = readGenerationRequest(window.localStorage);
          if (request) writeGenerationProgress(window.localStorage, { requestId: request.id, percent: 10 + Math.round((current / Math.max(1, total)) * 85), current, total, message: `Building editable DOCX page ${current} of ${total}…` });
        },
      });
      downloadDocx(bytes, fileNameOverride ? sanitizeExportFileName(fileNameOverride) : `${sanitizeExportFileName(name || 'Document')}-editable`);
      setStatus('Editable DOCX generated');
      setEditableDocxExportProgress(`Editable DOCX ready • ${model.totalPages} page${model.totalPages === 1 ? '' : 's'}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to generate editable DOCX';
      lastRendererErrorRef.current = detail;
      console.error('DB-4.5C v2 editable DOCX export failed', error);
      setStatus('Editable DOCX export failed');
      setEditableDocxExportProgress(detail);
      return false;
    } finally {
      setActivePageId(originalPageId);
      setActivePreviewPageIndex(originalPreviewPage);
      setSelectedId(originalSelectedId);
      await waitForBuilderPaint();
      setEditableDocxExporting(false);
    }
  }


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
          <div className="toolbar-history" aria-label="History actions">
            <button className="toolbar-icon-button" title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStackRef.current.length === 0}><Undo2 size={16}/><span className="sr-only">Undo</span></button>
            <button className="toolbar-icon-button" title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={redo} disabled={redoStackRef.current.length === 0}><Redo2 size={16}/><span className="sr-only">Redo</span></button>
          </div>
          <button className="secondary toolbar-primary-action"><Eye size={16}/><span>Preview</span></button>
          <details className="toolbar-menu">
            <summary className="secondary"><Download size={16}/><span>Export</span><ChevronDown size={14}/></summary>
            <div className="toolbar-menu-popover">
              <button type="button" onClick={() => { void exportPreviewPdf(); }} disabled={pdfExporting || docxExporting || editableDocxExporting}><Download size={15}/><span><strong>{pdfExporting ? pdfExportProgress || 'PDF…' : 'PDF'}</strong><small>Portable document</small></span></button>
              <button type="button" onClick={() => { void exportPreviewDocx(); }} disabled={docxExporting || pdfExporting || editableDocxExporting}><FileText size={15}/><span><strong>{docxExporting ? docxExportProgress || 'DOCX Exact…' : 'DOCX Exact'}</strong><small>Maximum Preview fidelity</small></span></button>
              <button type="button" onClick={() => { void exportEditableDocx(); }} disabled={editableDocxExporting || docxExporting || pdfExporting}><FileText size={15}/><span><strong>{editableDocxExporting ? editableDocxExportProgress || 'DOCX Editable…' : 'DOCX Editable'}</strong><small>Editable Word content</small></span></button>
            </div>
          </details>
          <details className="toolbar-menu">
            <summary className="secondary toolbar-more"><MoreHorizontal size={17}/><span>More</span><ChevronDown size={14}/></summary>
            <div className="toolbar-menu-popover toolbar-menu-popover-right">
              <button type="button" onClick={openCurrentDocumentJsonBody}><Braces size={15}/><span><strong>JSON Body</strong><small>ERP / API input body</small></span></button>
              <button type="button" onClick={requestNewTemplate}><FilePlus2 size={15}/><span><strong>New Template</strong><small>Create a new draft</small></span></button>
            </div>
          </details>
          <button className="secondary toolbar-save" onClick={saveTemplate}><Save size={16}/><span>Save</span></button>
          <button className="primary toolbar-generate" onClick={() => onNavigate('generate')}>Generate</button>
        </div>
      </header>

      {newTemplateUnsavedOpen && <div className="table-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setNewTemplateUnsavedOpen(false); }}>
        <div className="table-modal unsaved-template-modal" role="dialog" aria-modal="true" aria-label="Unsaved template changes">
          <div className="table-modal-title"><span>Unsaved changes</span></div>
          <div className="table-modal-note">Your current template has changes that have not been saved. What would you like to do before creating a new template?</div>
          <div className="table-modal-actions three-way"><button className="secondary" onClick={() => setNewTemplateUnsavedOpen(false)}>Cancel</button><button className="secondary danger-soft" onClick={() => { setNewTemplateUnsavedOpen(false); setNewTemplateOpen(true); }}>Discard</button><button className="primary" onClick={() => { saveTemplate(); setNewTemplateUnsavedOpen(false); setNewTemplateOpen(true); }}>Save &amp; Continue</button></div>
        </div>
      </div>}

      {newTemplateOpen && <NewTemplateModal onCancel={() => setNewTemplateOpen(false)} onCreate={createNewTemplate} />}

      {jsonBodyResult && <div className="table-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) { setJsonBodyResult(null); setInputContractResult(null); } }}>
        <div className="table-modal json-body-modal" role="dialog" aria-modal="true" aria-label="Current document JSON body">
          <div className="table-modal-title"><span><Braces size={18}/>Current Document JSON Body</span><button type="button" aria-label="Close JSON body" onClick={() => { setJsonBodyResult(null); setInputContractResult(null); }}>×</button></div>
          <div className="json-body-summary">
            <span><b>{jsonBodyResult.documentFields.length}</b> document fields</span>
            <span><b>{jsonBodyResult.itemFields.length}</b> item fields</span>
            <span><b>{jsonBodyResult.itemCount}</b> item rows</span>
            <span><b>{jsonBodyResult.formulaFieldsExcluded.length}</b> formulas excluded</span>
          </div>
          <div className="table-modal-note">This is the external ERP/API request body for the currently selected document. Only imported/bound source fields are included. Formula Fields are calculated inside Document Builder and are intentionally excluded.</div>
          {jsonBodyResult.formulaFieldsExcluded.length > 0 && <div className="json-body-excluded"><span>Calculated internally</span><code>{jsonBodyResult.formulaFieldsExcluded.join(', ')}</code></div>}
          {jsonBodyResult.warnings.map((warning) => <div key={warning} className="json-body-warning">{warning}</div>)}
          <div className="json-body-excluded"><span>Example request body</span><code>Raw ERP / Salesforce values</code></div>
          <textarea className="json-body-code" readOnly spellCheck={false} value={jsonBodyResult.json} aria-label="Generated JSON body" />
          {inputContractResult && <>
            <div className="json-body-excluded"><span>Template Input Contract v{inputContractResult.contract.contractVersion}</span><code>{inputContractResult.contract.required.length} required • {inputContractResult.contract.optional.length} optional • {inputContractResult.contract.collections.items?.fields.length ?? 0} item fields</code></div>
            <div className="table-modal-note">Stable DB-6A integration contract. Image bindings advertise URL / Base64 / data URL support, while Formula Fields remain calculated internally.</div>
            <textarea className="json-body-code" readOnly spellCheck={false} value={inputContractResult.json} aria-label="Template input contract" />
          </>}
          <div className="table-modal-actions json-body-actions"><button type="button" className="secondary" onClick={() => { setJsonBodyResult(null); setInputContractResult(null); }}>Close</button><div><button type="button" className="secondary" onClick={() => { void copyCurrentDocumentJsonBody(); }}><Clipboard size={15}/>{jsonBodyCopied ? 'Copied Body' : 'Copy Body'}</button><button type="button" className="secondary" onClick={() => { void copyTemplateInputContract(); }} disabled={!inputContractResult}><Clipboard size={15}/>{inputContractCopied ? 'Copied Schema' : 'Copy Schema'}</button><button type="button" className="secondary" onClick={downloadCurrentDocumentJsonBody}><Download size={15}/>Body .json</button><button type="button" className="primary" onClick={downloadTemplateInputContract} disabled={!inputContractResult}><Download size={15}/>Schema .json</button></div></div>
        </div>
      </div>}

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
          <div className="page-tree">{pages.map((page, _index) => <button key={page.id} className={page.id === activePageId ? "tree-row selected" : "tree-row"} onClick={() => { setActivePageId(page.id); setSelectedId(null); setActivePreviewPageIndex(0); }}><FileText size={15}/><span>{page.name}</span><small>{page.settings.preset}</small></button>)}</div>
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
                  <PageContentBorder settings={pageSettings}/>
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
          <div className="inspector-tabs contextual">
            {(selected ? (selected.type === 'text' ? (['properties', 'formatting', 'conditions'] as const) : selected.type === 'table' ? (['properties', 'binding', 'rows', 'formatting', 'conditions'] as const) : selected.type === 'shape' ? (['properties', 'content', 'formatting', 'conditions'] as const) : (selected.type === 'image') ? (['properties', 'formatting', 'conditions'] as const) : (selected.type === 'qr' || selected.type === 'barcode' || selected.type === 'signature') ? (['properties', 'content', 'formatting', 'conditions'] as const) : (['properties', 'binding', 'formatting', 'conditions'] as const)) : (['properties'] as const)).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'binding' ? (selected?.type === 'table' ? 'Columns' : 'Data') : item === 'rows' ? 'Rows' : item === 'content' ? 'Content' : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
          <Inspector tab={tab} onInspectorTab={setTab} selected={selected} source={source} record={record} formulaElements={formulaElements} formulaAggregateRows={formulaAggregateRows} dynamicTokenFields={dynamicTokenFields} dataState={dataState} pageSettings={pageSettings} pageName={activePage?.name || 'Page'} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={focusPreviewPage} onPageSettings={updatePageSettings} onPageName={renamePage} onAddPage={addPage} onDuplicatePage={duplicatePage} onDeletePage={deletePage} onMovePage={movePage} onSelectPage={(pageId) => { setActivePageId(pageId); setSelectedId(null); setActivePreviewPageIndex(0); }} onUpdate={updateSelected} onDelete={deleteSelected} onDuplicate={duplicateSelected} onArrange={arrangeSelected} onMoveFlow={moveFlowSelected} onFlowRowAction={updateFlowRowSelected} relativeElements={activeBodyElements} onSetInsertRegion={(region) => setActiveInsertRegion(region)} onEditTableConfiguration={(elementId) => { setTableEditorElementId(elementId); setTableModalOpen(true); }}/>
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
  return <div data-page-region={region} data-repeated-projection={repeatedBandElement ? 'true' : 'false'} className={`canvas-element ${selected ? 'selected' : ''} element-${item.type} region-${region} ${virtualPageMode ? 'virtual-continuation-element' : ''} ${repeatedBandElement ? 'repeated-region-projection' : ''}`} style={{ left: item.x, top: renderedTop, width: item.width, height: item.height, color: item.color, fontSize: item.fontSize, fontFamily: item.fontFamily ?? 'Arial', fontWeight: item.fontWeight ?? 400, fontStyle: item.italic ? 'italic' : 'normal', textDecoration: item.underline ? 'underline' : 'none', lineHeight: item.lineHeight ?? 1.25, textAlign: item.textAlign, ...imageElementFrameStyle(item) }} onPointerDown={startDrag} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <ElementContent item={item} pageSettings={pageSettings} record={record} source={source} sources={sources} formulaElements={formulaElements} formulaAggregateRows={formulaAggregateRows} virtualPageIndex={virtualPageIndex} virtualPageCount={virtualPageCount} runtimePageIndex={runtimePageIndex} runtimePageCount={runtimePageCount} virtualPageMode={virtualPageMode} onElementSelect={onSelect} onTableChange={(table) => onChange({ table })} onTableSelectionChange={onSelectionChange} onTableHistoryStart={onHistoryStart} onTableHistoryEnd={onHistoryEnd} onTableHeightChange={virtualPageMode ? undefined : (height) => { if (Math.abs(item.height - height) >= 1) onLayoutChange({ height }); }}/>
    {selected && (!virtualPageMode || virtualPageIndex === 0 || bandConstrained) && <>{!(region === 'body' && (item.layoutMode ?? 'floating') === 'flow') ? <span className="resize-handle" data-resize="true" onPointerDown={startResize}/> : null}<span className="selection-label">{repeatedBandElement ? `Global ${region === 'header' ? 'Header' : 'Footer'}` : labelFor(item.type)}</span></>}
  </div>;
}

function ElementContent({ item, pageSettings, record, source, sources, formulaElements, formulaAggregateRows, virtualPageIndex = 0, virtualPageCount = 1, runtimePageIndex = virtualPageIndex, runtimePageCount = virtualPageCount, virtualPageMode = false, onElementSelect, onTableChange, onTableSelectionChange, onTableHistoryStart, onTableHistoryEnd, onTableHeightChange }: { item: BuilderElement; pageSettings: PageSettings; record: ReturnType<typeof activeRecord>; source: ReturnType<typeof activeSource>; sources: BuilderDataState['sources']; formulaElements: BuilderElement[]; formulaAggregateRows: Array<Record<string, unknown>>; virtualPageIndex?: number; virtualPageCount?: number; runtimePageIndex?: number; runtimePageCount?: number; virtualPageMode?: boolean; repeatedBandElement?: boolean; onElementSelect: () => void; onTableChange: (table: TableDefinition) => void; onTableSelectionChange: (table: TableDefinition) => void; onTableHistoryStart: () => void; onTableHistoryEnd: () => void; onTableHeightChange?: (height: number) => void }) {
  const resolveBuilderField = (field: string) => valueForBuilderField(record, source?.fields ?? [], formulaElements, field, formulaAggregateRows);
  if (item.conditionEnabled && item.conditionField && !evaluateElementCondition(item, resolveBuilderField(item.conditionField))) return null;
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
  if (item.type === 'qr') return <QrElementContent item={item} value={rendered}/>;
  if (item.type === 'barcode') return <BarcodeElementContent item={item} value={rendered}/>;
  if (item.type === 'divider') return <span className="divider-line"/>;
  if (item.type === 'shape') return <ShapeElementContent item={item} rendered={rendered} mediaBoundValue={item.shapeMediaBinding ? resolveBuilderField(item.shapeMediaBinding) : undefined}/>;
  return <span className="text-content">{rendered}</span>;
}


function ShapeElementContent({ item, rendered, mediaBoundValue }: { item: BuilderElement; rendered: string; mediaBoundValue: unknown }) {
  const contentMode = item.shapeContentMode ?? (item.text ? 'text' : 'none');
  const showText = contentMode === 'text' || contentMode === 'text-media';
  const showMedia = contentMode === 'media' || contentMode === 'text-media';
  const mediaPosition = item.shapeMediaPosition ?? 'left';
  const verticalAlign = item.shapeTextVerticalAlign ?? 'middle';
  const direction = mediaPosition === 'top' || mediaPosition === 'bottom' ? 'column' : 'row';
  const foregroundStyle: CSSProperties = {
    padding: item.shapePadding ?? 12,
    gap: item.shapeContentGap ?? 8,
    justifyContent: verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center',
    textAlign: item.textAlign ?? 'left',
  };
  if (mediaPosition === 'center') {
    foregroundStyle.justifyContent = 'center';
    foregroundStyle.alignItems = 'center';
  } else if (mediaPosition !== 'background') {
    foregroundStyle.flexDirection = direction;
    foregroundStyle.alignItems = direction === 'row' ? (item.textAlign === 'center' ? 'center' : item.textAlign === 'right' ? 'flex-end' : 'flex-start') : 'stretch';
  }
  const mediaStyle: CSSProperties = { flexBasis: `${Math.min(80, Math.max(12, item.shapeMediaSizePercent ?? 32))}%` };
  if(item.shapeClipMedia??true){const clip=shapeClipPath(item.shapeKind??'rectangle');mediaStyle.clipPath=clip;mediaStyle.WebkitClipPath=clip;}
  const orderedTextFirst = mediaPosition === 'right' || mediaPosition === 'bottom';
  return <div className="shape-shell">
    <div className="shape-visual" style={shapeVisualStyle(item)}>
      {showMedia && mediaPosition === 'background' ? <ShapeMediaContent item={item} bound={mediaBoundValue} className="shape-media-image background" extraStyle={{opacity:Math.min(100,Math.max(0,item.shapeMediaOverlayOpacity??100))/100}}/> : null}
    </div>
    <div className={`shape-foreground mode-${contentMode} media-${mediaPosition}`} style={foregroundStyle}>
      {showMedia && mediaPosition !== 'background' && !orderedTextFirst ? <div className="shape-media-slot" style={mediaStyle}><ShapeMediaContent item={item} bound={mediaBoundValue} className="shape-media-image"/></div> : null}
      {showText && rendered ? <div className={`shape-text-block valign-${verticalAlign}`}><span className="shape-text-content">{rendered}</span></div> : null}
      {showMedia && mediaPosition !== 'background' && orderedTextFirst ? <div className="shape-media-slot" style={mediaStyle}><ShapeMediaContent item={item} bound={mediaBoundValue} className="shape-media-image"/></div> : null}
      {!showText && !showMedia ? <span className="shape-placeholder">Shape</span> : null}
    </div>
  </div>;
}

function ShapeMediaContent({ item, bound, className = 'shape-media-image', extraStyle }: { item: BuilderElement; bound: unknown; className?: string; extraStyle?: CSSProperties }) {
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
  if (src) return <img className={className} src={src} alt="Shape media" style={{ objectFit: item.imageFit ?? 'contain', objectPosition: item.imageObjectPosition ?? 'center', filter: imageElementFilter(item), ...shapeMediaFrameStyle(item), ...(extraStyle??{}) }}/>
  return <div className="shape-media-empty">No media</div>;
}

function shapeClipPath(kind: NonNullable<BuilderElement['shapeKind']>) {
  switch (kind) {
    case 'circle': return 'ellipse(50% 50% at 50% 50%)';
    case 'ellipse': return 'ellipse(50% 42% at 50% 50%)';
    case 'triangle': return 'polygon(50% 0%, 100% 100%, 0% 100%)';
    case 'diamond': return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    case 'pentagon': return 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
    case 'hexagon': return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    case 'pill': return 'inset(0 round 999px)';
    case 'tag': return 'polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%, 0 0)';
    case 'priceTag': return 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)';
    case 'ticket': return 'polygon(0 0, 100% 0, 100% 32%, 94% 38%, 100% 44%, 100% 100%, 0 100%, 0 44%, 6% 38%, 0 32%)';
    case 'banner': return 'polygon(0 0, 100% 0, 100% 78%, 76% 78%, 70% 100%, 64% 78%, 0 78%)';
    case 'ribbon': return 'polygon(0 15%, 15% 15%, 15% 0, 85% 0, 85% 15%, 100% 15%, 92% 50%, 100% 85%, 85% 85%, 85% 100%, 15% 100%, 15% 85%, 0 85%, 8% 50%)';
    case 'foldedRibbon': return 'polygon(0 18%, 18% 18%, 18% 0, 100% 0, 86% 50%, 100% 100%, 18% 100%, 18% 82%, 0 82%, 9% 50%)';
    case 'flag': return 'polygon(0 0, 100% 0, 82% 50%, 100% 100%, 0 100%)';
    case 'bookmark': return 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)';
    case 'arrowRight': return 'polygon(0 0, 72% 0, 72% 18%, 100% 50%, 72% 82%, 72% 100%, 0 100%, 12% 50%)';
    case 'arrowLeft': return 'polygon(28% 0, 100% 0, 88% 50%, 100% 100%, 28% 100%, 28% 82%, 0 50%, 28% 18%)';
    case 'arrowUp': return 'polygon(50% 0, 100% 35%, 72% 35%, 72% 100%, 28% 100%, 28% 35%, 0 35%)';
    case 'arrowDown': return 'polygon(28% 0, 72% 0, 72% 65%, 100% 65%, 50% 100%, 0 65%, 28% 65%)';
    case 'arrowDouble': return 'polygon(0 50%, 22% 12%, 22% 34%, 78% 34%, 78% 12%, 100% 50%, 78% 88%, 78% 66%, 22% 66%, 22% 88%)';
    case 'chevron': return 'polygon(0 0, 68% 0, 100% 50%, 68% 100%, 0 100%, 30% 50%)';
    case 'bentArrow': return 'polygon(0 0, 62% 0, 62% 28%, 78% 28%, 78% 8%, 100% 42%, 78% 76%, 78% 56%, 42% 56%, 42% 100%, 0 100%)';
    case 'speech': return 'polygon(0 0, 100% 0, 100% 82%, 64% 82%, 54% 100%, 50% 82%, 0 82%)';
    case 'thought': return 'polygon(10% 12%, 30% 0, 55% 6%, 76% 0, 96% 20%, 100% 48%, 92% 72%, 70% 88%, 46% 90%, 30% 100%, 18% 88%, 0 74%, 4% 42%)';
    case 'cloud': return 'polygon(10% 72%, 4% 54%, 10% 34%, 28% 24%, 38% 6%, 60% 8%, 72% 22%, 90% 24%, 100% 44%, 96% 66%, 82% 80%, 58% 86%, 34% 84%)';
    case 'cloudCallout': return 'polygon(10% 68%, 4% 48%, 12% 28%, 30% 22%, 40% 4%, 62% 8%, 74% 20%, 92% 24%, 100% 44%, 94% 66%, 78% 78%, 60% 82%, 50% 96%, 44% 82%, 28% 82%)';
    case 'star': return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
    case 'heart': return 'polygon(50% 92%, 12% 56%, 4% 34%, 12% 16%, 30% 8%, 50% 26%, 70% 8%, 88% 16%, 96% 34%, 88% 56%)';
    case 'check': return 'polygon(0 52%, 12% 40%, 36% 64%, 84% 10%, 100% 24%, 38% 92%)';
    case 'cross': return 'polygon(28% 0, 50% 22%, 72% 0, 100% 28%, 78% 50%, 100% 72%, 72% 100%, 50% 78%, 28% 100%, 0 72%, 22% 50%, 0 28%)';
    case 'plus': return 'polygon(36% 0, 64% 0, 64% 36%, 100% 36%, 100% 64%, 64% 64%, 64% 100%, 36% 100%, 36% 64%, 0 64%, 0 36%, 36% 36%)';
    case 'badge': return 'polygon(20% 0, 80% 0, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0 80%, 0 20%)';
    case 'seal': return 'polygon(50% 0, 60% 10%, 74% 4%, 80% 18%, 96% 20%, 90% 36%, 100% 50%, 90% 64%, 96% 80%, 80% 82%, 74% 96%, 60% 90%, 50% 100%, 40% 90%, 26% 96%, 20% 82%, 4% 80%, 10% 64%, 0 50%, 10% 36%, 4% 20%, 20% 18%, 26% 4%, 40% 10%)';
    case 'flowDecision': return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    case 'flowDocument': return 'polygon(0 0, 100% 0, 100% 84%, 86% 92%, 70% 86%, 52% 94%, 34% 86%, 16% 94%, 0 86%)';
    case 'flowDatabase': return 'ellipse(50% 50% at 50% 50%)';
    case 'rounded': return 'inset(0 round 18px)';
    case 'flowProcess':
    case 'rectangle':
    default:
      return 'none';
  }
}

function shapeVisualStyle(item: BuilderElement) {
  const kind=item.shapeKind??'rectangle';
  const clipPath=shapeClipPath(kind);
  const fillType=item.shapeFillType??'solid';
  const color1=item.fill||'#EAF1FF';
  const color2=item.shapeFillColor2??'#C7D7FE';
  const angle=item.shapeFillAngle??45;
  const strokeStyle=item.shapeStrokeStyle??'solid';
  const strokeWidth=Math.max(0,item.shapeStrokeWidth??1);
  const strokeColor=item.shapeStrokeColor??'#9DB7F5';
  const strokeAlignment=item.shapeStrokeAlignment??'center';
  const style:CSSProperties={
    background:fillType==='none'?'transparent':fillType==='linear'?`linear-gradient(${angle}deg, ${color1}, ${color2})`:fillType==='radial'?`radial-gradient(circle at center, ${color1}, ${color2})`:color1,
    opacity:Math.min(100,Math.max(0,item.shapeOpacity??100))/100,
    clipPath,
    WebkitClipPath:clipPath,
    boxSizing:'border-box',
  };
  if(kind==='rounded'||kind==='rectangle'||kind==='flowProcess')style.borderRadius=item.shapeCornerRadius??(kind==='rounded'?18:0);
  const shadows:string[]=[];
  if(strokeStyle!=='none'&&strokeWidth>0){
    if((strokeStyle==='solid')&&strokeAlignment==='inside')shadows.push(`inset 0 0 0 ${strokeWidth}px ${strokeColor}`);
    else if((strokeStyle==='solid')&&strokeAlignment==='outside')shadows.push(`0 0 0 ${strokeWidth}px ${strokeColor}`);
    else {style.borderStyle=strokeStyle;style.borderWidth=strokeWidth;style.borderColor=strokeColor;}
  }
  const irregular=!['rectangle','rounded','flowProcess'].includes(kind);
  const filters:string[]=[];
  if(item.shapeShadowEnabled){const c=hexToRgba(item.shapeShadowColor??'#000000',Math.min(100,Math.max(0,item.shapeShadowOpacity??28))/100);if(irregular)filters.push(`drop-shadow(${item.shapeShadowX??0}px ${item.shapeShadowY??4}px ${Math.max(0,item.shapeShadowBlur??10)}px ${c})`);else shadows.push(`${item.shapeShadowX??0}px ${item.shapeShadowY??4}px ${Math.max(0,item.shapeShadowBlur??10)}px ${item.shapeShadowSpread??0}px ${c}`);}
  if(item.shapeGlowEnabled){const c=hexToRgba(item.shapeGlowColor??'#60A5FA',Math.min(100,Math.max(0,item.shapeGlowOpacity??45))/100);if(irregular)filters.push(`drop-shadow(0 0 ${Math.max(0,item.shapeGlowBlur??12)}px ${c})`);else shadows.push(`0 0 ${Math.max(0,item.shapeGlowBlur??12)}px ${c}`);}
  if(shadows.length)style.boxShadow=shadows.join(', ');
  if(filters.length)style.filter=filters.join(' ');
  return style;
}

function shapeMediaFrameStyle(item: BuilderElement) {
  const style: CSSProperties = {
    opacity: Math.min(100, Math.max(0, item.imageOpacity ?? 100)) / 100,
  };
  const borderStyle = item.imageBorderStyle ?? '';
  const borderWidth = item.imageBorderWidth ?? 0;
  if (borderStyle && borderStyle !== 'none' && borderWidth > 0) {
    style.borderStyle = borderStyle;
    style.borderWidth = borderWidth;
    style.borderColor = item.imageBorderColor ?? '#CBD5E1';
  }
  if ((item.imageBorderRadius ?? 0) > 0) style.borderRadius = item.imageBorderRadius ?? 0;
  if (item.imageShadowEnabled) {
    const shadowColor = hexToRgba(item.imageShadowColor ?? '#000000', Math.min(100, Math.max(0, item.imageShadowOpacity ?? 25)) / 100);
    style.boxShadow = `${item.imageShadowX ?? 0}px ${item.imageShadowY ?? 3}px ${Math.max(0, item.imageShadowBlur ?? 8)}px ${item.imageShadowSpread ?? 0}px ${shadowColor}`;
  }
  if (item.imageBackground) style.background = item.imageBackground;
  return style;
}


function QrElementContent({ item, value }: { item: BuilderElement; value: string }) {
  const quiet = Math.max(0, item.qrQuietZone ?? 8);
  const display = value || ' ';
  return <div className="qr-render-shell" style={{ background: item.qrBackground ?? '#FFFFFF', padding: quiet }}>
    <div className="qr-code-host"><QRCode value={display} fgColor={item.qrForeground ?? '#111827'} bgColor={item.qrBackground ?? '#FFFFFF'} level={item.qrErrorCorrection ?? 'M'} size={256} style={{ width: '100%', height: '100%' }}/></div>
    {(item.qrShowValue ?? true) ? <div className="machine-readable-value">{value || 'QR value'}</div> : null}
  </div>;
}

const CODE39_PATTERNS: Record<string,string> = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};

function normalizeCode39(value: string) {
  return value.toUpperCase().split('').map((char) => CODE39_PATTERNS[char] ? char : '-').join('') || ' ';
}

function BarcodeElementContent({ item, value }: { item: BuilderElement; value: string }) {
  const normalized = normalizeCode39(value);
  const encoded = `*${normalized}*`;
  const modules: Array<{ wide:boolean; bar:boolean }> = [];
  for (let c = 0; c < encoded.length; c += 1) {
    const pattern = CODE39_PATTERNS[encoded[c]] ?? CODE39_PATTERNS['-'];
    for (let i = 0; i < pattern.length; i += 1) modules.push({ wide: pattern[i] === 'w', bar: i % 2 === 0 });
    if (c < encoded.length - 1) modules.push({ wide:false, bar:false });
  }
  const units = modules.reduce((sum, module) => sum + (module.wide ? 3 : 1), 0);
  let cursor = 0;
  const quiet = Math.max(0, item.barcodeQuietZone ?? 8);
  return <div className="barcode-render-shell" style={{ background: item.barcodeBackground ?? '#FFFFFF', padding: `${quiet}px` }}>
    <svg className="barcode-svg" viewBox={`0 0 ${Math.max(1,units)} ${Math.max(24,item.barcodeBarHeight ?? 54)}`} preserveAspectRatio="none" aria-label={`Code 39 barcode ${normalized}`}>
      {modules.map((module, index) => { const width = module.wide ? 3 : 1; const x = cursor; cursor += width; return module.bar ? <rect key={`${index}:${x}`} x={x} y="0" width={width} height="100%" fill={item.barcodeForeground ?? '#111827'}/> : null; })}
    </svg>
    {(item.barcodeShowText ?? true) ? <div className="machine-readable-value" style={{ fontSize: item.barcodeTextSize ?? 11, color: item.barcodeForeground ?? '#111827' }}>{normalized}</div> : null}
  </div>;
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
  if (src) return <img className="bound-image" src={src} alt={item.type === 'signature' ? 'Signature' : 'Image'} style={{ objectFit: item.imageFit ?? 'contain', objectPosition: item.imageObjectPosition ?? 'center', filter: imageElementFilter(item) }}/>;
  if (item.type === 'signature' && item.signatureShowPlaceholder === false) return null;
  const Icon = item.type === 'signature' ? Signature : Image;
  return <><Icon size={item.type === 'signature' ? 36 : 26}/><span>{item.type === 'signature' ? 'Signature image' : 'Image'}</span></>;
}

function isImageSource(value: string) {
  return /^data:image\//i.test(value.trim()) || /^https?:\/\//i.test(value.trim()) || /^blob:/i.test(value.trim());
}

function imageElementFrameStyle(item: BuilderElement) {
  if (item.type !== 'image' && item.type !== 'signature') return {};
  const style: CSSProperties = {
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: item.imageBorderRadius ?? 0,
    opacity: Math.min(100, Math.max(0, item.imageOpacity ?? 100)) / 100,
  };
  if (item.imageBackground) style.background = item.imageBackground;
  const borderStyle = item.imageBorderStyle ?? '';
  const borderWidth = item.imageBorderWidth ?? 0;
  if (borderStyle && borderStyle !== 'none' && borderWidth > 0) {
    style.borderStyle = borderStyle;
    style.borderWidth = borderWidth;
    style.borderColor = item.imageBorderColor ?? '#CBD5E1';
  } else if (borderStyle === 'none' || borderWidth === 0) {
    style.border = 'none';
  }
  if (item.imageShadowEnabled) {
    const shadowColor = hexToRgba(item.imageShadowColor ?? '#000000', Math.min(100, Math.max(0, item.imageShadowOpacity ?? 25)) / 100);
    style.boxShadow = `${item.imageShadowX ?? 0}px ${item.imageShadowY ?? 3}px ${Math.max(0, item.imageShadowBlur ?? 8)}px ${item.imageShadowSpread ?? 0}px ${shadowColor}`;
  }
  return style;
}

function imageElementFilter(item: BuilderElement) {
  const brightness=Math.max(0,item.imageBrightness??100);
  const contrast=Math.max(0,item.imageContrast??100);
  const saturation=Math.max(0,item.imageSaturation??100);
  const grayscale=Math.min(100,Math.max(0,item.imageGrayscale??0));
  const sepia=Math.min(100,Math.max(0,item.imageSepia??0));
  const blur=Math.max(0,item.imageBlur??0);
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%) sepia(${sepia}%) blur(${blur}px)`;
}

function hexToRgba(hex:string,alpha:number){
  const raw=hex.replace('#','').trim();
  const normalized=raw.length===3?raw.split('').map((c)=>c+c).join(''):raw.padEnd(6,'0').slice(0,6);
  const value=Number.parseInt(normalized,16);
  const r=(value>>16)&255,g=(value>>8)&255,b=value&255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1,Math.max(0,alpha))})`;
}


function pageCanvasStyle(settings: PageSettings) {
  const size = pagePixelSize(settings);
  // DB-2 Fix4: the configurable document border belongs to the printable
  // content/margin box, not to the physical paper edge. Keep the paper
  // itself borderless so Preview/PDF/DOCX never get a cut-to-cut border.
  return { width: `${size.width}px`, height: `${size.height}px`, background: settings.background };
}

function PageContentBorder({ settings }: { settings: PageSettings }) {
  const m = settings.marginsMm;
  if (settings.borderWidth <= 0) return null;
  const alignment = settings.borderAlignment ?? 'inside';
  const requestedOffsetMm = Math.max(0, settings.borderOffsetMm ?? 0);
  const borderMm = settings.borderWidth * 25.4 / 96;
  const edge = (marginMm: number) => {
    if (alignment === 'inside') return mmToPx(marginMm + requestedOffsetMm);
    if (alignment === 'center') return mmToPx(Math.max(0, marginMm - requestedOffsetMm)) - settings.borderWidth / 2;
    // Outside is clamped to the physical page edge. This keeps a printable
    // content border from escaping the paper unless a future bleed mode opts in.
    const outward = Math.min(requestedOffsetMm, Math.max(0, marginMm - borderMm));
    return Math.max(0, mmToPx(marginMm - outward) - settings.borderWidth);
  };
  return <div
    className="page-content-border"
    aria-hidden="true"
    style={{
      top: edge(m.top), right: edge(m.right), bottom: edge(m.bottom), left: edge(m.left),
      borderColor: settings.borderColor,
      borderWidth: `${settings.borderWidth}px`,
    }}
  />;
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

function PageProperties({ settings, pageName, pages, activePageId, virtualPageCount, activePreviewPageIndex, onFocusPreviewPage, onChange, onName, onAddPage, onDuplicatePage, onDeletePage, onMovePage, onSelectPage, onEditHeader, onEditFooter }: { settings: PageSettings; pageName: string; pages: BuilderPage[]; activePageId: string; virtualPageCount: number; activePreviewPageIndex: number; onFocusPreviewPage: (index: number) => void; onChange: (patch: Partial<PageSettings>) => void; onName: (value: string) => void; onAddPage: () => void; onDuplicatePage: () => void; onDeletePage: () => void; onMovePage: (direction: -1 | 1) => void; onSelectPage: (pageId: string) => void; onEditHeader: () => void; onEditFooter: () => void }) {
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
  const help = (text: string) => <button type="button" className="property-help" title={text} aria-label={text}><HelpCircle size={14}/></button>;
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const marginLinkedValue = Number(mmToUnit(settings.marginsMm.top,unit).toFixed(2));
  const bleedLinkedValue = Number(mmToUnit(settings.bleedMm.top,unit).toFixed(2));
  return <div className="page-properties-stack professional-page-settings">
    <div className="page-settings-intro"><div><strong>Page setup</strong><span>{activePage?.name ?? pageName} · {settings.preset} {settings.orientation}</span></div>{help('Configure physical page size, print margins, header/footer masters, bleed and appearance. Advanced sections stay collapsed until you need them.')}</div>

    <details className="inspector-accordion" open>
      <summary><span><span className="section-symbol">▤</span>Pages <small>{pages.length}</small></span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <div className="page-manager-toolbar"><button type="button" className="secondary compact" onClick={onAddPage}><Plus size={14}/>Add page</button><details className="page-action-menu"><summary title="Page actions"><MoreHorizontal size={16}/></summary><div><button type="button" onClick={onDuplicatePage} disabled={activePreviewPageIndex > 0}>Duplicate</button><button type="button" onClick={() => onMovePage(-1)} disabled={activePreviewPageIndex > 0}>Move up</button><button type="button" onClick={() => onMovePage(1)} disabled={activePreviewPageIndex > 0}>Move down</button><button type="button" className="danger-text" onClick={onDeletePage} disabled={pages.length <= 1 || activePreviewPageIndex > 0}>Delete</button></div></details></div>
        <div className="page-manager-list compact-list">{pages.map((page, index) => <div key={page.id} className="page-manager-group"><button type="button" className={page.id === activePageId && activePreviewPageIndex === 0 ? 'page-manager-row active' : 'page-manager-row'} onClick={() => { onSelectPage(page.id); if (page.id === activePageId) onFocusPreviewPage(0); }}><span>{index + 1}</span><strong>{page.name}</strong><small>{page.settings.preset}</small></button>{page.id === activePageId && Array.from({ length: Math.max(0, virtualPageCount - 1) }, (_, continuationIndex) => { const previewIndex = continuationIndex + 1; return <button type="button" key={`${page.id}:auto:${previewIndex}`} className={activePreviewPageIndex === previewIndex ? 'page-manager-row auto-page active' : 'page-manager-row auto-page'} onClick={() => onFocusPreviewPage(previewIndex)} title="Automatically generated by table overflow"><span>{index + 1}.{previewIndex + 1}</span><strong>Continuation {previewIndex + 1}</strong><small><b className="auto-page-badge">Auto</b></small></button>; })}</div>)}</div>
        {activePreviewPageIndex > 0 ? <div className="auto-page-note">Auto continuation page · page actions are disabled</div> : null}
      </div>
    </details>

    <details className="inspector-accordion" open>
      <summary><span><span className="section-symbol">▱</span>Size &amp; orientation</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <label>Page name<input value={pageName} onChange={(e) => onName(e.target.value)}/></label>
        <div className="property-grid"><label>Page size<select value={settings.preset} onChange={(e) => onChange({ preset: e.target.value as PagePreset })}>{presets.map((p) => <option key={p}>{p}</option>)}</select></label><label>Units<select value={unit} onChange={(e) => onChange({ unit: e.target.value as PageUnit })}><option value="mm">mm</option><option value="cm">cm</option><option value="in">inch</option></select></label></div>
        <label>Orientation<select value={settings.orientation} onChange={(e) => onChange({ orientation: e.target.value as PageOrientation })}><option>Portrait</option><option>Landscape</option></select></label>
        {settings.preset === 'Custom' ? <div className="property-grid"><label>Width<input type="number" min="20" step="0.1" value={Number(mmToUnit(settings.customWidthMm, unit).toFixed(2))} onChange={(e) => onChange({ customWidthMm: unitToMm(Number(e.target.value)||20,unit) })}/></label><label>Height<input type="number" min="20" step="0.1" value={Number(mmToUnit(settings.customHeightMm, unit).toFixed(2))} onChange={(e) => onChange({ customHeightMm: unitToMm(Number(e.target.value)||20,unit) })}/></label></div> : <div className="page-size-readout">{mmToUnit(size.widthMm,unit).toFixed(1)} × {mmToUnit(size.heightMm,unit).toFixed(1)} {unit === 'in' ? 'in' : unit}</div>}
      </div>
    </details>

    <details className="inspector-accordion">
      <summary><span><span className="section-symbol">↔</span>Margins {help('Margins define the primary printable/content inset from the physical page edge.')}</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <div className="section-inline-control"><span>Values</span><button type="button" className={linkMargins?'mini-toggle active':'mini-toggle'} onClick={() => setLinkMargins(!linkMargins)}>{linkMargins?'Linked':'Independent'}</button></div>
        {linkMargins ? <label>All sides<input type="number" min="0" step="0.5" value={marginLinkedValue} onChange={(e) => updateEdges('marginsMm','top',Number(e.target.value),true)}/></label> : <div className="edge-grid">{(['top','right','bottom','left'] as const).map((side) => <label key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.marginsMm[side],unit).toFixed(2))} onChange={(e) => updateEdges('marginsMm',side,Number(e.target.value),false)}/></label>)}</div>}
      </div>
    </details>

    <details className="inspector-accordion">
      <summary><span><span className="section-symbol">⇥</span>Header {settings.header.enabled ? <small>On · {settings.header.repeat === 'every' ? 'Every page' : settings.header.repeat === 'first' ? 'First only' : 'Except first'}</small> : <small>Off</small>} {help('Header is a document master. Elements assigned to it can repeat across generated pages according to the repeat policy.')}</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <div className="section-inline-control"><span>Header master</span><button type="button" className={settings.header.enabled?'mini-toggle active':'mini-toggle'} onClick={() => onChange({ header: { ...settings.header, enabled: !settings.header.enabled } })}>{settings.header.enabled?'Enabled':'Disabled'}</button></div>
        <div className="property-grid"><label>Height<input type="number" min="0" step="0.5" disabled={!settings.header.enabled} value={Number(mmToUnit(settings.header.heightMm,unit).toFixed(2))} onChange={(e) => onChange({ header: { ...settings.header, heightMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label><label>Content gap<input type="number" min="0" step="0.5" disabled={!settings.header.enabled} value={Number(mmToUnit(settings.header.gapMm,unit).toFixed(2))} onChange={(e) => onChange({ header: { ...settings.header, gapMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label></div>
        <label>Repeat<select disabled={!settings.header.enabled} value={settings.header.repeat} onChange={(e) => onChange({ header: { ...settings.header, repeat: e.target.value as PageRepeatMode } })}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label>
        <button type="button" className="secondary section-editor-button" onClick={onEditHeader}>Edit header content</button>
      </div>
    </details>

    <details className="inspector-accordion">
      <summary><span><span className="section-symbol">⇤</span>Footer {settings.footer.enabled ? <small>On · {settings.footer.repeat === 'every' ? 'Every page' : settings.footer.repeat === 'first' ? 'First only' : 'Except first'}</small> : <small>Off</small>} {help('Footer is a document master. It is ideal for page numbers, legal text and repeating document information.')}</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <div className="section-inline-control"><span>Footer master</span><button type="button" className={settings.footer.enabled?'mini-toggle active':'mini-toggle'} onClick={() => onChange({ footer: { ...settings.footer, enabled: !settings.footer.enabled } })}>{settings.footer.enabled?'Enabled':'Disabled'}</button></div>
        <div className="property-grid"><label>Height<input type="number" min="0" step="0.5" disabled={!settings.footer.enabled} value={Number(mmToUnit(settings.footer.heightMm,unit).toFixed(2))} onChange={(e) => onChange({ footer: { ...settings.footer, heightMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label><label>Content gap<input type="number" min="0" step="0.5" disabled={!settings.footer.enabled} value={Number(mmToUnit(settings.footer.gapMm,unit).toFixed(2))} onChange={(e) => onChange({ footer: { ...settings.footer, gapMm: Math.max(0,unitToMm(Number(e.target.value)||0,unit)) } })}/></label></div>
        <label>Repeat<select disabled={!settings.footer.enabled} value={settings.footer.repeat} onChange={(e) => onChange({ footer: { ...settings.footer, repeat: e.target.value as PageRepeatMode } })}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label>
        <button type="button" className="secondary section-editor-button" onClick={onEditFooter}>Edit footer content</button>
      </div>
    </details>

    <details className="inspector-accordion">
      <summary><span><span className="section-symbol">✂</span>Bleed {help('Bleed extends artwork beyond the trim edge so cutting does not leave white gaps. A common print bleed is 3 mm.')}</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <div className="section-inline-control"><span>Values</span><button type="button" className={linkBleed?'mini-toggle active':'mini-toggle'} onClick={() => setLinkBleed(!linkBleed)}>{linkBleed?'Linked':'Independent'}</button></div>
        {linkBleed ? <label>All sides<input type="number" min="0" step="0.5" value={bleedLinkedValue} onChange={(e) => updateEdges('bleedMm','top',Number(e.target.value),true)}/></label> : <div className="edge-grid">{(['top','right','bottom','left'] as const).map((side) => <label key={side}>{side[0].toUpperCase()+side.slice(1)}<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.bleedMm[side],unit).toFixed(2))} onChange={(e) => updateEdges('bleedMm',side,Number(e.target.value),false)}/></label>)}</div>}
        <div className="preset-row"><button type="button" className="secondary compact" onClick={() => onChange({ bleedMm:{top:0,right:0,bottom:0,left:0} })}>None</button><button type="button" className="secondary compact" onClick={() => onChange({ bleedMm:{top:3,right:3,bottom:3,left:3} })}>3 mm print</button></div>
      </div>
    </details>

    <details className="inspector-accordion">
      <summary><span><span className="section-symbol">◫</span>Appearance {help('Page appearance controls the background, safe-area inset, content border and design guides.')}</span><ChevronDown size={15}/></summary>
      <div className="inspector-accordion-content">
        <label>Safe area inset<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.safeAreaMm,unit).toFixed(2))} onChange={(e) => onChange({ safeAreaMm: unitToMm(Number(e.target.value)||0,unit) })}/></label>
        <div className="property-grid"><label>Background<input type="color" value={settings.background} onChange={(e) => onChange({ background:e.target.value })}/></label><label>Border color<input type="color" value={settings.borderColor} onChange={(e) => onChange({ borderColor:e.target.value })}/></label></div>
        <div className="property-grid"><label>Border width<input type="number" min="0" max="10" value={settings.borderWidth} onChange={(e) => onChange({ borderWidth:Math.max(0,Number(e.target.value)||0) })}/></label><label>Border alignment<select value={settings.borderAlignment ?? 'inside'} onChange={(e) => onChange({ borderAlignment:e.target.value as PageSettings['borderAlignment'] })}><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select></label></div>
        <label>Border offset ({unitLabel(unit)})<input type="number" min="0" step="0.5" value={Number(mmToUnit(settings.borderOffsetMm ?? 0,unit).toFixed(2))} onChange={(e) => onChange({ borderOffsetMm:Math.max(0,unitToMm(Number(e.target.value)||0,unit)) })}/></label>
        <label className="check-row guide-toggle"><input type="checkbox" checked={settings.showGuides} onChange={(e) => onChange({ showGuides:e.target.checked })}/><span><strong>Show layout guides</strong><small>Margin, safe area and bleed</small></span></label>
      </div>
    </details>
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

function Inspector({ tab, onInspectorTab, selected, source, record, formulaElements, formulaAggregateRows, dynamicTokenFields, dataState, pageSettings, pageName, pages, activePageId, virtualPageCount, activePreviewPageIndex, onFocusPreviewPage, onPageSettings, onPageName, onAddPage, onDuplicatePage, onDeletePage, onMovePage, onSelectPage, onUpdate, onDelete, onDuplicate, onArrange, onMoveFlow, onFlowRowAction, relativeElements, onSetInsertRegion, onEditTableConfiguration }: {
  tab: InspectorTab; onInspectorTab: (tab: InspectorTab) => void; selected: BuilderElement | null; source: ReturnType<typeof activeSource>; record: ReturnType<typeof activeRecord>; formulaElements: BuilderElement[]; formulaAggregateRows: Array<Record<string, unknown>>; dynamicTokenFields: TemplateTokenField[]; dataState: BuilderDataState; pageSettings: PageSettings; pageName: string; pages: BuilderPage[]; activePageId: string; virtualPageCount: number; activePreviewPageIndex: number; onFocusPreviewPage: (index: number) => void;
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
  const selectedBindingPreview = selected?.binding ? displayValue(valueForBuilderField(record, source?.fields ?? [], formulaElements, selected.binding, formulaAggregateRows)) : '';
  const selectedShapeMediaPreview = selected?.shapeMediaBinding ? displayValue(valueForBuilderField(record, source?.fields ?? [], formulaElements, selected.shapeMediaBinding, formulaAggregateRows)) : '';

  if (tab === 'header') return <GlobalBandEditor region="header" settings={pageSettings} onPageSettings={onPageSettings} onSetInsertRegion={onSetInsertRegion} onBack={() => onInspectorTab('properties')}/>;
  if (tab === 'footer') return <GlobalBandEditor region="footer" settings={pageSettings} onPageSettings={onPageSettings} onSetInsertRegion={onSetInsertRegion} onBack={() => onInspectorTab('properties')}/>;
  if (selected?.type === 'table' && selected.table && tab === 'properties') return <TableElementProperties selected={selected} elements={relativeElements} pageSettings={pageSettings} sources={dataState.sources} activeSourceId={dataState.activeSourceId ?? undefined} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction} onEditConfiguration={() => onEditTableConfiguration(selected.id)} onDuplicate={onDuplicate} onDelete={onDelete}/>;
  if (selected?.type === 'table' && selected.table && tab === 'binding') return <div className="inspector-body table-ux3-panel"><div className="inspector-panel-heading"><div><h3>Columns</h3><small>Column values and cell overrides</small></div></div><TableProperties table={selected.table} view="columns" sources={dataState.sources} activeSourceId={dataState.activeSourceId ?? undefined} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={(table) => onUpdate({ table })} onEditConfiguration={() => onEditTableConfiguration(selected.id)}/></div>;
  if (selected?.type === 'table' && selected.table && tab === 'rows') return <div className="inspector-body table-ux3-panel"><div className="inspector-panel-heading"><div><h3>Rows</h3><small>Header, body and summary row structure</small></div></div><TableProperties table={selected.table} view="rows" sources={dataState.sources} activeSourceId={dataState.activeSourceId ?? undefined} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={(table) => onUpdate({ table })} onEditConfiguration={() => onEditTableConfiguration(selected.id)}/></div>;
  if (selected?.type === 'table' && selected.table && tab === 'formatting') return <div className="inspector-body table-ux3-panel"><div className="inspector-panel-heading"><div><h3>Formatting</h3><small>Table and cell appearance</small></div></div><TableProperties table={selected.table} view="formatting" sources={dataState.sources} activeSourceId={dataState.activeSourceId ?? undefined} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={(table) => onUpdate({ table })} onEditConfiguration={() => onEditTableConfiguration(selected.id)}/></div>;
  if (selected?.type === 'shape' && tab === 'properties') return <ShapePropertiesPanel selected={selected} selectedBand={selectedBand} pageSettings={pageSettings} relativeElements={relativeElements} onUpdate={onUpdate} onPageSettings={onPageSettings} assignRegion={assignRegion} onMoveFlow={onMoveFlow} onFlowRowAction={onFlowRowAction} onArrange={onArrange} onDuplicate={onDuplicate} onDelete={onDelete}/>;
  if (selected?.type === 'shape' && (tab === 'content' || tab === 'binding')) return <ShapeContentPanel selected={selected} contentPreview={selectedContentPreview} dynamicTokenFields={dynamicTokenFields} mediaBindingPreview={selectedShapeMediaPreview} onUpdate={onUpdate}/>;
  if (selected?.type === 'shape' && tab === 'formatting') return <ShapeFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if ((selected?.type === 'qr' || selected?.type === 'barcode' || selected?.type === 'signature') && tab === 'properties') return <MachineReadablePropertiesPanel selected={selected} selectedBand={selectedBand} pageSettings={pageSettings} relativeElements={relativeElements} onUpdate={onUpdate} onPageSettings={onPageSettings} assignRegion={assignRegion} onMoveFlow={onMoveFlow} onFlowRowAction={onFlowRowAction} onArrange={onArrange} onDuplicate={onDuplicate} onDelete={onDelete}/>;
  if (selected?.type === 'qr' && (tab === 'content' || tab === 'binding')) return <QrContentPanel selected={selected} contentPreview={selectedContentPreview} dynamicTokenFields={dynamicTokenFields} onUpdate={onUpdate}/>;
  if (selected?.type === 'barcode' && (tab === 'content' || tab === 'binding')) return <BarcodeContentPanel selected={selected} contentPreview={selectedContentPreview} dynamicTokenFields={dynamicTokenFields} onUpdate={onUpdate}/>;
  if (selected?.type === 'signature' && (tab === 'content' || tab === 'binding')) return <SignatureContentPanel selected={selected} bindingPreview={selectedBindingPreview} dynamicTokenFields={dynamicTokenFields} onUpdate={onUpdate}/>;
  if (selected?.type === 'qr' && tab === 'formatting') return <QrFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if (selected?.type === 'barcode' && tab === 'formatting') return <BarcodeFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if (selected?.type === 'signature' && tab === 'formatting') return <ImageFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if (tab === 'binding' && (selected?.type as string) !== 'image' && (selected?.type as string) !== 'signature') return <div className="inspector-body"><h3>Dynamic Field</h3><p>{selected ? 'Pick an imported field or reusable Formula Field. Formula Fields are available everywhere in the document.' : 'Select an element to use a Dynamic Field.'}</p><label>Whole element binding<select disabled={!selected || dynamicTokenFields.length === 0 || selected.type === 'formula'} value={selected?.binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value || undefined })}><option value="">No whole-element binding</option>{source?.fields.length ? <optgroup label="Imported Fields">{source.fields.map((field) => <option key={`src:${field.name}`} value={field.name}>{field.label} ({field.type})</option>)}</optgroup> : null}{formulaTokenFieldsForElements(formulaElements).length ? <optgroup label="Formula Fields">{formulaTokenFieldsForElements(formulaElements).map((field) => <option key={`formula:${field.name}`} value={field.name}>{field.label}</option>)}</optgroup> : null}</select></label>{selected?.binding && <><div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{displayValue(valueForBuilderField(record, source?.fields ?? [], formulaElements, selected.binding, formulaAggregateRows)) || 'Empty / null'}</strong></div></>}{selected && selected.type !== 'table' && (selected.type as string) !== 'image' && (selected.type as string) !== 'signature' && selected.type !== 'divider' && selected.type !== 'formula' ? <TokenInsertPanel fields={dynamicTokenFields} value={selected.text} onChange={(text) => onUpdate({ text })}/> : null}</div>;
  if (tab === 'formatting' && selected?.type === 'text') return <TextFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if (tab === 'formatting' && (selected?.type === 'image' || selected?.type === 'signature')) return <ImageFormattingPanel selected={selected} onUpdate={onUpdate}/>;
  if (tab === 'formatting') return <div className="inspector-body"><h3>Formatting</h3>{!selected ? <p>Select an element to edit document-safe formatting.</p> : <><label>Font family<select value={selected.fontFamily ?? 'Arial'} onChange={(e) => onUpdate({ fontFamily: e.target.value })}><option>Arial</option><option>Helvetica</option><option>Verdana</option><option>Tahoma</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option></select></label><div className="property-grid"><label>Font size<input type="number" min="6" max="144" value={selected.fontSize} onChange={(e) => onUpdate({ fontSize: Math.max(6, Number(e.target.value) || 12) })}/></label><label>Line height<input type="number" min="0.8" max="3" step="0.05" value={selected.lineHeight ?? 1.25} onChange={(e) => onUpdate({ lineHeight: Math.min(3, Math.max(0.8, Number(e.target.value) || 1.25)) })}/></label></div><div className="text-style-actions"><button type="button" className={(selected.fontWeight ?? 400) >= 700 ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ fontWeight: (selected.fontWeight ?? 400) >= 700 ? 400 : 700 })}><b>B</b></button><button type="button" className={selected.italic ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ italic: !selected.italic })}><i>I</i></button><button type="button" className={selected.underline ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ underline: !selected.underline })}><u>U</u></button></div><label>Text color<input type="color" value={selected.color} onChange={(e) => onUpdate({ color: e.target.value })}/></label>{selected.type === 'shape' && <label>Fill<input type="color" value={selected.fill} onChange={(e) => onUpdate({ fill: e.target.value })}/></label>}<div className="align-actions"><button className={selected.textAlign === 'left' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'left' })}><AlignLeft size={16}/></button><button className={selected.textAlign === 'center' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'center' })}><AlignCenter size={16}/></button><button className={selected.textAlign === 'right' ? 'active' : ''} onClick={() => onUpdate({ textAlign: 'right' })}><AlignRight size={16}/></button></div><p className="table-cell-help">Typography applies to static text and every resolved dynamic token in this content block.</p></>}</div>;
  if (tab === 'properties' && selected?.type === 'text') return <TextPropertiesPanel selected={selected} selectedBand={selectedBand} contentPreview={selectedContentPreview} dynamicTokenFields={dynamicTokenFields} pageSettings={pageSettings} relativeElements={relativeElements} onUpdate={onUpdate} onPageSettings={onPageSettings} assignRegion={assignRegion} onMoveFlow={onMoveFlow} onFlowRowAction={onFlowRowAction} onArrange={onArrange} onDuplicate={onDuplicate} onDelete={onDelete}/>;
  if (tab === 'properties' && (selected?.type === 'image' || selected?.type === 'signature')) return <ImagePropertiesPanel selected={selected} selectedBand={selectedBand} bindingPreview={selectedBindingPreview} dynamicTokenFields={dynamicTokenFields} pageSettings={pageSettings} relativeElements={relativeElements} onUpdate={onUpdate} onPageSettings={onPageSettings} assignRegion={assignRegion} onMoveFlow={onMoveFlow} onFlowRowAction={onFlowRowAction} onArrange={onArrange} onDuplicate={onDuplicate} onDelete={onDelete}/>;
  if (tab === 'properties' && selected?.type === 'formula') return <div className="inspector-body"><h3>Formula Field</h3><FormulaFieldProperties selected={selected} source={source} formulaElements={formulaElements} preview={selectedFormulaPreview} onUpdate={onUpdate}/><div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></div>;
  if (tab === 'conditions') return <ConditionsPanel selected={selected} fields={dynamicTokenFields} onUpdate={onUpdate}/>;
  return <div className="inspector-body"><h3>Properties</h3>{selected ? <><section className="inspector-card element-zone-card"><div className="inspector-card-title">Page Zone</div><label>Region<select value={selected.region ?? 'body'} disabled={selected.type === 'table'} onChange={(e) => assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>{selected.type === 'table' ? <div className="table-cell-help">Tables belong to the Body zone and paginate between Header/Footer-aware content bounds.</div> : <>{selectedBand ? <label>{selectedBand === 'header' ? 'Header' : 'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e) => onPageSettings({ [selectedBand]: { ...pageSettings[selectedBand], enabled: true, repeat: e.target.value as PageRepeatMode } } as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label> : null}<div className="table-cell-help">Header/Footer are global document masters. All assigned Text/Image/Shape/QR/Barcode/Signature/Divider elements repeat across builder pages and overflow continuations using the master repeat rule. Dragging/resizing any projected copy edits the one global master, so all pages stay synchronized.</div></>}</section><div className="property-grid"><label>X<input type="number" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow'} value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label><label>Y<input type="number" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow'} value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label><label>Width<input type="number" min="20" disabled={!selectedBand && (selected.layoutMode ?? 'floating') === 'flow' && (selected.flowWidth ?? (selected.type === 'table' ? 'full' : 'custom')) === 'full'} value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label><label>Height<input type={selected.type === 'table' ? 'text' : 'number'} min={selected.type === 'table' ? undefined : '4'} disabled={selected.type === 'table'} value={selected.type === 'table' ? `Auto · ${Math.round(selected.height)}px` : Math.round(selected.height)} onChange={(e) => { if (selected.type !== 'table') onUpdate({ height: Math.max(4, Number(e.target.value) || 4) }); }}/></label></div>{selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <><BodyFlowControls selected={selected} elements={relativeElements} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction}/>{(selected.layoutMode ?? 'floating') === 'floating' ? <><BodyPositionControls selected={selected} settings={pageSettings} onUpdate={onUpdate}/><RelativePlacementControls selected={selected} elements={relativeElements} settings={pageSettings} onUpdate={onUpdate}/></> : null}</>}{selected.type === 'table' && selected.table ? <TableProperties table={selected.table} sources={dataState.sources} activeSourceId={dataState.activeSourceId ?? undefined} formulaFields={formulaTokenFieldsForElements(formulaElements)} onUpdate={(table) => onUpdate({ table })} onEditConfiguration={() => onEditTableConfiguration(selected.id)}/> : selected.type === 'formula' ? <FormulaFieldProperties selected={selected} source={source} formulaElements={formulaElements} preview={selectedFormulaPreview} onUpdate={onUpdate}/> : (selected.type === 'image' || selected.type === 'signature') ? <ImageProperties selected={selected} onUpdate={onUpdate}/> : selected.type !== 'divider' ? <MixedContentEditor label="Content" value={selected.text} fields={dynamicTokenFields} previewValue={selectedContentPreview} onChange={(text) => onUpdate({ text })}/> : null}{((selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') === 'floating') ? <section className="inspector-card arrange-card"><div className="inspector-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={() => onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={() => onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={() => onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={() => onArrange('back')}>Send Back</button></div><p className="table-cell-help">Smart Insert only avoids accidental overlap when an element is first created. Manual drag may overlap any existing block. Use these layer controls when the moved element needs to stay above or below a table, image, or shape.</p></section> : null}<div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></> : <PageProperties settings={pageSettings} pageName={pageName} pages={pages} activePageId={activePageId} virtualPageCount={virtualPageCount} activePreviewPageIndex={activePreviewPageIndex} onFocusPreviewPage={onFocusPreviewPage} onChange={onPageSettings} onName={onPageName} onAddPage={onAddPage} onDuplicatePage={onDuplicatePage} onDeletePage={onDeletePage} onMovePage={onMovePage} onSelectPage={onSelectPage} onEditHeader={() => onInspectorTab('header')} onEditFooter={() => onInspectorTab('footer')}/>}</div>;
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

function InspectorHelp({ text }: { text: string }) {
  return <span className="inspector-help" title={text} aria-label={text}>?</span>;
}


function MachineReadablePropertiesPanel({ selected, selectedBand, pageSettings, relativeElements, onUpdate, onPageSettings, assignRegion, onMoveFlow, onFlowRowAction, onArrange, onDuplicate, onDelete }: {
  selected: BuilderElement;
  selectedBand: 'header'|'footer'|null;
  pageSettings: PageSettings;
  relativeElements: BuilderElement[];
  onUpdate: (patch: Partial<BuilderElement>) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void;
  assignRegion: (region: PageRegion) => void;
  onMoveFlow: (direction: -1|1) => void;
  onFlowRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void;
  onArrange: (action: 'front'|'forward'|'backward'|'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const label = selected.type === 'qr' ? 'QR Code' : selected.type === 'barcode' ? 'Barcode' : 'Signature';
  const isFlow = !selectedBand && (selected.layoutMode ?? 'floating') === 'flow';
  const aspect = selected.height > 0 ? selected.width / selected.height : 1;
  const lockAspect = selected.type === 'signature' ? (selected.imageLockAspect ?? true) : false;
  const updateWidth = (width:number) => onUpdate(lockAspect ? { width, height: Math.max(20, width / aspect) } : { width });
  const updateHeight = (height:number) => onUpdate(lockAspect ? { height, width: Math.max(20, height * aspect) } : { height });
  return <div className="inspector-body text-inspector-body machine-inspector-body">
    <div className="inspector-panel-heading"><div><h3>{label}</h3><small>Placement, size and document flow</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Position & Size <span className="section-unit">px</span></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><div className="property-grid compact-geometry-grid"><label>X<input type="number" disabled={isFlow} value={Math.round(selected.x)} onChange={(e)=>onUpdate({x:Number(e.target.value)||0})}/></label><label>Y<input type="number" disabled={isFlow} value={Math.round(selected.y)} onChange={(e)=>onUpdate({y:Number(e.target.value)||0})}/></label><label>Width<input type="number" min="20" disabled={isFlow && (selected.flowWidth ?? 'custom') === 'full'} value={Math.round(selected.width)} onChange={(e)=>updateWidth(Math.max(20,Number(e.target.value)||20))}/></label><label>Height<input type="number" min="20" value={Math.round(selected.height)} onChange={(e)=>updateHeight(Math.max(20,Number(e.target.value)||20))}/></label></div>{selected.type === 'signature' ? <label className="guide-toggle"><input type="checkbox" checked={selected.imageLockAspect ?? true} onChange={(e)=>onUpdate({imageLockAspect:e.target.checked})}/><span><strong>Lock aspect ratio</strong><small>Keep signature proportions while resizing</small></span></label> : null}</div>
      </details>
      <details className="inspector-accordion text-accordion" open><summary><span>Layout <InspectorHelp text="Flow keeps the element in automatic document flow. Floating enables exact placement and overlap controls."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content">{selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <TextLayoutControls selected={selected} elements={relativeElements} pageSettings={pageSettings} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction} showRowManager={false}/>}</div></details>
      <details className="inspector-accordion text-accordion"><summary><span>Region <InspectorHelp text="Body is normal content. Header/Footer are global document masters and repeat according to the selected master rule."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Place in<select value={selected.region ?? 'body'} onChange={(e)=>assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>{selectedBand ? <label>{selectedBand === 'header' ? 'Header' : 'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e)=>onPageSettings({[selectedBand]:{...pageSettings[selectedBand],enabled:true,repeat:e.target.value as PageRepeatMode}} as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label> : null}</div></details>
      <details className="inspector-accordion text-accordion"><summary><span>Advanced</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content">{((selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') === 'floating') ? <section className="nested-inspector-card arrange-card"><div className="nested-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={()=>onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={()=>onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={()=>onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={()=>onArrange('back')}>Send Back</button></div></section> : <p className="field-hint">Layer controls appear when this element is Floating or assigned to a master region.</p>}<div className="inspector-actions text-object-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></div></details>
    </div>
  </div>;
}

function QrContentPanel({ selected, contentPreview, dynamicTokenFields, onUpdate }: { selected: BuilderElement; contentPreview: string; dynamicTokenFields: TemplateTokenField[]; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body machine-inspector-body"><div className="inspector-panel-heading"><div><h3>QR Content</h3><small>Value encoded into the QR Code</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>QR Value <InspectorHelp text="Use plain text, a URL, imported field tokens or Formula Field tokens. The resolved value is what gets encoded."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><MixedContentEditor label="QR content" value={selected.text} fields={dynamicTokenFields} previewValue={contentPreview} onChange={(text)=>onUpdate({text})}/><div className="machine-value-preview"><small>Encoded preview</small><strong>{contentPreview || 'Empty'}</strong></div></div></details></div></div>;
}

function BarcodeContentPanel({ selected, contentPreview, dynamicTokenFields, onUpdate }: { selected: BuilderElement; contentPreview: string; dynamicTokenFields: TemplateTokenField[]; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body machine-inspector-body"><div className="inspector-panel-heading"><div><h3>Barcode Content</h3><small>Code 39 value and binding</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>Barcode Value <InspectorHelp text="Current renderer supports Code 39. Lowercase characters are normalized to uppercase; unsupported characters are replaced safely."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Barcode type<select value={selected.barcodeFormat ?? 'code39'} disabled><option value="code39">Code 39</option></select></label><MixedContentEditor label="Barcode content" value={selected.text} fields={dynamicTokenFields} previewValue={contentPreview} onChange={(text)=>onUpdate({text})}/><div className="machine-value-preview"><small>Encoded preview</small><strong>{normalizeCode39(contentPreview || selected.text)}</strong></div></div></details></div></div>;
}

function SignatureContentPanel({ selected, bindingPreview, dynamicTokenFields, onUpdate }: { selected: BuilderElement; bindingPreview: string; dynamicTokenFields: TemplateTokenField[]; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body machine-inspector-body"><div className="inspector-panel-heading"><div><h3>Signature Content</h3><small>Manual or dynamic signature source</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>Signature Source <InspectorHelp text="Upload a transparent signature image, paste an image URL/data URL, or bind a field from the current record."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><ImageSourceEditor selected={selected} dynamicTokenFields={dynamicTokenFields} bindingPreview={bindingPreview} onUpdate={onUpdate}/></div></details><details className="inspector-accordion text-accordion"><summary><span>Display</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label className="guide-toggle"><input type="checkbox" checked={selected.signatureShowPlaceholder ?? true} onChange={(e)=>onUpdate({signatureShowPlaceholder:e.target.checked})}/><span><strong>Show empty placeholder</strong><small>Useful while designing before a signature is assigned</small></span></label></div></details></div></div>;
}

function QrFormattingPanel({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body machine-inspector-body"><div className="inspector-panel-heading"><div><h3>QR Formatting</h3><small>Colors, quiet zone and readability</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>Appearance</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Foreground<div className="color-control"><input type="color" value={selected.qrForeground ?? '#111827'} onChange={(e)=>onUpdate({qrForeground:e.target.value})}/><code>{(selected.qrForeground ?? '#111827').toUpperCase()}</code></div></label><label>Background<div className="color-control"><input type="color" value={selected.qrBackground ?? '#FFFFFF'} onChange={(e)=>onUpdate({qrBackground:e.target.value})}/><code>{(selected.qrBackground ?? '#FFFFFF').toUpperCase()}</code></div></label><div className="property-grid"><label>Quiet zone<input type="number" min="0" max="40" value={selected.qrQuietZone ?? 8} onChange={(e)=>onUpdate({qrQuietZone:Math.max(0,Number(e.target.value)||0)})}/></label><label>Error correction<select value={selected.qrErrorCorrection ?? 'M'} onChange={(e)=>onUpdate({qrErrorCorrection:e.target.value as NonNullable<BuilderElement['qrErrorCorrection']>})}><option value="L">L · Low</option><option value="M">M · Medium</option><option value="Q">Q · Quartile</option><option value="H">H · High</option></select></label></div><label className="guide-toggle"><input type="checkbox" checked={selected.qrShowValue ?? true} onChange={(e)=>onUpdate({qrShowValue:e.target.checked})}/><span><strong>Show value below QR</strong><small>Builder/exact preview helper text</small></span></label></div></details><details className="inspector-accordion text-accordion"><summary><span>Readability</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><p className="field-hint">For reliable scanning, keep strong foreground/background contrast and preserve a quiet zone around the code.</p></div></details></div></div>;
}

function BarcodeFormattingPanel({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body machine-inspector-body"><div className="inspector-panel-heading"><div><h3>Barcode Formatting</h3><small>Bars, label and spacing</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>Appearance</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Bar color<div className="color-control"><input type="color" value={selected.barcodeForeground ?? '#111827'} onChange={(e)=>onUpdate({barcodeForeground:e.target.value})}/><code>{(selected.barcodeForeground ?? '#111827').toUpperCase()}</code></div></label><label>Background<div className="color-control"><input type="color" value={selected.barcodeBackground ?? '#FFFFFF'} onChange={(e)=>onUpdate({barcodeBackground:e.target.value})}/><code>{(selected.barcodeBackground ?? '#FFFFFF').toUpperCase()}</code></div></label><div className="property-grid"><label>Bar height<input type="number" min="20" max="240" value={selected.barcodeBarHeight ?? 54} onChange={(e)=>onUpdate({barcodeBarHeight:Math.max(20,Number(e.target.value)||54)})}/></label><label>Quiet zone<input type="number" min="0" max="40" value={selected.barcodeQuietZone ?? 8} onChange={(e)=>onUpdate({barcodeQuietZone:Math.max(0,Number(e.target.value)||0)})}/></label></div></div></details><details className="inspector-accordion text-accordion" open><summary><span>Human-readable Text</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label className="guide-toggle"><input type="checkbox" checked={selected.barcodeShowText ?? true} onChange={(e)=>onUpdate({barcodeShowText:e.target.checked})}/><span><strong>Show barcode value</strong><small>Print the encoded value below the bars</small></span></label>{selected.barcodeShowText ?? true ? <label>Text size<input type="number" min="7" max="32" value={selected.barcodeTextSize ?? 11} onChange={(e)=>onUpdate({barcodeTextSize:Math.max(7,Number(e.target.value)||11)})}/></label> : null}</div></details><details className="inspector-accordion text-accordion"><summary><span>Readability</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><p className="field-hint">Keep the barcode wide enough for Code 39. Very long values in a narrow frame can become difficult to scan.</p></div></details></div></div>;
}

function TextPropertiesPanel({ selected, selectedBand, contentPreview, dynamicTokenFields, pageSettings, relativeElements, onUpdate, onPageSettings, assignRegion, onMoveFlow, onFlowRowAction, onArrange, onDuplicate, onDelete }: {
  selected: BuilderElement;
  selectedBand: 'header'|'footer'|null;
  contentPreview: string;
  dynamicTokenFields: TemplateTokenField[];
  pageSettings: PageSettings;
  relativeElements: BuilderElement[];
  onUpdate: (patch: Partial<BuilderElement>) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void;
  assignRegion: (region: PageRegion) => void;
  onMoveFlow: (direction: -1|1) => void;
  onFlowRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void;
  onArrange: (action: 'front'|'forward'|'backward'|'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isFlow = !selectedBand && (selected.layoutMode ?? 'floating') === 'flow';
  return <div className="inspector-body text-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Text</h3><small>Content, placement and document flow</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Content <InspectorHelp text="Write static text and insert imported fields or Formula Fields as tokens. The current document selector at the top controls preview values."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <MixedContentEditor label="Text content" value={selected.text} fields={dynamicTokenFields} previewValue={contentPreview} onChange={(text) => onUpdate({ text })}/>
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Position & Size <span className="section-unit">px</span></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <div className="property-grid compact-geometry-grid">
            <label>X<input type="number" disabled={isFlow} value={Math.round(selected.x)} onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}/></label>
            <label>Y<input type="number" disabled={isFlow} value={Math.round(selected.y)} onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}/></label>
            <label>Width<input type="number" min="20" disabled={isFlow && (selected.flowWidth ?? 'custom') === 'full'} value={Math.round(selected.width)} onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value) || 20) })}/></label>
            <label>Height<input type="number" min="4" value={Math.round(selected.height)} onChange={(e) => onUpdate({ height: Math.max(4, Number(e.target.value) || 4) })}/></label>
          </div>
          {isFlow ? <p className="field-hint">Flow owns X/Y automatically. Switch to Floating when exact X/Y placement is required.</p> : null}
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Layout <InspectorHelp text="Flow keeps document content moving automatically. Floating is for overlays, stamps and exact free placement."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          {selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <TextLayoutControls selected={selected} elements={relativeElements} pageSettings={pageSettings} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction}/>} 
        </div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Region <InspectorHelp text="Choose Body for normal document content. Header/Footer are global document masters and repeat according to the selected master policy."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <label>Place in<select value={selected.region ?? 'body'} onChange={(e) => assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>
          {selectedBand ? <label>{selectedBand === 'header' ? 'Header' : 'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e) => onPageSettings({ [selectedBand]: { ...pageSettings[selectedBand], enabled: true, repeat: e.target.value as PageRepeatMode } } as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label> : null}
        </div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Advanced</span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          {((selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') === 'floating') ? <section className="nested-inspector-card arrange-card"><div className="nested-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={() => onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={() => onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={() => onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={() => onArrange('back')}>Send Back</button></div></section> : <p className="field-hint">Layer controls appear here when Text is Floating or assigned to a master region.</p>}
          <div className="inspector-actions text-object-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div>
        </div>
      </details>
    </div>
  </div>;
}

function TextLayoutControls({ selected, elements, pageSettings, onUpdate, onMove, onRowAction, showRowManager = true }: { selected: BuilderElement; elements: BuilderElement[]; pageSettings: PageSettings; onUpdate: (patch: Partial<BuilderElement>) => void; onMove: (direction: -1|1) => void; onRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void; showRowManager?: boolean }) {
  const isFlow=(selected.layoutMode ?? 'floating')==='flow';
  const rowMembers=isFlow?elements.filter((item)=>(item.region??'body')==='body'&&(item.layoutMode??'floating')==='flow'&&flowRowKey(item)===flowRowKey(selected)):[];
  const widthPct=Math.min(100,Math.max(5,selected.flowWidthPercent??100));
  return <div className="text-layout-controls">
    <div className="field-label-row"><span>Placement</span></div>
    <div className="layout-mode-toggle segmented-control"><button type="button" className={isFlow?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({layoutMode:'flow',flowRowId:selected.flowRowId??newFlowRowId(),flowWidthPercent:selected.flowWidthPercent??100,flowGapBeforeMm:selected.flowGapBeforeMm??0,flowGapAfterMm:selected.flowGapAfterMm??4,flowColumnGapMm:selected.flowColumnGapMm??4,flowAlign:selected.flowAlign??'left',flowDistribution:selected.flowDistribution??'packed',flowWidth:'full'})}>Flow</button><button type="button" className={!isFlow?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({layoutMode:'floating'})}>Floating</button></div>
    {isFlow ? <>
      <div className="shared-row-summary"><div><strong>{rowMembers.length>1?'Shared row':'Single row'}</strong><small>{rowMembers.length>1?`${rowMembers.length} elements in this row`:'Automatic document flow'}</small></div>{rowMembers.length>1?<span className="shared-row-count">{rowMembers.length}</span>:null}</div>
      <div className="property-grid"><label>Width (%)<input type="number" min="5" max="100" step="1" value={widthPct} onChange={(e)=>onUpdate({flowWidthPercent:Math.min(100,Math.max(5,Number(e.target.value)||100)),flowWidth:'custom'})}/></label><label>Row gap after<input type="number" min="0" step="0.5" value={selected.flowGapAfterMm??4} onChange={(e)=>onUpdate({flowGapAfterMm:Math.max(0,Number(e.target.value)||0)})}/></label></div>
      <label>Distribution<select value={selected.flowDistribution??'packed'} onChange={(e)=>onUpdate({flowDistribution:e.target.value as BodyFlowDistribution})}><option value="packed">Packed</option><option value="space-between">Space Between</option><option value="space-around">Space Around</option><option value="space-evenly">Space Evenly</option></select></label>
      <div className="property-grid"><label>Gap before<input type="number" min="0" step="0.5" value={selected.flowGapBeforeMm??0} onChange={(e)=>onUpdate({flowGapBeforeMm:Math.max(0,Number(e.target.value)||0)})}/></label><label>Block gap<input type="number" min="0" step="0.5" disabled={(selected.flowDistribution??'packed')!=='packed'} value={selected.flowColumnGapMm??4} onChange={(e)=>onUpdate({flowColumnGapMm:Math.max(0,Number(e.target.value)||0)})}/></label></div>
      <label>Row alignment<select disabled={(selected.flowDistribution??'packed')!=='packed'} value={selected.flowAlign??'left'} onChange={(e)=>onUpdate({flowAlign:e.target.value as BodyFlowAlign})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      {showRowManager && <details className="row-manager"><summary>Manage row <ChevronDown size={14}/></summary><div className="row-manager-content"><div className="row-action-grid"><button type="button" className="secondary compact" onClick={()=>onRowAction('left')}>← Move in row</button><button type="button" className="secondary compact" onClick={()=>onRowAction('right')}>Move in row →</button><button type="button" className="secondary compact" onClick={()=>onMove(-1)}>↑ Move row</button><button type="button" className="secondary compact" onClick={()=>onMove(1)}>↓ Move row</button><button type="button" className="secondary compact" onClick={()=>onRowAction('joinPrevious')}>Join previous</button><button type="button" className="secondary compact" onClick={()=>onRowAction('joinNext')}>Join next</button></div><button type="button" className="secondary compact full-width" onClick={()=>onRowAction('newRow')}>+ New row</button><p className="field-hint">Use Join to place elements on the same horizontal row. Width controls each block's share of that row.</p></div></details>}
    </> : <>
      <p className="field-hint">Floating allows exact free placement for overlays, stamps and decorative text.</p>
      <BodyPositionControls selected={selected} settings={pageSettings} onUpdate={onUpdate}/>
      <RelativePlacementControls selected={selected} elements={elements} settings={pageSettings} onUpdate={onUpdate}/>
    </>}
  </div>;
}

function TextFormattingPanel({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  return <div className="inspector-body text-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Formatting</h3><small>Typography and text appearance</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open><summary><span>Typography</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content">
        <label>Font family<select value={selected.fontFamily??'Arial'} onChange={(e)=>onUpdate({fontFamily:e.target.value})}><option>Arial</option><option>Helvetica</option><option>Verdana</option><option>Tahoma</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option></select></label>
        <div className="property-grid"><label>Font size<input type="number" min="6" max="144" value={selected.fontSize} onChange={(e)=>onUpdate({fontSize:Math.max(6,Number(e.target.value)||12)})}/></label><label>Line height<input type="number" min="0.8" max="3" step="0.05" value={selected.lineHeight??1.25} onChange={(e)=>onUpdate({lineHeight:Math.min(3,Math.max(0.8,Number(e.target.value)||1.25))})}/></label></div>
        <div className="text-style-actions compact-style-actions"><button type="button" title="Bold" className={(selected.fontWeight??400)>=700?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({fontWeight:(selected.fontWeight??400)>=700?400:700})}><b>B</b></button><button type="button" title="Italic" className={selected.italic?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({italic:!selected.italic})}><i>I</i></button><button type="button" title="Underline" className={selected.underline?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({underline:!selected.underline})}><u>U</u></button></div>
      </div></details>
      <details className="inspector-accordion text-accordion" open><summary><span>Text Alignment <InspectorHelp text="Text alignment controls text inside this text box. It is separate from Layout → Row alignment, which positions the whole block in a shared row."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><div className="field-label-row"><span>Horizontal</span></div><div className="align-actions labeled-align-actions"><button title="Left" className={selected.textAlign==='left'?'active':''} onClick={()=>onUpdate({textAlign:'left'})}><AlignLeft size={16}/><span>Left</span></button><button title="Center" className={selected.textAlign==='center'?'active':''} onClick={()=>onUpdate({textAlign:'center'})}><AlignCenter size={16}/><span>Center</span></button><button title="Right" className={selected.textAlign==='right'?'active':''} onClick={()=>onUpdate({textAlign:'right'})}><AlignRight size={16}/><span>Right</span></button></div></div></details>
      <details className="inspector-accordion text-accordion" open><summary><span>Color & Spacing</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Text color<div className="color-control"><input type="color" value={selected.color} onChange={(e)=>onUpdate({color:e.target.value})}/><code>{selected.color}</code></div></label><label>Line height<input type="number" min="0.8" max="3" step="0.05" value={selected.lineHeight??1.25} onChange={(e)=>onUpdate({lineHeight:Math.min(3,Math.max(.8,Number(e.target.value)||1.25))})}/></label></div></details>
      <details className="inspector-accordion text-accordion"><summary><span>Effects & Auto Fit</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><p className="field-hint">Advanced text effects and auto-fit controls will stay grouped here as those renderer-safe options are enabled. Existing document formatting remains unchanged.</p></div></details>
    </div>
  </div>;
}



function ConditionsPanel({ selected, fields, onUpdate }: { selected: BuilderElement|null; fields: TemplateTokenField[]; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  if(!selected)return <div className="inspector-body"><h3>Conditions</h3><p>Select an element to configure visibility.</p></div>;
  const op=selected.conditionOperator??'equals';
  const needsValue=!['isEmpty','isNotEmpty'].includes(op);
  return <div className="inspector-body text-inspector-body"><div className="inspector-panel-heading"><div><h3>Conditions</h3><small>Control when this element is visible</small></div></div><div className="text-inspector-stack"><details className="inspector-accordion text-accordion" open><summary><span>Visibility <InspectorHelp text="The selected element can be shown only when a current-record field matches this rule. Formula Fields can also be used."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label className="guide-toggle"><input type="checkbox" checked={selected.conditionEnabled??false} onChange={(e)=>onUpdate({conditionEnabled:e.target.checked})}/><span><strong>Use visibility condition</strong><small>Hide this element when the rule is false</small></span></label>{selected.conditionEnabled?<><label>Field<select value={selected.conditionField??''} onChange={(e)=>onUpdate({conditionField:e.target.value||undefined})}><option value="">Select field…</option>{fields.map((field)=><option key={field.name} value={field.name}>{field.label||field.name}</option>)}</select></label><label>Operator<select value={op} onChange={(e)=>onUpdate({conditionOperator:e.target.value as NonNullable<BuilderElement['conditionOperator']>})}><option value="equals">Equals</option><option value="notEquals">Does not equal</option><option value="contains">Contains</option><option value="notContains">Does not contain</option><option value="isEmpty">Is empty</option><option value="isNotEmpty">Is not empty</option><option value="greaterThan">Greater than</option><option value="lessThan">Less than</option></select></label>{needsValue?<label>Value<input value={selected.conditionValue??''} onChange={(e)=>onUpdate({conditionValue:e.target.value})} placeholder="Comparison value"/></label>:null}<div className="condition-summary">Show when <strong>{selected.conditionField||'field'}</strong> {conditionOperatorLabel(op)} {needsValue?<strong>{selected.conditionValue||'value'}</strong>:null}</div></>:null}</div></details></div></div>;
}

function conditionOperatorLabel(op: NonNullable<BuilderElement['conditionOperator']>) {
  return ({equals:'equals',notEquals:'does not equal',contains:'contains',notContains:'does not contain',isEmpty:'is empty',isNotEmpty:'is not empty',greaterThan:'is greater than',lessThan:'is less than'} as const)[op];
}

function evaluateElementCondition(item: BuilderElement, rawValue: unknown) {
  const op=item.conditionOperator??'equals';
  const expected=item.conditionValue??'';
  const actual=displayValue(rawValue as NormalizedValue | undefined).trim();
  if(op==='isEmpty')return !actual;
  if(op==='isNotEmpty')return Boolean(actual);
  if(op==='contains')return actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if(op==='notContains')return !actual.toLocaleLowerCase().includes(expected.toLocaleLowerCase());
  if(op==='notEquals')return actual!==expected;
  if(op==='greaterThan'){const a=Number(actual),b=Number(expected);return Number.isFinite(a)&&Number.isFinite(b)&&a>b;}
  if(op==='lessThan'){const a=Number(actual),b=Number(expected);return Number.isFinite(a)&&Number.isFinite(b)&&a<b;}
  return actual===expected;
}

const SHAPE_LIBRARY: Array<{ value: NonNullable<BuilderElement['shapeKind']>; label: string; category: string }> = [
  { value:'rectangle', label:'Rectangle', category:'Basic' }, { value:'rounded', label:'Rounded Rectangle', category:'Basic' }, { value:'circle', label:'Circle', category:'Basic' }, { value:'ellipse', label:'Ellipse', category:'Basic' }, { value:'triangle', label:'Triangle', category:'Basic' }, { value:'diamond', label:'Diamond', category:'Basic' }, { value:'pentagon', label:'Pentagon', category:'Basic' }, { value:'hexagon', label:'Hexagon', category:'Basic' },
  { value:'arrowRight', label:'Right Arrow', category:'Arrows' }, { value:'arrowLeft', label:'Left Arrow', category:'Arrows' }, { value:'arrowUp', label:'Up Arrow', category:'Arrows' }, { value:'arrowDown', label:'Down Arrow', category:'Arrows' }, { value:'arrowDouble', label:'Double Arrow', category:'Arrows' }, { value:'chevron', label:'Chevron', category:'Arrows' }, { value:'bentArrow', label:'Bent Arrow', category:'Arrows' },
  { value:'pill', label:'Pill Badge', category:'Badges & Labels' }, { value:'tag', label:'Tag', category:'Badges & Labels' }, { value:'priceTag', label:'Price Tag', category:'Badges & Labels' }, { value:'ticket', label:'Ticket', category:'Badges & Labels' }, { value:'badge', label:'Badge', category:'Badges & Labels' }, { value:'seal', label:'Certificate Seal', category:'Badges & Labels' },
  { value:'banner', label:'Banner', category:'Banners & Ribbons' }, { value:'ribbon', label:'Ribbon', category:'Banners & Ribbons' }, { value:'foldedRibbon', label:'Folded Ribbon', category:'Banners & Ribbons' }, { value:'flag', label:'Flag', category:'Banners & Ribbons' }, { value:'bookmark', label:'Bookmark', category:'Banners & Ribbons' },
  { value:'speech', label:'Speech Bubble', category:'Callouts' }, { value:'thought', label:'Thought Bubble', category:'Callouts' }, { value:'cloud', label:'Cloud', category:'Callouts' }, { value:'cloudCallout', label:'Cloud Callout', category:'Callouts' },
  { value:'star', label:'Star', category:'Symbols' }, { value:'heart', label:'Heart', category:'Symbols' }, { value:'check', label:'Check', category:'Symbols' }, { value:'cross', label:'Cross', category:'Symbols' }, { value:'plus', label:'Plus', category:'Symbols' },
  { value:'flowProcess', label:'Process', category:'Flowchart' }, { value:'flowDecision', label:'Decision', category:'Flowchart' }, { value:'flowDocument', label:'Document', category:'Flowchart' }, { value:'flowDatabase', label:'Database', category:'Flowchart' },
];

function ShapePropertiesPanel({ selected, selectedBand, pageSettings, relativeElements, onUpdate, onPageSettings, assignRegion, onMoveFlow, onFlowRowAction, onArrange, onDuplicate, onDelete }: {
  selected: BuilderElement;
  selectedBand: 'header'|'footer'|null;
  pageSettings: PageSettings;
  relativeElements: BuilderElement[];
  onUpdate: (patch: Partial<BuilderElement>) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void;
  assignRegion: (region: PageRegion) => void;
  onMoveFlow: (direction: -1|1) => void;
  onFlowRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void;
  onArrange: (action: 'front'|'forward'|'backward'|'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isFlow = !selectedBand && (selected.layoutMode ?? 'floating') === 'flow';
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [shapeSearch, setShapeSearch] = useState('');
  const [shapeCategory, setShapeCategory] = useState('All');
  const currentShape = SHAPE_LIBRARY.find((item)=>item.value===(selected.shapeKind??'rectangle')) ?? SHAPE_LIBRARY[0]!;
  const aspect = selected.height > 0 ? selected.width / selected.height : 1;
  const updateWidth = (width:number) => onUpdate(selected.shapeLockAspect ? { width, height:Math.max(20,width/aspect) } : { width });
  const updateHeight = (height:number) => onUpdate(selected.shapeLockAspect ? { height, width:Math.max(20,height*aspect) } : { height });
  const categories = ['All', ...Array.from(new Set(SHAPE_LIBRARY.map((item)=>item.category)))];
  const normalizedSearch=shapeSearch.trim().toLowerCase();
  const visibleShapes=SHAPE_LIBRARY.filter((item)=>(shapeCategory==='All'||item.category===shapeCategory)&&(!normalizedSearch||`${item.label} ${item.category}`.toLowerCase().includes(normalizedSearch)));
  return <div className="inspector-body text-inspector-body shape-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Shape</h3><small>Shape type, placement and layout</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Shape <InspectorHelp text="Choose from basic shapes, arrows, badges, ribbons, callouts, symbols and flowchart shapes. Existing text/media content is preserved when the preset changes."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <div className="shape-current-card"><div className="shape-mini-preview"><span style={shapeVisualStyle({ ...selected, width:64, height:40 } as BuilderElement)}/></div><div><strong>{currentShape.label}</strong><small>{currentShape.category}</small></div><button type="button" className="secondary compact" onClick={()=>setLibraryOpen(true)}>Change Shape</button></div>
          {libraryOpen ? <div className="shape-library-overlay" role="dialog" aria-modal="true"><div className="shape-library-modal"><div className="shape-library-head"><div><strong>Choose Shape</strong><small>Search and select a reusable shape preset</small></div><button type="button" className="secondary compact" onClick={()=>setLibraryOpen(false)}>Close</button></div><input className="shape-search" placeholder="Search shapes..." value={shapeSearch} onChange={(e)=>setShapeSearch(e.target.value)}/><div className="shape-category-tabs">{categories.map((category)=><button type="button" key={category} className={shapeCategory===category?'secondary compact active':'secondary compact'} onClick={()=>setShapeCategory(category)}>{category}</button>)}</div><div className="shape-library-grid">{visibleShapes.map((option)=><button type="button" key={option.value} className={(selected.shapeKind??'rectangle')===option.value?'shape-library-item active':'shape-library-item'} onClick={()=>{onUpdate({shapeKind:option.value});setLibraryOpen(false);}}><span className="shape-library-preview"><i style={shapeVisualStyle({ ...selected, shapeKind:option.value, width:70, height:44, shapeStrokeWidth:1 } as BuilderElement)}/></span><strong>{option.label}</strong><small>{option.category}</small></button>)}</div></div></div> : null}
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Position & Size <span className="section-unit">px</span> <InspectorHelp text="Lock aspect ratio keeps width and height proportional while resizing. Flow mode owns X/Y automatically."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <div className="property-grid compact-geometry-grid">
            <label>X<input type="number" disabled={isFlow} value={Math.round(selected.x)} onChange={(e)=>onUpdate({x:Number(e.target.value)||0})}/></label>
            <label>Y<input type="number" disabled={isFlow} value={Math.round(selected.y)} onChange={(e)=>onUpdate({y:Number(e.target.value)||0})}/></label>
            <label>Width<input type="number" min="20" disabled={isFlow&&(selected.flowWidth??'custom')==='full'} value={Math.round(selected.width)} onChange={(e)=>updateWidth(Math.max(20,Number(e.target.value)||20))}/></label>
            <label>Height<input type="number" min="20" value={Math.round(selected.height)} onChange={(e)=>updateHeight(Math.max(20,Number(e.target.value)||20))}/></label>
          </div>
          <label className="guide-toggle"><input type="checkbox" checked={selected.shapeLockAspect??false} onChange={(e)=>onUpdate({shapeLockAspect:e.target.checked})}/><span><strong>Lock aspect ratio</strong><small>Keep shape proportions while resizing</small></span></label>
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Layout <InspectorHelp text="Flow keeps the shape in automatic document flow. Floating is best for stamps, callouts, banners and overlays."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">{selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <TextLayoutControls selected={selected} elements={relativeElements} pageSettings={pageSettings} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction}/>}</div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Region <InspectorHelp text="Body is normal content. Header/Footer are global masters and repeat according to their master policy."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><label>Place in<select value={selected.region??'body'} onChange={(e)=>assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>{selectedBand?<label>{selectedBand==='header'?'Header':'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e)=>onPageSettings({[selectedBand]:{...pageSettings[selectedBand],enabled:true,repeat:e.target.value as PageRepeatMode}} as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label>:null}</div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Advanced</span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">{((selected.region??'body')!=='body'||(selected.layoutMode??'floating')==='floating')?<section className="nested-inspector-card arrange-card"><div className="nested-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={()=>onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={()=>onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={()=>onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={()=>onArrange('back')}>Send Back</button></div></section>:<p className="field-hint">Layer controls appear when Shape is Floating or in a master region.</p>}<div className="inspector-actions text-object-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></div>
      </details>
    </div>
  </div>;
}

function ShapeContentPanel({ selected, contentPreview, dynamicTokenFields, mediaBindingPreview, onUpdate }: {
  selected: BuilderElement;
  contentPreview: string;
  dynamicTokenFields: TemplateTokenField[];
  mediaBindingPreview: string;
  onUpdate: (patch: Partial<BuilderElement>) => void;
}) {
  const contentMode = selected.shapeContentMode ?? 'text';
  const hasMedia = contentMode === 'media' || contentMode === 'text-media';
  const hasText = contentMode === 'text' || contentMode === 'text-media';
  return <div className="inspector-body text-inspector-body shape-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Content</h3><small>Text, media and inner layout</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Content Type <InspectorHelp text="Use no content, text only, media only, or text and media together inside the same shape container."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><label>Content mode<select value={contentMode} onChange={(e)=>onUpdate({shapeContentMode:e.target.value as NonNullable<BuilderElement['shapeContentMode']>})}><option value="none">None</option><option value="text">Text</option><option value="media">Media</option><option value="text-media">Text + Media</option></select></label></div>
      </details>

      {hasText?<details className="inspector-accordion text-accordion" open><summary><span>Text Content <InspectorHelp text="Static text and imported/formula tokens can be combined. Current-record preview is resolved below the editor."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><MixedContentEditor label="Shape text" value={selected.text} fields={dynamicTokenFields} previewValue={contentPreview} onChange={(text)=>onUpdate({text})}/></div></details>:null}

      {hasMedia?<details className="inspector-accordion text-accordion" open><summary><span>Media Source <InspectorHelp text="Upload a local image, use an image URL/data URL, or bind a current-record field. Dynamic media binding takes priority during preview."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><ShapeMediaSourceEditor selected={selected} dynamicTokenFields={dynamicTokenFields} bindingPreview={mediaBindingPreview} onUpdate={onUpdate}/></div></details>:null}

      {(hasText||hasMedia)?<details className="inspector-accordion text-accordion" open><summary><span>Inner Layout <InspectorHelp text="Control media position, media proportion, inner gap and padding without changing the outer shape size."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content">
        {hasMedia?<><label>Media position<select value={selected.shapeMediaPosition??'left'} onChange={(e)=>{const position=e.target.value as NonNullable<BuilderElement['shapeMediaPosition']>;onUpdate(position==='background'?{shapeMediaPosition:position,shapeClipMedia:true,imageFit:'cover',imageObjectPosition:'center'}:{shapeMediaPosition:position});}}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="background">Background</option><option value="center">Center / icon</option></select></label><div className="property-grid"><label>Media size (%)<input type="number" min="12" max="80" value={selected.shapeMediaSizePercent??32} onChange={(e)=>onUpdate({shapeMediaSizePercent:Math.min(80,Math.max(12,Number(e.target.value)||32))})}/></label><label>Gap<input type="number" min="0" max="40" value={selected.shapeContentGap??8} onChange={(e)=>onUpdate({shapeContentGap:Math.max(0,Number(e.target.value)||0)})}/></label></div><label className="guide-toggle"><input type="checkbox" checked={selected.shapeClipMedia??true} onChange={(e)=>onUpdate({shapeClipMedia:e.target.checked})}/><span><strong>Clip media to shape</strong><small>Prevent media from drawing outside the shape boundary</small></span></label>{(selected.shapeMediaPosition??'left')==='background'?<label>Background media opacity (%)<input type="number" min="0" max="100" value={selected.shapeMediaOverlayOpacity??100} onChange={(e)=>onUpdate({shapeMediaOverlayOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label>:null}</>:null}
        <div className="property-grid"><label>Padding<input type="number" min="0" max="64" value={selected.shapePadding??12} onChange={(e)=>onUpdate({shapePadding:Math.max(0,Number(e.target.value)||0)})}/></label><label>Vertical align<select value={selected.shapeTextVerticalAlign??'middle'} onChange={(e)=>onUpdate({shapeTextVerticalAlign:e.target.value as NonNullable<BuilderElement['shapeTextVerticalAlign']>})}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label></div>
      </div></details>:null}
    </div>
  </div>;
}

function ShapeFormattingPanel({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const contentMode=selected.shapeContentMode??'text';
  const hasMedia=contentMode==='media'||contentMode==='text-media';
  const hasText=contentMode==='text'||contentMode==='text-media';
  const strokeStyle=selected.shapeStrokeStyle??'solid';
  const strokeWidth=selected.shapeStrokeWidth??1;
  const strokeColor=selected.shapeStrokeColor??'#9DB7F5';
  const fillType=selected.shapeFillType??'solid';
  return <div className="inspector-body text-inspector-body shape-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Formatting</h3><small>Fill, stroke, text, media and effects</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Fill <InspectorHelp text="Use solid, linear gradient, radial gradient or no fill. Gradients are non-destructive and remain editable after save/reload."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><label>Fill type<select value={fillType} onChange={(e)=>onUpdate({shapeFillType:e.target.value as NonNullable<BuilderElement['shapeFillType']>})}><option value="solid">Solid</option><option value="linear">Linear gradient</option><option value="radial">Radial gradient</option><option value="none">None</option></select></label>{fillType!=='none'?<><div className="property-grid"><label>Color 1<div className="color-control"><input type="color" value={selected.fill??'#EAF1FF'} onChange={(e)=>onUpdate({fill:e.target.value})}/><code>{(selected.fill??'#EAF1FF').toUpperCase()}</code></div></label>{fillType!=='solid'?<label>Color 2<div className="color-control"><input type="color" value={selected.shapeFillColor2??'#C7D7FE'} onChange={(e)=>onUpdate({shapeFillColor2:e.target.value})}/><code>{(selected.shapeFillColor2??'#C7D7FE').toUpperCase()}</code></div></label>:<label>Opacity (%)<input type="number" min="0" max="100" value={selected.shapeOpacity??100} onChange={(e)=>onUpdate({shapeOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label>}</div>{fillType!=='solid'?<div className="property-grid"><label>Angle (°)<input type="number" min="0" max="360" value={selected.shapeFillAngle??45} onChange={(e)=>onUpdate({shapeFillAngle:((Number(e.target.value)||0)%360+360)%360})}/></label><label>Opacity (%)<input type="number" min="0" max="100" value={selected.shapeOpacity??100} onChange={(e)=>onUpdate({shapeOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label></div>:null}</>:null}</div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Border / Stroke <InspectorHelp text="Inside keeps the stroke inside the shape, Center straddles the boundary, Outside expands visually beyond the boundary. Dashed/dotted strokes use centered rendering for fidelity."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><div className="property-grid"><label>Style<select value={strokeStyle} onChange={(e)=>onUpdate({shapeStrokeStyle:e.target.value as NonNullable<BuilderElement['shapeStrokeStyle']>})}><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><label>Width<input type="number" min="0" max="20" value={strokeWidth} onChange={(e)=>onUpdate({shapeStrokeWidth:Math.max(0,Number(e.target.value)||0)})}/></label></div><label>Stroke color<div className="color-control"><input type="color" value={strokeColor} onChange={(e)=>onUpdate({shapeStrokeColor:e.target.value})}/><code>{strokeColor.toUpperCase()}</code></div></label><label>Alignment<select value={selected.shapeStrokeAlignment??'center'} onChange={(e)=>onUpdate({shapeStrokeAlignment:e.target.value as NonNullable<BuilderElement['shapeStrokeAlignment']>})}><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select></label></div>
      </details>

      {['rectangle','rounded','flowProcess'].includes(selected.shapeKind??'rectangle')?<details className="inspector-accordion text-accordion"><summary><span>Corners</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Corner radius<input type="number" min="0" max="200" value={selected.shapeCornerRadius??14} onChange={(e)=>onUpdate({shapeCornerRadius:Math.max(0,Number(e.target.value)||0)})}/></label></div></details>:null}

      {hasText?<details className="inspector-accordion text-accordion" open><summary><span>Text Style</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label>Font family<select value={selected.fontFamily??'Arial'} onChange={(e)=>onUpdate({fontFamily:e.target.value})}><option>Arial</option><option>Helvetica</option><option>Verdana</option><option>Tahoma</option><option>Georgia</option><option>Times New Roman</option><option>Courier New</option></select></label><div className="property-grid"><label>Font size<input type="number" min="6" max="144" value={selected.fontSize} onChange={(e)=>onUpdate({fontSize:Math.max(6,Number(e.target.value)||12)})}/></label><label>Line height<input type="number" min="0.8" max="3" step="0.05" value={selected.lineHeight??1.25} onChange={(e)=>onUpdate({lineHeight:Math.min(3,Math.max(.8,Number(e.target.value)||1.25))})}/></label></div><div className="text-style-actions compact-style-actions"><button type="button" className={(selected.fontWeight??400)>=700?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({fontWeight:(selected.fontWeight??400)>=700?400:700})}><b>B</b></button><button type="button" className={selected.italic?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({italic:!selected.italic})}><i>I</i></button><button type="button" className={selected.underline?'secondary compact active':'secondary compact'} onClick={()=>onUpdate({underline:!selected.underline})}><u>U</u></button></div><label>Text color<div className="color-control"><input type="color" value={selected.color} onChange={(e)=>onUpdate({color:e.target.value})}/><code>{selected.color.toUpperCase()}</code></div></label><div className="align-actions labeled-align-actions"><button className={selected.textAlign==='left'?'active':''} onClick={()=>onUpdate({textAlign:'left'})}><AlignLeft size={16}/><span>Left</span></button><button className={selected.textAlign==='center'?'active':''} onClick={()=>onUpdate({textAlign:'center'})}><AlignCenter size={16}/><span>Center</span></button><button className={selected.textAlign==='right'?'active':''} onClick={()=>onUpdate({textAlign:'right'})}><AlignRight size={16}/><span>Right</span></button></div><div className="property-grid"><label>Vertical align<select value={selected.shapeTextVerticalAlign??'middle'} onChange={(e)=>onUpdate({shapeTextVerticalAlign:e.target.value as NonNullable<BuilderElement['shapeTextVerticalAlign']>})}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label><label>Padding<input type="number" min="0" max="64" value={selected.shapePadding??12} onChange={(e)=>onUpdate({shapePadding:Math.max(0,Number(e.target.value)||0)})}/></label></div></div></details>:null}

      {hasMedia?<details className="inspector-accordion text-accordion" open><summary><span>Media Style <InspectorHelp text="Placement controls where media sits inside the Shape. Background fills the complete Shape frame; Fit and focal Position control how the image is cropped inside that frame."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><button type="button" className="secondary compact full-width shape-fill-media-action" onClick={()=>onUpdate({shapeMediaPosition:'background',shapeClipMedia:true,imageFit:'cover',imageObjectPosition:'center'})}>Fill Shape with Media</button><p className="field-hint">Recommended for a rectangle/circle photo background: Background placement + Clip ON + Cover + Center.</p><label>Placement in shape<select value={selected.shapeMediaPosition??'left'} onChange={(e)=>{const position=e.target.value as NonNullable<BuilderElement['shapeMediaPosition']>;onUpdate(position==='background'?{shapeMediaPosition:position,shapeClipMedia:true,imageFit:'cover',imageObjectPosition:'center'}:{shapeMediaPosition:position});}}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="center">Center / icon</option><option value="background">Background — fill shape</option></select></label><label className="guide-toggle"><input type="checkbox" checked={selected.shapeClipMedia??true} onChange={(e)=>onUpdate({shapeClipMedia:e.target.checked})}/><span><strong>Clip media to shape</strong><small>Hide media outside the selected Shape boundary</small></span></label>{(selected.shapeMediaPosition??'left')==='background'?<label>Background media opacity (%)<input type="number" min="0" max="100" value={selected.shapeMediaOverlayOpacity??100} onChange={(e)=>onUpdate({shapeMediaOverlayOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label>:null}<div className="property-grid"><label>Fit<select value={selected.imageFit??'contain'} onChange={(e)=>onUpdate({imageFit:e.target.value as 'contain'|'cover'|'fill'})}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></label><label>Focal position<select value={selected.imageObjectPosition??'center'} onChange={(e)=>onUpdate({imageObjectPosition:e.target.value as NonNullable<BuilderElement['imageObjectPosition']>})}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label></div><div className="property-grid"><label>Opacity (%)<input type="number" min="0" max="100" value={selected.imageOpacity??100} onChange={(e)=>onUpdate({imageOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Radius<input type="number" min="0" max="200" value={selected.imageBorderRadius??0} onChange={(e)=>onUpdate({imageBorderRadius:Math.max(0,Number(e.target.value)||0)})}/></label></div><label>Media background<div className="color-control"><input type="color" value={selected.imageBackground??'#ffffff'} onChange={(e)=>onUpdate({imageBackground:e.target.value})}/><code>{(selected.imageBackground??'#FFFFFF').toUpperCase()}</code></div></label><div className="property-grid"><label>Brightness (%)<input type="number" min="0" max="300" value={selected.imageBrightness??100} onChange={(e)=>onUpdate({imageBrightness:Math.max(0,Number(e.target.value)||0)})}/></label><label>Contrast (%)<input type="number" min="0" max="300" value={selected.imageContrast??100} onChange={(e)=>onUpdate({imageContrast:Math.max(0,Number(e.target.value)||0)})}/></label></div><div className="property-grid"><label>Saturation (%)<input type="number" min="0" max="300" value={selected.imageSaturation??100} onChange={(e)=>onUpdate({imageSaturation:Math.max(0,Number(e.target.value)||0)})}/></label><label>Blur (px)<input type="number" min="0" max="30" step="0.5" value={selected.imageBlur??0} onChange={(e)=>onUpdate({imageBlur:Math.max(0,Number(e.target.value)||0)})}/></label></div><div className="property-grid"><label>Grayscale (%)<input type="number" min="0" max="100" value={selected.imageGrayscale??0} onChange={(e)=>onUpdate({imageGrayscale:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Sepia (%)<input type="number" min="0" max="100" value={selected.imageSepia??0} onChange={(e)=>onUpdate({imageSepia:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label></div><div className="property-grid"><label>Border style<select value={selected.imageBorderStyle??'none'} onChange={(e)=>onUpdate({imageBorderStyle:e.target.value as NonNullable<BuilderElement['imageBorderStyle']>})}><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><label>Border width<input type="number" min="0" max="20" value={selected.imageBorderWidth??0} onChange={(e)=>onUpdate({imageBorderWidth:Math.max(0,Number(e.target.value)||0)})}/></label></div><label>Border color<div className="color-control"><input type="color" value={selected.imageBorderColor??'#CBD5E1'} onChange={(e)=>onUpdate({imageBorderColor:e.target.value})}/><code>{(selected.imageBorderColor??'#CBD5E1').toUpperCase()}</code></div></label><label className="guide-toggle"><input type="checkbox" checked={selected.imageShadowEnabled??false} onChange={(e)=>onUpdate({imageShadowEnabled:e.target.checked})}/><span><strong>Media shadow</strong><small>Use standalone Image-style drop shadow</small></span></label>{selected.imageShadowEnabled?<><div className="property-grid"><label>X<input type="number" value={selected.imageShadowX??0} onChange={(e)=>onUpdate({imageShadowX:Number(e.target.value)||0})}/></label><label>Y<input type="number" value={selected.imageShadowY??3} onChange={(e)=>onUpdate({imageShadowY:Number(e.target.value)||0})}/></label><label>Blur<input type="number" min="0" value={selected.imageShadowBlur??8} onChange={(e)=>onUpdate({imageShadowBlur:Math.max(0,Number(e.target.value)||0)})}/></label><label>Spread<input type="number" value={selected.imageShadowSpread??0} onChange={(e)=>onUpdate({imageShadowSpread:Number(e.target.value)||0})}/></label></div><div className="property-grid"><label>Opacity (%)<input type="number" min="0" max="100" value={selected.imageShadowOpacity??25} onChange={(e)=>onUpdate({imageShadowOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Color<div className="color-control"><input type="color" value={selected.imageShadowColor??'#000000'} onChange={(e)=>onUpdate({imageShadowColor:e.target.value})}/></div></label></div></>:null}<button type="button" className="secondary compact full-width" onClick={()=>onUpdate({imageOpacity:100,imageBrightness:100,imageContrast:100,imageSaturation:100,imageGrayscale:0,imageSepia:0,imageBlur:0,imageShadowEnabled:false})}>Reset media appearance</button><div className="nested-inspector-card"><div className="nested-card-title">Background Removal</div><ImageBackgroundRemoval selected={selected} onUpdate={onUpdate}/></div></div></details>:null}

      <details className="inspector-accordion text-accordion"><summary><span>Shape Effects <InspectorHelp text="Shadow adds depth outside the shape; Glow adds a soft halo. Both are non-destructive."/></span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><label className="guide-toggle"><input type="checkbox" checked={selected.shapeShadowEnabled??false} onChange={(e)=>onUpdate({shapeShadowEnabled:e.target.checked})}/><span><strong>Drop shadow</strong><small>Shadow behind the complete shape</small></span></label>{selected.shapeShadowEnabled?<><div className="property-grid"><label>X<input type="number" value={selected.shapeShadowX??0} onChange={(e)=>onUpdate({shapeShadowX:Number(e.target.value)||0})}/></label><label>Y<input type="number" value={selected.shapeShadowY??4} onChange={(e)=>onUpdate({shapeShadowY:Number(e.target.value)||0})}/></label><label>Blur<input type="number" min="0" value={selected.shapeShadowBlur??10} onChange={(e)=>onUpdate({shapeShadowBlur:Math.max(0,Number(e.target.value)||0)})}/></label><label>Spread<input type="number" value={selected.shapeShadowSpread??0} onChange={(e)=>onUpdate({shapeShadowSpread:Number(e.target.value)||0})}/></label></div><div className="property-grid"><label>Opacity (%)<input type="number" min="0" max="100" value={selected.shapeShadowOpacity??28} onChange={(e)=>onUpdate({shapeShadowOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Color<div className="color-control"><input type="color" value={selected.shapeShadowColor??'#000000'} onChange={(e)=>onUpdate({shapeShadowColor:e.target.value})}/></div></label></div></>:null}<label className="guide-toggle"><input type="checkbox" checked={selected.shapeGlowEnabled??false} onChange={(e)=>onUpdate({shapeGlowEnabled:e.target.checked})}/><span><strong>Glow</strong><small>Soft outer halo</small></span></label>{selected.shapeGlowEnabled?<div className="property-grid"><label>Blur<input type="number" min="0" max="60" value={selected.shapeGlowBlur??12} onChange={(e)=>onUpdate({shapeGlowBlur:Math.max(0,Number(e.target.value)||0)})}/></label><label>Opacity (%)<input type="number" min="0" max="100" value={selected.shapeGlowOpacity??45} onChange={(e)=>onUpdate({shapeGlowOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Glow color<div className="color-control"><input type="color" value={selected.shapeGlowColor??'#60A5FA'} onChange={(e)=>onUpdate({shapeGlowColor:e.target.value})}/></div></label></div>:null}</div></details>
    </div>
  </div>;
}

function ImagePropertiesPanel({ selected, selectedBand, bindingPreview, dynamicTokenFields, pageSettings, relativeElements, onUpdate, onPageSettings, assignRegion, onMoveFlow, onFlowRowAction, onArrange, onDuplicate, onDelete }: {
  selected: BuilderElement;
  selectedBand: 'header'|'footer'|null;
  bindingPreview: string;
  dynamicTokenFields: TemplateTokenField[];
  pageSettings: PageSettings;
  relativeElements: BuilderElement[];
  onUpdate: (patch: Partial<BuilderElement>) => void;
  onPageSettings: (patch: Partial<PageSettings>) => void;
  assignRegion: (region: PageRegion) => void;
  onMoveFlow: (direction: -1|1) => void;
  onFlowRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void;
  onArrange: (action: 'front'|'forward'|'backward'|'back') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const isFlow = !selectedBand && (selected.layoutMode ?? 'floating') === 'flow';
  const aspect = selected.height > 0 ? selected.width / selected.height : 1;
  const updateWidth = (width:number) => onUpdate(selected.imageLockAspect ? { width, height: Math.max(20, width / aspect) } : { width });
  const updateHeight = (height:number) => onUpdate(selected.imageLockAspect ? { height, width: Math.max(20, height * aspect) } : { height });
  return <div className="inspector-body text-inspector-body image-inspector-body">
    <div className="inspector-panel-heading"><div><h3>{selected.type === 'signature' ? 'Signature' : 'Image'}</h3><small>Source, sizing, fit and placement</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Image Source <InspectorHelp text="Choose a local image, paste a URL/data URL, or bind the element to a dynamic image field from the current record."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><ImageSourceEditor selected={selected} dynamicTokenFields={dynamicTokenFields} bindingPreview={bindingPreview} onUpdate={onUpdate}/></div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Position & Size <span className="section-unit">px</span> <InspectorHelp text="Flow owns X/Y automatically. Lock aspect ratio keeps width and height proportional while resizing."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <div className="property-grid compact-geometry-grid">
            <label>X<input type="number" disabled={isFlow} value={Math.round(selected.x)} onChange={(e)=>onUpdate({x:Number(e.target.value)||0})}/></label>
            <label>Y<input type="number" disabled={isFlow} value={Math.round(selected.y)} onChange={(e)=>onUpdate({y:Number(e.target.value)||0})}/></label>
            <label>Width<input type="number" min="20" disabled={isFlow && (selected.flowWidth ?? 'custom') === 'full'} value={Math.round(selected.width)} onChange={(e)=>updateWidth(Math.max(20,Number(e.target.value)||20))}/></label>
            <label>Height<input type="number" min="20" value={Math.round(selected.height)} onChange={(e)=>updateHeight(Math.max(20,Number(e.target.value)||20))}/></label>
          </div>
          <label className="guide-toggle"><input type="checkbox" checked={selected.imageLockAspect ?? true} onChange={(e)=>onUpdate({imageLockAspect:e.target.checked})}/><span><strong>Lock aspect ratio</strong><small>Keep image proportions while resizing</small></span></label>
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Layout <InspectorHelp text="Flow keeps the image in automatic document flow. Floating enables exact placement and layer/overlap controls."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">{selectedBand ? <BandPositionControls selected={selected} region={selectedBand} settings={pageSettings} onUpdate={onUpdate}/> : <TextLayoutControls selected={selected} elements={relativeElements} pageSettings={pageSettings} onUpdate={onUpdate} onMove={onMoveFlow} onRowAction={onFlowRowAction} showRowManager={false}/>}</div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Fit & Crop <InspectorHelp text="Contain shows the full image, Cover fills the frame, Stretch fills the frame without preserving proportions. Position chooses which part remains visible in Cover mode."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <label>Fit mode<select value={selected.imageFit ?? 'contain'} onChange={(e)=>onUpdate({imageFit:e.target.value as 'contain'|'cover'|'fill'})}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></select></label>
          <label>Image position<select value={selected.imageObjectPosition ?? 'center'} onChange={(e)=>onUpdate({imageObjectPosition:e.target.value as NonNullable<BuilderElement['imageObjectPosition']>})}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label>
        </div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Region <InspectorHelp text="Choose Body for normal content. Header/Footer are global document masters and repeat according to the selected master policy."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><label>Place in<select value={selected.region ?? 'body'} onChange={(e)=>assignRegion(e.target.value as PageRegion)}><option value="body">Body / Content</option><option value="header">Header</option><option value="footer">Footer</option></select></label>{selectedBand ? <label>{selectedBand === 'header' ? 'Header' : 'Footer'} repeat<select value={pageSettings[selectedBand].repeat} onChange={(e)=>onPageSettings({[selectedBand]:{...pageSettings[selectedBand],enabled:true,repeat:e.target.value as PageRepeatMode}} as Partial<PageSettings>)}><option value="every">Every page</option><option value="first">First page only</option><option value="exceptFirst">Except first page</option></select></label> : null}</div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Advanced</span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          {((selected.region ?? 'body') !== 'body' || (selected.layoutMode ?? 'floating') === 'floating') ? <section className="nested-inspector-card arrange-card"><div className="nested-card-title">Layer / Overlap</div><div className="arrange-actions"><button type="button" className="secondary compact" onClick={()=>onArrange('front')}>Bring Front</button><button type="button" className="secondary compact" onClick={()=>onArrange('forward')}>Forward</button><button type="button" className="secondary compact" onClick={()=>onArrange('backward')}>Backward</button><button type="button" className="secondary compact" onClick={()=>onArrange('back')}>Send Back</button></div></section> : <p className="field-hint">Layer controls appear when the image is Floating or assigned to a master region.</p>}
          <div className="inspector-actions text-object-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div>
        </div>
      </details>
    </div>
  </div>;
}

function ImageFormattingPanel({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const borderStyle=selected.imageBorderStyle??'none';
  const borderWidth=selected.imageBorderWidth??0;
  const borderColor=selected.imageBorderColor??'#CBD5E1';
  return <div className="inspector-body text-inspector-body image-inspector-body">
    <div className="inspector-panel-heading"><div><h3>Formatting</h3><small>Image appearance, effects and background tools</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion text-accordion" open>
        <summary><span>Appearance <InspectorHelp text="Opacity affects the whole image frame. Brightness, contrast and saturation affect the image pixels only."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content">
          <div className="property-grid"><label>Opacity (%)<input type="number" min="0" max="100" value={selected.imageOpacity??100} onChange={(e)=>onUpdate({imageOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Background<div className="color-control"><input type="color" value={selected.imageBackground??'#ffffff'} onChange={(e)=>onUpdate({imageBackground:e.target.value})}/><code>{(selected.imageBackground??'#FFFFFF').toUpperCase()}</code></div></label></div>
          <div className="property-grid"><label>Brightness (%)<input type="number" min="0" max="300" value={selected.imageBrightness??100} onChange={(e)=>onUpdate({imageBrightness:Math.max(0,Number(e.target.value)||0)})}/></label><label>Contrast (%)<input type="number" min="0" max="300" value={selected.imageContrast??100} onChange={(e)=>onUpdate({imageContrast:Math.max(0,Number(e.target.value)||0)})}/></label></div>
          <label>Saturation (%)<input type="number" min="0" max="300" value={selected.imageSaturation??100} onChange={(e)=>onUpdate({imageSaturation:Math.max(0,Number(e.target.value)||0)})}/></label>
          <button type="button" className="secondary compact full-width" onClick={()=>onUpdate({imageOpacity:100,imageBrightness:100,imageContrast:100,imageSaturation:100,imageGrayscale:0,imageSepia:0,imageBlur:0})}>Reset appearance</button>
        </div>
      </details>

      <details className="inspector-accordion text-accordion" open>
        <summary><span>Border <InspectorHelp text="Frame border and corner radius apply around the image element without changing the source image."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><div className="property-grid"><label>Style<select value={borderStyle} onChange={(e)=>onUpdate({imageBorderStyle:e.target.value as NonNullable<BuilderElement['imageBorderStyle']>})}><option value="none">None</option><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label><label>Width<input type="number" min="0" max="20" value={borderWidth} onChange={(e)=>onUpdate({imageBorderWidth:Math.max(0,Number(e.target.value)||0)})}/></label></div><label>Border color<div className="color-control"><input type="color" value={borderColor} onChange={(e)=>onUpdate({imageBorderColor:e.target.value})}/><code>{borderColor.toUpperCase()}</code></div></label><label>Corner radius<input type="number" min="0" max="200" value={selected.imageBorderRadius??0} onChange={(e)=>onUpdate({imageBorderRadius:Math.max(0,Number(e.target.value)||0)})}/></label></div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Shadow <InspectorHelp text="Adds a non-destructive drop shadow behind the image frame."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><label className="guide-toggle"><input type="checkbox" checked={selected.imageShadowEnabled??false} onChange={(e)=>onUpdate({imageShadowEnabled:e.target.checked})}/><span><strong>Enable shadow</strong><small>Drop shadow behind image frame</small></span></label><div className="property-grid"><label>X offset<input type="number" value={selected.imageShadowX??0} onChange={(e)=>onUpdate({imageShadowX:Number(e.target.value)||0})}/></label><label>Y offset<input type="number" value={selected.imageShadowY??3} onChange={(e)=>onUpdate({imageShadowY:Number(e.target.value)||0})}/></label><label>Blur<input type="number" min="0" value={selected.imageShadowBlur??8} onChange={(e)=>onUpdate({imageShadowBlur:Math.max(0,Number(e.target.value)||0)})}/></label><label>Spread<input type="number" value={selected.imageShadowSpread??0} onChange={(e)=>onUpdate({imageShadowSpread:Number(e.target.value)||0})}/></label></div><div className="property-grid"><label>Opacity (%)<input type="number" min="0" max="100" value={selected.imageShadowOpacity??25} onChange={(e)=>onUpdate({imageShadowOpacity:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Color<div className="color-control"><input type="color" value={selected.imageShadowColor??'#000000'} onChange={(e)=>onUpdate({imageShadowColor:e.target.value})}/><code>{(selected.imageShadowColor??'#000000').toUpperCase()}</code></div></label></div></div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Image Effects <InspectorHelp text="Use grayscale, sepia and blur as non-destructive effects. These remain editable after save/reload."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><div className="property-grid"><label>Grayscale (%)<input type="number" min="0" max="100" value={selected.imageGrayscale??0} onChange={(e)=>onUpdate({imageGrayscale:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label><label>Sepia (%)<input type="number" min="0" max="100" value={selected.imageSepia??0} onChange={(e)=>onUpdate({imageSepia:Math.min(100,Math.max(0,Number(e.target.value)||0))})}/></label></div><label>Blur (px)<input type="number" min="0" max="30" step="0.5" value={selected.imageBlur??0} onChange={(e)=>onUpdate({imageBlur:Math.max(0,Number(e.target.value)||0)})}/></label></div>
      </details>

      <details className="inspector-accordion text-accordion">
        <summary><span>Background Removal <InspectorHelp text="Removes a border-connected background color using corner sampling. Tolerance controls color matching; softness/feather smooth the edge. The original source is preserved for Restore."/></span><ChevronDown size={15}/></summary>
        <div className="inspector-accordion-content"><ImageBackgroundRemoval selected={selected} onUpdate={onUpdate}/></div>
      </details>
    </div>
  </div>;
}

function ImageBackgroundRemoval({ selected, onUpdate }: { selected: BuilderElement; onUpdate: (patch: Partial<BuilderElement>) => void }) {
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const tolerance=selected.imageBgRemoveTolerance??28;
  const softness=selected.imageBgRemoveSoftness??12;
  const feather=selected.imageBgRemoveFeather??6;
  const fringe=selected.imageBgRemoveFringe??2;
  const noise=selected.imageBgRemoveNoise??2;

  const apply=async()=>{
    setBusy(true);setMessage('Processing background…');
    try{
      const blob=await resolveManualImageBlob(selected);
      if(!blob) throw new Error('Upload a local image or provide an image URL before removing the background.');
      const processed=await removeConnectedImageBackground(blob,{tolerance,softness,feather,fringe,noise});
      const file=new File([processed],`background-removed-${Date.now()}.png`,{type:'image/png'});
      const id=await saveImageAsset(file);
      onUpdate({
        imageOriginalAssetId:selected.imageOriginalAssetId??selected.imageAssetId,
        imageOriginalSource:selected.imageOriginalSource??selected.imageSource,
        imageAssetId:id,imageSource:undefined,
      });
      setMessage('Background removed. Original source preserved for Restore.');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to remove background.');}
    finally{setBusy(false);}
  };
  const restore=()=>{
    if(!selected.imageOriginalAssetId&&!selected.imageOriginalSource)return;
    onUpdate({imageAssetId:selected.imageOriginalAssetId,imageSource:selected.imageOriginalSource,imageOriginalAssetId:undefined,imageOriginalSource:undefined});
    setMessage('Original image restored.');
  };
  return <div className="background-removal-panel">
    <div className="property-grid"><label>Tolerance<input type="number" min="0" max="150" value={tolerance} onChange={(e)=>onUpdate({imageBgRemoveTolerance:Math.min(150,Math.max(0,Number(e.target.value)||0))})}/></label><label>Edge softness<input type="number" min="0" max="80" value={softness} onChange={(e)=>onUpdate({imageBgRemoveSoftness:Math.min(80,Math.max(0,Number(e.target.value)||0))})}/></label><label>Feather<input type="number" min="0" max="80" value={feather} onChange={(e)=>onUpdate({imageBgRemoveFeather:Math.min(80,Math.max(0,Number(e.target.value)||0))})}/></label><label>Fringe<input type="number" min="0" max="40" value={fringe} onChange={(e)=>onUpdate({imageBgRemoveFringe:Math.min(40,Math.max(0,Number(e.target.value)||0))})}/></label></div>
    <label>Noise cleanup<input type="number" min="0" max="50" value={noise} onChange={(e)=>onUpdate({imageBgRemoveNoise:Math.min(50,Math.max(0,Number(e.target.value)||0))})}/></label>
    <div className="image-action-row"><button type="button" className="secondary" disabled={busy} onClick={apply}>{busy?'Processing…':'Remove Background'}</button><button type="button" className="secondary" disabled={!selected.imageOriginalAssetId&&!selected.imageOriginalSource} onClick={restore}>Restore Original</button></div>
    <p className="field-hint">Best for white/off-white or flat connected backgrounds. The algorithm starts from image edges so internal light details are less likely to be removed.</p>
    {message?<div className="image-message">{message}</div>:null}
  </div>;
}

async function resolveManualImageBlob(selected:BuilderElement):Promise<Blob|null>{
  if(selected.imageAssetId){const blob=await loadImageAsset(selected.imageAssetId);if(blob)return blob;}
  const source=selected.imageSource?.trim();
  if(!source)return null;
  const response=await fetch(source);
  if(!response.ok)throw new Error(`Unable to load image (${response.status}).`);
  return response.blob();
}

async function removeConnectedImageBackground(blob:Blob,options:{tolerance:number;softness:number;feather:number;fringe:number;noise:number}):Promise<Blob>{
  const bitmap=await createImageBitmap(blob);
  try{
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas is unavailable.');
    ctx.drawImage(bitmap,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height);const data=image.data,w=canvas.width,h=canvas.height;
    const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    let br=0,bg=0,bb=0;for(const [x,y] of corners){const i=(y*w+x)*4;br+=data[i];bg+=data[i+1];bb+=data[i+2];}
    br/=4;bg/=4;bb/=4;
    const dist=(i:number)=>Math.sqrt((data[i]-br)**2+(data[i+1]-bg)**2+(data[i+2]-bb)**2);
    const outer=options.tolerance+options.softness+options.feather+options.fringe;
    const visited=new Uint8Array(w*h);const queue=new Int32Array(w*h);let head=0,tail=0;
    const push=(x:number,y:number)=>{if(x<0||x>=w||y<0||y>=h)return;const p=y*w+x;if(visited[p])return;const i=p*4;if(dist(i)>outer)return;visited[p]=1;queue[tail++]=p;};
    for(let x=0;x<w;x++){push(x,0);push(x,h-1);}for(let y=0;y<h;y++){push(0,y);push(w-1,y);}
    while(head<tail){const p=queue[head++],x=p%w,y=(p/w)|0;push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);}
    const transition=Math.max(1,options.softness+options.feather);
    for(let p=0;p<w*h;p++)if(visited[p]){const i=p*4,d=dist(i);let alpha=d<=options.tolerance?0:Math.min(1,(d-options.tolerance)/transition);if(alpha*100<options.noise)alpha=0;data[i+3]=Math.round(data[i+3]*alpha);}
    ctx.putImageData(image,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob((result)=>result?resolve(result):reject(new Error('Unable to encode transparent PNG.')),'image/png'));
  }finally{bitmap.close();}
}


function ShapeMediaSourceEditor({ selected, dynamicTokenFields, bindingPreview, onUpdate }: { selected: BuilderElement; dynamicTokenFields: TemplateTokenField[]; bindingPreview: string; onUpdate: (patch: Partial<BuilderElement>) => void }) {
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
    onUpdate({ imageAssetId: undefined, imageSource: undefined, shapeMediaBinding: undefined });
    setMessage('Media removed');
  }

  return <div className="image-properties shape-media-properties">
    <input ref={inputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={upload}/>
    <label>Dynamic media binding<select value={selected.shapeMediaBinding ?? ''} onChange={(e) => onUpdate({ shapeMediaBinding: e.target.value || undefined })}><option value="">No media binding</option>{dynamicTokenFields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}</option>)}</select></label>
    {selected.shapeMediaBinding ? <><div className="binding-preview">{'{{'}{selected.shapeMediaBinding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{bindingPreview || 'Empty / null'}</strong></div></> : null}
    <div className="image-action-row">
      <button className="secondary" type="button" onClick={() => inputRef.current?.click()}>{selected.imageAssetId || selected.imageSource ? 'Replace media' : 'Upload media'}</button>
      <button className="secondary" type="button" onClick={removeImage} disabled={!selected.imageAssetId && !selected.imageSource && !selected.shapeMediaBinding}>Remove</button>
    </div>
    <label>Image URL / data URL<input type="text" placeholder="https://... or data:image/..." value={selected.imageSource ?? ''} onChange={(e) => onUpdate({ imageSource: e.target.value || undefined, imageAssetId: e.target.value ? undefined : selected.imageAssetId })}/></label>
    <p className="image-help">Dynamic media binding overrides the manual image during preview when the bound field resolves to an image URL or data URL.</p>
    {message && <div className="image-message">{message}</div>}
  </div>;
}

function ImageSourceEditor({ selected, dynamicTokenFields, bindingPreview, onUpdate }: { selected: BuilderElement; dynamicTokenFields: TemplateTokenField[]; bindingPreview: string; onUpdate: (patch: Partial<BuilderElement>) => void }) {
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

  return <div className="image-properties enhanced-image-properties">
    <input ref={inputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={upload}/>
    <div className="image-action-row">
      <button className="secondary" type="button" onClick={() => inputRef.current?.click()}>{selected.imageAssetId || selected.imageSource ? 'Replace image' : 'Upload image'}</button>
      <button className="secondary" type="button" onClick={removeImage} disabled={!selected.imageAssetId && !selected.imageSource}>Remove</button>
    </div>
    <label>Image URL / data URL<input type="text" placeholder="https://... or data:image/..." value={selected.imageSource ?? ''} onChange={(e) => onUpdate({ imageSource: e.target.value || undefined, imageAssetId: e.target.value ? undefined : selected.imageAssetId })}/></label>
    <label>Dynamic binding<select value={selected.binding ?? ''} onChange={(e) => onUpdate({ binding: e.target.value || undefined })}><option value="">No dynamic binding</option>{dynamicTokenFields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name}</option>)}</select></label>
    {selected.binding ? <><div className="binding-preview">{'{{'}{selected.binding}{'}}'}</div><div className="binding-value"><small>Preview value</small><strong>{bindingPreview || 'Empty / null'}</strong></div></> : null}
    <p className="image-help">{selected.type === 'signature' ? 'Use a PNG/WebP with transparent background for the cleanest signature.' : 'Upload a local image or use an image URL. Dynamic binding overrides the manual image during preview.'}</p>
    {message && <div className="image-message">{message}</div>}
  </div>;
}

function MixedContentEditor({ label, value, fields, onChange, compact = false, previewValue }: { label: string; value: string; fields: TemplateTokenField[]; onChange: (value: string) => void; compact?: boolean; previewValue?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [field, setField] = useState(fields[0]?.name ?? '');
  useEffect(() => { if (field && fields.some((item) => item.name === field)) return; setField(fields[0]?.name ?? ''); }, [fields, field]);
  const insert = (token: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
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
    <div className="layout-mode-toggle"><button type="button" className={isFlow ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ layoutMode: 'flow', flowRowId: selected.flowRowId ?? newFlowRowId(), flowWidthPercent: selected.flowWidthPercent ?? 100, flowGapBeforeMm: selected.flowGapBeforeMm ?? 0, flowGapAfterMm: selected.flowGapAfterMm ?? 4, flowColumnGapMm: selected.flowColumnGapMm ?? 4, flowAlign: selected.flowAlign ?? 'left', flowDistribution: selected.flowDistribution ?? 'packed', flowWidth: 'full' })}>Flow Block</button><button type="button" className={!isFlow ? 'secondary compact active' : 'secondary compact'} onClick={() => onUpdate({ layoutMode: 'floating' })}>Floating</button></div>
    {isFlow ? <>
      <p className="table-cell-help"><strong>Simple document flow:</strong> Body starts at the usable top. Every new block gets a new row by default. Row height follows its tallest block; when Text/Table grows, every following row shifts automatically.</p>
      {rowMembers.length > 1 ? <div className="flow-row-status"><strong>Shared row</strong><span>{rowMembers.length} blocks · selected measures {Math.round(selected.height)}px · tallest reserves {Math.round(reservedRowHeight)}px</span></div> : <div className="flow-row-status"><strong>Measured height</strong><span>{Math.round(selected.height)}px</span></div>}
      <div className="property-grid"><label>Width (%)<input type="number" min="5" max="100" step="1" value={widthPct} onChange={(e) => onUpdate({ flowWidthPercent: Math.min(100, Math.max(5, Number(e.target.value) || 100)), flowWidth: 'custom' })}/></label><label>Row gap after (mm)<input type="number" min="0" step="0.5" value={selected.flowGapAfterMm ?? 4} onChange={(e) => onUpdate({ flowGapAfterMm: Math.max(0, Number(e.target.value) || 0) })}/></label></div>
      <label>Row distribution<select value={selected.flowDistribution ?? 'packed'} onChange={(e) => onUpdate({ flowDistribution: e.target.value as BodyFlowDistribution })}><option value="packed">Packed</option><option value="space-between">Space Between</option><option value="space-around">Space Around</option><option value="space-evenly">Space Evenly</option></select></label>
      <div className="property-grid"><label>Gap before (mm)<input type="number" min="0" step="0.5" value={selected.flowGapBeforeMm ?? 0} onChange={(e) => onUpdate({ flowGapBeforeMm: Math.max(0, Number(e.target.value) || 0) })}/></label><label>Block gap in row (mm)<input type="number" min="0" step="0.5" disabled={(selected.flowDistribution ?? 'packed') !== 'packed'} value={selected.flowColumnGapMm ?? 4} onChange={(e) => onUpdate({ flowColumnGapMm: Math.max(0, Number(e.target.value) || 0) })}/></label></div>
      <label>Row alignment<select disabled={(selected.flowDistribution ?? 'packed') !== 'packed'} value={selected.flowAlign ?? 'left'} onChange={(e) => onUpdate({ flowAlign: e.target.value as BodyFlowAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      {(selected.flowDistribution ?? 'packed') !== 'packed' ? <p className="table-cell-help"><strong>Distributed row:</strong> leftover usable width is automatic. Space Between pins the first block to the left edge and the last block to the right edge; no spacer block is required.</p> : null}
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onMove(-1)}>↑ {rowMembers.length > 1 ? 'Move Row Up' : 'Move Up'}</button><button type="button" className="secondary compact" onClick={() => onMove(1)}>↓ {rowMembers.length > 1 ? 'Move Row Down' : 'Move Down'}</button></div>
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onRowAction('joinPrevious')}>Join Previous Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('joinNext')}>Join Next Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('newRow')}>New Row</button></div>
      <div className="relative-placement-actions"><button type="button" className="secondary compact" onClick={() => onRowAction('left')}>← In Row</button><button type="button" className="secondary compact" onClick={() => onRowAction('right')}>In Row →</button></div>
      <p className="table-cell-help">Default width is 100%. Set 50% + 50%, 35% + 35%, etc. and use Join Previous/Next Row to place blocks on the same horizontal line. Use Space Between when the first block must touch the left edge and the last block must touch the right edge with automatic blank space in the middle. Move Up/Down moves the complete logical row together; use In Row ←/→ only to reorder blocks inside that row. Flow owns X/Y; use Floating only for intentional overlays.</p>
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


function GlobalBandEditor({ region, settings, onPageSettings, onSetInsertRegion, onBack }: { region: 'header'|'footer'; settings: PageSettings; onPageSettings: (patch: Partial<PageSettings>) => void; onSetInsertRegion: (region: PageRegion) => void; onBack: () => void }) {
  const band = settings[region];
  const label = region === 'header' ? 'Header' : 'Footer';
  const patchBand = (patch: Partial<typeof band>) => onPageSettings({ [region]: { ...band, ...patch } } as Partial<PageSettings>);
  return <div className="inspector-body global-band-editor">
    <button type="button" className="inspector-back" onClick={onBack}><ArrowLeft size={14}/>Page settings</button>
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


function TableElementProperties({ selected, elements, pageSettings, sources, activeSourceId, formulaFields, onUpdate, onMove, onRowAction, onEditConfiguration, onDuplicate, onDelete }: { selected: BuilderElement; elements: BuilderElement[]; pageSettings: PageSettings; sources: BuilderDataState['sources']; activeSourceId?: string; formulaFields: TemplateTokenField[]; onUpdate: (patch: Partial<BuilderElement>) => void; onMove: (direction: -1|1) => void; onRowAction: (action: 'newRow'|'joinPrevious'|'joinNext'|'left'|'right') => void; onEditConfiguration: () => void; onDuplicate: () => void; onDelete: () => void }) {
  if (!selected.table) return null;
  const isFlow = (selected.layoutMode ?? 'floating') === 'flow';
  return <div className="inspector-body table-ux3-panel">
    <div className="inspector-panel-heading"><div><h3>Table</h3><small>Structure, data source and pagination</small></div></div>
    <div className="text-inspector-stack">
      <details className="inspector-accordion table-ux3-accordion" open><summary><span>Position &amp; Size</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><div className="property-grid"><label>X<input type="number" disabled={isFlow} value={Math.round(selected.x)} onChange={(e)=>onUpdate({x:Number(e.target.value)||0})}/></label><label>Y<input type="number" disabled={isFlow} value={Math.round(selected.y)} onChange={(e)=>onUpdate({y:Number(e.target.value)||0})}/></label><label>Width<input type="number" min="20" disabled={isFlow && (selected.flowWidth ?? 'full')==='full'} value={Math.round(selected.width)} onChange={(e)=>onUpdate({width:Math.max(20,Number(e.target.value)||20)})}/></label><label>Height<input type="text" disabled value={`Auto · ${Math.round(selected.height)}px`}/></label></div></div></details>
      <details className="inspector-accordion table-ux3-accordion" open><summary><span>Layout</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><TextLayoutControls selected={selected} elements={elements} pageSettings={pageSettings} onUpdate={onUpdate} onMove={onMove} onRowAction={onRowAction} showRowManager={false}/></div></details>
      <details className="inspector-accordion table-ux3-accordion"><summary><span>Region</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><div className="compact-info-row"><span>Place in</span><strong>Body / Content</strong></div><p className="field-hint">Tables remain in the document body so pagination respects header, footer and content bounds.</p></div></details>
      <TableProperties table={selected.table} view="properties" sources={sources} activeSourceId={activeSourceId} formulaFields={formulaFields} onUpdate={(table)=>onUpdate({table})} onEditConfiguration={onEditConfiguration}/>
      <details className="inspector-accordion table-ux3-accordion"><summary><span>Advanced</span><ChevronDown size={15}/></summary><div className="inspector-accordion-content"><div className="inspector-actions"><button className="secondary" onClick={onDuplicate}><Copy size={15}/>Duplicate</button><button className="danger" onClick={onDelete}><Trash2 size={15}/>Delete</button></div></div></details>
    </div>
  </div>;
}

function TableProperties({ table, view = 'properties', sources, activeSourceId, formulaFields, onUpdate, onEditConfiguration }: { table: TableDefinition; view?: 'properties'|'columns'|'rows'|'formatting'; sources: BuilderDataState['sources']; activeSourceId?: string; formulaFields: TemplateTokenField[]; onUpdate: (table: TableDefinition) => void; onEditConfiguration: () => void }) {
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
  return <div className={`table-properties table-view-${view}`}>
    <div className="table-summary table-scope-properties"><strong>{table.name}</strong><small>{table.mode === 'dynamic' ? `${table.binding?.grouping ? `Grouped Summary • ${table.binding.grouping.groupBy.join(' + ')}` : 'Dynamic'} • ${table.binding?.repeatSource || 'items'}` : `Custom • ${table.rows.length} rows × ${table.columns.length} cols`}</small></div>
    <label className="table-scope-properties">Table name<input value={table.name} onChange={(e) => onUpdate({ ...table, name: e.target.value })}/></label>
    <section className="table-inspector-card table-border-card table-scope-formatting">
      <div className="table-inspector-card-head"><span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▦</span><span>Table Border</span></span><small className="table-inspector-badge">Style</small></div>
      <div className="property-grid">
        <label>Style<select value={table.borderStyle ?? 'solid'} onChange={(e) => onUpdate({ ...table, borderStyle: e.target.value as 'solid'|'dashed'|'dotted'|'double'|'none' })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option><option value="none">None</option></select></label>
        <label>Width<input type="number" min="0" max="10" step="0.5" disabled={(table.borderStyle ?? 'solid') === 'none'} value={table.borderWidth} onChange={(e) => onUpdate({ ...table, borderWidth: Math.max(0, Number(e.target.value) || 0) })}/></label>
      </div>
      <label>Color<input type="color" disabled={(table.borderStyle ?? 'solid') === 'none'} value={table.borderColor} onChange={(e) => onUpdate({ ...table, borderColor: e.target.value })}/></label>
      <div className="table-border-preview" style={{ borderWidth: (table.borderStyle ?? 'solid') === 'none' ? 0 : Math.max(1, table.borderWidth), borderStyle: table.borderStyle ?? 'solid', borderColor: table.borderColor }}><span>Border preview</span></div>
    </section>
    {groupedSummary && <button type="button" className="secondary table-edit-configuration table-scope-properties" onClick={onEditConfiguration}>Edit Grouped Summary Configuration</button>}
    {view === 'properties' && table.mode === 'dynamic' && (() => {
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
          <label>Document ID<select value={parentKeys[0] ?? ''} onChange={(e) => updateParentKey(0, e.target.value)}><option value="">Select parent field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
          {parentKeys.slice(1).map((key, i) => <label key={`parent-extra-${i}`}>Parent key {i + 2}<select value={key} onChange={(e) => updateParentKey(i + 1, e.target.value)}><option value="">Select field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>)}
          <button type="button" className="secondary compact" onClick={() => onUpdate({ ...table, binding: { ...table.binding!, parentKeys: [...parentKeys, ''] } })}>+ Additional document key</button>
          {!groupedSummary && <><label>Row ID<select value={rowKeys[0] ?? ''} onChange={(e) => updateRowKey(0, e.target.value)}><option value="">Index fallback</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>
          {rowKeys.slice(1).map((key, i) => <label key={`row-extra-${i}`}>Row key {i + 2}<select value={key} onChange={(e) => updateRowKey(i + 1, e.target.value)}><option value="">Select field</option>{selectedSource.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}</select></label>)}
          <button type="button" className="secondary compact" onClick={() => onUpdate({ ...table, binding: { ...table.binding!, rowKeys: [...rowKeys, ''] } })}>+ Additional row key</button></>}
          <div className="table-schema-note"><span>{groupedSummary ? 'Grouped Summary' : 'Grouping'}</span><code>{groupedSummary ? `${(parentKeys.filter(Boolean).join(' + ') || '?')} → document; ${table.binding?.grouping?.groupBy.join(' + ')} → grouped rows` : `${(parentKeys.filter(Boolean).join(' + ') || recommendedParentKey(selectedSource.fields) || '?')} → rows; ${(rowKeys.filter(Boolean).join(' + ') || recommendedRowKey(selectedSource.fields) || 'index')} → row identity`}</code></div>
        </div>;
      })()}
      <section className="table-inspector-card pagination-card">
        <div className="table-inspector-card-head"><span className="table-inspector-heading"><span className="table-inspector-icon">↧</span><span>Pagination</span></span><small className="table-inspector-badge">DB-4.4</small></div>
        <label className="check-row"><input type="checkbox" checked={table.pagination.enabled !== false} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, enabled: e.target.checked } })}/>Automatic overflow</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.repeatHeader} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, repeatHeader: e.target.checked } })}/>Repeat header</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.keepRowsTogether} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, keepRowsTogether: e.target.checked } })}/>Keep row together</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.keepSummaryTogether !== false} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, keepSummaryTogether: e.target.checked } })}/>Keep summary block together</label>
        <label className="check-row"><input type="checkbox" checked={table.pagination.allowRowSplit} onChange={(e) => onUpdate({ ...table, pagination: { ...table.pagination, allowRowSplit: e.target.checked } })}/>Allow oversized row split</label>
        <div className="table-cell-help">Overflow is calculated from the table's Y position to the page bottom margin. Summary rows move to the final continuation page when needed.</div>
      </section>
      {!groupedSummary && <button className="secondary table-add-summary table-scope-rows" onClick={() => onUpdate(addCustomSummaryRow(table))}>+ Add custom total / summary row</button>}
      </>;
    })()}
    <div className="table-schema-note table-scope-properties"><span>Table ID</span><code>{table.id}</code></div>
    {view === 'rows' && <TableRowsOverview table={table} onUpdate={onUpdate}/>} 
    {cellLocation && <div className="table-structure-editor">
      <section className="table-inspector-card table-row-structure">
        <div className="table-inspector-card-head">
          <span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">☷</span><span>Row</span></span>
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

      {selectedColumn && <section className="table-inspector-card table-column-structure">
        <div className="table-inspector-card-head">
          <span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▥</span><span>Column</span></span>
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
          <div className="section-title"><span>Value &amp; Format</span><small>Column default</small></div>
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
    {cell ? <div className="table-cell-editor table-selected-cell-editor">
      <div className="table-inspector-card-head selected-cell-head"><span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▣</span><span>Selected Cell</span></span><small className="table-inspector-badge">{cell.type}</small></div>
      <div className="selected-cell-context ux4-cell-context"><strong>{selectedColumn?.label || 'Selected cell'}</strong><small>{cellLocation?.row.kind || 'cell'} row · shared by Columns and Rows workspaces</small></div>
      <div className="cell-editor-section-label">Cell Properties</div>
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
          <div className="section-title"><span>Cell Override</span><small>Advanced</small></div>
          <label>Data type<select value={cell.dataType ?? selectedColumn?.dataType ?? 'text'} onChange={(e) => patchCell({ dataType: e.target.value as TableDataType })}>{TABLE_DATA_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <TableDataFormatEditor dataType={cell.dataType ?? selectedColumn?.dataType ?? 'text'} value={cell.format ?? selectedColumn?.format ?? {}} onChange={(format) => patchCell({ format })}/>
        </div>
      </> : cell.type === 'image' ? <TableCellImageProperties cell={cell} source={bindingSource} formulaFields={formulaFields} onPatch={patchCell}/> : <>
        <MixedContentEditor label={cell.type === 'qr' ? 'Custom QR value' : 'Custom barcode value'} value={cell.content} fields={tableContentFields} compact onChange={(content) => patchCell({ content })}/>
        <TableCellBindingPicker source={bindingSource} formulaFields={formulaFields} value={cell.binding} onChange={(binding) => patchCell({ binding })}/>
        <p className="table-cell-help">Field binding overrides the custom value during preview/generation.</p>
      </>}
      <div className="cell-editor-section-label">Cell Layout</div>
      <div className="property-grid"><label>Row span<input type="number" min="1" max="50" value={cell.rowSpan} onChange={(e) => patchCell({ rowSpan: Math.max(1, Number(e.target.value) || 1) })}/></label><label>Col span<input type="number" min="1" max={Math.max(1, table.columns.length)} value={cell.colSpan} onChange={(e) => patchCell({ colSpan: Math.max(1, Math.min(table.columns.length, Number(e.target.value) || 1)) })}/></label></div>
      <div className="cell-editor-section-label">Cell Style</div>
      <div className="property-grid"><label>Padding<input type="number" min="0" max="40" value={cell.style.padding} onChange={(e) => patchCell({ style: { ...cell.style, padding: Math.max(0, Number(e.target.value) || 0) } })}/></label><label>Font size<input type="number" min="8" max="72" value={cell.style.fontSize} onChange={(e) => patchCell({ style: { ...cell.style, fontSize: Math.max(8, Number(e.target.value) || 11) } })}/></label></div>
      <label>Alignment<select value={cell.style.align} onChange={(e) => patchCell({ style: { ...cell.style, align: e.target.value as 'left'|'center'|'right' } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Background<input type="color" value={cell.style.background} onChange={(e) => patchCell({ style: { ...cell.style, background: e.target.value } })}/></label>
    </div> : <p className="table-cell-hint">Click a table cell on the canvas to edit its content, binding, type, row span and column span.</p>}
    {view === 'formatting' && cell && <section className="table-inspector-card table-cell-formatting-card">
      <div className="table-inspector-card-head selected-cell-head"><span className="table-inspector-heading"><span className="table-inspector-icon" aria-hidden="true">▣</span><span>Selected Cell Style</span></span><small className="table-inspector-badge">{cellLocation?.row.kind ?? cell.type}</small></div>
      <div className="selected-cell-context"><strong>{selectedColumn?.label || 'Selected cell'}</strong><small>Local style override</small></div>
      <div className="property-grid"><label>Padding<input type="number" min="0" max="40" value={cell.style.padding} onChange={(e) => patchCell({ style: { ...cell.style, padding: Math.max(0, Number(e.target.value) || 0) } })}/></label><label>Font size<input type="number" min="8" max="72" value={cell.style.fontSize} onChange={(e) => patchCell({ style: { ...cell.style, fontSize: Math.max(8, Number(e.target.value) || 11) } })}/></label></div>
      <label>Alignment<select value={cell.style.align} onChange={(e) => patchCell({ style: { ...cell.style, align: e.target.value as 'left'|'center'|'right' } })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Background<input type="color" value={cell.style.background} onChange={(e) => patchCell({ style: { ...cell.style, background: e.target.value } })}/></label>
      <details className="table-tech-details"><summary>Data format override</summary><div className="table-format-override-body"><label>Data type<select value={cell.dataType ?? selectedColumn?.dataType ?? 'text'} onChange={(e) => patchCell({ dataType: e.target.value as TableDataType })}>{TABLE_DATA_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><TableDataFormatEditor dataType={cell.dataType ?? selectedColumn?.dataType ?? 'text'} value={cell.format ?? selectedColumn?.format ?? {}} onChange={(format) => patchCell({ format })}/></div></details>
    </section>}
    {view === 'formatting' && !cell && <p className="table-cell-hint">Select a table cell on the canvas to edit its local style. Table border settings remain available above.</p>}
  </div>;
}




function TableRowsOverview({ table, onUpdate }: { table: TableDefinition; onUpdate: (table: TableDefinition) => void }) {
  const rows = table.mode === 'dynamic' ? [...table.headerRows, ...table.bodyRows, ...table.customRows] : table.rows;
  const selectRow = (rowId: string) => {
    const row = rows.find((item) => item.id === rowId);
    const firstCell = row?.cells.find(Boolean);
    if (firstCell) onUpdate({ ...table, selectedCellId: firstCell.id });
  };
  return <section className="table-rows-overview">
    <div className="table-row-workspace-actions">
      {table.mode === 'custom' && <button type="button" className="secondary compact" onClick={() => {
        const anchor = findTableCell(table, table.selectedCellId) ?? rows[rows.length - 1]?.cells[0];
        if (anchor) onUpdate(addTableRow(table, anchor.id, 'below'));
      }}>+ Add Row</button>}
      {table.mode === 'dynamic' && !table.binding?.grouping && <button type="button" className="secondary compact" onClick={() => onUpdate(addCustomSummaryRow(table))}>+ Summary Row</button>}
    </div>
    <div className="table-row-list">
      {rows.map((row, index) => {
        const selected = row.cells.some((cell) => cell.id === table.selectedCellId);
        const label = row.kind === 'header' ? 'Header Row' : row.kind === 'body' ? 'Body Row Template' : 'Summary / Custom Row';
        const meta = row.kind === 'header' ? (row.repeatOnEveryPage ? 'Repeats on each page' : 'Header') : row.kind === 'body' ? (table.mode === 'dynamic' ? 'Data-driven' : 'Body row') : 'Custom / summary';
        return <button type="button" key={row.id} className={`table-row-list-item${selected ? ' active' : ''}`} onClick={() => selectRow(row.id)}><span><strong>{label}</strong><small>{meta}</small></span><em>{index + 1}</em></button>;
      })}
    </div>
  </section>;
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

function documentFormulaAggregateRows(source: NonNullable<ReturnType<typeof activeSource>>, record: ReturnType<typeof activeRecord>, elements: BuilderElement[]): NormalizedRecord[] {
  const rows = source.records;
  if (!record || typeof record !== 'object') return rows;
  const identityTable = elements.find((item) => {
    if (item.type !== 'table' || item.table?.mode !== 'dynamic' || item.table.binding?.sourceId !== source.id) return false;
    const parentKeys = item.table.binding.parentKeys?.filter(Boolean) ?? (item.table.binding.parentKey ? [item.table.binding.parentKey] : []);
    return parentKeys.length > 0;
  });
  const parentKeys = identityTable?.table?.binding?.parentKeys?.filter(Boolean)
    ?? (identityTable?.table?.binding?.parentKey ? [identityTable.table.binding.parentKey] : []);
  if (parentKeys.length === 0) return rows;
  const same = (left: NormalizedValue | undefined, right: NormalizedValue | undefined) => displayValue(left).trim() === displayValue(right).trim();
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
  const values = rows.map((row) => valueForField(row as NormalizedRecord, field)).filter((value) => value !== undefined && value !== null && value !== '');
  if (operation === 'COUNT') return values.length;
  const numeric = values.map(formulaAggregateNumericValue).filter((value): value is number => value != null);
  if (operation === 'SUM') return numeric.reduce((total, value) => total + value, 0);
  if (operation === 'AVG') return numeric.length ? numeric.reduce((total, value) => total + value, 0) / numeric.length : 0;
  if (operation === 'MIN') return numeric.length ? Math.min(...numeric) : 0;
  return numeric.length ? Math.max(...numeric) : 0;
}

function unwrapWholeFormulaFunction(expression: string, functionNames: string[]): { name: string; inner: string } | null {
  const trimmed = expression.trim();
  const open = trimmed.indexOf('(');
  if (open <= 0 || !trimmed.endsWith(')')) return null;
  const name = trimmed.slice(0, open).trim().toUpperCase();
  if (!functionNames.includes(name)) return null;
  let depth = 0;
  for (let index = open; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && index !== trimmed.length - 1) return null;
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  return { name, inner: trimmed.slice(open + 1, -1).trim() };
}

function evaluateDocumentFormulaExpression(expression: string | undefined, scalarContext: Record<string, unknown>, aggregateRows: Array<Record<string, unknown>>): string | number | null {
  if (!expression?.trim()) return null;

  // DB-4.6 Number to Words: keep conversion at the document-formula layer so the
  // result becomes a normal reusable Formula Field value and therefore works in
  // Text, tables, Header/Footer, QR, Barcode and every other binding location.
  const wordsCall = unwrapWholeFormulaFunction(expression, ['NUMBER_TO_WORDS', 'AMOUNT_IN_WORDS', 'INR_WORDS']);
  if (wordsCall) {
    const numeric = evaluateDocumentFormulaExpression(wordsCall.inner, scalarContext, aggregateRows);
    if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null;
    return amountToIndianWords(numeric);
  }

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

function FormulaFieldProperties({ selected, source, formulaElements, preview, onUpdate }: { selected: BuilderElement; source: ReturnType<typeof activeSource>; formulaElements: BuilderElement[]; preview: string | number | null; onUpdate: (patch: Partial<BuilderElement>) => void }) {
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
    <div className="formula-reference-actions"><button type="button" className="secondary compact" disabled={!selectedReferenceName} onClick={insertSelectedRef}>Insert field</button><button type="button" className="secondary compact" disabled={!selectedReferenceName} onClick={() => appendFormulaText(`NUMBER_TO_WORDS(${formulaFieldReference(selectedReferenceName)})`)}>Amount in words</button><div className="formula-aggregate-picker"><select value={aggregateFunction} onChange={(e) => setAggregateFunction(e.target.value as 'SUM'|'COUNT'|'AVG'|'MIN'|'MAX')}><option value="SUM">SUM</option><option value="COUNT">COUNT</option><option value="AVG">AVG</option><option value="MIN">MIN</option><option value="MAX">MAX</option></select><button type="button" className="secondary compact" disabled={!selectedSourceField} title={selectedFormulaField ? 'Aggregate functions use imported source fields, not Formula Fields.' : undefined} onClick={insertSelectedAggregate}>Insert aggregate</button></div></div>
    {selectedFormulaField ? <p className="table-cell-help">Formula Fields can be inserted as references. Aggregate functions operate on imported source fields, so choose an Imported Field to enable Insert aggregate.</p> : null}
    <div className="binding-value"><small>Preview</small><strong>{preview == null ? 'Enter a valid formula' : displayValue(preview)}</strong></div>
    <p className="table-cell-help"><b>Functions:</b> SUM, COUNT, AVG, MIN, MAX and NUMBER_TO_WORDS. Example: <code>NUMBER_TO_WORDS([GrandTotal])</code> or <code>NUMBER_TO_WORDS(SUM([Taxable]))</code>. Amount words use the Indian numbering system (Thousand/Lakh/Crore) with Rupees + Paise. Arithmetic +, −, ×, ÷ and parentheses can be mixed before conversion.</p>
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
    flowDistribution: element.flowDistribution ?? 'packed',
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
  const common = { id: crypto.randomUUID(), type, region: 'body' as PageRegion, layoutMode: 'flow' as BodyLayoutMode, flowRowId: newFlowRowId(), flowWidthPercent: 100, flowGapBeforeMm: 0, flowGapAfterMm: 4, flowColumnGapMm: 4, flowAlign: 'left' as BodyFlowAlign, flowDistribution: 'packed' as BodyFlowDistribution, flowWidth: 'full' as BodyFlowWidth, x: position, y: position, fontSize: 18, fontFamily: 'Arial', fontWeight: 400, italic: false, underline: false, lineHeight: 1.25, textAlign: 'left' as TextAlign, fill: '#eaf1ff', color: '#18212f' };
  switch (type) {
    case 'text': return { ...common, width: 260, height: 44, text: 'Double-click style text' };
    case 'image': return { ...common, width: 180, height: 130, text: '', imageFit: 'contain' };
    case 'table': return { ...common, width: 430, height: 150, text: 'Table' };
    case 'shape': return { ...common, width: 220, height: 110, text: 'Shape text', fill: '#EAF1FF', shapeKind: 'rounded', shapeContentMode: 'text', shapeMediaPosition: 'left', shapeMediaSizePercent: 32, shapeContentGap: 8, shapePadding: 12, shapeOpacity: 100, shapeLockAspect: false, shapeFillType: 'solid', shapeFillColor2: '#C7D7FE', shapeFillAngle: 45, shapeStrokeStyle: 'solid', shapeStrokeWidth: 1, shapeStrokeColor: '#9DB7F5', shapeStrokeAlignment: 'center', shapeCornerRadius: 14, shapeTextVerticalAlign: 'middle', shapeClipMedia: true, shapeMediaOverlayOpacity: 100, shapeShadowEnabled: false, shapeGlowEnabled: false };
    case 'qr': return { ...common, width: 130, height: 150, text: 'QR value', qrForeground: '#111827', qrBackground: '#FFFFFF', qrQuietZone: 8, qrErrorCorrection: 'M', qrShowValue: true };
    case 'barcode': return { ...common, width: 220, height: 100, text: '1234567890', barcodeFormat: 'code39', barcodeForeground: '#111827', barcodeBackground: '#FFFFFF', barcodeShowText: true, barcodeTextSize: 11, barcodeBarHeight: 54, barcodeQuietZone: 8 };
    case 'signature': return { ...common, width: 220, height: 90, text: '', imageFit: 'contain', imageLockAspect: true, signatureShowPlaceholder: true };
    case 'divider': return { ...common, width: 360, height: 12, text: '' };
    case 'formula': return { ...common, width: 220, height: 44, text: '', formulaName: `Formula${index + 1}`, formulaExpression: '' };
  }
}

function labelFor(type: ToolType) {
  return tools.find((tool) => tool.type === type)?.label ?? type;
}


function buildStarterElements(starter: NewTemplateRequest['starter'], settings: PageSettings): BuilderElement[] {
  if (starter !== 'invoice') return [];
  const bounds = contentBoundsPx(settings);
  const titleY = bounds.y;
  return [
    { id: crypto.randomUUID(), type: 'text', x: bounds.x, y: titleY, width: bounds.width, height: 42, text: 'INVOICE', fontSize: 24, fontFamily: 'Arial', fontWeight: 700, textAlign: 'center', fill: 'transparent', color: '#111827', region: 'body', layoutMode: 'floating' },
    { id: crypto.randomUUID(), type: 'text', x: bounds.x, y: titleY + 58, width: Math.max(160, bounds.width * .45), height: 28, text: 'Invoice No:', fontSize: 11, fontFamily: 'Arial', fontWeight: 600, textAlign: 'left', fill: 'transparent', color: '#111827', region: 'body', layoutMode: 'floating' },
    { id: crypto.randomUUID(), type: 'text', x: bounds.x + bounds.width * .55, y: titleY + 58, width: Math.max(160, bounds.width * .45), height: 28, text: 'Invoice Date:', fontSize: 11, fontFamily: 'Arial', fontWeight: 600, textAlign: 'right', fill: 'transparent', color: '#111827', region: 'body', layoutMode: 'floating' },
    { id: crypto.randomUUID(), type: 'divider', x: bounds.x, y: titleY + 96, width: bounds.width, height: 2, text: '', fontSize: 10, textAlign: 'left', fill: '#94a3b8', color: '#94a3b8', region: 'body', layoutMode: 'floating' },
    { id: crypto.randomUUID(), type: 'text', x: bounds.x, y: titleY + 112, width: bounds.width, height: 30, text: 'Bill To', fontSize: 12, fontFamily: 'Arial', fontWeight: 700, textAlign: 'left', fill: 'transparent', color: '#111827', region: 'body', layoutMode: 'floating' },
  ];
}
