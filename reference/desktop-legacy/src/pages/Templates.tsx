import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type {
  Alignment,
  BlockLayout,
  BoxBlock,
  BoxStyle,
  CellStyle,
  CustomTableBlock,
  CustomGridCellDefinition,
  DocumentGroup,
  DisplayFormatDefinition,
  DataViewDefinition,
  CalculatedFieldDefinition,
  FontFamily,
  FooterAggregationType,
  MappingDefinition,
  MappingProfile,
  PageSize,
  RowBlock,
  RowChildBlock,
  RowColumn,
  TableBlock,
  TableColumnKind,
  SummaryTableBlock,
  AggregateValueDefinition,
  SummaryRowDefinition,
  TemplateBlock,
  TemplateDefinition,
  TemplateRegionName,
  TextStyle,
  VerticalAlignment,
  VisibilityRule,
  VisibilityCondition,
  ConditionOperator,
} from '@document-tool/contracts';
import { OFFLINE_FONT_FAMILIES, PAGE_SIZE_OPTIONS, getPageDimensions } from '@document-tool/contracts';
import { LocalStorageTemplateRepository } from '@document-tool/persistence';
import { MappingGroupingService, TemplateApplicationService, makeId } from '@document-tool/core';
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Code2,
  Copy,
  FilePlus,
  Image as ImageIcon,
  Minus,
  Save,
  Space,
  Table2,
  Trash2,
  Type,
  FileSpreadsheet,
  RefreshCw,
  Download,
  FileText,
  Printer,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  Layers3,
  SlidersHorizontal,
  Database,
} from 'lucide-react';
import { groupRichTextBindings } from '../utils/richTextBindings';
import { CombinedPaginatedPrintableDocument, PaginatedPrintableDocument, TemplatePreview, type CombinedExactPrintDocument, type PreviewPagePlan } from '../components/template/TemplatePreview.tsx';
import { CombinedPdfError, CombinedPdfRenderer, PdfExportRenderer, type CombinedPdfPageNumbering, type CombinedPdfProgress } from '@document-tool/renderer-pdf';
import { ExportCancellationSource, ExportCancelledError, ExportOrchestrator, RendererRegistry, ZipBundler, type ExportProgress, type ExportRequest, type ExportedFile } from '@document-tool/renderer-sdk';
import { BrowserExactPageRasterizer, registerJpegRenderer, registerPngRenderer, estimateImageMemory } from '@document-tool/renderer-image';
import { clearImportWorkspace, getActiveImportWorkspaceId, getWorkspaceGroups, hydrateWorkspaceGroup, listImportWorkspaceMetadata, listImportWorkspaces, loadImportWorkspace, saveImportWorkspace, setActiveImportWorkspace, type ImportWorkspaceMetadata, type StoredImportWorkspace } from '../services/workspaceStore.ts';
import { retainAvailableGroupIds, selectDefaultCollectionPath } from '../utils/groupSelection.ts';
import { augmentFilterFieldsWithImportedSource, coerceFilterValue, operatorsForFilterType, type FilterBindingOption, type FilterFieldType } from '../utils/dataViewFilters.ts';
import { buildExportRequest, DEFAULT_EXPORT_UI_STATE, validateExportUi, visibleExportOptions, type ExportUiState } from '../utils/exportUi.ts';
import { deliverExportedFiles } from '../services/fileDelivery.ts';

const repo = new LocalStorageTemplateRepository(window.localStorage);
const service = new TemplateApplicationService(repo);
const groupingService = new MappingGroupingService();
const combinedPdfRenderer = new CombinedPdfRenderer();
const EMPTY_DOCUMENT_GROUPS: DocumentGroup[] = [];
const ALIGNMENTS: Alignment[] = ['LEFT', 'CENTER', 'RIGHT'];
const VERTICAL_ALIGNMENTS: VerticalAlignment[] = ['TOP', 'CENTER', 'BOTTOM'];
const EMPTY_GROUP: DocumentGroup = {
  id: 'designer-empty-preview',
  key: 'Preview',
  header: {},
  items: [],
  sourceItems: [],
  itemDetails: [],
  sourceRowIndexes: [],
  warnings: [],
  valid: true,
};

type Selection = { block: TemplateBlock | RowChildBlock; parentRow?: RowBlock; parentColumnId?: string } | null;
type BindingOption = FilterBindingOption;
type CollectionBinding = { path: string; label: string; fields: BindingOption[] };

export const Templates = ({ documentGroups = EMPTY_DOCUMENT_GROUPS }: { documentGroups?: DocumentGroup[] }) => {
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<TemplateDefinition | null>(null);
  const [region, setRegion] = useState<TemplateRegionName>('BODY');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(documentGroups[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);
  const [leftWorkspaceTab, setLeftWorkspaceTab] = useState<'ELEMENTS'|'DOCUMENT'|'DATA'>('ELEMENTS');
  const [fullPreview, setFullPreview] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fitPreview, setFitPreview] = useState(true);
  const [sourceMetadata, setSourceMetadata] = useState<ImportWorkspaceMetadata[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<StoredImportWorkspace | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [sourceLibraryMessage, setSourceLibraryMessage] = useState('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const [previewPagePlan, setPreviewPagePlan] = useState<PreviewPagePlan[]>([]);
  const [combinedSelectedIds, setCombinedSelectedIds] = useState<string[]>([]);
  const [combinedPageNumbering, setCombinedPageNumbering] = useState<CombinedPdfPageNumbering>('PER_DOCUMENT');
  const [combinedFileName, setCombinedFileName] = useState('Combined_Documents');
  const [combinedDrawerOpen, setCombinedDrawerOpen] = useState(false);
  const [combinedGroupSearch, setCombinedGroupSearch] = useState('');
  const [combinedGenerating, setCombinedGenerating] = useState(false);
  const [combinedProgress, setCombinedProgress] = useState<CombinedPdfProgress | null>(null);
  const [combinedExactPrintRequested, setCombinedExactPrintRequested] = useState(false);
  const [combinedExactDocuments, setCombinedExactDocuments] = useState<CombinedExactPrintDocument[]>([]);
  const [combinedExactReady, setCombinedExactReady] = useState<{ documentCount:number; pageCount:number } | null>(null);
  const [exportOpen,setExportOpen]=useState(false);
  const [exportState,setExportState]=useState<ExportUiState>(DEFAULT_EXPORT_UI_STATE);
  const [activePreviewPage,setActivePreviewPage]=useState(0);
  const [exportRunning,setExportRunning]=useState(false);
  const [exportProgress,setExportProgress]=useState<ExportProgress|null>(null);
  const [exportStatus,setExportStatus]=useState('');
  const [exportFiles,setExportFiles]=useState<Array<ExportedFile&{url:string}>>([]);
  const [rasterExportDocuments,setRasterExportDocuments]=useState<CombinedExactPrintDocument[]>([]);
  const exportCancelRef=useRef<ExportCancellationSource|null>(null);
  const pendingRasterRef=useRef<{request:ExportRequest;documents:CombinedExactPrintDocument[]}|null>(null);
  const workspaceImportRef=useRef<HTMLInputElement|null>(null);
  const [persistenceRecovery,setPersistenceRecovery]=useState<{reason:string;rawBackupAvailable:boolean}|null>(null);
  const rasterStartedRef=useRef(false);
  const combinedCancelRef = useRef(false);
  const handlePreviewPagePlan = useCallback((plan: PreviewPagePlan[]) => setPreviewPagePlan(plan), []);

  useEffect(()=>()=>{for(const file of exportFiles)URL.revokeObjectURL(file.url);},[exportFiles]);

  useEffect(() => {
    void load();
    void refreshSourceLibrary();
  }, []);


  const workspaceGroups = useMemo(() => getWorkspaceGroups(selectedWorkspace), [selectedWorkspace]);
  const activeGroups = useMemo(() => workspaceGroups.length ? workspaceGroups : documentGroups, [workspaceGroups, documentGroups]);
  const combinedFilteredGroups = useMemo(() => {
    const query = combinedGroupSearch.trim().toLowerCase();
    const filtered = query ? activeGroups.filter((group) => `${group.key} ${group.id}`.toLowerCase().includes(query)) : activeGroups;
    return { total:filtered.length, visible:filtered.slice(0, 300) };
  }, [activeGroups, combinedGroupSearch]);

  useEffect(() => {
    if (!activeGroups.length) {
      setSelectedGroupId('');
      return;
    }
    if (!activeGroups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(activeGroups[0]!.id);
  }, [activeGroups, selectedGroupId]);

  useEffect(() => {
    setCombinedSelectedIds((current) => retainAvailableGroupIds(current, activeGroups));
  }, [activeGroups]);

  const blocks = draft ? getBlocks(draft, region) : [];
  const selection: Selection = useMemo(() => findSelection(blocks, selectedBlockId), [blocks, selectedBlockId]);
  const selectedGroupBase = activeGroups.find((group) => group.id === selectedGroupId) ?? activeGroups[0] ?? EMPTY_GROUP;
  const selectedGroup = useMemo(() => hydrateWorkspaceGroup(selectedWorkspace, selectedGroupBase) ?? selectedGroupBase, [selectedWorkspace, selectedGroupBase]);
  const hasLiveData = activeGroups.length > 0;
  const previewTemplate = useMemo(() => draft ? hydrateAggregateBindings(draft, selectedWorkspace?.mappings ?? []) : null, [draft, selectedWorkspace]);
  const preview = useMemo(() => (previewTemplate ? service.buildPreview(previewTemplate, selectedGroup) : null), [previewTemplate, selectedGroup]);
  const discovered = useMemo(() => service.discoverFields(selectedGroup), [selectedGroup]);
  const fieldBindings = useMemo(() => {
    const base = buildFieldBindings(selectedWorkspace?.mappings ?? [], discovered.scalarFields);
    const calculated = (draft?.calculatedFields ?? []).map((field) => ({ value:`calc.${field.alias}`, label:`Calculated · ${field.name || field.alias}`, targetPath:`calc.${field.alias}` }));
    return dedupeBindings([...base, ...calculated]);
  }, [selectedWorkspace, discovered, draft?.calculatedFields]);
  const collectionBindings = useMemo(() => augmentCollectionsWithDataViews(buildCollectionBindings(selectedWorkspace?.mappings ?? [], discovered.collections, selectedWorkspace?.dataPreview?.schema.fields ?? []), draft?.dataViews ?? []), [selectedWorkspace, discovered, draft?.dataViews]);
  const savedTemplate = useMemo(() => templates.find((item) => item.id === draft?.id), [templates, draft?.id]);
  const isDirty = !!draft && (!savedTemplate || JSON.stringify(draft) !== JSON.stringify(savedTemplate));


  useEffect(() => {
    if (!printRequested || !preview?.model || !previewPagePlan.length) return;
    let disposed = false;
    let fallbackTimer = 0;
    const styleId = 'document-tool-dynamic-print-page';
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      document.getElementById(styleId)?.remove();
      setPrintRequested(false);
      window.removeEventListener('afterprint', cleanup);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
    const run = async () => {
      // Planned physical pages already exist. Give fonts/images one final paint frame,
      // then let the browser print those pages without recalculating document breaks.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (disposed) return;
      const dims = getPageDimensions(preview.model!.page ?? { size: 'A4', orientation: 'PORTRAIT' });
      document.getElementById(styleId)?.remove();
      const pageStyle = document.createElement('style');
      pageStyle.id = styleId;
      pageStyle.textContent = `@page { size: ${dims.widthMm}mm ${dims.heightMm}mm; margin: 0; }`;
      document.head.appendChild(pageStyle);
      window.addEventListener('afterprint', cleanup, { once: true });
      setMessage('Opening system print dialog • printing the same planned pages shown in Live Preview');
      window.print();
      fallbackTimer = window.setTimeout(cleanup, 60000);
    };
    void run();
    return cleanup;
  }, [previewPagePlan.length, printRequested, preview?.model]);

  function printExactPreview() {
    if (!preview?.model || printRequested) return;
    if (!previewPagePlan.length) {
      setMessage('Preview pagination is still preparing. Please try again in a moment.');
      return;
    }
    setPrintRequested(true);
  }

  function openExportDialog(){
    setExportState(current=>({...current,fileName:draft?.name||'Document',currentPageIndex:activePreviewPage}));
    setExportFiles([]);
    setExportProgress(null);
    setExportStatus('');
    setExportOpen(true);
  }
  function patchExport(patch:Partial<ExportUiState>){setExportState(current=>({...current,...patch}));}
  function exportDocumentIds(){return exportState.scope==='CURRENT'?[selectedGroupId||'designer-preview']:combinedSelectedIds;}
  function exportValidation(){const dims=getPageDimensions(preview?.model?.page??draft?.page??{size:'A4',orientation:'PORTRAIT'});return validateExportUi(exportState,{activeDocumentId:selectedGroupId||'designer-preview',selectedDocumentIds:combinedSelectedIds,pageCount:previewPagePlan.length,pageWidthMm:dims.widthMm,pageHeightMm:dims.heightMm});}
  async function beginGeneralExport(){
    if(!draft||!preview?.model||exportRunning)return;const errors=exportValidation();if(errors.length){setMessage(errors[0]!);return;}
    if(exportState.format==='PDF'){
      setExportOpen(false);
      if(exportState.scope==='SELECTED'){if(exportState.pdfMode==='EXACT')printCombinedExact();else await generateCombinedPdf();}
      else if(exportState.pdfMode==='EXACT')printExactPreview();else await generatePdf(exportState.fileName);
      return;
    }
    setExportStatus('Preparing physical document pages…');
    const canonicalDraft=hydrateAggregateBindings(draft,selectedWorkspace?.mappings??[]);const ids=exportDocumentIds();const documents:CombinedExactPrintDocument[]=[];
    try{for(const id of ids){const base=id==='designer-preview'?selectedGroup:activeGroups.find(group=>group.id===id);if(!base)throw new Error(`Document ${id} is unavailable.`);const hydrated=hydrateWorkspaceGroup(selectedWorkspace,base)??base;const rendered=service.buildPreview(canonicalDraft,hydrated);if(!rendered.model||rendered.errors.length)throw new Error(rendered.errors.map(error=>error.message).join('; ')||`Unable to resolve ${id}.`);documents.push({id,label:base.key||id,model:rendered.model});}}
    catch(error){const text=error instanceof Error?error.message:'Unable to prepare export documents.';setExportStatus(text);setMessage(text);return;}
    const request=buildExportRequest({...exportState,currentPageIndex:activePreviewPage},canonicalDraft.id,selectedGroupId||'designer-preview',combinedSelectedIds);pendingRasterRef.current={request,documents};rasterStartedRef.current=false;setRasterExportDocuments(documents);setExportRunning(true);setExportProgress({phase:'RESOLVING',currentDocument:0,totalDocuments:documents.length,pagesGenerated:0,percent:0});
  }
  const handleRasterPagesReady=useCallback(async()=>{
    const pending=pendingRasterRef.current;if(!pending||rasterStartedRef.current)return;rasterStartedRef.current=true;const cancellation=new ExportCancellationSource();exportCancelRef.current=cancellation;
    try{
      // Combined pagination reports its plan before React commits the planned
      // physical-page nodes. Wait for that commit before the rasterizer queries
      // the isolated export root; otherwise valid group IDs appear unavailable.
      await new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      cancellation.token.throwIfCancellationRequested();
      const committedIds=new Set(Array.from(document.querySelectorAll<HTMLElement>('.raster-export-root [data-document-id]')).map(node=>node.dataset.documentId).filter((id):id is string=>!!id));
      const missing=pending.documents.find(item=>!committedIds.has(item.id));
      if(missing)throw new Error(`Physical export pages for ${missing.label||missing.id} were not committed.`);
      const rasterizer=new BrowserExactPageRasterizer(async resolved=>{const roots=Array.from(document.querySelectorAll<HTMLElement>('.raster-export-root [data-document-id]'));const root=roots.find(node=>node.dataset.documentId===resolved.documentGroupId);if(!root)throw new Error(`Isolated export page root for ${resolved.documentGroupId} is unavailable.`);return Array.from(root.querySelectorAll<HTMLElement>('[data-document-export-page]'));},()=>pending.request.format==='PNG'&&((pending.request.options?.png as {backgroundMode?:string}|undefined)?.backgroundMode==='TRANSPARENT'));
      const registry=new RendererRegistry();registry.register('PDF',new PdfExportRenderer());registerPngRenderer(registry,rasterizer);registerJpegRenderer(registry,rasterizer);
      const byId=new Map(pending.documents.map(item=>[item.id,item]));const canonicalDraft=hydrateAggregateBindings(draft!,selectedWorkspace?.mappings??[]);
      const result=await new ExportOrchestrator({registry,resolveDocument:async(_templateId,documentGroupId)=>{const item=byId.get(documentGroupId);if(!item)throw new Error(`Document ${documentGroupId} is unavailable.`);return{documentGroupId,template:canonicalDraft,model:item.model,namingValues:{DocumentGroupKey:item.label||documentGroupId}};}}).export(pending.request,{cancellationToken:cancellation.token,onProgress:setExportProgress});
      const downloadable=result.files.length>1?[new ZipBundler().bundle(result.files,{fileName:pending.request.fileName||`${result.format}_Documents`})]:result.files;
      setExportStatus('Waiting for save location...');
      const delivered=await deliverExportedFiles(downloadable);
      if(delivered.status==='CANCELLED')throw new ExportCancelledError('Save cancelled.');
      if(delivered.status==='FAILED')throw new Error(`Generated successfully but could not be saved. ${delivered.error??''}`.trim());
      setExportFiles([]);setExportStatus(`Export completed - ${downloadable.length} file${downloadable.length===1?'':'s'} saved`);
      setMessage(`Export completed • ${result.format} • ${result.documentCount} documents • ${result.pageCount??0} pages • ${result.files.length} generated files${result.files.length>1?' • ZIP download':''} • ${(result.diagnostics.durationMs/1000).toFixed(1)} sec`);
    }catch(error){const text=error instanceof ExportCancelledError?'Export cancelled.':error instanceof Error?`Export failed: ${error.message}`:'Export failed.';setExportStatus(text);setMessage(text);}
    finally{setExportRunning(false);setRasterExportDocuments([]);pendingRasterRef.current=null;exportCancelRef.current=null;}
  },[draft,selectedWorkspace]);
  function cancelGeneralExport(){exportCancelRef.current?.cancel();setExportStatus('Cancellation requested…');setMessage('Cancellation requested.');}


  const handleCombinedExactReady = useCallback((summary:{ documentCount:number; pageCount:number }) => {
    setCombinedExactReady(summary);
  }, []);

  useEffect(() => {
    if (!combinedExactPrintRequested || !combinedExactReady || !combinedExactDocuments.length) return;
    let disposed = false;
    let fallbackTimer = 0;
    const styleId = 'document-tool-combined-exact-print-page';
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      document.getElementById(styleId)?.remove();
      window.removeEventListener('afterprint', cleanup);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      setCombinedExactPrintRequested(false);
      setCombinedExactReady(null);
      setCombinedExactDocuments([]);
    };
    const run = async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (disposed) return;
      const first = combinedExactDocuments[0]?.model.page ?? { size:'A4' as const, orientation:'PORTRAIT' as const };
      const dims = getPageDimensions(first);
      const pageStyle = document.createElement('style');
      pageStyle.id = styleId;
      pageStyle.textContent = `@page { size: ${dims.widthMm}mm ${dims.heightMm}mm; margin: 0; }`;
      document.getElementById(styleId)?.remove();
      document.head.appendChild(pageStyle);
      window.addEventListener('afterprint', cleanup, { once:true });
      setMessage(`Opening Exact Combined print dialog • ${combinedExactReady.documentCount} documents • ${combinedExactReady.pageCount} planned pages`);
      window.print();
      fallbackTimer = window.setTimeout(cleanup, 60000);
    };
    void run();
    return cleanup;
  }, [combinedExactDocuments, combinedExactPrintRequested, combinedExactReady]);

  function printCombinedExact() {
    if (!draft || combinedGenerating || combinedExactPrintRequested) return;
    const selected = new Set(combinedSelectedIds);
    const orderedGroups = activeGroups.filter((group) => selected.has(group.id));
    if (!orderedGroups.length) { setMessage('Select at least one document for Exact Combined Print.'); return; }
    const canonicalDraft = hydrateAggregateBindings(draft, selectedWorkspace?.mappings ?? []);
    const documents: CombinedExactPrintDocument[] = [];
    try {
      for (const baseGroup of orderedGroups) {
        const hydrated = hydrateWorkspaceGroup(selectedWorkspace, baseGroup) ?? baseGroup;
        const rendered = service.buildPreview(canonicalDraft, hydrated);
        if (!rendered.model || rendered.errors.length) {
          const reason = rendered.errors.map((error) => error.message).join('; ') || 'TemplateEngine returned no RenderModel.';
          throw new Error(`${baseGroup.key || baseGroup.id}: ${reason}`);
        }
        documents.push({ id:baseGroup.id, label:baseGroup.key || baseGroup.id, model:rendered.model });
      }
      const firstDims = getPageDimensions(documents[0]!.model.page ?? { size:'A4', orientation:'PORTRAIT' });
      const incompatible = documents.find((document) => {
        const dims = getPageDimensions(document.model.page ?? { size:'A4', orientation:'PORTRAIT' });
        return Math.abs(dims.widthMm - firstDims.widthMm) > 0.01 || Math.abs(dims.heightMm - firstDims.heightMm) > 0.01;
      });
      if (incompatible) {
        setMessage(`Exact Combined Print requires the same physical page size for all selected documents. ${incompatible.label || incompatible.id} differs. Use Engine Combined PDF for mixed page sizes.`);
        return;
      }
      // The Combined Documents drawer is rendered through a body portal. Close it
      // before activating print mode so browser print never captures application chrome.
      setCombinedDrawerOpen(false);
      setCombinedExactReady(null);
      setCombinedExactDocuments(documents);
      setCombinedExactPrintRequested(true);
      setMessage(`Preparing Exact Combined Print • ${documents.length} document${documents.length === 1 ? '' : 's'} • measuring the same paginated layout used by Live Preview`);
    } catch (error) {
      setMessage(error instanceof Error ? `Exact Combined Print failed: ${error.message}` : 'Exact Combined Print failed.');
      setCombinedExactDocuments([]);
      setCombinedExactPrintRequested(false);
    }
  }

  async function generatePdf(fileNameOverride?:string) {
    if (!draft || !preview?.model || pdfGenerating) return;
    setPdfGenerating(true);
    try {
      const canonicalDraft = hydrateAggregateBindings(draft, selectedWorkspace?.mappings ?? []);
      const exportGroupId = selectedGroupId || 'designer-preview';
      const registry = new RendererRegistry();
      registry.register('PDF', new PdfExportRenderer());
      const orchestrator = new ExportOrchestrator({
        registry,
        resolveDocument: async (templateId, documentGroupId) => {
          if (templateId !== canonicalDraft.id || documentGroupId !== exportGroupId) throw new Error('The requested PDF document is no longer selected.');
          return { documentGroupId, template:canonicalDraft, model:preview.model! };
        },
      });
      const result = await orchestrator.export({ format:'PDF', templateId:canonicalDraft.id, documentGroupIds:[exportGroupId], fileName:fileNameOverride||canonicalDraft.name });
      const document = result.files[0]!;
      const delivered=await deliverExportedFiles([document]);
      if(delivered.status==='CANCELLED'){setMessage('Engine PDF save cancelled.');return;}
      if(delivered.status==='FAILED')throw new Error(`PDF generated successfully but could not be saved. ${delivered.error??''}`.trim());
      setMessage(`Engine PDF export completed - ${document.fileName} - ${document.bytes.byteLength} bytes verified`);
    } catch (error) {
      setMessage(error instanceof Error ? `PDF generation failed: ${error.message}` : 'PDF generation failed.');
    } finally {
      setPdfGenerating(false);
    }
  }


  function toggleCombinedGroup(id:string) {
    setCombinedSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function selectAllCombinedGroups() {
    setCombinedSelectedIds(activeGroups.map((group) => group.id));
  }

  function selectCurrentCombinedGroup() {
    if (!selectedGroupId) return;
    setCombinedSelectedIds((current) => current.includes(selectedGroupId) ? current : [...current, selectedGroupId]);
  }

  async function generateCombinedPdf() {
    if (!draft || combinedGenerating) return;
    const selected = new Set(combinedSelectedIds);
    const orderedGroups = activeGroups.filter((group) => selected.has(group.id));
    if (!orderedGroups.length) { setMessage('Select at least one document for the combined PDF.'); return; }
    const canonicalDraft = hydrateAggregateBindings(draft, selectedWorkspace?.mappings ?? []);
    combinedCancelRef.current = false;
    setCombinedGenerating(true);
    setCombinedProgress({ phase:'PREPARING', currentDocument:0, totalDocuments:orderedGroups.length, pagesGenerated:0, percent:0 });
    try {
      async function* sources() {
        for (const baseGroup of orderedGroups) {
          if (combinedCancelRef.current) return;
          yield {
            documentGroupId:baseGroup.id,
            label:baseGroup.key || baseGroup.id,
            resolve:async () => {
              const hydrated = hydrateWorkspaceGroup(selectedWorkspace, baseGroup) ?? baseGroup;
              const rendered = service.buildPreview(canonicalDraft, hydrated);
              if (!rendered.model || rendered.errors.length) {
                const reason = rendered.errors.map((error) => error.message).join('; ') || 'TemplateEngine returned no RenderModel.';
                throw new Error(reason);
              }
              return { template:canonicalDraft, model:rendered.model };
            },
          };
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
      const document = await combinedPdfRenderer.render(sources(), {
        fileNamePrefix:combinedFileName || 'Combined_Documents',
        pageNumbering:combinedPageNumbering,
        totalDocumentsHint:orderedGroups.length,
        shouldCancel:() => combinedCancelRef.current,
        onProgress:(progress) => setCombinedProgress(progress),
      });
      const bytes=new Uint8Array(document.content);
      const delivered=await deliverExportedFiles([{fileName:document.fileName,mimeType:document.mimeType,bytes}]);
      if(delivered.status==='CANCELLED'){setMessage('Combined PDF save cancelled.');return;}
      if(delivered.status==='FAILED')throw new Error(`Combined PDF generated successfully but could not be saved. ${delivered.error??''}`.trim());
      setMessage(`Combined PDF export completed - ${document.documentCount} documents - ${document.totalPages} pages - ${bytes.byteLength} bytes verified`);
    } catch (error) {
      if (error instanceof CombinedPdfError && error.code === 'COMBINED_PDF_CANCELLED') setMessage('Combined PDF generation cancelled.');
      else setMessage(error instanceof Error ? `Combined PDF failed: ${error.message}` : 'Combined PDF generation failed.');
    } finally {
      setCombinedGenerating(false);
      combinedCancelRef.current = false;
    }
  }

  function cancelCombinedPdf() {
    combinedCancelRef.current = true;
    setMessage('Cancellation requested • current document will stop before the next document starts.');
  }

  async function loadSelectedSource(id: string) {
    if (!id) { setSelectedWorkspace(null); setSourceLoading(false); return; }
    setSourceLoading(true);
    try {
      const stored = await loadImportWorkspace(id);
      if (!stored) { setSelectedWorkspace(null); setSourceLibraryMessage('Selected imported source is unavailable.'); return; }
      // Repair is intentionally lazy: only the selected source can trigger a rebuild.
      const repaired = await repairWorkspaceGroups(stored);
      setSelectedWorkspace(repaired);
      setSourceLibraryMessage(`${sourceMetadata.length || 1} imported source${(sourceMetadata.length || 1) === 1 ? '' : 's'} available • ${repaired.sourceFile?.name ?? 'Imported source'}`);
    } catch {
      setSelectedWorkspace(null);
      setSourceLibraryMessage('Unable to load the selected source.');
    } finally { setSourceLoading(false); }
  }

  async function refreshSourceLibrary(preferredId?: string) {
    try {
      const [metadata, activeId] = await Promise.all([listImportWorkspaceMetadata(), getActiveImportWorkspaceId()]);
      setSourceMetadata(metadata);
      const nextId = preferredId && metadata.some((item) => item.id === preferredId)
        ? preferredId
        : activeId && metadata.some((item) => item.id === activeId)
          ? activeId
          : metadata[0]?.id ?? '';
      setSelectedSourceId(nextId);
      setSelectedWorkspace(null);
      if (!nextId) {
        setSourceLibraryMessage('No imported sources saved yet.');
        return;
      }
      const meta = metadata.find((item) => item.id === nextId);
      setSourceLibraryMessage(`${metadata.length} imported source${metadata.length === 1 ? '' : 's'} available${meta ? ` • ${meta.sourceName} ready to load` : ''}`);
    } catch {
      setSelectedWorkspace(null);
      setSourceLibraryMessage('Unable to load the local source library.');
    } finally { setSourceLoading(false); }
  }

  async function selectSource(id: string) {
    setSelectedSourceId(id);
    setSelectedGroupId('');
    setSelectedWorkspace(null);
    if (!id) return;
    await setActiveImportWorkspace(id);
    const meta = sourceMetadata.find((item) => item.id === id);
    setSourceLibraryMessage(`${meta?.sourceName ?? 'Selected source'} ready to load.`);
  }

  async function loadCurrentSource() {
    if (!selectedSourceId || sourceLoading) return;
    await loadSelectedSource(selectedSourceId);
  }

  async function load() {
    const inspected=repo.inspect();
    if(inspected.status==='RECOVERY_REQUIRED'){setPersistenceRecovery({reason:inspected.reason,rawBackupAvailable:inspected.rawBackupAvailable});setMessage('Workspace could not be loaded. Recovery is required.');return;}
    setPersistenceRecovery(null);
    let list = inspected.status==='EMPTY'?[]:inspected.workspace.templates;
    if(inspected.status==='LOADED'&&inspected.migrated)await repo.list();
    if (list.length === 0) {
      const seeded = basicInvoice();
      await service.save(seeded);
      list = [seeded];
    }
    setTemplates(list);
    setSelectedId(list[0]?.id ?? '');
    setDraft(list[0] ? clone(list[0]) : null);
  }

  async function backupTemplateWorkspace(){
    try{const backup=repo.exportBackup() as ReturnType<typeof repo.exportBackup>&{workspace:{templates:TemplateDefinition[];sources?:StoredImportWorkspace[]}};const sources=(await listImportWorkspaces()).map(source=>({...source,sourceFile:null,dataPreview:null,groups:[],groupingResult:null}));backup.workspace.sources=sources;const date=new Date().toISOString().slice(0,10);const bytes=new TextEncoder().encode(JSON.stringify(backup,null,2));const result=await deliverExportedFiles([{fileName:`Document_Generator_Workspace_${date}.dgw`,mimeType:'application/json',bytes}]);if(result.status==='SAVED')setMessage('Workspace backup saved successfully. Source configuration is included; original Excel/CSV bytes are not.');else if(result.status==='CANCELLED')setMessage('Workspace backup cancelled.');else setMessage(`Workspace backup failed: ${result.error??'Unable to save backup.'}`);}
    catch(error){setMessage(error instanceof Error?`Workspace backup failed: ${error.message}`:'Workspace backup failed.');}
  }
  async function importTemplateWorkspace(file:File){
    try{const raw=await file.text();const parsed=JSON.parse(raw) as {workspace?:{templates?:unknown[];sources?:unknown[]}};const count=parsed.workspace?.templates?.length??0;const incomingSources=parsed.workspace?.sources??[];if(!Array.isArray(incomingSources)||!incomingSources.every(isStoredSourceConfiguration))throw new Error('Backup contains invalid source configuration.');if(!window.confirm(`Import Workspace?\n\nCurrent workspace will be replaced.\nTemplates: ${count}\nSource configurations: ${incomingSources.length}\n\nOriginal Excel/CSV files must be selected again. Continue?`))return;const previousBackup=persistenceRecovery?null:JSON.stringify(repo.exportBackup());const previousSources=await listImportWorkspaces();try{await repo.importBackup(raw);for(const source of previousSources)await clearImportWorkspace(source.id);for(const source of incomingSources)await saveImportWorkspace(source as StoredImportWorkspace);}catch(error){if(previousBackup)await repo.importBackup(previousBackup);for(const source of await listImportWorkspaces())await clearImportWorkspace(source.id);for(const source of previousSources)await saveImportWorkspace(source);throw error;}setPersistenceRecovery(null);await load();await refreshSourceLibrary();setMessage(`Workspace imported successfully - ${count} template${count===1?'':'s'}, ${incomingSources.length} source configuration${incomingSources.length===1?'':'s'}.`);}
    catch(error){setMessage(error instanceof Error?`Workspace import failed: ${error.message}`:'This is not a valid Document Generator workspace backup.');}
    finally{if(workspaceImportRef.current)workspaceImportRef.current.value='';}
  }
  async function downloadRecoveryCopy(){const raw=repo.recoveryCopy();if(!raw){setMessage('No recovery copy is available.');return;}const bytes=new TextEncoder().encode(raw);const result=await deliverExportedFiles([{fileName:`workspace-recovery-${new Date().toISOString().slice(0,10)}.json`,mimeType:'application/json',bytes}]);setMessage(result.status==='SAVED'?'Recovery copy saved.':result.status==='CANCELLED'?'Recovery copy save cancelled.':`Recovery copy failed: ${result.error??'Unknown error.'}`);}
  async function resetTemplateWorkspace(){if(!window.confirm('Reset Workspace?\n\nThis removes the currently stored templates. This cannot be undone without a backup.'))return;repo.reset();setPersistenceRecovery(null);await load();setMessage('Workspace reset completed.');}

  const selectTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(template ? clone(template) : null);
    setSelectedBlockId('');
    setMessage('');
  };

  const newTemplate = () => {
    setDraft(service.createBlank('New Template'));
    setSelectedId('');
    setSelectedBlockId('');
    setMessage('Unsaved template');
  };

  const save = async () => {
    if (!draft) return;
    // Persist canonical Generate mappings too, not only use them transiently in
    // preview. This permanently repairs older fields.x/items.x mismatches when
    // the user saves the template with a source loaded.
    const canonicalDraft = hydrateAggregateBindings(draft, selectedWorkspace?.mappings ?? []);
    const validation = service.validate(canonicalDraft);
    if (!validation.valid) {
      setMessage(validation.errors.map((error) => error.message).join(' '));
      return;
    }
    await service.save(canonicalDraft);
    const list = await service.list();
    setTemplates(list);
    const saved = list.find((item) => item.id === draft.id);
    if (saved) setDraft(clone(saved));
    setSelectedId(draft.id);
    setMessage(`Template saved locally • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft]);

  const remove = async () => {
    if (!draft) return;
    await service.delete(draft.id);
    await load();
    setMessage('Template deleted.');
  };

  const duplicate = () => {
    if (!draft) return;
    setDraft({ ...clone(draft), id: makeId('template'), name: `${draft.name} Copy` });
    setSelectedId('');
    setSelectedBlockId('');
  };

  const add = (kind: TemplateBlock['type']) => {
    if (!draft) return;
    const block = createBlock(kind, fieldBindings[0]?.value ?? discovered.scalarFields[0], collectionBindings[0]?.path ?? discovered.collections[0]?.path);
    setDraft(updateRegion(draft, region, [...blocks, block]));
    setSelectedBlockId(block.id);
  };

  const updateSelected = (next: TemplateBlock | RowChildBlock) => {
    if (!draft || !selection) return;
    const nextBlocks = selection.parentRow
      ? blocks.map((block) => {
          if (block.id !== selection.parentRow!.id || block.type !== 'ROW') return block;
          if (selection.parentColumnId) return { ...block, columns: (block.columns ?? []).map((column) => column.id === selection.parentColumnId ? { ...column, children: column.children.map((child) => child.id === next.id ? next as RowChildBlock : child) } : column) };
          return { ...block, children: block.children.map((child) => child.id === next.id ? next as RowChildBlock : child) };
        })
      : blocks.map((block) => (block.id === next.id ? (next as TemplateBlock) : block));
    setDraft(updateRegion(draft, region, nextBlocks));
  };

  const moveSelected = (direction: number) => {
    if (!draft || !selection) return;
    if (selection.parentRow) {
      const row = selection.parentRow;
      if (selection.parentColumnId) {
        const column = row.columns?.find((item) => item.id === selection.parentColumnId);
        if (!column) return;
        const index = column.children.findIndex((child) => child.id === selection.block.id);
        const target = index + direction;
        if (target < 0 || target >= column.children.length) return;
        const children = [...column.children];
        [children[index], children[target]] = [children[target]!, children[index]!];
        const columns = (row.columns ?? []).map((item) => item.id === column.id ? { ...item, children } : item);
        setDraft(updateRegion(draft, region, blocks.map((block) => block.id === row.id ? { ...row, columns } : block)));
        return;
      }
      const index = row.children.findIndex((child) => child.id === selection.block.id);
      const target = index + direction;
      if (target < 0 || target >= row.children.length) return;
      const children = [...row.children];
      [children[index], children[target]] = [children[target]!, children[index]!];
      setDraft(updateRegion(draft, region, blocks.map((block) => (block.id === row.id ? { ...row, children } : block))));
      return;
    }
    const index = blocks.findIndex((block) => block.id === selection.block.id);
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setDraft(updateRegion(draft, region, next));
  };


  const moveSelectedToRegion = (targetRegion: TemplateRegionName) => {
    if (!draft || !selection || selection.parentRow || targetRegion === region) return;
    const moving = selection.block as TemplateBlock;
    const without = updateRegion(draft, region, blocks.filter((block) => block.id !== moving.id));
    const targetBlocks = targetRegion === 'HEADER' ? without.header.blocks : targetRegion === 'FOOTER' ? without.footer.blocks : without.body.blocks;
    setDraft(updateRegion(without, targetRegion, [...targetBlocks, moving]));
    setRegion(targetRegion);
    setSelectedBlockId(moving.id);
  };

  const deleteSelected = () => {
    if (!draft || !selection) return;
    if (selection.parentRow) {
      const row = selection.parentRow;
      setDraft(updateRegion(draft, region, blocks.map((block) => {
        if (block.id !== row.id) return block;
        if (selection.parentColumnId) return { ...row, columns: (row.columns ?? []).map((column) => column.id === selection.parentColumnId ? { ...column, children: column.children.filter((child) => child.id !== selection.block.id) } : column) };
        return { ...row, children: row.children.filter((child) => child.id !== selection.block.id) };
      })));
    } else {
      setDraft(updateRegion(draft, region, blocks.filter((block) => block.id !== selection.block.id)));
    }
    setSelectedBlockId('');
  };

  const addRowChild = (row: RowBlock, type: RowChildBlock['type']) => {
    if (!draft) return;
    const child = createRowChild(type, fieldBindings[0]?.value ?? discovered.scalarFields[0]);
    const currentTotal = row.children.reduce((sum, item) => sum + (item.layout?.widthPercent ?? 0), 0);
    const available = Math.max(10, 100 - currentTotal);
    child.layout = { ...child.layout, widthPercent: Math.min(child.layout?.widthPercent ?? 50, available) };
    const nextRow = { ...row, children: [...row.children, child] };
    setDraft(updateRegion(draft, region, blocks.map((block) => (block.id === row.id ? nextRow : block))));
    setSelectedBlockId(child.id);
  };

  const updateRow = (row: RowBlock) => {
    if (!draft) return;
    setDraft(updateRegion(draft, region, blocks.map((block) => block.id === row.id ? row : block)));
  };

  const addRowColumn = (row: RowBlock) => {
    const columns = row.columns ?? [];
    const width = Math.max(10, Math.floor(100 / (columns.length + 1)));
    const nextColumns = columns.map((column) => ({ ...column, widthPercent: width }));
    nextColumns.push({ id: makeId('cell'), widthPercent: Math.max(1, 100 - width * columns.length), style: defaultCellStyle(), children: [] });
    updateRow({ ...row, columns: nextColumns, children: columns.length ? row.children : [] });
  };

  const patchRowColumn = (row: RowBlock, columnId: string, patch: Partial<RowColumn>) => updateRow({ ...row, columns: (row.columns ?? []).map((column) => column.id === columnId ? { ...column, ...patch } : column) });
  const removeRowColumn = (row: RowBlock, columnId: string) => updateRow({ ...row, columns: (row.columns ?? []).filter((column) => column.id !== columnId) });
  const addCellChild = (row: RowBlock, columnId: string, type: RowChildBlock['type']) => {
    const child = createRowChild(type, fieldBindings[0]?.value ?? discovered.scalarFields[0]);
    child.layout = { ...child.layout, widthPercent: 100, alignment: 'LEFT' };
    updateRow({ ...row, columns: (row.columns ?? []).map((column) => column.id === columnId ? { ...column, children: [...column.children, child] } : column) });
    setSelectedBlockId(child.id);
  };

  const moveCellChild = (row: RowBlock, columnId: string, childId: string, direction: number) => {
    const columns = (row.columns ?? []).map((column) => {
      if (column.id !== columnId) return column;
      const index = column.children.findIndex((child) => child.id === childId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= column.children.length) return column;
      const children = [...column.children];
      [children[index], children[target]] = [children[target]!, children[index]!];
      return { ...column, children };
    });
    updateRow({ ...row, columns });
    setSelectedBlockId(childId);
  };

  const duplicateCellChild = (row: RowBlock, columnId: string, childId: string) => {
    const columns = (row.columns ?? []).map((column) => {
      if (column.id !== columnId) return column;
      const index = column.children.findIndex((child) => child.id === childId);
      if (index < 0) return column;
      const duplicate = cloneRowChildWithFreshIds(column.children[index]!);
      const children = [...column.children];
      children.splice(index + 1, 0, duplicate);
      setSelectedBlockId(duplicate.id);
      return { ...column, children };
    });
    updateRow({ ...row, columns });
  };

  const removeCellChild = (row: RowBlock, columnId: string, childId: string) => {
    const columns = (row.columns ?? []).map((column) => column.id === columnId
      ? { ...column, children: column.children.filter((child) => child.id !== childId) }
      : column);
    updateRow({ ...row, columns });
    if (selectedBlockId === childId) setSelectedBlockId(row.id);
  };

  const setZoom = (value: number) => {
    setFitPreview(false);
    setZoomPercent(Math.max(50, Math.min(200, value)));
  };

  return (
    <div className={`templates-container animated-fade-in phase32-page ${fullPreview ? 'is-full-preview' : ''}`}>
      <div className="page-header phase32-header designer-command-header">
        <div className="designer-heading-group">
          <div className="designer-title-line"><span className="designer-eyebrow">Document Designer</span><span className="designer-title-separator">/</span><strong>{draft?.name || 'Untitled template'}</strong></div>
          <div className="designer-context-chips">
            <span>{draft?.page.size ?? 'A4'} · {draft?.page.orientation === 'LANDSCAPE' ? 'Landscape' : 'Portrait'}</span>
            <span>{region.charAt(0) + region.slice(1).toLowerCase()} · {blocks.length} block{blocks.length === 1 ? '' : 's'}</span>
            <span className={hasLiveData ? 'is-live' : ''}>{hasLiveData ? `${activeGroups.length.toLocaleString()} groups` : 'Placeholder data'}</span>
          </div>
        </div>
        <div className="template-top-actions designer-command-actions">
          <button className="btn-secondary workspace-toggle" onClick={() => setLeftCollapsed((value) => !value)} title={leftCollapsed ? 'Show template tools' : 'Hide template tools'}>{leftCollapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}<span>{leftCollapsed ? 'Tools' : 'Hide Tools'}</span></button>
          <button className="btn-secondary workspace-toggle" onClick={() => setPropertiesCollapsed((value) => !value)} title={propertiesCollapsed ? 'Show properties' : 'Hide properties'}>{propertiesCollapsed ? <PanelRightOpen size={16}/> : <PanelRightClose size={16}/>}<span>{propertiesCollapsed ? 'Properties' : 'Hide Properties'}</span></button>
          <button className="btn-secondary" onClick={() => setFullPreview((value) => !value)} title={fullPreview ? 'Return to designer' : 'Focus on preview'}>{fullPreview ? <Minimize2 size={16}/> : <Maximize2 size={16}/>} {fullPreview ? 'Designer' : 'Focus Preview'}</button>
           <button className="btn-secondary" onClick={newTemplate}><FilePlus size={15}/> New</button>
           <button className="btn-secondary" type="button" onClick={()=>void backupTemplateWorkspace()} disabled={!!persistenceRecovery}><Download size={15}/> Backup</button>
           <button className="btn-secondary" type="button" onClick={()=>workspaceImportRef.current?.click()}><FileText size={15}/> Import</button>
           <input ref={workspaceImportRef} type="file" accept=".dgw,.json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void importTemplateWorkspace(file);}}/>
          <div className={`save-state ${isDirty ? 'dirty' : 'saved'}`}>{isDirty ? 'Unsaved changes' : 'Saved'}</div>
          <button className="btn-primary" onClick={() => void save()} disabled={!draft}><Save size={15}/> Save Template</button>
        </div>
       </div>

      {persistenceRecovery&&<div className="live-data-empty-banner" role="alert"><div><strong>Workspace could not be loaded.</strong><span>{persistenceRecovery.reason} Your saved data was not reset or overwritten.</span></div><button type="button" className="btn-secondary" onClick={()=>void load()}>Retry</button><button type="button" className="btn-secondary" onClick={()=>workspaceImportRef.current?.click()}>Import Backup</button>{persistenceRecovery.rawBackupAvailable&&<button type="button" className="btn-secondary" onClick={()=>void downloadRecoveryCopy()}>Download Recovery Copy</button>}<button type="button" className="btn-secondary" onClick={()=>void resetTemplateWorkspace()}>Reset Workspace</button></div>}

      {!fullPreview && (
        <div className="source-context-bar panel-card">
          <div className="source-context-main">
            <FileSpreadsheet size={18}/>
            <label>Template Source File
              <select value={selectedSourceId} onChange={(event) => void selectSource(event.target.value)}>
                <option value="">No imported source selected</option>
                {sourceMetadata.map((source) => <option key={source.id} value={source.id}>{source.sourceName} • {source.groupCount.toLocaleString()} groups</option>)}
              </select>
            </label>
            <button className="btn-secondary compact-button" onClick={() => void loadCurrentSource()} disabled={!selectedSourceId || sourceLoading} title="Load selected imported source"><FileSpreadsheet size={14}/> {sourceLoading ? 'Loading…' : 'Load Source'}</button>
            <button className="btn-secondary compact-button" onClick={() => void refreshSourceLibrary(selectedSourceId)} title="Refresh imported source library"><RefreshCw size={14}/> Refresh</button>
          </div>
          <div className="source-context-meta">
            {sourceLoading ? <>Loading selected source…</> : selectedWorkspace?.sourceFile ? <>Using <strong>{selectedWorkspace.sourceFile.name}</strong> for field dropdowns and live preview. Imported {formatSourceDate(selectedWorkspace.updatedAt)}.</> : <>Import Excel/CSV in Generate. Every imported file will remain available here locally.</>}
            {sourceLibraryMessage && <span>{sourceLibraryMessage}</span>}
          </div>
        </div>
      )}

      {!hasLiveData && !fullPreview && (
        <div className="live-data-empty-banner">
          <strong>No live source data available.</strong>
          <span>Import and group Excel/CSV data in Generate to preview real values. Template design can continue with safe placeholders.</span>
        </div>
      )}

      <div className={`phase32-layout ${leftCollapsed ? 'left-collapsed' : ''} ${propertiesCollapsed ? 'properties-collapsed' : ''} ${!selection && !propertiesCollapsed && !fullPreview ? 'properties-idle' : ''}`}>
        {!leftCollapsed && !fullPreview && (
          <aside className="designer-left-panel panel-card">
            <nav className="designer-panel-tabs" aria-label="Designer tools">
              <button type="button" className={leftWorkspaceTab === 'ELEMENTS' ? 'active' : ''} onClick={() => setLeftWorkspaceTab('ELEMENTS')} title="Elements"><Layers3 size={16}/><span>Elements</span></button>
              <button type="button" className={leftWorkspaceTab === 'DOCUMENT' ? 'active' : ''} onClick={() => setLeftWorkspaceTab('DOCUMENT')} title="Document settings"><SlidersHorizontal size={16}/><span>Document</span></button>
              <button type="button" className={leftWorkspaceTab === 'DATA' ? 'active' : ''} onClick={() => setLeftWorkspaceTab('DATA')} title="Data logic"><Database size={16}/><span>Data</span></button>
            </nav>

            <div className="designer-panel-content">
              {leftWorkspaceTab === 'DOCUMENT' && (
                <section className="template-library-section">
                  <div className="workspace-panel-heading"><div><h3>Document</h3><small>Template, page & pagination settings</small></div></div>
                  <select value={selectedId} onChange={(event) => selectTemplate(event.target.value)}>
                    <option value="">Unsaved template</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                  {draft && (<>
                    <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
                    <div className="page-setting-row">
                      <label>Size<select value={draft.page.size} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, size: event.target.value as PageSize } })}>{PAGE_SIZE_OPTIONS.map((size)=><option key={size} value={size}>{size}</option>)}</select></label>
                      <label>Orientation<select value={draft.page.orientation} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, orientation: event.target.value as 'PORTRAIT'|'LANDSCAPE' } })}><option>PORTRAIT</option><option>LANDSCAPE</option></select></label>{draft.page.size === 'CUSTOM' && <><label>Custom Width (mm)<input type="number" min={1} value={draft.page.customWidthMm ?? 210} onChange={(event)=>setDraft({...draft,page:{...draft.page,customWidthMm:+event.target.value}})}/></label><label>Custom Height (mm)<input type="number" min={1} value={draft.page.customHeightMm ?? 297} onChange={(event)=>setDraft({...draft,page:{...draft.page,customHeightMm:+event.target.value}})}/></label></>}
                    </div>
                    <div className="margin-grid">
                      {(['top','right','bottom','left'] as const).map((key) => (<label key={key}>{key} (mm)<input type="number" min={0} value={draft.page.margins[key]} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, margins: { ...draft.page.margins, [key]: +event.target.value } } })}/></label>))}
                    </div>
                    <details className="page-style-details">
                      <summary>Page Style & Border</summary>
                      <ColorControl label="Page Background" value={draft.page.backgroundColor ?? '#FFFFFF'} onChange={(backgroundColor) => setDraft({ ...draft, page: { ...draft.page, backgroundColor } })}/>
                      <label className="checkbox-label"><input type="checkbox" checked={draft.page.border?.enabled ?? false} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, border: { ...draft.page.border, enabled: event.target.checked, style: draft.page.border?.style ?? 'SOLID', width: draft.page.border?.width ?? 1, color: draft.page.border?.color ?? '#111827', offset: draft.page.border?.offset ?? 4 } } })}/> Enable Page Border</label>
                      {draft.page.border?.enabled && <div className="control-grid">
                        <label>Border Style<select value={draft.page.border.style ?? 'SOLID'} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, border: { ...draft.page.border, enabled: true, style: event.target.value as 'NONE'|'SOLID'|'DASHED' } } })}><option>NONE</option><option>SOLID</option><option>DASHED</option></select></label>
                        <label>Width (pt)<input type="number" min={0} step="0.5" value={draft.page.border.width ?? 1} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, border: { ...draft.page.border, enabled: true, width: +event.target.value } } })}/></label>
                        <label>Offset (mm)<input type="number" min={0} value={draft.page.border.offset ?? 4} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, border: { ...draft.page.border, enabled: true, offset: +event.target.value } } })}/></label>
                        <ColorControl label="Border Color" value={draft.page.border.color ?? '#111827'} onChange={(color) => setDraft({ ...draft, page: { ...draft.page, border: { ...draft.page.border, enabled: true, color } } })}/>
                      </div>}
                    </details>
                    <details className="page-style-details">
                      <summary>Print & Pagination</summary>
                      <label className="checkbox-label"><input type="checkbox" checked={draft.page.pagination?.repeatHeader ?? true} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, repeatHeader: event.target.checked } } })}/> Repeat document header on every page</label>
                      <label>Footer Mode<select value={draft.page.pagination?.footerMode ?? ((draft.page.pagination?.repeatFooter ?? true) ? 'REPEAT_PAGE' : 'FLOW')} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, footerMode: event.target.value as 'REPEAT_PAGE'|'FLOW'|'LAST_PAGE_ONLY', repeatFooter: event.target.value === 'REPEAT_PAGE' } } })}><option value="REPEAT_PAGE">Repeat on every page</option><option value="FLOW">Flow after body</option><option value="LAST_PAGE_ONLY">Last page only / keep together</option></select></label>
                      <label className="checkbox-label"><input type="checkbox" checked={draft.page.pagination?.showPageNumbers ?? true} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, showPageNumbers: event.target.checked } } })}/> Show Page X of Y (engine PDF)</label>
                      <label>Page Number Position<select value={draft.page.pagination?.pageNumberPosition ?? 'BOTTOM_CENTER'} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, pageNumberPosition: event.target.value as 'BOTTOM_LEFT'|'BOTTOM_CENTER'|'BOTTOM_RIGHT' } } })}><option value="BOTTOM_LEFT">Bottom Left</option><option value="BOTTOM_CENTER">Bottom Center</option><option value="BOTTOM_RIGHT">Bottom Right</option></select></label>
                      <label className="checkbox-label"><input type="checkbox" checked={draft.page.pagination?.keepSummaryTogether ?? true} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, keepSummaryTogether: event.target.checked } } })}/> Keep summary blocks together</label>
                      <label className="checkbox-label"><input type="checkbox" checked={draft.page.pagination?.keepCustomGridTogether ?? true} onChange={(event) => setDraft({ ...draft, page: { ...draft.page, pagination: { ...draft.page.pagination, keepCustomGridTogether: event.target.checked } } })}/> Keep custom grids together</label>
                    </details>
                    <div className="template-small-actions designer-danger-zone"><button onClick={duplicate}><Copy size={14}/> Duplicate</button><button onClick={() => void remove()}><Trash2 size={14}/> Delete</button></div>
                  </>)}
                </section>
              )}

              {leftWorkspaceTab === 'DATA' && (
                <section className="template-library-section">
                  <div className="workspace-panel-heading"><div><h3>Data & Logic</h3><small>Reusable views and calculated values</small></div></div>
                  {draft ? <>
                    <DataViewsEditor value={draft.dataViews ?? []} onChange={(dataViews)=>setDraft({...draft,dataViews})} collections={collectionBindings}/>
                    <CalculatedFieldsEditor value={draft.calculatedFields ?? []} onChange={(calculatedFields)=>setDraft({...draft,calculatedFields})} fieldBindings={fieldBindings} collections={collectionBindings}/>
                  </> : <div className="designer-empty">Create or select a template to configure data logic.</div>}
                </section>
              )}

              {leftWorkspaceTab === 'ELEMENTS' && (
                <section className="block-builder-section professional-elements-panel">
                  <div className="workspace-panel-heading"><div><h3>Elements</h3><small>Add, select and arrange content</small></div></div>
                  <div className="region-tabs" aria-label="Document regions">
                    {(['HEADER','BODY','FOOTER'] as TemplateRegionName[]).map((item) => (<button key={item} className={region === item ? 'active' : ''} onClick={() => { setRegion(item); setSelectedBlockId(''); }}>{item}</button>))}
                  </div>
                  <div className="toolbox-groups">
                    <div className="toolbox-group"><span className="toolbox-label">Content</span><div className="block-palette">
                      <button onClick={() => add('TEXT')}><Type size={14}/> Text</button><button onClick={() => add('FIELD')}><Braces size={14}/> Data Field</button><button onClick={() => add('IMAGE')}><ImageIcon size={14}/> Image</button><button onClick={() => add('TABLE')}><Table2 size={14}/> Data Table</button><button onClick={() => add('CUSTOM_TABLE')}><Table2 size={14}/> Custom Grid</button><button onClick={() => add('SUMMARY_TABLE')}><Table2 size={14}/> Summary</button>
                    </div></div>
                    <div className="toolbox-group"><span className="toolbox-label">Layout</span><div className="block-palette">
                      <button onClick={() => add('ROW')}><span>↔</span> Row / Grid</button><button onClick={() => add('BOX')}><span>□</span> Box / Shape</button><button onClick={() => add('DIVIDER')}><Minus size={14}/> Divider</button><button onClick={() => add('SPACER')}><Space size={14}/> Spacer</button>
                    </div></div>
                  </div>
                  <div className="layers-heading"><span>Layers</span><small>{blocks.length}</small></div>
                  <div className="block-list phase32-block-list">
                    {blocks.length === 0 ? <div className="designer-empty">No blocks in {region.toLowerCase()}.</div> : blocks.map((block, index) => (<BlockTreeItem key={block.id} block={block} index={index} selectedBlockId={selectedBlockId} onSelect={setSelectedBlockId} onAddCellChild={addCellChild} onMoveCellChild={moveCellChild} onDuplicateCellChild={duplicateCellChild} onRemoveCellChild={removeCellChild}/>))}
                  </div>
                  {selection && <div className="block-order-actions">
                    <button onClick={() => moveSelected(-1)}><ArrowUp size={14}/> {selection.parentRow ? 'Left' : 'Up'}</button><button onClick={() => moveSelected(1)}><ArrowDown size={14}/> {selection.parentRow ? 'Right' : 'Down'}</button>
                    {!selection.parentRow && region !== 'HEADER' && <button onClick={() => moveSelectedToRegion('HEADER')}>Header</button>}{!selection.parentRow && region !== 'BODY' && <button onClick={() => moveSelectedToRegion('BODY')}>Body</button>}{!selection.parentRow && region !== 'FOOTER' && <button onClick={() => moveSelectedToRegion('FOOTER')}>Footer</button>}
                    <button onClick={deleteSelected}><Trash2 size={14}/> Remove</button>
                  </div>}
                </section>
              )}
            </div>
          </aside>
        )}

        <section className="template-preview-panel phase32-preview-panel panel-card">
          <div className="preview-panel-title phase32-preview-title">
            <div>
              <h3>Canvas & Live Preview</h3>
              <span>{hasLiveData ? `${activeGroups.length} live group${activeGroups.length === 1 ? '' : 's'} loaded` : 'Placeholder mode'}</span>
            </div>
            <span className="phase-badge">Design Mode</span>
          </div>

          <div className="preview-toolbar">
            <label className="preview-group-select">
              <span>Record / Group</span>
              <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={!hasLiveData}>
                {!hasLiveData && <option value="">No live groups</option>}
                {activeGroups.map((group, index) => <option key={group.id} value={group.id}>{group.key || `Group ${index + 1}`}</option>)}
              </select>
            </label>
            <div className="preview-zoom-controls">
              <button className={fitPreview ? 'active' : ''} onClick={() => setFitPreview(true)}>Fit Page</button>
              {[75,100,125,150].map((value) => <button key={value} className={!fitPreview && zoomPercent === value ? 'active' : ''} onClick={() => setZoom(value)}>{value}%</button>)}
              <button onClick={() => setZoom(zoomPercent - 10)}>−</button>
              <button onClick={() => setZoom(zoomPercent + 10)}>+</button>
              <button onClick={() => setFullPreview((value) => !value)}>{fullPreview ? 'Designer' : 'Focus'}</button>
              <button className="combined-docs-trigger" type="button" onClick={() => setCombinedDrawerOpen(true)}><Layers3 size={14}/> Combined ({combinedSelectedIds.length})</button>
              <button className="pdf-generate-button export-entry-button" type="button" aria-haspopup="dialog" aria-expanded={exportOpen} disabled={exportRunning} onPointerDown={(event)=>{if(event.button!==0||exportRunning)return;event.preventDefault();openExportDialog();}} onClick={()=>{if(!exportRunning)openExportDialog();}}><Download size={14}/> Export</button>
              <button className="pdf-print-button" onClick={printExactPreview} disabled={!preview?.model || printRequested}><Printer size={14}/> {printRequested ? 'Preparing…' : 'Exact PDF'}</button>
              <button className="pdf-generate-button" onClick={() => void generatePdf()} disabled={!preview?.model || pdfGenerating}><FileText size={14}/> {pdfGenerating ? 'Generating…' : 'Engine PDF'}</button>
            </div>
          </div>

          {preview && (
            <TemplatePreview
              model={preview.model}
              warnings={[...preview.errors.map((error) => error.message), ...preview.warnings.map((warning) => warning.message)]}
              zoomPercent={zoomPercent}
              fitToContainer={fitPreview}
              onPagePlanChange={handlePreviewPagePlan}
              onActivePageChange={setActivePreviewPage}
            />
          )}

          {!fullPreview && (
            <details className="template-json template-debug-panel">
              <summary><Code2 size={14}/> Advanced / Debug · Template JSON</summary>
              <pre>{draft ? JSON.stringify(draft, null, 2) : ''}</pre>
            </details>
          )}
        </section>

        {!propertiesCollapsed && !fullPreview && (
          <aside className="properties-sidebar panel-card">
            <div className="properties-sidebar-title properties-sticky-header">
              <div><h3>Properties</h3><small className="properties-eyebrow">Context-aware editor</small></div>
              <span className="properties-breadcrumb">{selection ? selectionBreadcrumb(selection) : 'Select a block'}</span>
            </div>
            {selection ? (
              <>
                {selection.parentRow && <div className="row-child-context"><strong>Context:</strong> {selectionBreadcrumb(selection)}<span>Edit this item below. Use the left Cell toolbar to add more content without returning to Row properties.</span></div>}
                <PropertyEditor
                  block={selection.block}
                  onChange={updateSelected}
                  fieldBindings={fieldBindings}
                  collections={collectionBindings}
                  mappings={selectedWorkspace?.mappings ?? []}
                  sourceFields={selectedWorkspace?.dataPreview?.schema.fields.map((field) => field.name) ?? []}
                  onAddRowChild={selection.block.type === 'ROW' ? (type) => addRowChild(selection.block as RowBlock, type) : undefined}
                  onAddRowColumn={selection.block.type === 'ROW' ? () => addRowColumn(selection.block as RowBlock) : undefined}
                  onPatchRowColumn={selection.block.type === 'ROW' ? (columnId, patch) => patchRowColumn(selection.block as RowBlock, columnId, patch) : undefined}
                  onRemoveRowColumn={selection.block.type === 'ROW' ? (columnId) => removeRowColumn(selection.block as RowBlock, columnId) : undefined}
                />
              </>
            ) : (
              <div className="designer-empty">Select a block or row child to edit its properties.</div>
            )}
          </aside>
        )}
      </div>
      {combinedDrawerOpen && createPortal(
        <div className="combined-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCombinedDrawerOpen(false); }}>
          <aside className="combined-documents-drawer" role="dialog" aria-modal="true" aria-label="Combined Documents">
            <div className="combined-drawer-header">
              <div><h3>Combined Documents</h3><span>{combinedSelectedIds.length} selected · {activeGroups.length.toLocaleString()} available</span></div>
              <button type="button" className="drawer-close" onClick={() => setCombinedDrawerOpen(false)} aria-label="Close Combined Documents">×</button>
            </div>
            <div className="combined-drawer-controls">
              <div className="combined-quick-actions">
                <button type="button" onClick={selectCurrentCombinedGroup} disabled={!selectedGroupId || combinedGenerating}>Add Current</button>
                <button type="button" onClick={selectAllCombinedGroups} disabled={!activeGroups.length || combinedGenerating}>Select All</button>
                <button type="button" onClick={() => setCombinedSelectedIds([])} disabled={!combinedSelectedIds.length || combinedGenerating}>Clear</button>
              </div>
              <div className="combined-settings-grid">
                <label>Page Numbering<select value={combinedPageNumbering} onChange={(event) => setCombinedPageNumbering(event.target.value as CombinedPdfPageNumbering)} disabled={combinedGenerating}><option value="PER_DOCUMENT">Per Document</option><option value="GLOBAL">Global</option></select></label>
                <label>File Name<input value={combinedFileName} onChange={(event) => setCombinedFileName(event.target.value)} placeholder="Combined_Documents" disabled={combinedGenerating}/></label>
              </div>
              <label className="combined-search-field">Search<input value={combinedGroupSearch} onChange={(event) => setCombinedGroupSearch(event.target.value)} placeholder="Search document / group…" disabled={combinedGenerating}/><small>{combinedFilteredGroups.total.toLocaleString()} matching · showing up to 300</small></label>
            </div>
            <div className="combined-drawer-list">
              {activeGroups.length === 0 && <span className="combined-empty">Load a source with document groups first.</span>}
              {combinedFilteredGroups.visible.map((group, index) => (
                <label key={group.id} className={`combined-drawer-item ${combinedSelectedIds.includes(group.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={combinedSelectedIds.includes(group.id)} onChange={() => toggleCombinedGroup(group.id)} disabled={combinedGenerating}/>
                  <span>{group.key || `Group ${index + 1}`}</span>
                </label>
              ))}
            </div>
            <div className="combined-drawer-footer">
              {combinedProgress && <div className="combined-progress"><progress max={100} value={combinedProgress.percent}/><span>{combinedProgress.phase} · {combinedProgress.currentDocument}/{combinedProgress.totalDocuments ?? combinedSelectedIds.length} documents · {combinedProgress.pagesGenerated} pages · {combinedProgress.percent}%</span></div>}
              <div className="combined-drawer-actions">
                {!combinedGenerating ? <>
                  <button className="pdf-generate-button" type="button" onClick={() => void generateCombinedPdf()} disabled={!draft || !combinedSelectedIds.length || combinedExactPrintRequested}><FileText size={14}/> Engine Combined PDF</button>
                  <button className="pdf-print-button" type="button" onClick={printCombinedExact} disabled={!draft || !combinedSelectedIds.length || combinedExactPrintRequested}><Printer size={14}/> {combinedExactPrintRequested ? 'Preparing…' : 'Exact Combined PDF'}</button>
                </> : <button type="button" onClick={cancelCombinedPdf}>Cancel Generation</button>}
              </div>
              <p>Engine mode supports scalable generation. Exact mode uses the same paginated HTML/CSS layout as Live Preview and requires matching physical page sizes.</p>
            </div>
          </aside>
        </div>, document.body)}
      {exportOpen&&createPortal(<div className="export-modal-backdrop" data-export-dialog-open="true" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!exportRunning)setExportOpen(false);}}><section className="export-modal" role="dialog" aria-modal="true" aria-label="Export Document">
        <header><div><h3>Export Document</h3><span>PDF, PNG, or JPEG</span></div><button className="drawer-close" type="button" disabled={exportRunning} onClick={()=>setExportOpen(false)} aria-label="Close export">×</button></header>
        <div className="export-modal-body">
          <label>Format<select value={exportState.format} disabled={exportRunning} onChange={event=>patchExport({format:event.target.value as ExportUiState['format']})}><option value="PDF">PDF</option><option value="PNG">PNG</option><option value="JPEG">JPEG</option><option value="DOCX" disabled>DOCX — Coming in Phase 4.19.4</option></select></label>
          <fieldset><legend>Documents</legend><label className="export-radio"><input type="radio" checked={exportState.scope==='CURRENT'} onChange={()=>patchExport({scope:'CURRENT'})} disabled={exportRunning}/> Current Document</label><label className="export-radio"><input type="radio" checked={exportState.scope==='SELECTED'} onChange={()=>patchExport({scope:'SELECTED'})} disabled={exportRunning||!combinedSelectedIds.length}/> Selected Documents ({combinedSelectedIds.length})</label>{!combinedSelectedIds.length&&<small>No documents selected. Use Combined to select documents.</small>}</fieldset>
          <label>File Name<input value={exportState.fileName} disabled={exportRunning} onChange={event=>patchExport({fileName:event.target.value})}/></label>
          {visibleExportOptions(exportState.format).pdf&&<fieldset><legend>PDF Mode</legend><label className="export-radio"><input type="radio" checked={exportState.pdfMode==='EXACT'} onChange={()=>patchExport({pdfMode:'EXACT'})}/> Exact Layout</label><label className="export-radio"><input type="radio" checked={exportState.pdfMode==='ENGINE'} onChange={()=>patchExport({pdfMode:'ENGINE'})}/> Engine / Scalable</label>{exportState.scope==='SELECTED'&&<small>Selected documents use the existing combined PDF workflow.</small>}</fieldset>}
          {visibleExportOptions(exportState.format).raster&&<><fieldset><legend>Pages</legend><label className="export-radio"><input type="radio" checked={exportState.pageSelection==='CURRENT'} onChange={()=>patchExport({pageSelection:'CURRENT'})}/> Current Page ({activePreviewPage+1})</label><label className="export-radio"><input type="radio" checked={exportState.pageSelection==='ALL'} onChange={()=>patchExport({pageSelection:'ALL'})}/> All Pages ({previewPagePlan.length})</label></fieldset><label>Resolution<select value={exportState.dpi} disabled={exportRunning} onChange={event=>patchExport({dpi:Number(event.target.value) as ExportUiState['dpi']})}>{[96,150,300,600].map(dpi=><option key={dpi} value={dpi}>{dpi} DPI</option>)}</select></label>{(()=>{const dims=getPageDimensions(preview?.model?.page??draft?.page??{size:'A4',orientation:'PORTRAIT'});const estimate=estimateImageMemory(dims.widthMm,dims.heightMm,exportState.dpi,1);return <div className="export-estimate">Approx. {estimate.width} × {estimate.height} px per page · ~{Math.ceil(estimate.pixelsPerPage*4/1048576)} MB working memory</div>;})()}</>}
          {visibleExportOptions(exportState.format).png&&<fieldset><legend>Background</legend><label className="export-radio"><input type="radio" checked={exportState.pngBackground==='TEMPLATE'} onChange={()=>patchExport({pngBackground:'TEMPLATE'})}/> Template Background</label><label className="export-radio"><input type="radio" checked={exportState.pngBackground==='TRANSPARENT'} onChange={()=>patchExport({pngBackground:'TRANSPARENT'})}/> Transparent</label></fieldset>}
          {visibleExportOptions(exportState.format).jpeg&&<><label>Quality<input type="number" min={60} max={100} value={exportState.jpegQuality} disabled={exportRunning} onChange={event=>patchExport({jpegQuality:Number(event.target.value)})}/><small>60 Smaller · 75 Balanced · 90 High · 100 Maximum</small></label><label>Background<input type="color" value={exportState.jpegBackground} disabled={exportRunning} onChange={event=>patchExport({jpegBackground:event.target.value.toUpperCase()})}/></label></>}
          {exportValidation().map(error=><div className="inline-validation-error" key={error}>{error}</div>)}
          {exportProgress&&exportRunning&&<div className="export-progress"><progress max={100} value={exportProgress.percent}/><span>{exportProgress.phase==='RESOLVING'?'Preparing document pages':exportProgress.phase==='RENDERING'?`Rendering ${exportState.format}`:'Finalizing export'} · Document {exportProgress.currentDocument} of {exportProgress.totalDocuments} · {exportProgress.pagesGenerated} pages</span></div>}
          {exportStatus&&!exportRunning&&!exportFiles.length&&<div className="export-status" role="status">{exportStatus}</div>}
          {!!exportFiles.length&&!exportRunning&&<div className="export-results"><strong>Export completed · {exportFiles.length} file{exportFiles.length===1?'':'s'}</strong>{exportFiles.map((file,index)=><a key={file.url} href={file.url} download={file.fileName}><Download size={13}/> Download {exportFiles.length===1?file.fileName:`page/file ${index+1} · ${file.fileName}`}</a>)}</div>}
        </div><footer>{exportRunning?<button type="button" onClick={cancelGeneralExport}>Cancel Export</button>:<><button type="button" onClick={()=>setExportOpen(false)}>Close</button><button className="pdf-generate-button" type="button" disabled={exportValidation().length>0} onClick={()=>void beginGeneralExport()}>Export</button></>}</footer>
      </section></div>,document.body)}
      {rasterExportDocuments.length>0&&createPortal(<div className="raster-export-root" aria-hidden="true"><CombinedPaginatedPrintableDocument documents={rasterExportDocuments} onReady={handleRasterPagesReady}/></div>,document.body)}
      {message && <div className="template-message">{message}</div>}
      {printRequested && preview?.model && previewPagePlan.length > 0 && createPortal(<div className="document-print-root exact-planned-print-root is-ready"><PaginatedPrintableDocument model={preview.model} pagePlan={previewPagePlan} /></div>, document.body)}
      {combinedExactPrintRequested && combinedExactDocuments.length > 0 && createPortal(
        <div className="document-print-root exact-planned-print-root combined-exact-print-root is-ready">
          <CombinedPaginatedPrintableDocument documents={combinedExactDocuments} onReady={handleCombinedExactReady}/>
        </div>,
        document.body,
      )}
    </div>
  );
};

function BlockTreeItem({
  block,
  index,
  selectedBlockId,
  onSelect,
  onAddCellChild,
  onMoveCellChild,
  onDuplicateCellChild,
  onRemoveCellChild,
}: {
  block: TemplateBlock;
  index: number;
  selectedBlockId: string;
  onSelect: (id: string) => void;
  onAddCellChild: (row: RowBlock, columnId: string, type: RowChildBlock['type']) => void;
  onMoveCellChild: (row: RowBlock, columnId: string, childId: string, direction: number) => void;
  onDuplicateCellChild: (row: RowBlock, columnId: string, childId: string) => void;
  onRemoveCellChild: (row: RowBlock, columnId: string, childId: string) => void;
}) {
  const [collapsedCells, setCollapsedCells] = useState<Record<string, boolean>>({});
  const toggleCell = (id: string) => setCollapsedCells((current) => ({ ...current, [id]: !current[id] }));
  const addActions: Array<{ type: RowChildBlock['type']; label: string; icon: ReactNode }> = [
    { type: 'TEXT', label: 'Text', icon: <Type size={12}/> },
    { type: 'FIELD', label: 'Field', icon: <Braces size={12}/> },
    { type: 'IMAGE', label: 'Image', icon: <ImageIcon size={12}/> },
    { type: 'TABLE', label: 'Table', icon: <Table2 size={12}/> },
    { type: 'CUSTOM_TABLE', label: 'Custom Grid', icon: <Table2 size={12}/> },
    { type: 'SUMMARY_TABLE', label: 'Summary', icon: <Table2 size={12}/> },
    { type: 'DIVIDER', label: 'Divider', icon: <Minus size={12}/> },
    { type: 'SPACER', label: 'Spacer', icon: <Space size={12}/> },
  ];
  const renderItemContent = (item: TemplateBlock | RowChildBlock, leadingText: string, trailingText: string) => (
    <>
      <span className="designer-block-main">
        <span className={`designer-block-icon type-${item.type.toLowerCase()}`}>{blockTypeIcon(item)}</span>
        <span className="designer-block-copy">
          <strong>{leadingText}</strong>
          <em title={blockLabel(item)}>{blockLabel(item)}</em>
        </span>
      </span>
      <small>{trailingText}</small>
    </>
  );
  return (
    <div className="block-tree-item">
      <button className={`designer-block symbol-block ${selectedBlockId === block.id ? 'active' : ''}`} onClick={() => onSelect(block.id)}>
        {renderItemContent(block, `${index + 1}. ${blockTypeName(block)}`, block.type)}
      </button>
      {block.type === 'ROW' && (
        <div className="row-child-list direct-cell-editor">
          {block.columns?.length ? block.columns.map((column, columnIndex) => {
            const collapsed = !!collapsedCells[column.id];
            return (
              <div className={`grid-cell-tree direct-grid-cell ${collapsed ? 'is-collapsed' : ''}`} key={column.id}>
                <button type="button" className="grid-cell-tree-title cell-tree-toggle" onClick={() => toggleCell(column.id)}>
                  <span><strong>Cell {columnIndex + 1}</strong> <em>{column.children.length} item{column.children.length === 1 ? '' : 's'}</em></span>
                  <span><small>{column.widthPercent ?? 'Auto'}%</small> <b>{collapsed ? '＋' : '−'}</b></span>
                </button>
                {!collapsed && <>
                  <div className="inline-cell-add-toolbar" aria-label={`Add content to Cell ${columnIndex + 1}`}>
                    <span>Add:</span>
                    {addActions.map((action) => (
                      <button key={action.type} type="button" title={`Add ${action.label} to Cell ${columnIndex + 1}`} onClick={() => onAddCellChild(block, column.id, action.type)}>
                        {action.icon}{action.label}
                      </button>
                    ))}
                  </div>
                  {column.children.length === 0 && <div className="row-empty-hint cell-empty-cta">Blank cell — add content above.</div>}
                  <div className="cell-child-stack">
                    {column.children.map((child, childIndex) => (
                      <div className={`cell-child-row ${selectedBlockId === child.id ? 'active' : ''}`} key={child.id}>
                        <button className={`designer-block row-child-block symbol-block ${selectedBlockId === child.id ? 'active' : ''}`} onClick={() => onSelect(child.id)}>
                          {renderItemContent(child, `${childIndex + 1}. ${blockTypeName(child)}`, child.type.replace('_', ' '))}
                        </button>
                        <details className="cell-child-menu">
                          <summary title="Item actions" aria-label="Item actions">⋮</summary>
                          <div className="cell-child-menu-popover">
                            <button type="button" disabled={childIndex === 0} onClick={() => onMoveCellChild(block, column.id, child.id, -1)}><ArrowUp size={13}/> Move Up</button>
                            <button type="button" disabled={childIndex === column.children.length - 1} onClick={() => onMoveCellChild(block, column.id, child.id, 1)}><ArrowDown size={13}/> Move Down</button>
                            <button type="button" onClick={() => onDuplicateCellChild(block, column.id, child.id)}><Copy size={13}/> Duplicate</button>
                            <button type="button" className="danger" onClick={() => onRemoveCellChild(block, column.id, child.id)}><Trash2 size={13}/> Remove</button>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="add-another-cell-item" onClick={() => onAddCellChild(block, column.id, 'FIELD')}>+ Add another field</button>
                </>}
              </div>
            );
          }) : <>
            {block.children.length === 0 && <div className="row-empty-hint">Blank row — add grid columns from Properties.</div>}
            {block.children.map((child, childIndex) => (
              <button key={child.id} className={`designer-block row-child-block symbol-block ${selectedBlockId === child.id ? 'active' : ''}`} onClick={() => onSelect(child.id)}>
                {renderItemContent(child, `${childIndex + 1}. ${blockTypeName(child)}`, `${child.layout?.widthPercent ?? 50}%`)}
              </button>
            ))}
          </>}
        </div>
      )}
    </div>
  );
}

function PropertyEditor({
  block,
  onChange,
  fieldBindings,
  collections,
  mappings,
  sourceFields,
  onAddRowChild,
  onAddRowColumn,
  onPatchRowColumn,
  onRemoveRowColumn,
}: {
  block: TemplateBlock | RowChildBlock;
  onChange: (block: TemplateBlock | RowChildBlock) => void;
  fieldBindings: BindingOption[];
  collections: CollectionBinding[];
  mappings: MappingDefinition[];
  sourceFields: string[];
  onAddRowChild?: (type: RowChildBlock['type']) => void;
  onAddRowColumn?: () => void;
  onPatchRowColumn?: (columnId: string, patch: Partial<RowColumn>) => void;
  onRemoveRowColumn?: (columnId: string) => void;
}) {
  return (
    <div className="property-editor phase32-property-editor">
      {block.type === 'TEXT' && (
        <>
          <Section title="Basic"><RichDynamicTextEditor block={block} onChange={onChange} fieldBindings={fieldBindings}/></Section>
          <Section title="Style"><TextControls value={block.style} onChange={(style) => onChange({ ...block, style })}/></Section>
          <LayoutControls value={block.layout} onChange={(layout) => onChange({ ...block, layout })}/>
        </>
      )}

      {block.type === 'FIELD' && (
        <>
          <Section title="Basic">
            <label>Label<input value={block.label ?? ''} onChange={(event) => onChange({ ...block, label: event.target.value })}/></label>
            <div className="control-grid">
              <label>Display<select value={block.layoutMode ?? 'INLINE'} onChange={(event) => onChange({ ...block, layoutMode: event.target.value as 'INLINE'|'STACKED' })}><option>INLINE</option><option>STACKED</option></select></label>
              <label>Text Alignment<select value={block.textAlignment ?? 'LEFT'} onChange={(event) => onChange({ ...block, textAlignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
              <label>Label / Value Gap (mm)<input type="number" min={0} value={block.spacing ?? 2} onChange={(event) => onChange({ ...block, spacing: +event.target.value })}/></label>
            </div>
          </Section>
          <Section title="Data Binding">
            <PathInput label="Field Path" value={block.path} options={fieldBindings} onChange={(path) => onChange({ ...block, path })}/>
            <label>Fallback when empty<input value={block.fallback ?? ''} onChange={(event) => onChange({ ...block, fallback: event.target.value })}/></label>
            <DisplayFormatEditor value={block.format} onChange={(format)=>onChange({...block,format})}/>
          </Section>
          <Section title="Label Style"><TextControls value={block.labelStyle} onChange={(labelStyle) => onChange({ ...block, labelStyle })}/></Section>
          <Section title="Value Style"><TextControls value={block.valueStyle} onChange={(valueStyle) => onChange({ ...block, valueStyle })}/></Section>
          <LayoutControls value={block.layout} onChange={(layout) => onChange({ ...block, layout })}/>
        </>
      )}

      {block.type === 'BOX' && <BoxEditor block={block} onChange={onChange} fieldBindings={fieldBindings}/>}
      {block.type === 'TABLE' && <TableEditor block={block} onChange={onChange} collections={collections} mappings={mappings} sourceFields={sourceFields} fieldBindings={fieldBindings}/>} 
      {block.type === 'CUSTOM_TABLE' && <CustomTableEditor block={block} onChange={onChange} fieldBindings={fieldBindings} mappings={mappings}/>} 
      {block.type === 'SUMMARY_TABLE' && <SummaryTableEditor block={block} onChange={onChange} fieldBindings={fieldBindings} collections={collections} mappings={mappings} sourceFields={sourceFields}/>} 
      {block.type === 'IMAGE' && <ImageEditor block={block} onChange={onChange}/>} 
      {block.type === 'SPACER' && <label>Height (mm)<input type="number" min={0} value={block.height} onChange={(event) => onChange({ ...block, height: +event.target.value })}/></label>}
      {block.type === 'DIVIDER' && (
        <>
          <div className="control-grid">
            <label>Thickness<input type="number" min={0.1} step="0.5" value={block.thickness} onChange={(event) => onChange({ ...block, thickness: +event.target.value })}/></label>
            <label>Style<select value={block.style ?? 'SOLID'} onChange={(event) => onChange({ ...block, style: event.target.value as 'NONE'|'SOLID'|'DASHED' })}><option>NONE</option><option>SOLID</option><option>DASHED</option></select></label>
            <ColorControl label="Color" value={block.color ?? '#94A3B8'} onChange={(color) => onChange({ ...block, color })}/>
          </div>
          <LayoutControls value={block.layout} onChange={(layout) => onChange({ ...block, layout })}/>
        </>
      )}

      {block.type === 'ROW' && (
        <>
          <Section title="Row Layout">
            <div className="control-grid">
              <label>Gap (mm)<input type="number" min={0} value={block.gap ?? 5} onChange={(event) => onChange({ ...block, gap: +event.target.value })}/></label>
              <label>Vertical Alignment<select value={block.verticalAlignment ?? 'CENTER'} onChange={(event) => onChange({ ...block, verticalAlignment: event.target.value as VerticalAlignment })}>{VERTICAL_ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
            </div>
          </Section>
          <LayoutControls value={block.layout} onChange={(layout) => onChange({ ...block, layout })}/>
          <Section title="Grid / Cells">
            <button className="add-column-button" onClick={() => onAddRowColumn?.()}>+ Add Blank Column</button>
            {(block.columns ?? []).map((column, index) => {
              const style = column.style ?? {};
              const mode = style.widthMode ?? (column.widthPercent !== undefined ? 'PERCENT' : 'AUTO');
              const widthLabel = mode === 'FIXED_MM' ? `${style.widthMm ?? 35}mm fixed` : mode === 'PERCENT' ? `${style.widthPercent ?? column.widthPercent ?? 50}%` : 'Flex';
              return <details className="row-column-card cell-settings-card" key={column.id}>
                <summary><span><strong>Cell {index + 1}</strong> · {widthLabel} · {column.children.length} item{column.children.length === 1 ? '' : 's'}</span><small>Settings</small></summary>
                <div className="cell-settings-body">
                  <div className="row-column-heading"><span>Cell layout & appearance</span><button className="column-remove" onClick={() => onRemoveRowColumn?.(column.id)}>Remove Cell</button></div>
                  <div className="control-grid">
                    <label>Width Mode<select value={style.widthMode ?? (column.widthPercent !== undefined ? 'PERCENT' : 'AUTO')} onChange={(event) => {
                      const widthMode = event.target.value as CellStyle['widthMode'];
                      onPatchRowColumn?.(column.id, { style: { ...style, widthMode, widthPercent: style.widthPercent ?? column.widthPercent ?? 50, widthMm: style.widthMm ?? 35 } });
                    }}><option value="AUTO">AUTO / FLEX</option><option value="PERCENT">PERCENT</option><option value="FIXED_MM">FIXED MM</option></select></label>
                    {(style.widthMode ?? (column.widthPercent !== undefined ? 'PERCENT' : 'AUTO')) === 'PERCENT' && <label>Width %<input type="number" min={1} max={100} value={style.widthPercent ?? column.widthPercent ?? 50} onChange={(event) => onPatchRowColumn?.(column.id, { widthPercent:+event.target.value, style: { ...style, widthMode:'PERCENT', widthPercent:+event.target.value } })}/></label>}
                    {(style.widthMode ?? (column.widthPercent !== undefined ? 'PERCENT' : 'AUTO')) === 'FIXED_MM' && <label>Width (mm)<input type="number" min={1} value={style.widthMm ?? 35} onChange={(event) => onPatchRowColumn?.(column.id, { style: { ...style, widthMode:'FIXED_MM', widthMm:+event.target.value } })}/></label>}
                    <label>Min Height (mm)<input type="number" min={0} value={style.minHeight ?? 0} onChange={(event) => onPatchRowColumn?.(column.id, { style: { ...style, minHeight: +event.target.value } })}/></label>
                    <label>Horizontal<select value={style.horizontalAlignment ?? 'LEFT'} onChange={(event) => onPatchRowColumn?.(column.id, { style: { ...style, horizontalAlignment: event.target.value as Alignment } })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
                    <label>Vertical<select value={style.verticalAlignment ?? 'TOP'} onChange={(event) => onPatchRowColumn?.(column.id, { style: { ...style, verticalAlignment: event.target.value as VerticalAlignment } })}>{VERTICAL_ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
                  </div>
                  <ColorControl label="Cell Background" value={style.backgroundColor ?? '#FFFFFF'} onChange={(backgroundColor) => onPatchRowColumn?.(column.id, { style: { ...style, backgroundColor } })}/>
                  <CellStyleEditor value={style} onChange={(nextStyle) => onPatchRowColumn?.(column.id, { style: nextStyle })}/>
                  <p className="property-help cell-content-help">Content is managed directly from <strong>Cell {index + 1}</strong> in the left block tree. Add multiple fields/images/tables there without re-selecting this Row.</p>
                </div>
              </details>;
            })}
            {!(block.columns?.length) && <p className="property-help">Add one or more blank columns. Each cell can contain multiple Text, Field, Image, Divider or Spacer blocks.</p>}
          </Section>
          {!block.columns?.length && block.children.length > 0 && <Section title="Legacy Phase 3.3 Row"><div className="row-add-actions"><button onClick={() => onAddRowChild?.('TEXT')}>+ Text</button><button onClick={() => onAddRowChild?.('FIELD')}>+ Field</button><button onClick={() => onAddRowChild?.('IMAGE')}>+ Image</button></div><p className="property-help">This saved row remains backward-compatible. New rows use Grid/Cells.</p></Section>}
        </>
      )}
      <VisibilityRuleEditor
        value={block.visibility}
        onChange={(visibility) => onChange({ ...block, visibility })}
        options={fieldBindings}
        title="Conditional Visibility"
        help="Controls whether this whole block is included in the resolved document. Hidden blocks are removed before measurement and pagination, so they leave no blank space."
      />
    </div>
  );
}

function TableEditor({ block, onChange, collections, mappings, sourceFields, fieldBindings }: { block: TableBlock; onChange: (block: TemplateBlock | RowChildBlock) => void; collections: CollectionBinding[]; mappings: MappingDefinition[]; sourceFields: string[]; fieldBindings: BindingOption[] }) {
  const tableStyle = block.tableStyle ?? {};
  const collection = collections.find((item) => item.path === block.sourcePath);
  const columnSuggestions = buildTableColumnBindings(mappings, block.sourcePath, sourceFields, collection?.fields ?? []);
  const totalWidth = block.columns.reduce((sum, column) => sum + (column.widthPercent ?? 0), 0);
  const setFooterAggregation = (columnIndex:number, aggregation:FooterAggregationType) => {
    const column=block.columns[columnIndex]!;
    const updatedColumns=block.columns.map((c,i)=>i===columnIndex?{...c,footerAggregation:aggregation}:c);
    const footerRows=[...(block.footerRows ?? [])];
    const row=footerRows[0] ?? {id:makeId('foot-row'),cells:[],style:{fontFamily:'Arial' as const,fontSize:10,bold:true,textColor:'#111827'}};
    const existingIndex=row.cells.findIndex(c=>c.columnId===column.id);
    const value:AggregateValueDefinition = aggregation==='BLANK'
      ? {operation:'STATIC',staticValue:''}
      : aggregation==='CUSTOM_LABEL'
        ? {operation:'STATIC',staticValue:column.footerCustomLabel ?? column.label}
        : {operation:aggregation,path:column.path,sourceField:column.sourceField,targetPath:column.targetPath,decimals:2,format:'NUMBER'};
    const nextCell={id:existingIndex>=0?row.cells[existingIndex]!.id:makeId('foot-cell'),columnId:column.id,value,alignment:aggregation==='CUSTOM_LABEL'?'LEFT' as const:'RIGHT' as const};
    const cells=existingIndex>=0?row.cells.map((c,i)=>i===existingIndex?nextCell:c):[...row.cells,nextCell];
    const nextRow={...row,cells};
    if(footerRows.length) footerRows[0]=nextRow; else footerRows.push(nextRow);
    onChange({...block,columns:updatedColumns,footerRows});
  };
  return (
    <>
      <PathInput label="Source Path" value={block.sourcePath} options={collections.map((item) => ({ value: item.path, label: item.label }))} onChange={(sourcePath) => onChange({ ...block, sourcePath })}/>
      <Section title="Table Visibility">
        <div className="control-grid">
          <label className="checkbox-label"><input type="checkbox" checked={tableStyle.showHeader ?? true} onChange={(event) => onChange({ ...block, tableStyle: { ...tableStyle, showHeader: event.target.checked } })}/> Show Header</label>
          <label className="checkbox-label"><input type="checkbox" checked={tableStyle.showBorder ?? true} onChange={(event) => onChange({ ...block, tableStyle: { ...tableStyle, showBorder: event.target.checked } })}/> Show Border</label>
        </div>
        <p className="property-help">Header and border are independent. Turning Border off keeps widths, padding, alignment and footer totals unchanged.</p>
      </Section>
      <VisibilityRuleEditor value={block.rowFilter} onChange={(rowFilter)=>onChange({...block,rowFilter})} options={columnSuggestions} title="Row Filter" help="Filters only this table's rows. Hidden rows are excluded before footer totals are calculated; source data remains unchanged and reusable elsewhere." pathLabel="Row Field Path" scopeHelp="No filter means every source row is included. Row filters evaluate each row independently before table totals and pagination."/>
      <Section title="Layout"><WidthAlign value={{ widthPercent: tableStyle.widthPercent ?? block.layout?.widthPercent, alignment: tableStyle.alignment ?? block.layout?.alignment }} onChange={(value) => onChange({ ...block, tableStyle: { ...tableStyle, ...value } })}/></Section>
      <Section title="Header Style"><TextControls value={tableStyle.headerStyle} onChange={(headerStyle) => onChange({ ...block, tableStyle: { ...tableStyle, headerStyle } })}/></Section>
      <Section title="Cell Style"><TextControls value={tableStyle.cellStyle} onChange={(cellStyle) => onChange({ ...block, tableStyle: { ...tableStyle, cellStyle } })}/><PaddingControls value={tableStyle.cellPadding} onChange={(cellPadding) => onChange({ ...block, tableStyle: { ...tableStyle, cellPadding } })}/></Section>
      <Section title="Border">
        <div className="control-grid">
          <label>Style<select value={tableStyle.border?.style ?? 'SOLID'} onChange={(event) => onChange({ ...block, tableStyle: { ...tableStyle, border: { ...tableStyle.border, style: event.target.value as 'NONE'|'SOLID'|'DASHED' } } })}><option>NONE</option><option>SOLID</option><option>DASHED</option></select></label>
          <label>Width<input type="number" min={0} step="0.5" value={tableStyle.border?.width ?? 1} onChange={(event) => onChange({ ...block, tableStyle: { ...tableStyle, border: { ...tableStyle.border, width: +event.target.value } } })}/></label>
          <ColorControl label="Color" value={tableStyle.border?.color ?? '#CBD5E1'} onChange={(color) => onChange({ ...block, tableStyle: { ...tableStyle, border: { ...tableStyle.border, color } } })}/>
        </div>
      </Section>
      <Section title={`Columns · explicit width ${totalWidth}%`}>
        <p className="property-help">All imported Excel/CSV headers are available here. Generate → Source Column / Target Path mappings are shown first. Table cells use the mapped path when present and safely fall back to the original imported source column.</p>
        {totalWidth > 100 && <div className="inline-validation-error">Column widths exceed 100%.</div>}
        {block.columns.length >= 8 && <div className="inline-validation-warning">Dense table: verify narrow columns in Preview. Text wraps by word and numeric cells stay on one line; increase width for long headers/values.</div>}
        {block.columns.map((column, index) => (
          <div className="table-column-card" key={column.id}>
            <div className="control-grid">
              <label>Label<input value={column.label} onChange={(event) => patchCol(block, onChange, index, { label: event.target.value })}/></label>
              <label>Column Type<select value={column.kind ?? 'SOURCE'} onChange={(event)=>patchCol(block,onChange,index,{kind:event.target.value as TableColumnKind})}><option value="SOURCE">Source Field</option><option value="FORMULA">Formula</option><option value="STATIC_TEXT">Static Text</option><option value="IMAGE">Row Image</option><option value="ROW_NUMBER">Row Number</option><option value="QR">QR Code</option></select></label>
              <label>Width %<input type="number" min={1} max={100} value={column.widthPercent ?? ''} placeholder="Auto" onChange={(event) => patchCol(block, onChange, index, { widthPercent: event.target.value === '' ? undefined : +event.target.value })}/></label>
              <label>Cell Alignment<select value={column.alignment ?? 'LEFT'} onChange={(event) => patchCol(block, onChange, index, { alignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
              <label>Header Alignment<select value={column.headerAlignment ?? column.alignment ?? 'LEFT'} onChange={(event) => patchCol(block, onChange, index, { headerAlignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
              <label>Footer Aggregation<select value={column.footerAggregation ?? 'BLANK'} onChange={(event)=>setFooterAggregation(index,event.target.value as FooterAggregationType)}><option value="BLANK">BLANK</option><option value="SUM">SUM</option><option value="AVG">AVG</option><option value="COUNT">COUNT</option><option value="CUSTOM_LABEL">CUSTOM LABEL</option></select></label>
            </div>
            {(['SOURCE','IMAGE','QR'] as TableColumnKind[]).includes(column.kind ?? 'SOURCE') && <PathInput label={column.kind==='IMAGE'?'Image Source Path':column.kind==='QR'?'QR Value Path':'Path'} value={column.path} options={columnSuggestions} onChange={(path) => patchCol(block, onChange, index, { path })} onSelect={(option) => patchCol(block, onChange, index, { path: option.value, sourceField: option.sourceField, targetPath: option.targetPath })}/>} 
            {(column.kind ?? 'SOURCE')==='STATIC_TEXT' && <label>Static Value<input value={String(column.staticValue ?? '')} onChange={(event)=>patchCol(block,onChange,index,{staticValue:event.target.value})}/></label>}
            {(column.kind ?? 'SOURCE')==='FORMULA' && <FormulaBuilder value={{operation:'FORMULA',expression:column.formulaExpression ?? '',formulaBindings:column.formulaBindings ?? [],format:'NUMBER'}} options={columnSuggestions} onChange={(value)=>patchCol(block,onChange,index,{formulaExpression:value.expression,formulaBindings:value.formulaBindings})}/>} 
            {!['IMAGE','QR'].includes(column.kind ?? 'SOURCE') && <DisplayFormatEditor value={column.format} onChange={(format)=>patchCol(block,onChange,index,{format})}/>} 
            {(column.kind==='IMAGE'||column.kind==='QR') && <div className="control-grid"><label>Visual Width (mm)<input type="number" min={5} value={column.imageWidthMm ?? column.qr?.widthMm ?? 18} onChange={(event)=>patchCol(block,onChange,index,{imageWidthMm:+event.target.value,qr:column.kind==='QR'?{...column.qr,widthMm:+event.target.value}:column.qr})}/></label><label>Visual Height (mm)<input type="number" min={5} value={column.imageHeightMm ?? column.qr?.heightMm ?? column.imageWidthMm ?? 18} onChange={(event)=>patchCol(block,onChange,index,{imageHeightMm:+event.target.value,qr:column.kind==='QR'?{...column.qr,heightMm:+event.target.value}:column.qr})}/></label>{column.kind==='QR'&&<label>QR Error Correction<select value={column.qr?.errorCorrection ?? 'M'} onChange={(event)=>patchCol(block,onChange,index,{qr:{...column.qr,errorCorrection:event.target.value as 'L'|'M'|'Q'|'H'}})}><option>L</option><option>M</option><option>Q</option><option>H</option></select></label>}</div>}
            <VisibilityRuleEditor value={column.visibility} onChange={(visibility)=>patchCol(block,onChange,index,{visibility})} options={columnSuggestions} title="Conditional Column Visibility" help="The whole column is included or removed for the document before table widths, totals and pagination are resolved."/>
            <button className="column-remove" onClick={() => onChange({ ...block, columns: block.columns.filter((_, itemIndex) => itemIndex !== index) })}>Remove Column</button>
          </div>
        ))}
        <button className="add-column-button" onClick={() => onChange({ ...block, columns: [...block.columns, { id: makeId('col'), label: 'Column', path: columnSuggestions[0]?.value ?? 'field', alignment: 'LEFT' }] })}>+ Add Column</button>
      </Section>
      <Section title="Grouped Header / colSpan">
        <p className="property-help">Create an optional header cell spanning consecutive Data Table columns, e.g. Tax Details over CGST + SGST + IGST. Dynamic body rowSpan is intentionally not enabled because cross-page row merging needs a separate page-aware design.</p>
        {(block.headerGroups ?? []).map((group,index)=><div className="table-column-card" key={group.id}><div className="control-grid"><label>Label<input value={group.label} onChange={(event)=>onChange({...block,headerGroups:(block.headerGroups ?? []).map((g,i)=>i===index?{...g,label:event.target.value}:g)})}/></label><label>Start Column<select value={group.startColumnId} onChange={(event)=>onChange({...block,headerGroups:(block.headerGroups ?? []).map((g,i)=>i===index?{...g,startColumnId:event.target.value}:g)})}>{block.columns.map(column=><option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label>ColSpan<input type="number" min={1} max={Math.max(1,block.columns.length)} value={group.colspan} onChange={(event)=>onChange({...block,headerGroups:(block.headerGroups ?? []).map((g,i)=>i===index?{...g,colspan:+event.target.value}:g)})}/></label></div><button className="column-remove" onClick={()=>onChange({...block,headerGroups:(block.headerGroups ?? []).filter((_,i)=>i!==index)})}>Remove Header Group</button></div>)}
        <button className="add-column-button" disabled={!block.columns.length} onClick={()=>onChange({...block,headerGroups:[...(block.headerGroups ?? []),{id:makeId('head-group'),label:'Group Header',startColumnId:block.columns[0]?.id ?? '',colspan:Math.min(2,block.columns.length),alignment:'CENTER'}]})}>+ Add Header Group</button>
      </Section>
      <Section title="Footer / Total Rows">
        <p className="property-help">Add static labels or SUM / COUNT / AVG / MIN / MAX calculations below item rows.</p>
        {(block.footerRows ?? []).map((row,rowIndex)=><div className="table-column-card" key={row.id}>
          <div className="row-column-heading"><strong>Total Row {rowIndex+1}</strong><button className="column-remove" onClick={()=>onChange({...block,footerRows:(block.footerRows ?? []).filter((_,i)=>i!==rowIndex)})}>Remove</button></div>
          {row.cells.map((cell,cellIndex)=><div key={cell.id} className="summary-value-editor">
            <div className="control-grid">
              <label>Column<select value={cell.columnId ?? block.columns[0]?.id ?? ''} onChange={(e)=>onChange({...block,footerRows:(block.footerRows ?? []).map((r,ri)=>ri===rowIndex?{...r,cells:r.cells.map((c,ci)=>ci===cellIndex?{...c,columnId:e.target.value}:c)}:r)})}>{block.columns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <label>Colspan<input type="number" min={1} max={Math.max(1,block.columns.length)} value={cell.colspan ?? 1} onChange={(e)=>onChange({...block,footerRows:(block.footerRows ?? []).map((r,ri)=>ri===rowIndex?{...r,cells:r.cells.map((c,ci)=>ci===cellIndex?{...c,colspan:+e.target.value}:c)}:r)})}/></label>
            </div>
            <AggregateCellEditor label="Footer Value" value={cell.value} fieldOptions={fieldBindings} rowPathOptions={columnSuggestions} onChange={(value)=>onChange({...block,footerRows:(block.footerRows ?? []).map((r,ri)=>ri===rowIndex?{...r,cells:r.cells.map((c,ci)=>ci===cellIndex?{...c,value}:c)}:r)})}/>
            <button className="column-remove" onClick={()=>onChange({...block,footerRows:(block.footerRows ?? []).map((r,ri)=>ri===rowIndex?{...r,cells:r.cells.filter((_,ci)=>ci!==cellIndex)}:r)})}>Remove Cell</button>
          </div>)}
          <button className="add-column-button" onClick={()=>onChange({...block,footerRows:(block.footerRows ?? []).map((r,ri)=>ri===rowIndex?{...r,cells:[...r.cells,{id:makeId('foot-cell'),columnId:block.columns[0]?.id,value:{operation:'STATIC',staticValue:'Total'}}]}:r)})}>+ Add Footer Cell</button>
        </div>)}
        <button className="add-column-button" onClick={()=>onChange({...block,footerRows:[...(block.footerRows ?? []),{id:makeId('foot-row'),cells:[{id:makeId('foot-cell'),columnId:block.columns[0]?.id,value:{operation:'STATIC',staticValue:'Total'}},{id:makeId('foot-cell'),columnId:block.columns[block.columns.length - 1]?.id,value:{operation:'SUM',path:block.columns[block.columns.length - 1]?.path ?? 'qty',decimals:2},alignment:'RIGHT'}],style:{fontFamily:'Arial',fontSize:10,bold:true,textColor:'#111827'}}]})}>+ Add Total Row</button>
      </Section>
      
    </>
  );
}


function SummaryTableEditor({ block, onChange, fieldBindings, collections, mappings, sourceFields }: { block: SummaryTableBlock; onChange: (block: TemplateBlock | RowChildBlock) => void; fieldBindings: BindingOption[]; collections: CollectionBinding[]; mappings: MappingDefinition[]; sourceFields: string[] }) {
  const style = block.tableStyle ?? {};
  const sourceOptions = collections.map((item) => ({ value:item.path, label:item.label }));
  const selectedCollection = collections.find((item) => item.path === block.sourcePath);
  const rowPathOptions = buildTableColumnBindings(mappings, block.sourcePath ?? 'items', sourceFields, selectedCollection?.fields ?? []);
  const patchRow = (rowIndex:number, row:SummaryRowDefinition) => onChange({ ...block, rows:(block.rows ?? []).map((item,index)=>index===rowIndex?row:item) });
  return <>
    <div className="summary-preset-actions"><span>Quick preset:</span><button type="button" onClick={()=>onChange(makeAmountSummaryPreset(block,mappings))}>Amount Summary</button><button type="button" onClick={()=>onChange(makeTaxSummaryPreset(block))}>Tax Summary</button>{mappings.some(m=>m.role==='SUMMARY_FIELD') && <button type="button" onClick={()=>onChange(makeMappedSummaryPreset(block,mappings))}>Mapped Summary Fields</button>}</div>
    <label>Title<input value={block.title ?? ''} onChange={(e)=>onChange({...block,title:e.target.value})}/></label>
    <div className="control-grid">
      <label>Mode<select value={block.dataMode ?? 'MANUAL'} onChange={(e)=>onChange({...block,dataMode:e.target.value as 'MANUAL'|'GROUP_BY'})}><option>MANUAL</option><option>GROUP_BY</option></select></label>
    </div>
    <Section title="Table Visibility">
      <div className="control-grid">
        <label className="checkbox-label"><input type="checkbox" checked={block.showHeader ?? style.showHeader ?? true} onChange={(e)=>onChange({...block,showHeader:e.target.checked,tableStyle:{...style,showHeader:e.target.checked}})}/> Show Header</label>
        <label className="checkbox-label"><input type="checkbox" checked={style.showBorder ?? true} onChange={(e)=>onChange({...block,tableStyle:{...style,showBorder:e.target.checked}})}/> Show Border</label>
      </div>
      <p className="property-help">Header and border can be switched independently. Existing Summary presets that intentionally hide headers remain backward-compatible.</p>
    </Section>
    <PathInput label="Source Path" value={block.sourcePath ?? 'items'} options={sourceOptions} onChange={(sourcePath)=>onChange({...block,sourcePath})}/>
    {block.dataMode === 'GROUP_BY' && <PathInput label="Group By Path" value={block.groupByPath ?? ''} options={rowPathOptions} onChange={(groupByPath)=>onChange({...block,groupByPath})}/>} 
    <Section title="Layout"><WidthAlign value={{widthPercent:style.widthPercent ?? block.layout?.widthPercent,alignment:style.alignment ?? block.layout?.alignment}} onChange={(value)=>onChange({...block,tableStyle:{...style,...value}})}/></Section>
    <Section title="Columns">
      {block.columns.map((col,index)=><div key={col.id} className="table-column-card"><div className="control-grid">
        <label>Label<input value={col.label} onChange={(e)=>onChange({...block,columns:block.columns.map((c,i)=>i===index?{...c,label:e.target.value}:c)})}/></label>
        <label>Width %<input type="number" min={1} max={100} value={col.widthPercent ?? ''} placeholder="Auto" onChange={(e)=>onChange({...block,columns:block.columns.map((c,i)=>i===index?{...c,widthPercent:e.target.value?+e.target.value:undefined}:c)})}/></label>
        <label>Alignment<select value={col.alignment ?? 'LEFT'} onChange={(e)=>onChange({...block,columns:block.columns.map((c,i)=>i===index?{...c,alignment:e.target.value as Alignment}:c)})}>{ALIGNMENTS.map(a=><option key={a}>{a}</option>)}</select></label>
      </div><button className="column-remove" onClick={()=>onChange({...block,columns:block.columns.filter((_,i)=>i!==index)})}>Remove Column</button></div>)}
      <button className="add-column-button" onClick={()=>onChange({...block,columns:[...block.columns,{id:makeId('sum-col'),label:'Column',alignment:'RIGHT'}]})}>+ Add Column</button>
    </Section>
    <Section title="Summary Rows">
      {(block.rows ?? []).map((row,rowIndex)=><div className="table-column-card summary-row-editor" key={row.id}>
        <div className="row-column-heading"><strong>Row {rowIndex+1}</strong><button className="column-remove" onClick={()=>onChange({...block,rows:(block.rows ?? []).filter((_,i)=>i!==rowIndex)})}>Remove</button></div>
        <details className="summary-row-style-details">
          <summary>Row Style {row.style?.fontSize ? `• ${row.style.fontSize} pt` : '• Table default'}</summary>
          <TextControls value={row.style} onChange={(rowStyle)=>patchRow(rowIndex,{...row,style:rowStyle,backgroundColor:rowStyle.backgroundColor ?? row.backgroundColor,bold:rowStyle.bold ?? row.bold})}/>
          <p className="property-help">Overrides this summary row only. Cell-level style, when configured, has higher priority than row style.</p>
        </details>
        {block.columns.map((col)=><AggregateCellEditor key={col.id} label={col.label} value={row.cells.find(c=>c.columnId===col.id)?.value} fieldOptions={fieldBindings} rowPathOptions={rowPathOptions} onChange={(value)=>{
          const existing=row.cells.find(c=>c.columnId===col.id);
          const cells=existing?row.cells.map(c=>c.columnId===col.id?{...c,value}:c):[...row.cells,{id:makeId('sum-cell'),columnId:col.id,value}];
          patchRow(rowIndex,{...row,cells});
        }}/>) }
      </div>)}
      <button className="add-column-button" onClick={()=>onChange({...block,rows:[...(block.rows ?? []),createAutoSummaryRow(block.columns,rowPathOptions)]})}>+ Add Summary Row</button>
    </Section>
    <Section title="Total Row">
      <label className="checkbox-label"><input type="checkbox" checked={!!block.totalRow} onChange={(e)=>onChange({...block,totalRow:e.target.checked?{id:makeId('sum-total'),bold:true,cells:block.columns.map((col,index)=>({id:makeId('sum-cell'),columnId:col.id,value:{operation:'STATIC',staticValue:index===0?'TOTAL':''}}))}:undefined})}/> Enable Total Row</label>
      {block.totalRow && <>
        <details className="summary-row-style-details">
          <summary>Total Row Style {block.totalRow.style?.fontSize ? `• ${block.totalRow.style.fontSize} pt` : '• Table default'}</summary>
          <TextControls value={block.totalRow.style} onChange={(rowStyle)=>onChange({...block,totalRow:{...block.totalRow!,style:rowStyle,backgroundColor:rowStyle.backgroundColor ?? block.totalRow!.backgroundColor,bold:rowStyle.bold ?? block.totalRow!.bold}})}/>
          <p className="property-help">Use this to emphasize the total independently from normal summary rows.</p>
        </details>
        {block.columns.map((col)=><AggregateCellEditor key={col.id} label={col.label} value={block.totalRow!.cells.find(c=>c.columnId===col.id)?.value} fieldOptions={fieldBindings} rowPathOptions={rowPathOptions} onChange={(value)=>{
          const total=block.totalRow!; const existing=total.cells.find(c=>c.columnId===col.id); const cells=existing?total.cells.map(c=>c.columnId===col.id?{...c,value}:c):[...total.cells,{id:makeId('sum-cell'),columnId:col.id,value}]; onChange({...block,totalRow:{...total,cells}});
        }}/>) }
      </>}
    </Section>
    <Section title="Style"><TextControls value={style.cellStyle} onChange={(cellStyle)=>onChange({...block,tableStyle:{...style,cellStyle}})}/><PaddingControls value={style.cellPadding} onChange={(cellPadding)=>onChange({...block,tableStyle:{...style,cellPadding}})}/></Section>
  </>;
}


function createAutoSummaryRow(columns: SummaryTableBlock['columns'], options: BindingOption[]): SummaryRowDefinition {
  const preferred = options.find((option) => option.role === 'SUMMARY_FIELD') ?? options[0];
  return {
    id: makeId('sum-row'),
    cells: columns.map((column, index) => {
      if (index === 0) {
        return { id: makeId('sum-cell'), columnId: column.id, value: { operation: 'STATIC', staticValue: preferred?.label ?? 'Label' } };
      }
      if (index === 1 && preferred) {
        return {
          id: makeId('sum-cell'),
          columnId: column.id,
          value: {
            operation: preferred.summaryAggregation ?? 'SUM',
            path: preferred.targetPath ?? preferred.value,
            sourceField: preferred.sourceField,
            targetPath: preferred.targetPath ?? preferred.value,
            decimals: 2,
            format: 'NUMBER',
          },
          alignment: 'RIGHT' as Alignment,
        };
      }
      return { id: makeId('sum-cell'), columnId: column.id, value: { operation: 'STATIC', staticValue: '' } };
    }),
  };
}

function makeMappedSummaryPreset(block: SummaryTableBlock, mappings: MappingDefinition[]): SummaryTableBlock {
  const summaryMappings = mappings.filter((m)=>m.role==='SUMMARY_FIELD' && m.sourceField && m.targetPath);
  const l=makeId('sum-col'), v=makeId('sum-col');
  const rows:SummaryRowDefinition[] = summaryMappings.map((m)=>({id:makeId('sum-row'),cells:[
    {id:makeId('sum-cell'),columnId:l,value:{operation:'STATIC',staticValue:m.sourceField!}},
    {id:makeId('sum-cell'),columnId:v,value:{operation:(m.summaryAggregation ?? 'SUM'),path:m.targetPath!,sourceField:m.sourceField,targetPath:m.targetPath,decimals:2,format:'NUMBER'},alignment:'RIGHT'}
  ]}));
  return {...block,title:'Mapped Summary',dataMode:'MANUAL',sourcePath:block.sourcePath ?? 'items',showHeader:false,columns:[{id:l,label:'Label',widthPercent:65,alignment:'LEFT'},{id:v,label:'Value',widthPercent:35,alignment:'RIGHT'}],rows,totalRow:undefined,tableStyle:{...block.tableStyle,widthPercent:block.tableStyle?.widthPercent ?? 45,alignment:block.tableStyle?.alignment ?? 'RIGHT'}};
}

function makeAmountSummaryPreset(block: SummaryTableBlock, mappings: MappingDefinition[]): SummaryTableBlock {
  const l=makeId('sum-col'), v=makeId('sum-col');
  const usable = mappings.filter((m)=>m.role !== 'IGNORE' && m.sourceField && m.targetPath);
  const find = (patterns: RegExp[]) => usable.find((m)=>patterns.some((pattern)=>pattern.test(m.sourceField!)));
  const dynamicRow=(label:string, mapping:MappingDefinition, operation:AggregateValueDefinition['operation'] = mapping.summaryAggregation ?? 'SUM'):SummaryRowDefinition=>({
    id:makeId('sum-row'),cells:[
      {id:makeId('sum-cell'),columnId:l,value:{operation:'STATIC',staticValue:label}},
      {id:makeId('sum-cell'),columnId:v,value:{operation,path:mapping.targetPath!,sourceField:mapping.sourceField,targetPath:mapping.targetPath,decimals:2,format:'NUMBER'},alignment:'RIGHT'}
    ]
  });
  const candidates:Array<[string, MappingDefinition|undefined]> = [
    ['GST', find([/total\s*(gst|tax)/i,/gst\s*amount/i])],
    ['Net Amount', find([/net\s*amount/i,/taxable\s*value/i])],
    ['TCS', find([/\btcs\b/i])],
    ['Freight', find([/freight/i])],
    ['Round Off (+/-)', find([/round\s*off/i])],
  ];
  const rows = candidates.flatMap(([label,mapping])=>mapping?[dynamicRow(label,mapping)]:[]);
  const finalMapping = find([/final\s*amount/i,/grand\s*total/i,/total\s*amount\s*to\s*pay/i]);
  return {
    ...block,title:'Amount Summary',dataMode:'MANUAL',sourcePath:'items',showHeader:false,
    columns:[{id:l,label:'Label',widthPercent:65,alignment:'LEFT'},{id:v,label:'Value',widthPercent:35,alignment:'RIGHT'}],
    rows,
    totalRow:finalMapping?{...dynamicRow('TOTAL AMOUNT TO PAY',finalMapping),bold:true}:undefined,
    tableStyle:{...block.tableStyle,widthPercent:block.tableStyle?.widthPercent ?? 45,alignment:block.tableStyle?.alignment ?? 'RIGHT'}
  };
}
function makeTaxSummaryPreset(block: SummaryTableBlock): SummaryTableBlock {
  const defs=[['hsn','HSN','LEFT'],['gst','GST','CENTER'],['taxable','Taxable Amt.','RIGHT'],['sgst','SGST','RIGHT'],['cgst','CGST','RIGHT'],['igst','IGST','RIGHT'],['total','Total','RIGHT']] as const;
  const columns=defs.map(([key,label,alignment])=>({id:`tax-${key}-${makeId('c')}`,label,widthPercent:key==='hsn'?18:key==='taxable'?20:12,alignment:alignment as Alignment}));
  const by=(key:string)=>columns.find(c=>c.id.includes(`tax-${key}-`))!.id;
  return {...block,title:'Tax Summary',dataMode:'GROUP_BY',sourcePath:block.sourcePath ?? 'items',groupByPath:'hsn',showHeader:true,columns,rows:[{id:makeId('tax-row'),cells:[
    {id:makeId('cell'),columnId:by('hsn'),value:{operation:'FIELD',path:'groupKey'}},
    {id:makeId('cell'),columnId:by('gst'),value:{operation:'FIELD',path:'current.gstRate'}},
    {id:makeId('cell'),columnId:by('taxable'),value:{operation:'SUM',path:'taxable',decimals:2}},
    {id:makeId('cell'),columnId:by('sgst'),value:{operation:'SUM',path:'sgst',decimals:2}},
    {id:makeId('cell'),columnId:by('cgst'),value:{operation:'SUM',path:'cgst',decimals:2}},
    {id:makeId('cell'),columnId:by('igst'),value:{operation:'SUM',path:'igst',decimals:2}},
    {id:makeId('cell'),columnId:by('total'),value:{operation:'SUM',path:'taxAmount',decimals:2}},
  ]}],totalRow:{id:makeId('tax-total'),bold:true,cells:[
    {id:makeId('cell'),columnId:by('hsn'),value:{operation:'STATIC',staticValue:'Total'}},
    {id:makeId('cell'),columnId:by('taxable'),value:{operation:'SUM',path:'taxable',decimals:2}},
    {id:makeId('cell'),columnId:by('sgst'),value:{operation:'SUM',path:'sgst',decimals:2}},
    {id:makeId('cell'),columnId:by('cgst'),value:{operation:'SUM',path:'cgst',decimals:2}},
    {id:makeId('cell'),columnId:by('igst'),value:{operation:'SUM',path:'igst',decimals:2}},
    {id:makeId('cell'),columnId:by('total'),value:{operation:'SUM',path:'taxAmount',decimals:2}},
  ]},tableStyle:{...block.tableStyle,widthPercent:block.tableStyle?.widthPercent ?? 70,alignment:block.tableStyle?.alignment ?? 'RIGHT'}};
}

function normalizeAlias(value:string,fallback='view'):string {
  const clean=value.trim().replace(/[^A-Za-z0-9_]+/g,'_').replace(/^([^A-Za-z_])/,'_$1').replace(/_+/g,'_');
  return clean || fallback;
}

function DataViewsEditor({value,onChange,collections}:{value:DataViewDefinition[];onChange:(value:DataViewDefinition[])=>void;collections:CollectionBinding[]}) {
  const add=()=>{const index=value.length+1;const sourcePath=selectDefaultCollectionPath(collections);onChange([...value,{id:makeId('data-view'),name:`Data View ${index}`,alias:`view_${index}`,sourcePath}]);};
  const patch=(index:number,next:Partial<DataViewDefinition>)=>onChange(value.map((item,i)=>i===index?{...item,...next}:item));
  return <details className="page-style-details"><summary>Data Views / Filtered Collections ({value.length})</summary>
    <p className="property-help">Create reusable row subsets without deleting source rows. Views are available everywhere as <code>views.alias</code>.</p>
    <button type="button" className="add-column-button" onClick={add}>+ Data View</button>
    {value.map((view,index)=>{const selected=collections.find((item)=>item.path===view.sourcePath);const rowOptions=selected?.fields ?? [];return <div key={view.id} className="table-column-card">
      <div className="control-grid"><label>Name<input value={view.name} onChange={e=>patch(index,{name:e.target.value})}/></label><label>Alias<input value={view.alias} onChange={e=>patch(index,{alias:normalizeAlias(e.target.value,`view_${index+1}`)})}/></label></div>
      <PathInput label="Source Collection" value={view.sourcePath} options={collections.map((item)=>({value:item.path,label:item.label}))} onChange={(sourcePath)=>patch(index,{sourcePath,filter:undefined})}/>
      <DataViewFilterEditor value={view.filter} onChange={(filter)=>patch(index,{filter})} options={rowOptions}/>
      <div className="template-small-actions"><button type="button" className="column-remove" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove Data View</button></div>
      <p className="property-help">Resolved path: <strong>views.{view.alias}</strong></p>
    </div>;})}
  </details>;
}

function dataViewFieldType(options:BindingOption[], path:string):FilterFieldType|undefined {
  return options.find((option)=>option.value===path)?.dataType;
}

function operatorLabel(operator:ConditionOperator):string {
  if(operator==='NOT_EMPTY') return 'IS_NOT_EMPTY';
  if(operator==='GREATER_OR_EQUAL') return 'GREATER_THAN_OR_EQUAL';
  if(operator==='LESS_OR_EQUAL') return 'LESS_THAN_OR_EQUAL';
  return operator;
}

function DataViewCompareValue({condition,type,onChange}:{condition:VisibilityCondition;type:FilterFieldType|undefined;onChange:(next:Partial<VisibilityCondition>)=>void}) {
  if(CONDITION_NO_VALUE.has(condition.operator)) return null;
  if(condition.operator==='IN') return <label>Values (comma separated)<input value={(condition.values ?? []).join(', ')} onChange={(e)=>onChange({values:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})}/></label>;
  if(type==='boolean') return <label>Compare Value<select value={String(condition.value ?? false)} onChange={(e)=>onChange({value:e.target.value==='true'})}><option value="true">True</option><option value="false">False</option></select></label>;
  if(type==='number') return <label>Compare Value<input type="number" value={String(condition.value ?? '')} onChange={(e)=>onChange({value:coerceFilterValue(e.target.value,type)})}/></label>;
  if(type==='date') return <label>Compare Value<input type="date" value={String(condition.value ?? '')} onChange={(e)=>onChange({value:e.target.value})}/></label>;
  if(type==='datetime') return <label>Compare Value<input type="datetime-local" value={String(condition.value ?? '')} onChange={(e)=>onChange({value:e.target.value})}/></label>;
  return <label>Compare Value<input value={String(condition.value ?? '')} onChange={(e)=>onChange({value:e.target.value})}/></label>;
}

function DataViewConditionEditor({condition,onChange,options}:{condition:VisibilityCondition;onChange:(next:VisibilityCondition)=>void;options:BindingOption[]}) {
  const type=dataViewFieldType(options,condition.path);
  const typedOperators=operatorsForFilterType(type);
  const operators=typedOperators.includes(condition.operator) ? typedOperators : [...typedOperators,condition.operator];
  const patch=(next:Partial<VisibilityCondition>)=>onChange({...condition,...next});
  const selectField=(path:string)=>{
    const nextType=dataViewFieldType(options,path);
    const allowed=operatorsForFilterType(nextType);
    const nextOperator=allowed.includes(condition.operator)?condition.operator:allowed[0] ?? 'EQUALS';
    const nextValue=nextType==='boolean' ? false : '';
    onChange({path,operator:nextOperator,value:CONDITION_NO_VALUE.has(nextOperator)?undefined:nextValue});
  };
  return <>
    <PathInput label="Field" value={condition.path} options={options} onChange={selectField}/>
    <div className="control-grid">
      <label>Operator<select value={condition.operator} onChange={(e)=>{const operator=e.target.value as ConditionOperator;patch({operator,value:CONDITION_NO_VALUE.has(operator)?undefined:condition.value});}}>{operators.map(op=><option key={op} value={op}>{operatorLabel(op)}</option>)}</select></label>
      <DataViewCompareValue condition={condition} type={type} onChange={patch}/>
    </div>
    {type&&<p className="property-help">Detected field type: <strong>{type}</strong>{options.find((option)=>option.value===condition.path)?.rawSource?' • filtering the aligned imported source row':''}.</p>}
  </>;
}

function DataViewFilterEditor({value,onChange,options}:{value?:VisibilityRule;onChange:(value:VisibilityRule|undefined)=>void;options:BindingOption[]}) {
  const makeCondition=(base?:VisibilityCondition):VisibilityCondition=>{
    const path=base?.path ?? options[0]?.value ?? '';
    const type=dataViewFieldType(options,path);
    const operator=base?.operator ?? operatorsForFilterType(type)[0] ?? 'EQUALS';
    return {path:path || 'field',operator,value:type==='boolean'?false:''};
  };
  if(value && !('path' in value)) return <DataViewRuleGroupEditor value={value} onChange={onChange} options={options}/>;
  const condition=value && 'path' in value ? value : makeCondition();
  return <Section title="Data View Filter">
    <div className="table-column-card visibility-rule-card">
      <DataViewConditionEditor condition={condition} onChange={(next)=>onChange(next)} options={options}/>
      <div className="template-small-actions">
        <button type="button" onClick={()=>onChange({logic:'ALL',conditions:[value&&'path'in value?value:condition,makeCondition()]})}>+ AND Condition</button>
        <button type="button" onClick={()=>onChange({logic:'ANY',conditions:[value&&'path'in value?value:condition,makeCondition()]})}>+ OR Condition</button>
        {value&&<button type="button" className="column-remove" onClick={()=>onChange(undefined)}>Clear Filter</button>}
      </div>
    </div>
    {!options.length&&<p className="property-help">No row fields are available for the selected source collection. Import/map fields first or choose another collection.</p>}
    <p className="property-help">No saved filter includes every source row. Selecting/changing a field, operator or value creates the filter. Imported text, number, boolean and date fields are filterable.</p>
  </Section>;
}

function DataViewRuleGroupEditor({value,onChange,options,depth=0}:{value:Extract<VisibilityRule,{logic:'ALL'|'ANY'}>;onChange:(value:VisibilityRule|undefined)=>void;options:BindingOption[];depth?:number}) {
  const makeCondition=():VisibilityCondition=>{const path=options[0]?.value ?? 'field';const type=dataViewFieldType(options,path);return {path,operator:operatorsForFilterType(type)[0] ?? 'EQUALS',value:type==='boolean'?false:''};};
  const patchChild=(index:number,next:VisibilityRule|undefined)=>onChange({...value,conditions:next?value.conditions.map((child,i)=>i===index?next:child):value.conditions.filter((_,i)=>i!==index)});
  return <Section title={depth===0?'Data View Filter':'Condition Group'}>
    <div className="table-column-card visibility-rule-card visibility-rule-group">
      <div className="control-grid">
        <label>Match<select value={value.logic} onChange={(e)=>onChange({...value,logic:e.target.value as 'ALL'|'ANY'})}><option value="ALL">ALL conditions (AND)</option><option value="ANY">ANY condition (OR)</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={value.negate ?? false} onChange={(e)=>onChange({...value,negate:e.target.checked})}/> Negate Result</label>
      </div>
      {value.conditions.map((child,index)=><div key={index} className="visibility-rule-child">{'path' in child?<div className="table-column-card"><strong>Rule {index+1}</strong><DataViewConditionEditor condition={child} onChange={(next)=>patchChild(index,next)} options={options}/><button type="button" className="column-remove" onClick={()=>patchChild(index,undefined)}>Remove Rule</button></div>:<DataViewRuleGroupEditor value={child} onChange={(next)=>patchChild(index,next)} options={options} depth={depth+1}/>}</div>)}
      <div className="template-small-actions">
        <button type="button" onClick={()=>onChange({...value,conditions:[...value.conditions,makeCondition()]})}>+ Condition</button>
        {depth<2&&<button type="button" onClick={()=>onChange({...value,conditions:[...value.conditions,{logic:'ALL',conditions:[makeCondition()]}]})}>+ Nested Group</button>}
        <button type="button" className="column-remove" onClick={()=>onChange(undefined)}>Clear Filter</button>
      </div>
    </div>
  </Section>;
}

function CalculatedFieldsEditor({value,onChange,fieldBindings,collections}:{value:CalculatedFieldDefinition[];onChange:(value:CalculatedFieldDefinition[])=>void;fieldBindings:BindingOption[];collections:CollectionBinding[]}) {
  const add=()=>{const index=value.length+1;onChange([...value,{id:makeId('calc-field'),name:`Calculated Field ${index}`,alias:`calculated_${index}`,value:{operation:'STATIC',staticValue:0,sourcePath:collections[0]?.path ?? 'items'}}]);};
  const patch=(index:number,next:Partial<CalculatedFieldDefinition>)=>onChange(value.map((item,i)=>i===index?{...item,...next}:item));
  return <details className="page-style-details"><summary>Calculated Fields ({value.length})</summary>
    <p className="property-help">Reusable scalar values resolve once per document and are exposed as <code>calc.alias</code>. Calculations may aggregate raw collections or Data Views.</p>
    <button type="button" className="add-column-button" onClick={add}>+ Calculated Field</button>
    {value.map((field,index)=>{const sourcePath=field.value.sourcePath ?? 'items';const selected=collections.find((item)=>item.path===sourcePath);const rowOptions=dedupeBindings([...(selected?.fields ?? []),...fieldBindings]);return <div key={field.id} className="table-column-card">
      <div className="control-grid"><label>Name<input value={field.name} onChange={e=>patch(index,{name:e.target.value})}/></label><label>Alias<input value={field.alias} onChange={e=>patch(index,{alias:normalizeAlias(e.target.value,`calculated_${index+1}`)})}/></label></div>
      <PathInput label="Calculation Source" value={sourcePath} options={collections.map((item)=>({value:item.path,label:item.label}))} onChange={(nextSource)=>patch(index,{value:{...field.value,sourcePath:nextSource}})}/>
      <AggregateCellEditor label="Calculation" value={field.value} fieldOptions={fieldBindings} rowPathOptions={rowOptions} calculationOnly onChange={(nextValue)=>patch(index,{value:{...nextValue,sourcePath:nextValue.sourcePath ?? sourcePath}})}/><p className="property-help">Calculated fields stay raw for reuse. Apply percentage/currency/date formatting where calc.{field.alias} is displayed.</p>
      <div className="template-small-actions"><button type="button" className="column-remove" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove Calculation</button></div>
      <p className="property-help">Resolved path: <strong>calc.{field.alias}</strong></p>
    </div>;})}
  </details>;
}

function AggregateCellEditor({ label, value, fieldOptions, rowPathOptions, onChange, calculationOnly=false }: { label:string; value?:AggregateValueDefinition; fieldOptions:BindingOption[]; rowPathOptions:BindingOption[]; onChange:(value:AggregateValueDefinition)=>void; calculationOnly?:boolean }) {
  const current=value ?? {operation:'STATIC',staticValue:''};
  const op=current.operation;
  const calculatedOptions=fieldOptions.filter((item)=>item.value.startsWith('calc.'));
  const options=op==='FIELD'?fieldOptions:op==='CALCULATED'?calculatedOptions:rowPathOptions;
  return <div className="summary-value-editor"><strong>{label}</strong><div className="control-grid">
    <label>Value Type<select value={op} onChange={(e)=>(()=>{ const nextOp=e.target.value as AggregateValueDefinition['operation']; const aggregateFirst=rowPathOptions.find((item)=>item.role==='SUMMARY_FIELD') ?? rowPathOptions[0]; const first=nextOp==='CALCULATED'?calculatedOptions[0]:nextOp==='FIELD'?fieldOptions[0]:aggregateFirst; const fallbackPath=nextOp==='CALCULATED'?'':nextOp==='FIELD'?'group.key':'qty'; onChange({operation:nextOp,staticValue:nextOp==='STATIC'?'':'',path:first?.value ?? fallbackPath,sourceField:first?.sourceField,targetPath:first?.targetPath,decimals:2,format:nextOp==='STATIC'?'RAW':'NUMBER'}); })()}><option>STATIC</option><option>FIELD</option><option>CALCULATED</option><option>SUM</option><option>FIRST</option><option>COUNT</option><option>AVG</option><option>MIN</option><option>MAX</option><option>FORMULA</option></select></label>
    {op==='STATIC'?<label>Text / Value<input value={String(current.staticValue ?? '')} onChange={(e)=>onChange({...current,staticValue:e.target.value})}/></label>:op==='FORMULA'?<FormulaBuilder value={current} options={rowPathOptions.length?rowPathOptions:fieldOptions} onChange={onChange}/>:op==='CALCULATED'&&calculatedOptions.length===0?<div className="inline-validation-warning">Create a Calculated Field first. It will appear here as calc.&lt;alias&gt;.</div>:<PathInput label={op==='FIELD'?'Field':op==='CALCULATED'?'Calculated Field':'Item Path'} value={current.path ?? ''} options={options} onChange={(path)=>onChange({...current,path})} onSelect={(option)=>onChange({...current,path:option.value,sourceField:option.sourceField,targetPath:option.targetPath})}/>} 
    {!calculationOnly && ['SUM','AVG','MIN','MAX','FORMULA'].includes(op) && <label>Decimals<input type="number" min={0} max={8} value={current.decimals ?? 2} onChange={(e)=>onChange({...current,decimals:+e.target.value})}/></label>}
    {!calculationOnly && <><label>Format<select value={current.format ?? 'RAW'} onChange={(e)=>onChange({...current,format:e.target.value as 'RAW'|'NUMBER'|'WORDS'})}><option>RAW</option><option>NUMBER</option><option>WORDS</option></select></label>
    <label>Prefix<input value={current.prefix ?? ''} onChange={(e)=>onChange({...current,prefix:e.target.value})}/></label>
    <label>Suffix<input value={current.suffix ?? ''} onChange={(e)=>onChange({...current,suffix:e.target.value})}/></label>
    {current.format!=='WORDS'&&<DisplayFormatEditor value={current.displayFormat} onChange={displayFormat=>onChange({...current,displayFormat})}/>}</>}
  </div></div>;
}



const CONDITION_OPERATORS: ConditionOperator[] = ['EQUALS','NOT_EQUALS','IS_EMPTY','NOT_EMPTY','GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','IN','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH'];
const CONDITION_NO_VALUE = new Set<ConditionOperator>(['IS_EMPTY','NOT_EMPTY']);

function VisibilityRuleEditor({value,onChange,options,title='Conditional Visibility',help,depth=0,pathLabel='Document Field Path',scopeHelp='No rule means always visible. Rules use resolved document data and run before layout/pagination.'}:{value?:VisibilityRule;onChange:(value:VisibilityRule|undefined)=>void;options:BindingOption[];title?:string;help?:string;depth?:number;pathLabel?:string;scopeHelp?:string}) {
  const makeCondition=():VisibilityCondition=>({path:options[0]?.value ?? 'field',operator:'EQUALS',value:''});
  if(!value) return <Section title={title}><button type="button" className="add-column-button" onClick={()=>onChange(makeCondition())}>+ Add Visibility Rule</button>{help&&<p className="property-help">{help}</p>}<p className="property-help">{scopeHelp}</p></Section>;
  if('path' in value){
    const condition=value;
    const patch=(next:Partial<VisibilityCondition>)=>onChange({...condition,...next});
    return <Section title={title}>
      <div className="table-column-card visibility-rule-card">
        <PathInput label={pathLabel} value={condition.path} options={options} onChange={(path)=>patch({path})}/>
        <div className="control-grid">
          <label>Operator<select value={condition.operator} onChange={(e)=>patch({operator:e.target.value as ConditionOperator})}>{CONDITION_OPERATORS.map(op=><option key={op}>{op}</option>)}</select></label>
          {condition.operator==='IN' ? <label>Values (comma separated)<input value={(condition.values ?? []).join(', ')} onChange={(e)=>patch({values:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})}/></label> : !CONDITION_NO_VALUE.has(condition.operator) && <label>Compare Value<input value={String(condition.value ?? '')} onChange={(e)=>patch({value:e.target.value})}/></label>}
          {!['GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','IS_EMPTY','NOT_EMPTY'].includes(condition.operator) && <label className="checkbox-label"><input type="checkbox" checked={condition.caseSensitive ?? false} onChange={(e)=>patch({caseSensitive:e.target.checked})}/> Case Sensitive</label>}
        </div>
        <div className="template-small-actions">
          <button type="button" onClick={()=>onChange({logic:'ALL',conditions:[condition,makeCondition()]})}>+ AND Condition</button>
          <button type="button" onClick={()=>onChange({logic:'ANY',conditions:[condition,makeCondition()]})}>+ OR Condition</button>
          <button type="button" className="column-remove" onClick={()=>onChange(undefined)}>Always Visible</button>
        </div>
      </div>
      {help&&<p className="property-help">{help}</p>}
    </Section>;
  }
  const group=value;
  const patchChild=(index:number,next:VisibilityRule|undefined)=>onChange({...group,conditions:next?group.conditions.map((child,i)=>i===index?next:child):group.conditions.filter((_,i)=>i!==index)});
  return <Section title={title}>
    <div className="table-column-card visibility-rule-card visibility-rule-group">
      <div className="control-grid">
        <label>Match<select value={group.logic} onChange={(e)=>onChange({...group,logic:e.target.value as 'ALL'|'ANY'})}><option value="ALL">ALL conditions (AND)</option><option value="ANY">ANY condition (OR)</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={group.negate ?? false} onChange={(e)=>onChange({...group,negate:e.target.checked})}/> Negate Result</label>
      </div>
      {group.conditions.map((child,index)=><div key={index} className="visibility-rule-child"><VisibilityRuleEditor value={child} onChange={(next)=>patchChild(index,next)} options={options} title={`Rule ${index+1}`} depth={depth+1} pathLabel={pathLabel} scopeHelp={scopeHelp}/></div>)}
      <div className="template-small-actions">
        <button type="button" onClick={()=>onChange({...group,conditions:[...group.conditions,makeCondition()]})}>+ Condition</button>
        {depth<2&&<button type="button" onClick={()=>onChange({...group,conditions:[...group.conditions,{logic:'ALL',conditions:[makeCondition()]}]})}>+ Nested Group</button>}
        <button type="button" className="column-remove" onClick={()=>onChange(undefined)}>Always Visible</button>
      </div>
    </div>
    {help&&<p className="property-help">{help}</p>}
  </Section>;
}

function DisplayFormatEditor({value,onChange}:{value?:DisplayFormatDefinition;onChange:(value:DisplayFormatDefinition|undefined)=>void}) {
  const format=value??{}; const type=format.type??'RAW';
  return <div className="control-grid">
    <label>Display Format<select value={type} onChange={(event)=>{const next=event.target.value as NonNullable<DisplayFormatDefinition['type']>;onChange(next==='RAW'?undefined:{...format,type:next,decimals:(next==='INTEGER'||next==='PERCENT')?0:(format.decimals ?? 2),percentInputMode:next==='PERCENT'?(format.percentInputMode ?? 'FRACTION'):format.percentInputMode});}}>
      <option value="RAW">Raw / As Source</option><option value="NUMBER">Number</option><option value="INTEGER">Integer</option><option value="PERCENT">Percentage</option><option value="CURRENCY">Currency</option><option value="DATE">Date</option><option value="DATETIME">Date & Time</option><option value="BOOLEAN">Boolean</option><option value="CUSTOM">Custom</option>
    </select></label>
    {['NUMBER','PERCENT','CURRENCY'].includes(type)&&<label>Decimals<input type="number" min={0} max={8} value={format.decimals ?? (type==='PERCENT'?0:2)} onChange={(event)=>onChange({...format,decimals:+event.target.value})}/></label>}
    {type==='PERCENT'&&<label>Percentage Source<select value={format.percentInputMode ?? 'FRACTION'} onChange={(event)=>onChange({...format,percentInputMode:event.target.value as 'FRACTION'|'WHOLE'})}><option value="FRACTION">Fraction: 0.18 → 18%</option><option value="WHOLE">Whole: 18 → 18%</option></select></label>}
    {type==='CURRENCY'&&<><label>Currency Code<input value={format.currencyCode ?? 'INR'} onChange={(event)=>onChange({...format,currencyCode:event.target.value.toUpperCase()})}/></label><label>Currency Symbol<input value={format.currencySymbol ?? '₹'} onChange={(event)=>onChange({...format,currencySymbol:event.target.value})}/></label></>}
    {(type==='DATE'||type==='DATETIME')&&<label>Date Style<select value={format.dateStyle ?? 'MEDIUM'} onChange={e=>onChange({...format,dateStyle:e.target.value as any})}><option>SHORT</option><option>MEDIUM</option><option>LONG</option><option>ISO</option></select></label>}
    {type==='BOOLEAN'&&<><label>True Label<input value={format.trueLabel ?? 'Yes'} onChange={e=>onChange({...format,trueLabel:e.target.value})}/></label><label>False Label<input value={format.falseLabel ?? 'No'} onChange={e=>onChange({...format,falseLabel:e.target.value})}/></label></>}
    {type==='CUSTOM'&&<label>Pattern<input value={format.customPattern ?? '{value}'} onChange={e=>onChange({...format,customPattern:e.target.value})} placeholder="Example: Ref: {value}"/></label>}
    {type!=='RAW'&&<><label>Prefix<input value={format.prefix ?? ''} onChange={e=>onChange({...format,prefix:e.target.value})}/></label><label>Suffix<input value={format.suffix ?? ''} onChange={e=>onChange({...format,suffix:e.target.value})}/></label><label>Null Display<input value={format.nullDisplay ?? ''} onChange={e=>onChange({...format,nullDisplay:e.target.value})} placeholder="-"/></label></>}
  </div>;
}

type RichTextTokenSettings = { format?: DisplayFormatDefinition; fallback?: string };
type RichTextComposerValue = { text?: string; fieldTokens?: Record<string, RichTextTokenSettings> };

function RichTextComposer({value,onChange,fieldBindings,rows=7}:{value:RichTextComposerValue;onChange:(next:RichTextComposerValue)=>void;fieldBindings:BindingOption[];rows?:number}) {
  const ref=useRef<HTMLTextAreaElement>(null);
  const text=value.text ?? '';
  const tokens=value.fieldTokens ?? {};
  const bindingGroups=useMemo(()=>groupRichTextBindings(fieldBindings),[fieldBindings]);
  const [field,setField]=useState(fieldBindings[0]?.value ?? '');
  useEffect(()=>{ if(!field && fieldBindings[0]?.value) setField(fieldBindings[0].value); },[field,fieldBindings]);
  const selectedBinding=fieldBindings.find((option)=>option.value===field);
  const insertField=()=>{
    if(!field) return;
    const token=`{{${field}}}`;
    const el=ref.current;
    const start=el?.selectionStart ?? text.length;
    const end=el?.selectionEnd ?? start;
    const nextText=text.slice(0,start)+token+text.slice(end);
    onChange({text:nextText,fieldTokens:{...tokens,[field]:tokens[field]??{}}});
    requestAnimationFrame(()=>{if(ref.current){const pos=start+token.length;ref.current.focus();ref.current.setSelectionRange(pos,pos);}});
  };
  const tokenPaths=Array.from(new Set(Array.from(text.matchAll(/\{\{([^{}\n]+)\}\}/g)).map(m=>m[1]!.trim()).filter(Boolean)));
  return <div className="rich-text-composer">
    <label>Text<textarea ref={ref} rows={rows} value={text} onChange={e=>onChange({text:e.target.value,fieldTokens:tokens})} placeholder={'Static text + {{dynamic.field}}. Press Enter for a new line.'}/></label>
    <div className="control-grid"><label>Insert Dynamic Value<select value={field} onChange={e=>setField(e.target.value)}><option value="">Select value…</option>{bindingGroups.calculated.length>0&&<optgroup label="Calculated Fields">{bindingGroups.calculated.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}{bindingGroups.fields.length>0&&<optgroup label="Source / Document Fields">{bindingGroups.fields.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}</select></label><button type="button" onClick={insertField} disabled={!field}>{selectedBinding?.value.startsWith('calc.')?'Insert Calculated':'Insert at Cursor'}</button></div>
    <p className="property-help">{'Static text, source fields, Calculated Fields (calc.<alias>) and manual new lines use the same behavior everywhere. Formula-based Calculated Fields are inserted the same way. Blank lines are preserved. Use \\{{ to print literal {{.'}</p>
    {tokenPaths.length>0&&<details className="rich-text-token-settings"><summary>Dynamic field formatting ({tokenPaths.length})</summary>{tokenPaths.map(path=><div className="table-column-card" key={path}><strong>{path}</strong><label>Fallback<input value={tokens[path]?.fallback ?? ''} onChange={e=>onChange({text,fieldTokens:{...tokens,[path]:{...(tokens[path]??{}),fallback:e.target.value}}})}/></label><DisplayFormatEditor value={tokens[path]?.format} onChange={format=>onChange({text,fieldTokens:{...tokens,[path]:{...(tokens[path]??{}),format}}})}/></div>)}</details>}
  </div>;
}

function RichDynamicTextEditor({block,onChange,fieldBindings}:{block:Extract<TemplateBlock|RowChildBlock,{type:'TEXT'}>;onChange:(block:any)=>void;fieldBindings:BindingOption[]}) {
  return <RichTextComposer value={{text:block.text,fieldTokens:block.fieldTokens}} fieldBindings={fieldBindings} onChange={next=>onChange({...block,text:next.text ?? '',fieldTokens:next.fieldTokens})}/>;
}

function FormulaBuilder({value,options,onChange}:{value:AggregateValueDefinition;options:BindingOption[];onChange:(value:AggregateValueDefinition)=>void}) {
  const bindings=value.formulaBindings??[];
  const [selected,setSelected]=useState(options[0]?.value??'');
  const selectedOption=options.find(o=>o.value===selected)??options[0];
  const append=(text:string)=>onChange({...value,operation:'FORMULA',expression:`${value.expression??''}${text}`,formulaBindings:bindings,format:value.format??'NUMBER'});
  const addField=(fn?:string)=>{
    if(!selectedOption)return;
    let binding=bindings.find(b=>(b.sourceField&&b.sourceField===selectedOption.sourceField)||(b.targetPath&&b.targetPath===selectedOption.targetPath)||b.path===selectedOption.value);
    const nextBindings=[...bindings];
    if(!binding){binding={id:`f${bindings.length+1}`,label:selectedOption.label,path:selectedOption.value,sourceField:selectedOption.sourceField,targetPath:selectedOption.targetPath};nextBindings.push(binding);}
    const token=`{{${binding.id}}}`;
    const text=fn?`${fn}(${token})`:token;
    onChange({...value,operation:'FORMULA',expression:`${value.expression??''}${text}`,formulaBindings:nextBindings,format:value.format??'NUMBER'});
  };
  return <div className="formula-builder">
    <label>Formula Field<select value={selectedOption?.value??''} onChange={e=>setSelected(e.target.value)}>{options.map(o=><option key={`${o.value}-${o.sourceField??''}`} value={o.value}>{o.label}</option>)}</select></label>
    <div className="template-small-actions formula-actions">
      <button type="button" onClick={()=>addField()}>Add Field</button>
      <button type="button" onClick={()=>addField('SUM')}>SUM(Field)</button>
      <button type="button" onClick={()=>addField('AVG')}>AVG</button>
      <button type="button" onClick={()=>addField('MIN')}>MIN</button>
      <button type="button" onClick={()=>addField('MAX')}>MAX</button>
      <button type="button" onClick={()=>addField('COUNT')}>COUNT</button>
    </div>
    <div className="template-small-actions formula-actions">
      {[' + ',' - ',' * ',' / ','(',')'].map(op=><button type="button" key={op} onClick={()=>append(op)}>{op.trim()||op}</button>)}
      <button type="button" onClick={()=>append('ROUND(')}>ROUND(</button>
      <button type="button" onClick={()=>onChange({...value,expression:'',formulaBindings:[]})}>Clear</button>
    </div>
    <label>Formula Expression<textarea rows={3} value={value.expression??''} onChange={e=>onChange({...value,operation:'FORMULA',expression:e.target.value})} placeholder="Example: SUM({{f1}}) + SUM({{f2}})"/></label>
    {!!bindings.length&&<div className="formula-legend"><strong>Fields:</strong>{bindings.map(b=><div key={b.id}><code>{`{{${b.id}}}`}</code> = {b.label}</div>)}</div>}
    <p className="property-help">Safe formula engine only supports +, -, *, /, parentheses and SUM/AVG/MIN/MAX/COUNT/FIRST/ROUND. No JavaScript execution.</p>
  </div>;
}


function createCustomTable(rowCount:number,columnCount:number): CustomTableBlock {
  const cells: CustomGridCellDefinition[]=[];
  for(let r=0;r<rowCount;r++) for(let c=0;c<columnCount;c++) cells.push({id:makeId('grid-cell'),row:r,column:c,rowSpan:1,colSpan:1,content:{type:'BLANK'},style:{backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#CBD5E1'},padding:{top:2,right:2,bottom:2,left:2},horizontalAlignment:'LEFT',verticalAlignment:'TOP'}});
  return {id:makeId('block'),type:'CUSTOM_TABLE',rowCount,columnCount,cells,layout:{widthPercent:100,alignment:'LEFT'},tableStyle:{showHeader:false,showBorder:true,widthPercent:100,alignment:'LEFT',cellStyle:{fontFamily:'Arial',fontSize:10,textColor:'#111827',backgroundColor:'#FFFFFF'},border:{style:'SOLID',width:1,color:'#CBD5E1'},cellPadding:{top:2,right:2,bottom:2,left:2}}};
}

function resizeCustomGrid(block:CustomTableBlock,rowCount:number,columnCount:number):CustomTableBlock {
  const kept=block.cells.filter(cell=>cell.row<rowCount && cell.column<columnCount).map(cell=>({...cell,rowSpan:Math.min(cell.rowSpan??1,rowCount-cell.row),colSpan:Math.min(cell.colSpan??1,columnCount-cell.column)}));
  const occupied=new Set(kept.map(c=>`${c.row}:${c.column}`));
  for(let r=0;r<rowCount;r++) for(let c=0;c<columnCount;c++) if(!occupied.has(`${r}:${c}`)) kept.push({id:makeId('grid-cell'),row:r,column:c,rowSpan:1,colSpan:1,content:{type:'BLANK'},style:{backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#CBD5E1'},padding:{top:2,right:2,bottom:2,left:2},horizontalAlignment:'LEFT',verticalAlignment:'TOP'}});
  return {...block,rowCount,columnCount,cells:kept};
}

function CustomTableEditor({block,onChange,fieldBindings,mappings}:{block:CustomTableBlock;onChange:(block:TemplateBlock|RowChildBlock)=>void;fieldBindings:BindingOption[];mappings:MappingDefinition[]}) {
  const style=block.tableStyle??{};
  const covered=new Set<string>();
  for(const cell of block.cells){for(let r=cell.row;r<cell.row+(cell.rowSpan??1);r++)for(let c=cell.column;c<cell.column+(cell.colSpan??1);c++)if(!(r===cell.row&&c===cell.column))covered.add(`${r}:${c}`)}
  const patchCell=(id:string,patch:Partial<CustomGridCellDefinition>)=>onChange({...block,cells:block.cells.map(c=>c.id===id?{...c,...patch}:c)});
  const applySpan=(cell:CustomGridCellDefinition,rowSpan:number,colSpan:number)=>{
    rowSpan=Math.max(1,Math.min(rowSpan,block.rowCount-cell.row)); colSpan=Math.max(1,Math.min(colSpan,block.columnCount-cell.column));
    const overlaps=block.cells.some(other=>other.id!==cell.id && !covered.has(`${other.row}:${other.column}`) && ((other.rowSpan??1)>1 || (other.colSpan??1)>1) && other.row<cell.row+rowSpan && other.row+(other.rowSpan??1)>cell.row && other.column<cell.column+colSpan && other.column+(other.colSpan??1)>cell.column);
    if(overlaps){alert('Selected span overlaps another merged cell. Reset that merge first.');return;}
    patchCell(cell.id,{rowSpan,colSpan});
  };
  return <>
    <Section title="Grid Size"><div className="template-small-actions"><button type="button" onClick={()=>{const one=createCustomTable(1,1);onChange({...one,id:block.id,layout:block.layout,tableStyle:{...one.tableStyle,widthPercent:style.widthPercent??100,alignment:style.alignment??'LEFT'}})}}>1 × 1 Box</button></div><div className="control-grid"><label>Rows<input type="number" min={1} max={100} value={block.rowCount} onChange={e=>onChange(resizeCustomGrid(block,Math.max(1,+e.target.value),block.columnCount))}/></label><label>Columns<input type="number" min={1} max={50} value={block.columnCount} onChange={e=>onChange(resizeCustomGrid(block,block.rowCount,Math.max(1,+e.target.value)))}/></label></div><p className="property-help">Custom Grid is independent of line items. Use it for details, bank information, signatures, labels, dynamic fields, cards, or any custom matrix.</p>{block.columnCount>=8&&<div className="inline-validation-warning">Dense grid: expected column width may fall below the recommended 15 mm. Text will word-wrap and numeric values will stay intact; increase the grid width or reduce columns if content becomes cramped.</div>}</Section>
    <Section title="Table Visibility"><label className="checkbox-label"><input type="checkbox" checked={style.showBorder??true} onChange={e=>onChange({...block,tableStyle:{...style,showBorder:e.target.checked}})}/> Show Border</label></Section>
    <Section title="Layout"><WidthAlign value={{widthPercent:style.widthPercent??block.layout?.widthPercent,alignment:style.alignment??block.layout?.alignment}} onChange={value=>onChange({...block,tableStyle:{...style,...value}})}/></Section>
    <Section title="Cells">
      {block.cells.filter(cell=>!covered.has(`${cell.row}:${cell.column}`)).sort((a,b)=>a.row-b.row||a.column-b.column).map(cell=><details className="table-column-card" key={cell.id}><summary><strong>R{cell.row+1} C{cell.column+1}</strong> · span {cell.rowSpan??1}×{cell.colSpan??1} · {cell.content.type}</summary><div className="cell-settings-body">
        <div className="control-grid"><label>Row Span<input type="number" min={1} max={block.rowCount-cell.row} value={cell.rowSpan??1} onChange={e=>applySpan(cell,+e.target.value,cell.colSpan??1)}/></label><label>Column Span<input type="number" min={1} max={block.columnCount-cell.column} value={cell.colSpan??1} onChange={e=>applySpan(cell,cell.rowSpan??1,+e.target.value)}/></label><label>Content Type<select value={cell.content.type} onChange={e=>patchCell(cell.id,{content:{type:e.target.value as any}})}><option>BLANK</option><option>TEXT</option><option>FIELD</option><option>VALUE</option><option>IMAGE</option></select></label></div>
        <div className="template-small-actions"><button type="button" onClick={()=>applySpan(cell,1,1)}>Reset Merge</button>{cell.column<block.columnCount-1&&<button type="button" onClick={()=>applySpan(cell,cell.rowSpan??1,(cell.colSpan??1)+1)}>Merge Right</button>}{cell.row<block.rowCount-1&&<button type="button" onClick={()=>applySpan(cell,(cell.rowSpan??1)+1,cell.colSpan??1)}>Merge Down</button>}</div>
        {cell.content.type==='TEXT'&&<><RichTextComposer rows={5} value={{text:cell.content.text,fieldTokens:cell.content.fieldTokens}} fieldBindings={fieldBindings} onChange={next=>patchCell(cell.id,{content:{...cell.content,text:next.text??'',fieldTokens:next.fieldTokens}})}/><details><summary>Text Style</summary><TextControls value={cell.content.style} onChange={style=>patchCell(cell.id,{content:{...cell.content,style}})}/></details></>}
        {cell.content.type==='FIELD'&&<><PathInput label="Field" value={cell.content.path??''} options={fieldBindings} onChange={path=>patchCell(cell.id,{content:{...cell.content,path}})}/><label>Fallback<input value={cell.content.fallback??''} onChange={e=>patchCell(cell.id,{content:{...cell.content,fallback:e.target.value}})}/></label><DisplayFormatEditor value={cell.content.format} onChange={format=>patchCell(cell.id,{content:{...cell.content,format}})}/></>} 
        {cell.content.type==='VALUE'&&<AggregateCellEditor label="Calculated Value" value={cell.content.value} fieldOptions={fieldBindings} rowPathOptions={buildTableColumnBindings(mappings,'items',[],[])} onChange={value=>patchCell(cell.id,{content:{...cell.content,value}})}/>} 
        {cell.content.type==='IMAGE'&&<><label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024)return alert('Image must be 5 MB or smaller.');const reader=new FileReader();reader.onload=()=>patchCell(cell.id,{content:{...cell.content,type:'IMAGE',sourceType:'DATA_URL',source:String(reader.result),altText:f.name,maintainAspectRatio:true,width:30}});reader.readAsDataURL(f)}}/></label><label>Width (mm)<input type="number" min={1} value={cell.content.width??30} onChange={e=>patchCell(cell.id,{content:{...cell.content,width:+e.target.value}})}/></label></>}
        {cell.content.type!=='IMAGE'&&cell.content.type!=='BLANK'&&<TextControls value={cell.content.style} onChange={next=>patchCell(cell.id,{content:{...cell.content,style:next}})}/>} 
        <CellStyleEditor value={cell.style} onChange={next=>patchCell(cell.id,{style:next})}/>
      </div></details>)}
    </Section>
  </>;
}

function BoxEditor({ block, onChange, fieldBindings }: { block: BoxBlock; onChange: (block: TemplateBlock | RowChildBlock) => void; fieldBindings: BindingOption[] }) {
  const style=block.style??{};
  const addChild=(type:'TEXT'|'FIELD'|'IMAGE'|'DIVIDER'|'SPACER')=>onChange({...block,children:[...block.children,createRowChild(type,fieldBindings[0]?.value??'group.key') as any]});
  return <>
    <Section title="Basic"><label>Designer Name<input value={block.name??''} onChange={e=>onChange({...block,name:e.target.value})}/></label><div className="template-small-actions"><button type="button" onClick={()=>onChange({...block,style:{...style,heightMode:'MINIMUM',minHeightMm:20,backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#CBD5E1'},borderRadiusMm:0}})}>Plain Box</button><button type="button" onClick={()=>onChange({...block,style:{...style,heightMode:'MINIMUM',minHeightMm:20,backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#CBD5E1'},borderRadiusMm:4}})}>Rounded Box</button><button type="button" onClick={()=>onChange({...block,style:{...style,heightMode:'MINIMUM',minHeightMm:20,backgroundColor:'#F3F4F6',border:{style:'SOLID',width:1,color:'#CBD5E1'}}})}>Filled Box</button><button type="button" onClick={()=>onChange({...block,style:{...style,heightMode:'MINIMUM',minHeightMm:30,backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#64748B'},borderRadiusMm:0},layout:{...block.layout,keepTogether:true}})}>Signature Box</button></div></Section>
    <Section title="Size"><BoxStyleEditor value={style} onChange={next=>onChange({...block,style:next})}/></Section>
    <Section title="Content">
      <div className="row-add-actions"><button onClick={()=>addChild('TEXT')}>+ Text</button><button onClick={()=>addChild('FIELD')}>+ Field</button><button onClick={()=>addChild('IMAGE')}>+ Image</button><button onClick={()=>addChild('DIVIDER')}>+ Divider</button><button onClick={()=>addChild('SPACER')}>+ Spacer</button></div>
      {block.children.length===0?<p className="property-help">Blank box. Add dynamic content above.</p>:block.children.map((child,index)=><div className="table-column-card" key={child.id}><strong>{index+1}. {blockLabel(child)}</strong><button type="button" className="column-remove" onClick={()=>onChange({...block,children:block.children.filter(c=>c.id!==child.id)})}>Remove</button>{child.type==='TEXT'&&<><RichDynamicTextEditor block={child} fieldBindings={fieldBindings} onChange={(next:any)=>onChange({...block,children:block.children.map(c=>c.id===child.id?next:c)})}/><details><summary>Text Style</summary><TextControls value={child.style} onChange={style=>onChange({...block,children:block.children.map(c=>c.id===child.id?{...child,style}:c)})}/></details></>}{child.type==='FIELD'&&<PathInput label="Field" value={child.path} options={fieldBindings} onChange={path=>onChange({...block,children:block.children.map(c=>c.id===child.id?{...child,path}:c)})}/>}</div>)}
    </Section>
    <LayoutControls value={{...block.layout,keepTogether:block.layout?.keepTogether??true}} onChange={layout=>onChange({...block,layout})}/>
  </>;
}

function ImageEditor({ block, onChange }: { block: Extract<RowChildBlock, { type: 'IMAGE' }>; onChange: (block: TemplateBlock | RowChildBlock) => void }) {
  const upload = (file?: File) => {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return alert('Use PNG, JPEG, or WEBP.');
    if (file.size > 5 * 1024 * 1024) return alert('Image must be 5 MB or smaller.');
    const reader = new FileReader();
    reader.onload = () => onChange({ ...block, sourceType: 'DATA_URL', source: String(reader.result), altText: block.altText || file.name });
    reader.readAsDataURL(file);
  };
  return (
    <>
      <label>Image File<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.target.files?.[0])}/></label>
      <label>Alt Text<input value={block.altText ?? ''} onChange={(event) => onChange({ ...block, altText: event.target.value })}/></label>
      <div className="control-grid">
        <label>Width (mm)<input type="number" min={1} value={block.width ?? 40} onChange={(event) => onChange({ ...block, width: +event.target.value })}/></label>
        <label>Height (mm)<input type="number" min={1} value={block.height ?? 30} disabled={block.maintainAspectRatio ?? true} onChange={(event) => onChange({ ...block, height: +event.target.value })}/></label>
        <label>Image Alignment<select value={block.alignment ?? 'LEFT'} onChange={(event) => onChange({ ...block, alignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
        <label className="checkbox-label"><input type="checkbox" checked={block.maintainAspectRatio ?? true} onChange={(event) => onChange({ ...block, maintainAspectRatio: event.target.checked })}/> Maintain aspect ratio</label>
      </div>
      <LayoutControls value={block.layout} onChange={(layout) => onChange({ ...block, layout })}/>
    </>
  );
}

function TextControls({ value, onChange }: { value?: TextStyle; onChange: (style: TextStyle) => void }) {
  const style = value ?? {};
  return (
    <div className="control-grid">
      <label>Font<select value={style.fontFamily ?? 'Arial'} onChange={(event) => onChange({ ...style, fontFamily: event.target.value as FontFamily })}>{OFFLINE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{displayFont(font)}</option>)}</select></label>
      <label>Size<input type="number" min={6} max={96} value={style.fontSize ?? 12} onChange={(event) => onChange({ ...style, fontSize: +event.target.value })}/></label>
      <label>Alignment<select value={style.alignment ?? 'LEFT'} onChange={(event) => onChange({ ...style, alignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
      <ColorControl label="Text Color" value={style.textColor ?? '#000000'} onChange={(textColor) => onChange({ ...style, textColor })}/>
      <ColorControl label="Background" value={style.backgroundColor ?? '#FFFFFF'} onChange={(backgroundColor) => onChange({ ...style, backgroundColor })}/>
      <label>Line Height<input type="number" min={0.5} step="0.1" value={style.lineHeight ?? 1.2} onChange={(event) => onChange({ ...style, lineHeight: +event.target.value })}/></label>
      <label className="checkbox-label"><input type="checkbox" checked={!!style.bold} onChange={(event) => onChange({ ...style, bold: event.target.checked })}/> Bold</label>
      <label className="checkbox-label"><input type="checkbox" checked={!!style.italic} onChange={(event) => onChange({ ...style, italic: event.target.checked })}/> Italic</label>
      <label className="checkbox-label"><input type="checkbox" checked={!!style.underline} onChange={(event) => onChange({ ...style, underline: event.target.checked })}/> Underline</label>
    </div>
  );
}

function LayoutControls({ value, onChange }: { value?: BlockLayout; onChange: (layout: BlockLayout) => void }) {
  return (
    <Section title="Block Layout">
      <WidthAlign value={value} onChange={(next) => onChange({ ...value, ...next })}/>
      <div className="margin-grid">
        {(['marginTop','marginRight','marginBottom','marginLeft'] as const).map((key) => (
          <label key={key}>{key.replace('margin','')} (mm)<input type="number" min={0} value={value?.[key] ?? 0} onChange={(event) => onChange({ ...value, [key]: +event.target.value })}/></label>
        ))}
      </div>
      <div className="pagination-block-controls">
        <label className="checkbox-label"><input type="checkbox" checked={value?.keepTogether ?? false} onChange={(event) => onChange({ ...value, keepTogether: event.target.checked })}/> Keep block together on one page</label>
        <label className="checkbox-label"><input type="checkbox" checked={value?.breakBefore ?? false} onChange={(event) => onChange({ ...value, breakBefore: event.target.checked })}/> Start on new page</label>
        <label className="checkbox-label"><input type="checkbox" checked={value?.breakAfter ?? false} onChange={(event) => onChange({ ...value, breakAfter: event.target.checked })}/> Page break after block</label>
      </div>
    </Section>
  );
}

function WidthAlign({ value, onChange }: { value?: Partial<Pick<BlockLayout,'widthPercent'|'alignment'>>; onChange: (value: Partial<Pick<BlockLayout,'widthPercent'|'alignment'>>) => void }) {
  return (
    <div className="control-grid">
      <label>Width %<input type="number" min={1} max={100} list="width-presets" value={value?.widthPercent ?? 100} onChange={(event) => onChange({ ...value, widthPercent: +event.target.value })}/><datalist id="width-presets"><option value="25"/><option value="50"/><option value="75"/><option value="100"/></datalist></label>
      <label>Block/Page Alignment<select value={value?.alignment ?? 'LEFT'} onChange={(event) => onChange({ ...value, alignment: event.target.value as Alignment })}>{ALIGNMENTS.map((alignment) => <option key={alignment}>{alignment}</option>)}</select></label>
    </div>
  );
}

function BoxStyleEditor({ value, onChange }: { value?: BoxStyle; onChange: (value: BoxStyle) => void }) {
  const style=value??{};
  return <div className="cell-style-editor">
    <div className="control-grid">
      <label>Width Mode<select value={style.widthMode??'AUTO'} onChange={e=>onChange({...style,widthMode:e.target.value as any})}><option>AUTO</option><option>PERCENT</option><option>FIXED_MM</option></select></label>
      {style.widthMode==='PERCENT'&&<label>Width %<input type="number" min={1} max={100} value={style.widthPercent??100} onChange={e=>onChange({...style,widthPercent:+e.target.value})}/></label>}
      {style.widthMode==='FIXED_MM'&&<label>Width (mm)<input type="number" min={1} value={style.widthMm??50} onChange={e=>onChange({...style,widthMm:+e.target.value})}/></label>}
      <label>Height Mode<select value={style.heightMode??'AUTO'} onChange={e=>onChange({...style,heightMode:e.target.value as any})}><option>AUTO</option><option>MINIMUM</option><option>FIXED</option></select></label>
      {style.heightMode==='MINIMUM'&&<label>Min Height (mm)<input type="number" min={0} value={style.minHeightMm??0} onChange={e=>onChange({...style,minHeightMm:+e.target.value})}/></label>}
      {style.heightMode==='FIXED'&&<label>Height (mm)<input type="number" min={0} value={style.heightMm??20} onChange={e=>onChange({...style,heightMm:+e.target.value})}/></label>}
      <label>Overflow<select value={style.overflow??'EXPAND'} onChange={e=>onChange({...style,overflow:e.target.value as any})}><option>EXPAND</option><option>CLIP</option><option>SHRINK_CONTENT</option></select></label>
      <label>Horizontal<select value={style.horizontalAlignment??'LEFT'} onChange={e=>onChange({...style,horizontalAlignment:e.target.value as Alignment})}>{ALIGNMENTS.map(a=><option key={a}>{a}</option>)}</select></label>
      <label>Vertical<select value={style.verticalAlignment??'TOP'} onChange={e=>onChange({...style,verticalAlignment:e.target.value as VerticalAlignment})}>{VERTICAL_ALIGNMENTS.map(a=><option key={a}>{a}</option>)}</select></label>
      <label>Corner Radius (mm)<input type="number" min={0} step="0.5" value={style.borderRadiusMm??0} onChange={e=>onChange({...style,borderRadiusMm:+e.target.value})}/></label>
    </div>
    <ColorControl label="Background" value={style.backgroundColor??'#FFFFFF'} onChange={backgroundColor=>onChange({...style,backgroundColor})}/>
    <div className="control-grid"><label>Border Style<select value={style.border?.style??'SOLID'} onChange={e=>onChange({...style,border:{...style.border,style:e.target.value as any}})}><option>NONE</option><option>SOLID</option><option>DASHED</option><option>DOTTED</option></select></label><label>Border Width<input type="number" min={0} step="0.5" value={style.border?.width??1} onChange={e=>onChange({...style,border:{...style.border,width:+e.target.value}})}/></label></div>
    <ColorControl label="Border Color" value={style.border?.color??'#CBD5E1'} onChange={color=>onChange({...style,border:{...style.border,color}})}/>
    <PaddingControls value={style.padding} onChange={padding=>onChange({...style,padding})}/>
  </div>;
}

function CellStyleEditor({ value, onChange }: { value?: CellStyle; onChange: (value: CellStyle) => void }) {
  const style=value??{};
  return <div><BoxStyleEditor value={{...style,minHeightMm:style.minHeightMm??style.minHeight??0}} onChange={next=>onChange({...style,...next,minHeight:next.minHeightMm??style.minHeight??0})}/></div>;
}

function PaddingControls({ value, onChange }: { value?: { top?: number; right?: number; bottom?: number; left?: number }; onChange: (value: { top?: number; right?: number; bottom?: number; left?: number }) => void }) {
  return <div className="margin-grid">{(['top','right','bottom','left'] as const).map((key) => <label key={key}>Padding {key}<input type="number" min={0} value={value?.[key] ?? 2} onChange={(event) => onChange({ ...value, [key]: +event.target.value })}/></label>)}</div>;
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<span className="color-control"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value.toUpperCase())}/><input value={value} maxLength={7} onChange={(event) => onChange(event.target.value)}/></span></label>;
}

function PathInput({ label, value, options, onChange, onSelect }: { label: string; value: string; options: BindingOption[]; onChange: (value: string) => void; onSelect?: (option: BindingOption) => void }) {
  const normalized = Array.from(new Map(options.filter((item) => item.value).map((item) => [item.value, item])).values()).sort((a, b) => a.label.localeCompare(b.label));
  const isKnown = normalized.some((item) => item.value === value);
  const [advanced, setAdvanced] = useState(normalized.length === 0 && !isKnown && !!value);
  const optionSignature = normalized.map((item) => `${item.value}:${item.label}`).join('|');
  useEffect(() => { if (normalized.length > 0) setAdvanced(false); }, [optionSignature]);
  return <label>{label}
    <select className="source-path-select" value={isKnown && !advanced ? value : advanced ? '__advanced__' : ''} onChange={(event) => {
      if (event.target.value === '__advanced__') { setAdvanced(true); return; }
      setAdvanced(false);
      const selected = normalized.find((item) => item.value === event.target.value);
      onChange(event.target.value);
      if (selected) onSelect?.(selected);
    }}>
      <option value="" disabled>{normalized.length ? 'Select imported field…' : 'No imported fields available'}</option>
      {normalized.map((item) => { const shownPath = item.targetPath ?? item.value; return <option key={`${item.value}-${shownPath}`} value={item.value}>{item.label}{item.label !== shownPath ? `  →  ${shownPath}` : ''}</option>; })}
      <option value="__advanced__">Advanced: custom path…</option>
    </select>
    {advanced && <div className="advanced-path-box"><span>Advanced custom binding</span><input className="custom-path-input" value={value} placeholder="Enter renderer path" onChange={(event) => onChange(event.target.value)}/><button type="button" onClick={() => { setAdvanced(false); if (!isKnown && normalized[0]) onChange(normalized[0].value); }}>Use imported fields</button></div>}
    {normalized.length > 0 && <small className="field-source-hint">{normalized.length} imported field{normalized.length === 1 ? '' : 's'} available. Header name is shown first; renderer path is shown after →.</small>}
  </label>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(!/(Advanced|Border|Padding)/i.test(title));
  return <details className="property-section property-accordion" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{title}</span><small>{open ? '−' : '+'}</small></summary>
    <div className="property-section-body">{children}</div>
  </details>;
}

function patchCol(block: TableBlock, onChange: (block: TemplateBlock | RowChildBlock) => void, index: number, patch: Partial<TableBlock['columns'][number]>) {
  onChange({ ...block, columns: block.columns.map((column, itemIndex) => itemIndex === index ? { ...column, ...patch } : column) });
}

function selectionBreadcrumb(selection: NonNullable<Selection>): string {
  if (!selection.parentRow) return blockLabel(selection.block);
  if (!selection.parentColumnId) return `Row > ${blockLabel(selection.block)}`;
  const columnIndex = (selection.parentRow.columns ?? []).findIndex((column) => column.id === selection.parentColumnId);
  return `Row > Cell ${columnIndex >= 0 ? columnIndex + 1 : '?'} > ${blockLabel(selection.block)}`;
}

function cloneRowChildWithFreshIds(child: RowChildBlock): RowChildBlock {
  const copy = clone(child) as unknown as Record<string, unknown>;
  const idMap = new Map<string, string>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') idMap.set(record.id, makeId('copy'));
    Object.values(record).forEach(collect);
  };
  const rewrite = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(rewrite); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && idMap.has(record.id)) record.id = idMap.get(record.id)!;
    if (typeof record.columnId === 'string' && idMap.has(record.columnId)) record.columnId = idMap.get(record.columnId)!;
    Object.values(record).forEach(rewrite);
  };
  collect(copy);
  rewrite(copy);
  return copy as unknown as RowChildBlock;
}


function hydrateAggregateBindings(template: TemplateDefinition, mappings: MappingDefinition[]): TemplateDefinition {
  if (!mappings.length) return template;
  const cloned = clone(template);
  const enrich = (value: AggregateValueDefinition, sourcePath?: string): AggregateValueDefinition => {
    if (value.operation === 'STATIC') return value;
    const path = value.targetPath ?? value.path;
    const match = mappings.find((mapping) => {
      if (!mapping.targetPath || !mapping.sourceField || mapping.role === 'IGNORE') return false;
      // The imported source header is the strongest identity. This repairs old
      // templates where the same source column was saved once as fields.x and
      // later as items.x after its mapping role changed.
      if (value.sourceField && mapping.sourceField === value.sourceField) return true;
      if (!path) return false;
      if (mapping.targetPath === path) return true;
      if (sourcePath && mapping.targetPath === `${sourcePath}.${path}`) return true;
      return false;
    });
    let next = match ? { ...value, path: match.targetPath, sourceField: match.sourceField, targetPath: match.targetPath } : value;
    if (next.operation === 'FORMULA' && next.formulaBindings?.length) {
      next = { ...next, formulaBindings: next.formulaBindings.map((binding) => {
        const mapped = mappings.find((mapping) => mapping.role !== 'IGNORE' && mapping.targetPath && ((binding.sourceField && mapping.sourceField === binding.sourceField) || mapping.targetPath === binding.targetPath || mapping.targetPath === binding.path));
        return mapped ? { ...binding, label: mapped.sourceField || binding.label, path: mapped.targetPath!, sourceField: mapped.sourceField, targetPath: mapped.targetPath } : binding;
      }) };
    }
    return next;
  };
  const visit = (block: TemplateBlock) => {
    if (block.type === 'TABLE') {
      block.footerRows = block.footerRows?.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, value: enrich(cell.value, block.sourcePath) })) }));
    }
    if (block.type === 'CUSTOM_TABLE') {
      block.cells = block.cells.map((cell) => cell.content.type === 'VALUE' && cell.content.value ? { ...cell, content: { ...cell.content, value: enrich(cell.content.value, cell.content.value.sourcePath ?? 'items') } } : cell);
    }
    if (block.type === 'SUMMARY_TABLE') {
      block.rows = block.rows?.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, value: enrich(cell.value, block.sourcePath) })) }));
      if (block.totalRow) block.totalRow = { ...block.totalRow, cells: block.totalRow.cells.map((cell) => ({ ...cell, value: enrich(cell.value, block.sourcePath) })) };
    }
    if (block.type === 'ROW') {
      for (const child of block.children) visit(child as TemplateBlock);
      for (const column of block.columns ?? []) for (const child of column.children) visit(child as TemplateBlock);
    }
  };
  [...cloned.header.blocks, ...cloned.body.blocks, ...cloned.footer.blocks].forEach(visit);
  cloned.calculatedFields = cloned.calculatedFields?.map((field) => ({ ...field, value: enrich(field.value, field.value.sourcePath ?? 'items') }));
  return cloned;
}

function dedupeBindings(bindings: BindingOption[]): BindingOption[] {
  const seen = new Set<string>();
  const result: BindingOption[] = [];
  for (const binding of bindings) {
    const key = binding.value || binding.targetPath || binding.sourceField || binding.label;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(binding);
  }
  return result;
}

function buildFieldBindings(mappings: MappingDefinition[], discovered: string[]): BindingOption[] {
  const mapped = mappings
    .filter((item) => item.role !== 'IGNORE' && item.targetPath)
    .map((item) => ({ value: item.targetPath!, label: `${item.sourceField || item.targetPath!}${item.role === 'SUMMARY_FIELD' ? ` [Summary: ${item.summaryAggregation ?? 'SUM'}]` : ''}`, sourceField: item.sourceField, role: item.role, targetPath: item.targetPath!, summaryAggregation: item.summaryAggregation }));
  const known = new Set(mapped.map((item) => item.value));
  return [...mapped, ...discovered.filter((path) => !known.has(path)).map((path) => ({ value: path, label: path }))];
}

function buildCollectionBindings(mappings: MappingDefinition[], discovered: Array<{ path: string; fields: string[] }>, schemaFields: import('@document-tool/contracts').FieldDefinition[] = []): CollectionBinding[] {
  const byPath = new Map<string, CollectionBinding>();
  for (const mapping of mappings.filter((item) => (item.role === 'LINE_ITEM_FIELD' || item.role === 'SUMMARY_FIELD') && item.targetPath)) {
    const root = mapping.targetPath!.split('.')[0]!;
    const current = byPath.get(root) ?? { path: root, label: `${root} (line items)`, fields: [] };
    const relativePath = mapping.targetPath!.slice(root.length + 1);
    current.fields.push({ value: relativePath || mapping.targetPath!, label: `${mapping.sourceField || mapping.targetPath!}${mapping.role === 'SUMMARY_FIELD' ? ` [Summary: ${mapping.summaryAggregation ?? 'SUM'}]` : ''}`, sourceField: mapping.sourceField, role: mapping.role, targetPath: mapping.targetPath!, summaryAggregation: mapping.summaryAggregation });
    byPath.set(root, current);
  }
  for (const collection of discovered) {
    const current = byPath.get(collection.path) ?? { path: collection.path, label: collection.path, fields: [] };
    const known = new Set(current.fields.map((item) => item.value));
    for (const path of collection.fields) {
      const relativePath = path.startsWith(`${collection.path}.`) ? path.slice(collection.path.length + 1) : path;
      if (!known.has(relativePath)) current.fields.push({ value: relativePath, label: relativePath, targetPath: path });
    }
    byPath.set(collection.path, current);
  }
  const enriched = [...byPath.values()].map((collection) => ({
    ...collection,
    fields: augmentFilterFieldsWithImportedSource(collection.path, collection.fields, schemaFields, mappings),
  }));
  // Raw imported rows are also a first-class collection for advanced templates.
  if (schemaFields.length && !enriched.some((collection) => collection.path === 'sourceItems')) {
    enriched.push({
      path:'sourceItems',
      label:'sourceItems (raw imported rows)',
      fields:augmentFilterFieldsWithImportedSource('sourceItems', [], schemaFields, mappings),
    });
  }
  return enriched.sort((a, b) => a.label.localeCompare(b.label));
}

function augmentCollectionsWithDataViews(base:CollectionBinding[], views:DataViewDefinition[]):CollectionBinding[] {
  const byPath=new Map(base.map((item)=>[item.path,item] as const));
  const resolveFields=(sourcePath:string,seen=new Set<string>()):BindingOption[]=>{
    if(seen.has(sourcePath)) return [];
    seen.add(sourcePath);
    const direct=byPath.get(sourcePath); if(direct) return direct.fields;
    if(sourcePath.startsWith('views.')){
      const alias=sourcePath.slice(6).split('.')[0]!;
      const def=views.find((view)=>view.alias===alias); if(def) return resolveFields(def.sourcePath,seen);
    }
    return [];
  };
  const derived=views.map((view)=>({path:`views.${view.alias}`,label:`Data View · ${view.name || view.alias}`,fields:resolveFields(view.sourcePath)}));
  return [...base,...derived];
}


function buildTableColumnBindings(
  mappings: MappingDefinition[],
  _sourcePath: string,
  sourceFields: string[],
  discovered: BindingOption[] = [],
): BindingOption[] {
  const bySource = new Map<string, BindingOption>();

  for (const mapping of mappings) {
    if (!mapping.sourceField) continue;
    const targetPath = mapping.targetPath || `fields.${safePathSegment(mapping.sourceField)}`;
    bySource.set(mapping.sourceField, {
      value: targetPath,
      label: mapping.sourceField,
      sourceField: mapping.sourceField,
      role: mapping.role,
      targetPath,
      summaryAggregation: mapping.summaryAggregation,
    });
  }

  for (const sourceField of sourceFields) {
    if (bySource.has(sourceField)) continue;
    bySource.set(sourceField, {
      value: `fields.${safePathSegment(sourceField)}`,
      label: sourceField,
      sourceField,
      targetPath: `fields.${safePathSegment(sourceField)}`,
    });
  }

  const mapped = [...bySource.values()].sort((a, b) => a.label.localeCompare(b.label));
  const known = new Set(mapped.map((item) => `${item.sourceField ?? ''}|${item.value}`));
  const extra = discovered.filter((item) => !known.has(`${item.sourceField ?? ''}|${item.value}`));
  return [...mapped, ...extra];
}

function safePathSegment(value: string): string {
  const words = value.trim().replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const [first = 'field', ...rest] = words;
  const camel = first.toLowerCase().replace(/^[^a-z_]+/, '') + rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
  const clean = camel.replace(/[^A-Za-z0-9_]/g, '');
  return /^[A-Za-z_]/.test(clean) ? clean : `field${clean || 'Value'}`;
}


async function repairWorkspaceGroups(workspace: StoredImportWorkspace): Promise<StoredImportWorkspace> {
  const existingGroups = getWorkspaceGroups(workspace);
  // Persisted groups are intentionally compact (sourceItems/itemDetails omitted).
  // Their absence is not corruption; selected-group context is hydrated lazily.
  if (existingGroups.length) return workspace;
  if (!workspace.dataPreview || !workspace.mappings?.length) return workspace;
  const groupMapping = workspace.mappings.find((mapping) => mapping.role === 'GROUP_KEY');
  const groupingMode = workspace.groupingMode ?? 'GROUP_BY_FIELD';
  const profile: MappingProfile = {
    id: `source-repair-${workspace.id}`,
    name: 'Restored Source Mapping',
    sourceType: String(workspace.dataPreview.metadata?.sourceType ?? 'file'),
    mappings: workspace.mappings,
    groupDefinition: {
      mode: groupingMode,
      groupKey: groupingMode === 'GROUP_BY_FIELD'
        ? { sourceField: groupMapping?.sourceField, targetPath: groupMapping?.targetPath }
        : undefined,
    },
  };
  const validation = groupingService.validate(workspace.dataPreview, profile);
  if (!validation.valid) return workspace;
  const groupingResult = groupingService.buildGroups(workspace.dataPreview, profile);
  const repaired: StoredImportWorkspace = {
    ...workspace,
    groupingMode,
    groupingResult,
    groups: groupingResult.groups,
    updatedAt: new Date().toISOString(),
  };
  try { await saveImportWorkspace(repaired); } catch { /* Keep repaired data in-memory even if IndexedDB write fails. */ }
  return repaired;
}

function formatSourceDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function createBlock(type: TemplateBlock['type'], field = 'group.key', collection = 'items'): TemplateBlock {
  if (type === 'BOX') {
    return { id: makeId('block'), type:'BOX', name:'Box', style:{widthMode:'PERCENT',widthPercent:100,heightMode:'MINIMUM',minHeightMm:20,overflow:'EXPAND',backgroundColor:'#FFFFFF',border:{style:'SOLID',width:1,color:'#CBD5E1'},borderRadiusMm:0,padding:{top:2,right:2,bottom:2,left:2},horizontalAlignment:'LEFT',verticalAlignment:'TOP'}, layout:{widthPercent:100,alignment:'LEFT',keepTogether:true}, children:[] };
  }
  if (type === 'ROW') {
    return { id: makeId('block'), type: 'ROW', gap: 4, verticalAlignment: 'TOP', layout: { widthPercent: 100, alignment: 'LEFT' }, children: [], columns: [{ id: makeId('cell'), widthPercent: 100, style: defaultCellStyle(), children: [] }] };
  }
  if (type === 'CUSTOM_TABLE') {
    return createCustomTable(2, 2);
  }
  if (type === 'SUMMARY_TABLE') {
    const labelCol = makeId('sum-col'); const valueCol = makeId('sum-col');
    return {
      id: makeId('block'), type: 'SUMMARY_TABLE', title: 'Amount Summary', dataMode: 'MANUAL', sourcePath: collection || 'items', showHeader: false,
      layout: { widthPercent: 45, alignment: 'RIGHT', marginTop: 4 },
      tableStyle: { widthPercent: 45, alignment: 'RIGHT', headerStyle: { fontFamily:'Arial', fontSize:10, bold:true, textColor:'#111827', backgroundColor:'#F3F4F6' }, cellStyle: { fontFamily:'Arial', fontSize:10, textColor:'#111827', backgroundColor:'#FFFFFF' }, border:{style:'SOLID',width:1,color:'#9CA3AF'}, cellPadding:{top:1.5,right:2,bottom:1.5,left:2} },
      columns: [{ id: labelCol, label:'Label', widthPercent:65, alignment:'LEFT' }, { id:valueCol, label:'Value', widthPercent:35, alignment:'RIGHT' }],
      rows: [{ id:makeId('sum-row'), cells:[{id:makeId('sum-cell'),columnId:labelCol,value:{operation:'STATIC',staticValue:'Net Amount'}},{id:makeId('sum-cell'),columnId:valueCol,value:{operation:'SUM',path:'rate',sourcePath:collection || 'items',decimals:2},alignment:'RIGHT'}] }],
      totalRow: { id:makeId('sum-total'), bold:true, cells:[{id:makeId('sum-cell'),columnId:labelCol,value:{operation:'STATIC',staticValue:'TOTAL AMOUNT'}},{id:makeId('sum-cell'),columnId:valueCol,value:{operation:'SUM',path:'rate',sourcePath:collection || 'items',decimals:2},alignment:'RIGHT'}] },
    };
  }
  if (type === 'TABLE') {
    return {
      id: makeId('block'), type: 'TABLE', sourcePath: collection || 'items',
      tableStyle: { showHeader: true, showBorder: true, widthPercent: 100, alignment: 'LEFT', headerStyle: { fontFamily: 'Arial', fontSize: 11, bold: true, textColor: '#111827', backgroundColor: '#F3F4F6' }, cellStyle: { fontFamily: 'Arial', fontSize: 10, textColor: '#111827' }, border: { style: 'SOLID', width: 1, color: '#CBD5E1' }, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } },
      columns: [{ id: makeId('col'), label: 'Column', path: 'product', alignment: 'LEFT' }],
    };
  }
  return createRowChild(type, field);
}

function createRowChild(type: RowChildBlock['type'], field = 'group.key'): RowChildBlock {
  switch (type) {
    case 'BOX': return createBlock('BOX',field) as BoxBlock;
    case 'TEXT': return { id: makeId('block'), type, text: 'New text', style: { fontFamily: 'Arial', fontSize: 12, textColor: '#000000', backgroundColor: '#FFFFFF', alignment: 'LEFT' }, layout: { widthPercent: 50, alignment: 'LEFT' } };
    case 'FIELD': return { id: makeId('block'), type, label: 'Field', path: field || 'group.key', fallback: '—', layoutMode: 'INLINE', textAlignment: 'LEFT', labelStyle: { fontFamily: 'Arial', fontSize: 12, bold: true, textColor: '#374151', alignment: 'LEFT' }, valueStyle: { fontFamily: 'Arial', fontSize: 12, textColor: '#000000', alignment: 'LEFT' }, layout: { widthPercent: 50, alignment: 'LEFT' } };
    case 'CUSTOM_TABLE': return createCustomTable(2, 2);
    case 'TABLE': return { id: makeId('block'), type, sourcePath: 'items', layout: { widthPercent: 100, alignment: 'LEFT' }, tableStyle: { showHeader: true, showBorder: true, widthPercent: 100, alignment: 'LEFT', headerStyle: { fontFamily:'Arial',fontSize:9,bold:true,textColor:'#111827',backgroundColor:'#F3F4F6' }, cellStyle: { fontFamily:'Arial',fontSize:9,textColor:'#111827',backgroundColor:'#FFFFFF' }, border:{style:'SOLID',width:1,color:'#CBD5E1'}, cellPadding:{top:1,right:1,bottom:1,left:1} }, columns:[{id:makeId('col'),label:'Column',path:'group.key',alignment:'LEFT'}] };
    case 'SUMMARY_TABLE': { const labelCol=makeId('sum-col'), valueCol=makeId('sum-col'); return { id:makeId('block'), type, title:'', dataMode:'MANUAL', sourcePath:'items', showHeader:false, layout:{widthPercent:100,alignment:'LEFT'}, tableStyle:{showHeader:true,showBorder:true,widthPercent:100,alignment:'LEFT',headerStyle:{fontFamily:'Arial',fontSize:9,bold:true,textColor:'#111827',backgroundColor:'#F3F4F6'},cellStyle:{fontFamily:'Arial',fontSize:9,textColor:'#111827',backgroundColor:'#FFFFFF'},border:{style:'SOLID',width:1,color:'#9CA3AF'},cellPadding:{top:1,right:1,bottom:1,left:1}},columns:[{id:labelCol,label:'Label',widthPercent:45,alignment:'LEFT'},{id:valueCol,label:'Value',widthPercent:55,alignment:'LEFT'}],rows:[] }; }
    case 'IMAGE': return { id: makeId('block'), type, sourceType: 'DATA_URL', source: transparentPixel(), altText: 'Logo', width: 30, maintainAspectRatio: true, alignment: 'LEFT', layout: { widthPercent: 50, alignment: 'LEFT' } };
    case 'SPACER': return { id: makeId('block'), type, height: 5, layout: { widthPercent: 50, alignment: 'LEFT' } };
    case 'DIVIDER': return { id: makeId('block'), type, thickness: 1, color: '#94A3B8', style: 'SOLID', layout: { widthPercent: 50, alignment: 'LEFT', marginTop: 3, marginBottom: 3 } };
  }
}

function basicInvoice(): TemplateDefinition {
  const now = new Date().toISOString();
  return {
    id: 'basic-invoice-v1', name: 'Basic Invoice', version: 1,
    page: { size: 'A4', orientation: 'PORTRAIT', margins: { top: 15, right: 15, bottom: 15, left: 15 }, backgroundColor: '#FFFFFF', border: { enabled: true, style: 'SOLID', width: 1, color: '#CBD5E1', offset: 5 }, pagination: { repeatHeader: true, repeatFooter: true, footerMode: 'REPEAT_PAGE', showPageNumbers: true, pageNumberPosition: 'BOTTOM_CENTER', keepSummaryTogether: true, keepCustomGridTogether: true } },
    header: { blocks: [{ id: 'header-row', type: 'ROW', gap: 4, verticalAlignment: 'CENTER', layout: { widthPercent: 100, alignment: 'LEFT', marginBottom: 4 }, children: [], columns: [
      { id: 'header-cell-logo', widthPercent: 30, style: { backgroundColor: '#FFFFFF', border: { style: 'NONE', width: 0, color: '#CBD5E1' }, padding: { top: 2, right: 2, bottom: 2, left: 2 }, verticalAlignment: 'CENTER', horizontalAlignment: 'LEFT' }, children: [
        { id: 'logo', type: 'IMAGE', sourceType: 'DATA_URL', source: transparentPixel(), altText: 'Company Logo Placeholder', width: 25, maintainAspectRatio: true, alignment: 'LEFT', layout: { widthPercent: 100, alignment: 'LEFT' } }
      ] },
      { id: 'header-cell-title', widthPercent: 70, style: { backgroundColor: '#FFFFFF', border: { style: 'NONE', width: 0, color: '#CBD5E1' }, padding: { top: 2, right: 2, bottom: 2, left: 2 }, verticalAlignment: 'CENTER', horizontalAlignment: 'CENTER' }, children: [
        { id: 'head-title', type: 'TEXT', text: 'TAX INVOICE', style: { fontFamily: 'Arial', fontSize: 22, bold: true, textColor: '#111827', backgroundColor: '#FFFFFF', alignment: 'CENTER' }, layout: { widthPercent: 100, alignment: 'LEFT' } }
      ] }
    ] }] },
    body: { blocks: [
      { id: 'f-inv', type: 'FIELD', label: 'Invoice No', path: 'invoice.number', fallback: '—', layoutMode: 'INLINE', textAlignment: 'RIGHT', labelStyle: { fontFamily: 'Arial', fontSize: 11, bold: true, textColor: '#6B7280', alignment: 'RIGHT' }, valueStyle: { fontFamily: 'Times New Roman', fontSize: 12, bold: true, textColor: '#1D4ED8', alignment: 'RIGHT' }, layout: { widthPercent: 50, alignment: 'RIGHT', marginBottom: 2 } },
      { id: 'f-customer', type: 'FIELD', label: 'Customer Name', path: 'customer.name', fallback: '—', labelStyle: { fontFamily: 'Arial', fontSize: 11, bold: true, textColor: '#374151' }, valueStyle: { fontFamily: 'Arial', fontSize: 11, textColor: '#111827' }, layout: { widthPercent: 75, alignment: 'LEFT', marginBottom: 2 } },
      { id: 'divider-1', type: 'DIVIDER', thickness: 1, color: '#94A3B8', style: 'SOLID', layout: { widthPercent: 100, alignment: 'CENTER', marginTop: 2, marginBottom: 3 } },
      { id: 'items-table', type: 'TABLE', sourcePath: 'items', tableStyle: { showHeader: true, showBorder: true, widthPercent: 75, alignment: 'CENTER', headerStyle: { fontFamily: 'Arial', fontSize: 11, bold: true, textColor: '#111827', backgroundColor: '#F3F4F6', alignment: 'LEFT' }, cellStyle: { fontFamily: 'Arial', fontSize: 10, textColor: '#111827', backgroundColor: '#FFFFFF' }, border: { style: 'SOLID', width: 1, color: '#CBD5E1' }, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } }, columns: [
        { id: 'c-product', label: 'Product', path: 'product', widthPercent: 50, alignment: 'LEFT' },
        { id: 'c-qty', label: 'Qty', path: 'qty', widthPercent: 20, alignment: 'CENTER' },
        { id: 'c-rate', label: 'Rate', path: 'rate', widthPercent: 30, alignment: 'RIGHT' },
      ], footerRows: [{ id:'items-total-row', style:{fontFamily:'Arial',fontSize:10,bold:true,textColor:'#111827'}, cells:[
        { id:'items-total-label', columnId:'c-product', colspan:1, value:{operation:'STATIC',staticValue:'TOTAL'}, alignment:'RIGHT' },
        { id:'items-total-qty', columnId:'c-qty', value:{operation:'SUM',path:'qty',decimals:0}, alignment:'CENTER' },
        { id:'items-total-rate', columnId:'c-rate', value:{operation:'SUM',path:'rate',decimals:2}, alignment:'RIGHT' },
      ] }] },
      { id:'amount-summary', type:'SUMMARY_TABLE', title:'Amount Summary', dataMode:'MANUAL', sourcePath:'items', showHeader:false, layout:{widthPercent:45,alignment:'RIGHT',marginTop:5}, tableStyle:{widthPercent:45,alignment:'RIGHT',cellStyle:{fontFamily:'Arial',fontSize:10,textColor:'#111827'},border:{style:'SOLID',width:1,color:'#9CA3AF'},cellPadding:{top:1.5,right:2,bottom:1.5,left:2}}, columns:[
        {id:'sum-label',label:'Label',widthPercent:65,alignment:'LEFT'}, {id:'sum-value',label:'Value',widthPercent:35,alignment:'RIGHT'}
      ], rows:[
        {id:'sum-net',cells:[{id:'sum-net-l',columnId:'sum-label',value:{operation:'STATIC',staticValue:'Net Amount'}},{id:'sum-net-v',columnId:'sum-value',value:{operation:'SUM',path:'rate',decimals:2},alignment:'RIGHT'}]},
        {id:'sum-count',cells:[{id:'sum-count-l',columnId:'sum-label',value:{operation:'STATIC',staticValue:'Line Count'}},{id:'sum-count-v',columnId:'sum-value',value:{operation:'COUNT'},alignment:'RIGHT'}]}
      ], totalRow:{id:'sum-grand',bold:true,cells:[{id:'sum-grand-l',columnId:'sum-label',value:{operation:'STATIC',staticValue:'TOTAL AMOUNT'}},{id:'sum-grand-v',columnId:'sum-value',value:{operation:'SUM',path:'rate',decimals:2},alignment:'RIGHT'}]} },
    ] },
    footer: { blocks: [{ id: 'foot-thanks', type: 'TEXT', text: 'Thank you for your business', style: { fontFamily: 'Arial', fontSize: 10, textColor: '#4B5563', backgroundColor: '#FFFFFF', alignment: 'CENTER' }, layout: { widthPercent: 100, alignment: 'CENTER' } }] },
    metadata: { createdAt: now, updatedAt: now, description: 'Phase 3.5 live-data invoice sample with totals and summary tables' },
  };
}

function getBlocks(template: TemplateDefinition, region: TemplateRegionName) {
  return region === 'HEADER' ? template.header.blocks : region === 'FOOTER' ? template.footer.blocks : template.body.blocks;
}

function updateRegion(template: TemplateDefinition, region: TemplateRegionName, blocks: TemplateBlock[]): TemplateDefinition {
  return region === 'HEADER' ? { ...template, header: { blocks } } : region === 'FOOTER' ? { ...template, footer: { blocks } } : { ...template, body: { blocks } };
}

function findSelection(blocks: TemplateBlock[], id: string): Selection {
  if (!id) return null;
  for (const block of blocks) {
    if (block.id === id) return { block };
    if (block.type === 'ROW') {
      const child = block.children.find((item) => item.id === id);
      if (child) return { block: child, parentRow: block };
      for (const column of block.columns ?? []) {
        const cellChild = column.children.find((item) => item.id === id);
        if (cellChild) return { block: cellChild, parentRow: block, parentColumnId: column.id };
      }
    }
  }
  return null;
}

function blockTypeName(block: TemplateBlock | RowChildBlock) {
  switch (block.type) {
    case 'TEXT': return 'Text';
    case 'FIELD': return 'Field';
    case 'TABLE': return 'Data Table';
    case 'CUSTOM_TABLE': return 'Custom Grid';
    case 'SUMMARY_TABLE': return 'Summary Table';
    case 'IMAGE': return 'Image';
    case 'ROW': return 'Row / Grid';
    case 'BOX': return 'Box / Shape';
    case 'DIVIDER': return 'Divider';
    case 'SPACER': return 'Spacer';
  }
  return 'Element';
}

function blockTypeIcon(block: TemplateBlock | RowChildBlock) {
  return block.type === 'TEXT' ? <Type size={14}/> :
    block.type === 'FIELD' ? <Braces size={14}/> :
    block.type === 'IMAGE' ? <ImageIcon size={14}/> :
    block.type === 'TABLE' ? <Table2 size={14}/> :
    block.type === 'CUSTOM_TABLE' ? <Table2 size={14}/> :
    block.type === 'SUMMARY_TABLE' ? <Table2 size={14}/> :
    block.type === 'DIVIDER' ? <Minus size={14}/> :
    block.type === 'SPACER' ? <Space size={14}/> :
    block.type === 'ROW' ? <span>↔</span> :
    block.type === 'BOX' ? <span>□</span> : <span>•</span>;
}

function blockLabel(block: TemplateBlock | RowChildBlock) {
  return block.type === 'TEXT' ? block.text : block.type === 'FIELD' ? `${block.label ?? 'Field'} · ${block.path}` : block.type === 'TABLE' ? `Table · ${block.sourcePath}` : block.type === 'CUSTOM_TABLE' ? `Custom Grid · ${block.rowCount}×${block.columnCount}` : block.type === 'SUMMARY_TABLE' ? `Summary · ${block.title ?? 'Table'}` : block.type === 'IMAGE' ? block.altText ?? 'Image' : block.type === 'ROW' ? `Row · ${block.columns?.length ? `${block.columns.length} cells` : `${block.children.length} children`}` : block.type === 'BOX' ? `Box · ${block.name ?? `${block.children.length} items`}` : block.type;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function isStoredSourceConfiguration(value:unknown):value is StoredImportWorkspace{return typeof value==='object'&&value!==null&&typeof (value as {id?:unknown}).id==='string'&&typeof (value as {updatedAt?:unknown}).updatedAt==='string'&&Array.isArray((value as {groups?:unknown}).groups);}
function displayFont(value: FontFamily) { return value === 'system-ui' ? 'System UI' : value === 'sans-serif' ? 'Sans Serif' : value === 'serif' ? 'Serif' : value === 'monospace' ? 'Monospace' : value; }
function defaultCellStyle(): CellStyle { return { widthMode:'AUTO',heightMode:'AUTO',overflow:'EXPAND',backgroundColor:'#FFFFFF',border:{style:'NONE',width:0,color:'#CBD5E1'},borderRadiusMm:0,padding:{top:2,right:2,bottom:2,left:2},minHeight:0,minHeightMm:0,horizontalAlignment:'LEFT',verticalAlignment:'TOP' }; }
function transparentPixel() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLz9QAAAABJRU5ErkJggg=='; }
