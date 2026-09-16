import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileOutput, FileText, Files, History, Loader2, Play, RefreshCw, Search } from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { RecordPicker } from '../components/RecordPicker.tsx';
import { activeRecord, activeSource, displayValue, loadDataState, loadDataStateAsync, saveDataSelection, valueForField, type BuilderDataState, type BuilderDataSource } from '../lib/dataSourceStore.ts';
import { PDF_RENDER_PROFILES, readPdfRenderProfile, writePdfRenderProfile, type PdfRenderProfileId } from '../lib/pdfRenderProfile.ts';
import { analyzeNativePdfCompatibility, readPdfRenderMode, renderNativeCombinedPdf, renderNativeSinglePdf, writePdfRenderMode, type NativePdfMode } from '../lib/nativePdfGeneration.ts';
import { downloadPdf } from '../lib/exactPdfExport.ts';
import { ACTIVE_TEMPLATE_ID_KEY, TEMPLATE_LIBRARY_EVENT, migrateLegacyTemplateToLibrary, openTemplateFromLibrary, readTemplateLibrary, type TemplateLibraryEntry } from '../lib/templateLibrary.ts';
import {
  buildDocumentOptions,
  BULK_GENERATION_EVENT,
  GENERATION_HISTORY_EVENT,
  GENERATION_PROGRESS_EVENT,
  readGenerationProgress,
  readGenerationRequest,
  readBulkGeneration,
  writeBulkGeneration,
  readGenerationHistory,
  readSavedTemplateSummary,
  resolveFileNamePattern,
  validateGeneration,
  writeGenerationRequest,
  writeGenerationProgress,
  clearGenerationProgress,
  appendGenerationHistory,
  TEMPLATE_STORAGE_KEY,
  type GenerationFormat,
  type GenerationHistoryEntry,
} from '../lib/generationEngine.ts';


function GenerationProgressRing({ completed, total, failed, status }: { completed: number; total: number; failed: number; status: 'running' | 'complete' | 'paused' }) {
  const safeTotal = Math.max(0, total);
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal || completed);
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeCompleted / safeTotal) * 100)) : 0;
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);
  const stateClass = status === 'complete' ? (failed > 0 ? 'failed' : 'complete') : status === 'paused' ? 'paused' : 'running';

  return <div
    className={`generation-progress-ring ${stateClass}`}
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={safeTotal || 1}
    aria-valuenow={safeCompleted}
    aria-label={`Generation progress ${safeCompleted} of ${safeTotal}`}
  >
    <svg viewBox="0 0 58 58" aria-hidden="true">
      <circle className="generation-progress-track" cx="29" cy="29" r={radius} />
      <circle
        className="generation-progress-value"
        cx="29"
        cy="29"
        r={radius}
        style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }}
      />
    </svg>
    <span>{percent}%</span>
  </div>;
}

export function Generate({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const [dataState, setDataState] = useState<BuilderDataState>(() => loadDataState());
  const [format, setFormat] = useState<GenerationFormat>('pdf');
  const [pdfRenderProfile, setPdfRenderProfile] = useState<PdfRenderProfileId>(() => readPdfRenderProfile(window.localStorage));
  const [pdfRenderMode, setPdfRenderMode] = useState<NativePdfMode>(() => readPdfRenderMode(window.localStorage));
  const [filePattern, setFilePattern] = useState('{{Document}}');
  const [history, setHistory] = useState<GenerationHistoryEntry[]>(() => readGenerationHistory(window.localStorage));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<number[]>([]);
  const [bulkPdfOutput, setBulkPdfOutput] = useState<'separate' | 'combined-pdf'>('separate');
  const [combinedFileName, setCombinedFileName] = useState('Combined_Invoices');
  const [bulkState, setBulkState] = useState(() => readBulkGeneration(window.localStorage));
  const [activeRequestId, setActiveRequestId] = useState<string | null>(() => readGenerationRequest(window.localStorage)?.id ?? null);
  const [generationProgress, setGenerationProgress] = useState(() => readGenerationProgress(window.localStorage));
  const [bulkSearch, setBulkSearch] = useState('');
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const [template, setTemplate] = useState(() => readSavedTemplateSummary(window.localStorage));
  const [templateLibrary, setTemplateLibrary] = useState<TemplateLibraryEntry[]>(() => readTemplateLibrary(window.localStorage));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => window.localStorage.getItem(ACTIVE_TEMPLATE_ID_KEY));
  const source = activeSource(dataState);
  const record = activeRecord(dataState);
  const parentKeys = source ? (template?.parentKeysBySource[source.id] ?? []) : [];
  const documentOptions = source ? buildDocumentOptions(source, parentKeys) : [];
  const selectedDocument = documentOptions.find((item) => item.value === dataState.activeRecordIndex) ?? documentOptions[0];
  const documentLabel = selectedDocument?.rawLabel ?? `Record-${dataState.activeRecordIndex + 1}`;
  const resolvedFileName = resolveFileNamePattern(filePattern, record, template?.name ?? 'Document', documentLabel);
  const errors = validateGeneration({ template, source, record, format, fileName: resolvedFileName });
  const nativeCompatibility = useMemo(() => analyzeNativePdfCompatibility(window.localStorage.getItem(TEMPLATE_STORAGE_KEY), source), [template?.name, template?.updatedAt, source?.id]);
  const filteredDocumentOptions = useMemo(() => {
    const query = bulkSearch.trim().toLowerCase();
    if (!query || !source) return documentOptions;
    return documentOptions.filter((item) => {
      const details = documentDetails(source, item.value);
      return [item.label, item.rawLabel, details.customer, details.date, details.amount].some((value) => value.toLowerCase().includes(query));
    });
  }, [bulkSearch, documentOptions, source]);
  const historyGroups = useMemo(() => buildHistoryGroups(history), [history]);
  const visibleHistoryGroups = showAllHistory ? historyGroups : historyGroups.slice(0, 8);

  useEffect(() => {
    const library = migrateLegacyTemplateToLibrary(window.localStorage);
    setTemplateLibrary(library);
    const activeId = window.localStorage.getItem(ACTIVE_TEMPLATE_ID_KEY) ?? library[0]?.id ?? null;
    setSelectedTemplateId(activeId);
    setTemplate(readSavedTemplateSummary(window.localStorage));
  }, []);

  useEffect(() => {
    const refreshTemplates = () => {
      const library = readTemplateLibrary(window.localStorage);
      setTemplateLibrary(library);
      setSelectedTemplateId(window.localStorage.getItem(ACTIVE_TEMPLATE_ID_KEY) ?? library[0]?.id ?? null);
      setTemplate(readSavedTemplateSummary(window.localStorage));
    };
    window.addEventListener(TEMPLATE_LIBRARY_EVENT, refreshTemplates);
    return () => window.removeEventListener(TEMPLATE_LIBRARY_EVENT, refreshTemplates);
  }, []);

  useEffect(() => {
    void loadDataStateAsync()
      .then((state) => {
        setDataState(state);
        const active = activeSource(state);
        if (active && template?.sourceIds.length && template.sourceIds.includes(active.id)) return;
        const preferred = state.sources.find((item) => template?.sourceIds.includes(item.id));
        if (preferred) {
          const next = { ...state, activeSourceId: preferred.id, activeRecordIndex: 0 };
          setDataState(next);
          saveDataSelection(next);
        }
      })
      .finally(() => setLoading(false));
  }, [template?.name, template?.updatedAt]);

  useEffect(() => {
    const refreshHistory = () => {
      const nextHistory = readGenerationHistory(window.localStorage);
      setHistory(nextHistory);
      if (activeRequestId && nextHistory.some((item) => item.id === activeRequestId)) setActiveRequestId(null);
    };
    const refreshProgress = () => setGenerationProgress(readGenerationProgress(window.localStorage));
    const refreshBulk = () => setBulkState(readBulkGeneration(window.localStorage));
    window.addEventListener('focus', refreshHistory);
    window.addEventListener('storage', refreshHistory);
    window.addEventListener(GENERATION_HISTORY_EVENT, refreshHistory);
    window.addEventListener(GENERATION_PROGRESS_EVENT, refreshProgress);
    window.addEventListener(BULK_GENERATION_EVENT, refreshBulk);
    return () => {
      window.removeEventListener('focus', refreshHistory);
      window.removeEventListener('storage', refreshHistory);
      window.removeEventListener(GENERATION_HISTORY_EVENT, refreshHistory);
      window.removeEventListener(GENERATION_PROGRESS_EVENT, refreshProgress);
      window.removeEventListener(BULK_GENERATION_EVENT, refreshBulk);
    };
  }, [activeRequestId]);

  function changeTemplate(templateId: string) {
    const entry = openTemplateFromLibrary(window.localStorage, templateId);
    if (!entry) return;
    const nextTemplate = readSavedTemplateSummary(window.localStorage);
    setSelectedTemplateId(entry.id);
    setTemplate(nextTemplate);
    setBulkSelected([]);
    setMessage('');

    if (nextTemplate?.sourceIds.length) {
      const preferred = dataState.sources.find((item) => nextTemplate.sourceIds.includes(item.id));
      if (preferred && preferred.id !== dataState.activeSourceId) {
        const nextState = { ...dataState, activeSourceId: preferred.id, activeRecordIndex: 0 };
        setDataState(nextState);
        saveDataSelection(nextState);
      }
    }
  }

  function changeSource(sourceId: string) {
    const next = { ...dataState, activeSourceId: sourceId, activeRecordIndex: 0 };
    setDataState(next);
    saveDataSelection(next);
    setMessage('');
  }

  function changeRecord(index: number) {
    const next = { ...dataState, activeRecordIndex: index };
    setDataState(next);
    saveDataSelection(next);
    setMessage('');
  }

  useEffect(() => {
    if (!bulkMode) return;
    setBulkSelected((current) => current.filter((value) => documentOptions.some((item) => item.value === value)));
  }, [bulkMode, source?.id, documentOptions.length]);

  useEffect(() => {
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      const bulk = readBulkGeneration(window.localStorage);
      setBulkState(bulk);
      if (!bulk || bulk.status !== 'running') return;
      if (bulk.renderMode === 'native-auto') return;
      const historyNow = readGenerationHistory(window.localStorage);
      const completed = new Set(bulk.completedIds);
      const failed = new Set(bulk.failedIds);
      for (const request of bulk.requests) {
        const result = historyNow.find((item) => item.id === request.id);
        if (result) { completed.add(request.id); if (result.status === 'failed') failed.add(request.id); }
      }
      const updated = { ...bulk, completedIds: Array.from(completed), failedIds: Array.from(failed) };
      if (updated.outputMode === 'combined-pdf' && failed.size > 0) {
        updated.status = 'complete';
        writeBulkGeneration(window.localStorage, updated);
        setBulkState(updated);
        setActiveRequestId(null);
        setMessage('Combined PDF stopped because one invoice failed. No partial combined PDF was downloaded.');
        return;
      }
      const next = updated.requests.find((request) => !completed.has(request.id));
      if (!next) {
        updated.status = 'complete';
        writeBulkGeneration(window.localStorage, updated);
        setBulkState(updated);
        setActiveRequestId(null);
        setMessage(updated.failedIds.length ? `Bulk generation complete · ${updated.failedIds.length} failed.` : 'Generation complete. Your file is ready.');
        return;
      }
      writeBulkGeneration(window.localStorage, updated);
      // A hidden Builder render host handles the active request in the background.
      // Do not queue a second request until the current one has written its history entry.
      if (readGenerationRequest(window.localStorage)) return;
      const nextData = { ...loadDataState(), activeSourceId: next.sourceId, activeRecordIndex: next.activeRecordIndex };
      setDataState(nextData);
      saveDataSelection(nextData);
      setActiveRequestId(next.id);
      writeGenerationRequest(window.localStorage, next);
      setMessage(updated.outputMode === 'combined-pdf'
        ? `Combined PDF ${completed.size + 1} / ${updated.requests.length}: ${next.documentLabel}`
        : `Bulk generation ${completed.size + 1} / ${updated.requests.length}: ${next.documentLabel}`);
    };
    advance();
    const timer = window.setInterval(advance, 250);
    window.addEventListener(GENERATION_HISTORY_EVENT, advance);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener(GENERATION_HISTORY_EVENT, advance); };
  }, []);
  async function startBulkGeneration() {
    if (!template || !source || bulkSelected.length === 0) { setMessage('Select at least one document for bulk generation.'); return; }
    const selected = documentOptions.filter((item) => bulkSelected.includes(item.value));
    const useCombinedPdf = format === 'pdf' && bulkPdfOutput === 'combined-pdf';
    const batchId = crypto.randomUUID();
    const finalCombinedName = (combinedFileName.trim() || 'Combined_Invoices').replace(/\.pdf$/i, '');
    const useNative = format === 'pdf' && pdfRenderMode === 'native-auto' && nativeCompatibility.supported;
    const requests = selected.map((item, index) => {
      const selectedRecord = source.records[item.value] ?? null;
      return {
        id: crypto.randomUUID(), templateName: template.name, sourceId: source.id, activeRecordIndex: item.value, documentLabel: item.rawLabel, format,
        fileName: useCombinedPdf ? finalCombinedName : resolveFileNamePattern(filePattern, selectedRecord, template.name, item.rawLabel),
        pdfRenderProfile: format === 'pdf' ? pdfRenderProfile : undefined,
        pdfRenderMode: format === 'pdf' ? ((useNative ? 'native-auto' : 'exact') as NativePdfMode) : undefined,
        createdAt: new Date().toISOString(),
        combinedPdf: useCombinedPdf ? { batchId, index, total: selected.length, finalFileName: finalCombinedName } : undefined,
      };
    });
    const bulk = { id: batchId, sourceId: source.id, format, filePattern, requests, completedIds: [], failedIds: [], status: 'running' as const, outputMode: useCombinedPdf ? 'combined-pdf' as const : 'separate' as const, renderMode: useNative ? 'native-auto' as const : 'exact' as const, combinedFileName: useCombinedPdf ? finalCombinedName : undefined, createdAt: new Date().toISOString() };
    writeBulkGeneration(window.localStorage, bulk); setBulkState(bulk);

    if (!useNative) {
      if (format === 'pdf' && pdfRenderMode === 'native-auto' && !nativeCompatibility.supported) setMessage(`Fast / Native is not compatible with this template yet. Using Exact Preview: ${nativeCompatibility.reasons[0] ?? 'unsupported content'}`);
      const first = requests[0]; if (!first) return;
      const nextData = { ...dataState, activeSourceId: first.sourceId, activeRecordIndex: first.activeRecordIndex };
      setDataState(nextData); saveDataSelection(nextData); setActiveRequestId(first.id); writeGenerationRequest(window.localStorage, first);
      setMessage(useCombinedPdf ? `Combined PDF 1 / ${requests.length}: ${first.documentLabel}` : `Bulk generation 1 / ${requests.length}: ${first.documentLabel}`);
      return;
    }

    const runId=batchId; setActiveRequestId(runId);
    const updateBulk=(completedIds:string[],failedIds:string[],status:'running'|'complete')=>{const next={...bulk,completedIds,failedIds,status};writeBulkGeneration(window.localStorage,next);setBulkState(next);};
    const completed:string[]=[]; const failed:string[]=[];
    try {
      if (useCombinedPdf) {
        const result=await renderNativeCombinedPdf({savedTemplateRaw:window.localStorage.getItem(TEMPLATE_STORAGE_KEY),source,recordIndexes:selected.map((item)=>item.value),fileName:finalCombinedName,onProgress:(percent,message,current,total)=>{writeGenerationProgress(window.localStorage,{requestId:runId,percent,current,total,message});setGenerationProgress(readGenerationProgress(window.localStorage));}});
        downloadPdf(result.bytes,finalCombinedName);
        for(const request of requests){completed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'success',completedAt:new Date().toISOString()});}
        updateBulk(completed,failed,'complete');
        setMessage(`Combined PDF ready · ${result.pageCount} pages · native renderer.`);
      } else {
        for(let index=0;index<requests.length;index+=1){
          const request=requests[index]!;
          try{
            const result=await renderNativeSinglePdf({savedTemplateRaw:window.localStorage.getItem(TEMPLATE_STORAGE_KEY),source,recordIndex:request.activeRecordIndex,fileName:request.fileName,onProgress:(pagePercent,message)=>{const percent=Math.round(((index+pagePercent/100)/Math.max(1,requests.length))*100);writeGenerationProgress(window.localStorage,{requestId:runId,percent,current:index,total:requests.length,message:`Invoice ${index+1} of ${requests.length} · ${message}`});setGenerationProgress(readGenerationProgress(window.localStorage));}});
            downloadPdf(result.bytes,request.fileName);completed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'success',completedAt:new Date().toISOString()});
          }catch(error){failed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'failed',completedAt:new Date().toISOString(),error:error instanceof Error?error.message:String(error)});}
          updateBulk(completed,failed,'running');
          await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));
        }
        updateBulk(completed,failed,'complete');
        setMessage(failed.length?`Native bulk generation complete · ${failed.length} failed.`:'Native bulk generation complete.');
      }
    } catch(error) {
      const detail=error instanceof Error?error.message:String(error);
      const unresolved=requests.filter((request)=>!completed.includes(request.id));
      for(const request of unresolved){failed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'failed',completedAt:new Date().toISOString(),error:detail});}
      updateBulk(completed,[...new Set(failed)],'complete'); setMessage(detail);
    } finally { clearGenerationProgress(window.localStorage); setGenerationProgress(null); setActiveRequestId(null); setHistory(readGenerationHistory(window.localStorage)); }
  }

  async function retryBulkFailures() {
    const bulk = readBulkGeneration(window.localStorage); if (!bulk?.failedIds.length) return;
    const failed = new Set(bulk.failedIds);
    const retryAll = bulk.outputMode === 'combined-pdf';
    const sourceRequests = retryAll ? bulk.requests : bulk.requests.filter((r) => failed.has(r.id));
    const retryBatchId = crypto.randomUUID();
    const requests = sourceRequests.map((r, index) => ({ ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString(), combinedPdf: retryAll ? { batchId: retryBatchId, index, total: sourceRequests.length, finalFileName: bulk.combinedFileName || 'Combined_Invoices' } : undefined }));
    const retry = { ...bulk, id: retryBatchId, requests, completedIds: [], failedIds: [], status:'running' as const, createdAt:new Date().toISOString() };
    writeBulkGeneration(window.localStorage,retry); setBulkState(retry);

    if (bulk.renderMode !== 'native-auto' || bulk.format !== 'pdf') {
      const first=retry.requests[0]; if(first){ const nextData={...dataState,activeSourceId:first.sourceId,activeRecordIndex:first.activeRecordIndex}; setDataState(nextData); saveDataSelection(nextData); setActiveRequestId(first.id); writeGenerationRequest(window.localStorage,first); }
      return;
    }

    const retrySource=dataState.sources.find((candidate)=>candidate.id===bulk.sourceId) ?? source;
    if(!retrySource){setMessage('The Data Source for this retry is unavailable.');return;}
    setActiveRequestId(retryBatchId);
    const completed:string[]=[]; const failedNext:string[]=[];
    const update=(status:'running'|'complete')=>{const next={...retry,completedIds:[...completed],failedIds:[...failedNext],status};writeBulkGeneration(window.localStorage,next);setBulkState(next);};
    try{
      if(retry.outputMode==='combined-pdf'){
        const finalName=retry.combinedFileName || 'Combined_Invoices';
        const result=await renderNativeCombinedPdf({savedTemplateRaw:window.localStorage.getItem(TEMPLATE_STORAGE_KEY),source:retrySource,recordIndexes:requests.map((request)=>request.activeRecordIndex),fileName:finalName,onProgress:(percent,message,current,total)=>{writeGenerationProgress(window.localStorage,{requestId:retryBatchId,percent,current,total,message});setGenerationProgress(readGenerationProgress(window.localStorage));}});
        downloadPdf(result.bytes,finalName);
        for(const request of requests){completed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'success',completedAt:new Date().toISOString()});}
      }else{
        for(let index=0;index<requests.length;index+=1){const request=requests[index]!;try{const result=await renderNativeSinglePdf({savedTemplateRaw:window.localStorage.getItem(TEMPLATE_STORAGE_KEY),source:retrySource,recordIndex:request.activeRecordIndex,fileName:request.fileName,onProgress:(part,message)=>{const percent=Math.round(((index+part/100)/Math.max(1,requests.length))*100);writeGenerationProgress(window.localStorage,{requestId:retryBatchId,percent,current:index,total:requests.length,message});setGenerationProgress(readGenerationProgress(window.localStorage));}});downloadPdf(result.bytes,request.fileName);completed.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'success',completedAt:new Date().toISOString()});}catch(error){failedNext.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'failed',completedAt:new Date().toISOString(),error:error instanceof Error?error.message:String(error)});}update('running');}
      }
      update('complete'); setMessage(failedNext.length?`Retry complete · ${failedNext.length} failed.`:'Retry complete.');
    }catch(error){const detail=error instanceof Error?error.message:String(error);for(const request of requests.filter((request)=>!completed.includes(request.id))){failedNext.push(request.id);appendGenerationHistory(window.localStorage,{...request,status:'failed',completedAt:new Date().toISOString(),error:detail});}update('complete');setMessage(detail);}finally{clearGenerationProgress(window.localStorage);setGenerationProgress(null);setActiveRequestId(null);setHistory(readGenerationHistory(window.localStorage));}
  }

  async function startGeneration() {
    if (errors.length || !template || !source || !record || !selectedDocument) {
      setMessage(errors[0] ?? 'Generation cannot start.');
      return;
    }
    const request = {
      id: crypto.randomUUID(),
      templateName: template.name,
      sourceId: source.id,
      activeRecordIndex: selectedDocument.value,
      documentLabel: selectedDocument.rawLabel,
      format,
      fileName: resolvedFileName,
      pdfRenderProfile: format === 'pdf' ? pdfRenderProfile : undefined,
      pdfRenderMode: format === 'pdf' ? pdfRenderMode : undefined,
      createdAt: new Date().toISOString(),
    };
    if (format === 'pdf' && pdfRenderMode === 'native-auto' && nativeCompatibility.supported) {
      setActiveRequestId(request.id); setMessage('Generating with native PDF renderer…');
      try {
        const result=await renderNativeSinglePdf({savedTemplateRaw:window.localStorage.getItem(TEMPLATE_STORAGE_KEY),source,recordIndex:selectedDocument.value,fileName:resolvedFileName,onProgress:(percent,message)=>{writeGenerationProgress(window.localStorage,{requestId:request.id,percent,message});setGenerationProgress(readGenerationProgress(window.localStorage));}});
        downloadPdf(result.bytes,resolvedFileName);
        appendGenerationHistory(window.localStorage,{...request,status:'success',completedAt:new Date().toISOString()});
        setHistory(readGenerationHistory(window.localStorage)); setMessage(`PDF ready · ${result.pageCount || 1} page${result.pageCount===1?'':'s'} · native renderer.`);
      } catch(error) {
        const detail=error instanceof Error?error.message:String(error);appendGenerationHistory(window.localStorage,{...request,status:'failed',completedAt:new Date().toISOString(),error:detail});setHistory(readGenerationHistory(window.localStorage));setMessage(detail);
      } finally {clearGenerationProgress(window.localStorage);setGenerationProgress(null);setActiveRequestId(null);}
      return;
    }
    if (format === 'pdf' && pdfRenderMode === 'native-auto' && !nativeCompatibility.supported) setMessage(`Native renderer fallback → Exact Preview. ${nativeCompatibility.reasons[0] ?? ''}`);
    const exactRequest = format === 'pdf' && pdfRenderMode === 'native-auto' ? { ...request, pdfRenderMode: 'exact' as const } : request;
    setActiveRequestId(exactRequest.id);
    writeGenerationRequest(window.localStorage, exactRequest);
    setMessage(format === 'pdf' && pdfRenderMode === 'native-auto' ? 'Using Exact Preview fallback in the background…' : 'Generating in the background…');
  }

  function clearHistory() {
    window.localStorage.removeItem('document-builder.generation.history.db5b.v1');
    setHistory([]);
  }

  const runningBulk = bulkState?.status === 'running' ? bulkState : null;
  const generationActive = Boolean(activeRequestId || runningBulk);
  const activeFormat = runningBulk?.format ?? format;
  const activeLabel = activeFormat === 'pdf' ? (runningBulk?.outputMode === 'combined-pdf' ? 'Your combined PDF is generating...' : 'Your PDF is generating...') : 'Your document is generating...';
  const completedDocuments = runningBulk?.completedIds.length ?? 0;
  const totalDocuments = runningBulk?.requests.length ?? 1;
  const currentFraction = generationProgress && (!activeRequestId || generationProgress.requestId === activeRequestId) ? generationProgress.percent / 100 : 0;
  const overlayPercent = runningBulk?.renderMode === 'native-auto'
    ? Math.min(99, Math.max(1, Math.round(generationProgress?.percent ?? (generationActive ? 4 : 0))))
    : runningBulk
      ? Math.min(99, Math.max(1, Math.round(((completedDocuments + currentFraction) / Math.max(1, totalDocuments)) * 100)))
      : Math.min(99, Math.max(1, Math.round(generationProgress?.percent ?? (generationActive ? 4 : 0))));

  const validationRows = [
    ['Saved template', Boolean(template), template?.name ?? 'Save the template first'],
    ['Data source', Boolean(source), source?.name ?? 'No source selected'],
    [bulkMode ? 'Documents' : 'Document / record', bulkMode ? bulkSelected.length > 0 : Boolean(record), bulkMode ? `${bulkSelected.length} selected` : selectedDocument?.label ?? 'No record selected'],
    ['Output format', Boolean(format), formatLabel(format)],
    ['File name', Boolean((bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? combinedFileName : resolvedFileName).trim()), bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? combinedFileName : resolvedFileName],
    ['Template-source match', !(template && source && template.sourceIds.length > 0 && !template.sourceIds.includes(source.id)), template?.sourceIds.length ? 'Bound source verified' : 'Template has no source restriction'],
  ] as const;
  const readyToGenerate = bulkMode ? Boolean(template && source && bulkSelected.length > 0) : errors.length === 0;
  const outputSummary = format === 'pdf'
    ? (bulkMode ? (bulkPdfOutput === 'combined-pdf' ? 'Combined PDF' : 'Separate PDFs') : 'PDF')
    : formatLabel(format);

  return <div className="page generate-page generate-workspace">
    {generationActive ? <GenerationOverlay percent={overlayPercent} label={activeLabel} detail={generationProgress?.message || message} completed={runningBulk ? completedDocuments : undefined} total={runningBulk ? totalDocuments : undefined} /> : null}
    <PageHeader
      eyebrow="Output"
      title={bulkMode ? 'Generate Documents' : 'Generate Document'}
      description="Create production-ready PDF or DOCX files from your saved template and imported business data."
      actions={<button className="secondary" onClick={() => onNavigate('builder')}><FileText size={16}/>Open Template Builder</button>}
    />

    <section className="generation-status-strip" aria-label="Generation readiness">
      <div className={template ? 'ready' : 'pending'}><CheckCircle2 size={15}/><span>Template</span><strong>{template?.name ?? 'Required'}</strong></div>
      <div className={source ? 'ready' : 'pending'}><CheckCircle2 size={15}/><span>Data</span><strong>{source?.name ?? 'Required'}</strong></div>
      <div className={(bulkMode ? bulkSelected.length > 0 : Boolean(record)) ? 'ready' : 'pending'}><CheckCircle2 size={15}/><span>{bulkMode ? 'Documents' : 'Document'}</span><strong>{bulkMode ? `${bulkSelected.length} selected` : (selectedDocument?.rawLabel ?? 'Required')}</strong></div>
      <div className={readyToGenerate ? 'ready' : 'pending'}><CheckCircle2 size={15}/><span>Status</span><strong>{readyToGenerate ? 'Ready' : 'Needs attention'}</strong></div>
    </section>

    <div className="generate-console-grid">
      <section className="panel generation-console-main">
        <div className="generation-mode-tabs" role="tablist" aria-label="Generation mode">
          <button type="button" className={!bulkMode ? 'active' : ''} onClick={() => setBulkMode(false)}>Single document</button>
          <button type="button" className={bulkMode ? 'active' : ''} onClick={() => setBulkMode(true)}>Bulk documents</button>
        </div>

        <div className="generation-section">
          <div className="generation-section-head"><span className="generation-step-number">1</span><div><strong>Source</strong><small>Choose the saved template and imported data.</small></div></div>
          <div className="generation-source-grid">
            <label>Template
              <select value={selectedTemplateId ?? ''} disabled={loading || templateLibrary.filter((item) => item.status !== 'Archived').length === 0} onChange={(e) => changeTemplate(e.target.value)}>
                {templateLibrary.filter((item) => item.status !== 'Archived').length === 0 && <option value="">No saved template</option>}
                {templateLibrary.filter((item) => item.status !== 'Archived').map((item) => <option key={item.id} value={item.id}>{item.name}{(item.version ?? 1) > 1 ? ` · v${item.version}` : ''}{item.status === 'Draft' ? ' · Draft' : ''}</option>)}
              </select>
              {templateLibrary.filter((item) => item.status !== 'Archived').length === 0 ? <button type="button" className="secondary compact generation-source-link" onClick={() => onNavigate('templates')}>Open Templates</button> : null}
            </label>
            <label>Data Source
              <select value={source?.id ?? ''} disabled={loading} onChange={(e) => changeSource(e.target.value)}>
                {loading ? <option value="">Loading data sources…</option> : null}
                {!loading && dataState.sources.length === 0 ? <option value="">No imported source — import data first</option> : null}
                {dataState.sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!loading && dataState.sources.length === 0 ? <button type="button" className="secondary compact generation-source-link" onClick={() => onNavigate('data')}>Open Data Sources</button> : null}
            </label>
          </div>
        </div>

        <div className="generation-section">
          <div className="generation-section-head"><span className="generation-step-number">2</span><div><strong>{bulkMode ? 'Select documents' : 'Select document'}</strong><small>{bulkMode ? 'Search and select one or more business documents.' : 'Choose the parent / record to generate.'}</small></div></div>
          {bulkMode ? <div className="bulk-document-picker">
            <div className="bulk-search-row">
              <div className="bulk-search-box"><Search size={15}/><input value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)} placeholder="Search invoice, customer, date or amount…"/></div>
              <span className="selected-count-chip">{bulkSelected.length} selected</span>
              <button className="secondary" type="button" onClick={() => setBulkSelected(filteredDocumentOptions.map((item) => item.value))}>Select shown</button>
              <button className="secondary" type="button" onClick={() => setBulkSelected([])}>Clear</button>
            </div>
            <div className="bulk-document-list">
              <div className="bulk-document-header"><span></span><span>Document</span><span>Customer</span><span>Date</span><span>Amount</span></div>
              {filteredDocumentOptions.length === 0 ? <div className="bulk-document-empty">No matching documents.</div> : filteredDocumentOptions.map((item) => {
                const detail = source ? documentDetails(source, item.value) : { customer: '', date: '', amount: '' };
                return <label className="bulk-document-row" key={item.value}>
                  <input type="checkbox" checked={bulkSelected.includes(item.value)} onChange={(e) => setBulkSelected((current) => e.target.checked ? Array.from(new Set([...current, item.value])) : current.filter((value) => value !== item.value))}/>
                  <strong>{item.rawLabel}</strong><span>{detail.customer || '—'}</span><span>{detail.date || '—'}</span><span>{detail.amount || '—'}</span>
                </label>;
              })}
            </div>
            <div className="bulk-picker-footer"><span>Showing {filteredDocumentOptions.length} of {documentOptions.length}</span><strong>{bulkSelected.length} document{bulkSelected.length === 1 ? '' : 's'} selected</strong></div>
          </div> : <div className="single-record-picker">{source ? <RecordPicker count={source.records.length} value={selectedDocument?.value ?? dataState.activeRecordIndex} options={documentOptions.map(({ value, label }) => ({ value, label }))} disabled={loading || source.records.length === 0} compactLabel={parentKeys.length ? 'Document' : 'Record'} searchable searchPlaceholder={parentKeys.length ? 'Search document ID…' : 'Search record…'} onChange={changeRecord}/> : <div className="readonly-field">Import a data source first</div>}</div>}
        </div>

        <div className="generation-section">
          <div className="generation-section-head"><span className="generation-step-number">3</span><div><strong>Output</strong><small>Select the file format and packaging.</small></div></div>
          <div className="generation-format-group">
            <div className="generation-format-options compact">
              <button type="button" className={format === 'pdf' ? 'active' : ''} onClick={() => setFormat('pdf')}><FileOutput size={18}/><b>PDF</b><small>Native fast or Exact Preview</small></button>
              <button type="button" className={format === 'docx-exact' ? 'active' : ''} onClick={() => setFormat('docx-exact')}><FileText size={18}/><b>DOCX Exact</b><small>Page artwork fidelity</small></button>
              <button type="button" className={format === 'docx-editable' ? 'active' : ''} onClick={() => setFormat('docx-editable')}><FileText size={18}/><b>DOCX Editable</b><small>Native Word content</small></button>
            </div>
          </div>

          {format === 'pdf' ? <div className="pdf-render-mode-panel">
            <div className="pdf-quality-heading"><span>PDF rendering</span><small>Native avoids DOM screenshots. Exact Preview is the pixel-fidelity fallback.</small></div>
            <div className="generation-segmented pdf-render-mode-options">
              <button type="button" className={pdfRenderMode === 'native-auto' ? 'active' : ''} onClick={() => { setPdfRenderMode('native-auto'); writePdfRenderMode(window.localStorage,'native-auto'); }}><b>Fast / Native</b><small>{nativeCompatibility.supported ? 'Ready · selectable text · best for bulk' : 'Auto-fallback to Exact for this template'}</small></button>
              <button type="button" className={pdfRenderMode === 'exact' ? 'active' : ''} onClick={() => { setPdfRenderMode('exact'); writePdfRenderMode(window.localStorage,'exact'); }}><b>Exact Preview</b><small>DOM capture · maximum Builder fidelity</small></button>
            </div>
            {pdfRenderMode === 'native-auto' && !nativeCompatibility.supported ? <div className="native-compatibility-note"><AlertCircle size={15}/><span>Native fallback: {nativeCompatibility.reasons[0]}</span></div> : null}
          </div> : null}

          {format === 'pdf' && pdfRenderMode === 'exact' ? <div className="pdf-quality-panel">
            <div className="pdf-quality-heading"><span>PDF quality</span><small>Standard is recommended for fast invoice generation. Higher DPI takes more time and memory.</small></div>
            <div className="pdf-quality-options">
              {(Object.values(PDF_RENDER_PROFILES)).map((profile) => <button key={profile.id} type="button" className={pdfRenderProfile === profile.id ? 'active' : ''} onClick={() => { setPdfRenderProfile(profile.id); writePdfRenderProfile(window.localStorage, profile.id); }}>
                <b>{profile.label}</b><span>{profile.dpi} DPI</span><small>{profile.description}</small>
              </button>)}
            </div>
          </div> : null}

          {bulkMode && format === 'pdf' ? <div className="generation-packaging-row">
            <span>PDF packaging</span>
            <div className="generation-segmented">
              <button type="button" className={bulkPdfOutput === 'separate' ? 'active' : ''} onClick={() => setBulkPdfOutput('separate')}><Files size={15}/>Separate PDFs</button>
              <button type="button" className={bulkPdfOutput === 'combined-pdf' ? 'active' : ''} onClick={() => setBulkPdfOutput('combined-pdf')}><FileText size={15}/>Combined PDF</button>
            </div>
          </div> : null}

          <details className="generation-advanced" open={bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf'}>
            <summary>File naming & advanced options</summary>
            {bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? <label>Combined PDF Name<input value={combinedFileName} onChange={(e) => setCombinedFileName(e.target.value)} placeholder="Combined_Invoices"/></label> : <label>File Name Rule<input value={filePattern} onChange={(e) => setFilePattern(e.target.value)} placeholder="{{InvoiceNo}}_{{Customer Name}}"/><small className="generation-help">Use imported fields, <b>{'{{Document}}'}</b> or <b>{'{{Template}}'}</b>.</small></label>}
          </details>
          <div className="generation-file-preview"><span>Output file</span><strong>{bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? `${(combinedFileName.trim() || 'Combined_Invoices').replace(/\.pdf$/i, '')}.pdf` : `${resolvedFileName}${format === 'pdf' ? '.pdf' : '.docx'}`}</strong></div>
        </div>
      </section>

      <aside className="generation-summary-column">
        <section className="panel generation-summary-card">
          <div className="generation-summary-title"><div><span>Generation Summary</span><small>Everything needed for this run.</small></div><span className={`ready-pill ${readyToGenerate ? 'ready' : 'pending'}`}>{readyToGenerate ? 'Ready' : 'Check setup'}</span></div>
          <div className="generation-summary-list">
            <div><span>Template</span><strong>{template?.name ?? '—'}</strong></div>
            <div><span>Data</span><strong>{source?.name ?? '—'}</strong></div>
            <div><span>{bulkMode ? 'Documents' : 'Document'}</span><strong>{bulkMode ? `${bulkSelected.length} selected` : (selectedDocument?.rawLabel ?? '—')}</strong></div>
            <div><span>Format</span><strong>{outputSummary}</strong></div>
            {format === 'pdf' ? <div><span>Renderer</span><strong>{pdfRenderMode === 'native-auto' ? (nativeCompatibility.supported ? 'Fast / Native' : 'Exact fallback') : 'Exact Preview'}</strong></div> : null}
            {format === 'pdf' && pdfRenderMode === 'exact' ? <div><span>Quality</span><strong>{PDF_RENDER_PROFILES[pdfRenderProfile].label} · {PDF_RENDER_PROFILES[pdfRenderProfile].dpi} DPI</strong></div> : null}
            <div><span>File</span><strong>{bulkMode && format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? `${combinedFileName || 'Combined_Invoices'}.pdf` : `${resolvedFileName}${format === 'pdf' ? '.pdf' : '.docx'}`}</strong></div>
          </div>
          {message && <div className="generation-message"><Loader2 size={16}/>{message}</div>}
          <button className="primary generation-run generation-summary-run" disabled={loading || !readyToGenerate} onClick={bulkMode ? startBulkGeneration : startGeneration}><Play size={17}/>{bulkMode ? (format === 'pdf' && bulkPdfOutput === 'combined-pdf' ? `Generate ${bulkSelected.length} in one PDF` : `Generate ${bulkSelected.length} documents`) : 'Generate document'}</button>
          {bulkState ? <div className="bulk-progress compact-progress"><GenerationProgressRing completed={bulkState.completedIds.length} total={bulkState.requests.length} failed={bulkState.failedIds.length} status={bulkState.status}/><div className="bulk-progress-copy"><strong>{bulkState.outputMode === 'combined-pdf' ? 'Combined PDF' : 'Bulk'} · {bulkState.completedIds.length}/{bulkState.requests.length}</strong><span>{bulkState.status === 'complete' ? `${bulkState.failedIds.length ? `${bulkState.failedIds.length} failed` : 'Complete'}` : 'Generation in progress'}</span></div>{bulkState.status === 'complete' && bulkState.failedIds.length > 0 ? <button className="secondary" onClick={retryBulkFailures}>{bulkState.outputMode === 'combined-pdf' ? 'Retry batch' : 'Retry failed'}</button> : null}</div> : null}
        </section>

        <section className={`panel generation-validation-card ${errors.length ? 'has-errors' : ''}`}>
          <button className="validation-summary-toggle" type="button" onClick={() => setValidationExpanded((value) => !value)}>
            <span>{errors.length ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}<span><strong>{errors.length ? `${errors.length} validation issue${errors.length === 1 ? '' : 's'}` : 'Ready to generate'}</strong><small>{errors.length ? 'Review before generating.' : 'All pre-generation checks passed.'}</small></span></span>
            {validationExpanded ? <ChevronDown size={17}/> : <ChevronRight size={17}/>} 
          </button>
          {validationExpanded || errors.length > 0 ? <div className="validation-list compact-validation">{validationRows.map(([label, ok, detail]) => <div className={`validation-row ${ok ? 'ok' : 'bad'}`} key={String(label)}>{ok ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}<span><strong>{label}</strong><small>{String(detail)}</small></span></div>)}</div> : null}
          {errors.length > 0 && <div className="generation-errors">{errors.map((error) => <div key={error}>• {error}</div>)}</div>}
        </section>
      </aside>
    </div>

    <section className="panel generation-history generation-history-v2">
      <div className="section-title"><span><History size={16}/>Recent generation activity</span><div className="history-actions"><button className="secondary" onClick={() => setHistory(readGenerationHistory(window.localStorage))}><RefreshCw size={14}/>Refresh</button>{history.length > 0 && <button className="secondary" onClick={clearHistory}>Clear</button>}</div></div>
      {history.length === 0 ? <div className="empty-state generation-empty"><History size={28}/><strong>No documents generated yet</strong><span>Your recent PDF and DOCX runs will appear here.</span></div> : <div className="history-run-list">{visibleHistoryGroups.map((group) => <div className={`history-run-card ${group.status}`} key={group.key}>
        <div className="history-run-icon">{group.status === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}</div>
        <div className="history-run-main"><strong>{group.title}</strong><span>{group.meta}</span>{group.error ? <small>{group.error}</small> : null}</div>
        <div className="history-run-status"><span className={`history-status ${group.status}`}>{group.status === 'success' ? 'Success' : 'Failed'}</span><time>{new Date(group.completedAt).toLocaleString()}</time></div>
      </div>)}</div>}
      {historyGroups.length > 8 ? <button className="history-view-all" type="button" onClick={() => setShowAllHistory((value) => !value)}>{showAllHistory ? 'Show recent only' : `View all history (${historyGroups.length})`}</button> : null}
    </section>
  </div>;
}

function normalizeFieldToken(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function documentDetails(source: BuilderDataSource, recordIndex: number) {
  const record = source.records[recordIndex] ?? null;
  const findValue = (candidates: string[]) => {
    const field = source.fields.find((item) => {
      const haystack = `${normalizeFieldToken(item.name)} ${normalizeFieldToken(item.label || '')}`;
      return candidates.some((candidate) => haystack.includes(normalizeFieldToken(candidate)));
    });
    return field ? displayValue(valueForField(record, field.name)).trim() : '';
  };
  return {
    customer: findValue(['customeraccountname', 'customername', 'accountname', 'customer', 'partyname']),
    date: findValue(['invoicedate', 'documentdate', 'orderdate', 'date']),
    amount: findValue(['netpayable', 'totalamount', 'grandtotal', 'invoiceamount', 'amount']),
  };
}

function buildHistoryGroups(history: GenerationHistoryEntry[]) {
  const combined = new Map<string, GenerationHistoryEntry[]>();
  const singles: GenerationHistoryEntry[][] = [];
  for (const item of history) {
    const batchId = item.combinedPdf?.batchId;
    if (!batchId) { singles.push([item]); continue; }
    const bucket = combined.get(batchId) ?? [];
    bucket.push(item);
    combined.set(batchId, bucket);
  }
  const groups = [...singles, ...combined.values()].map((entries) => {
    const first = entries[0];
    const failed = entries.find((item) => item.status === 'failed');
    const isCombined = Boolean(first.combinedPdf);
    const completedAt = entries.reduce((latest, item) => item.completedAt > latest ? item.completedAt : latest, first.completedAt);
    return {
      key: isCombined ? `combined:${first.combinedPdf!.batchId}` : first.id,
      title: isCombined ? `${first.combinedPdf!.finalFileName}.pdf` : `${first.fileName}${first.format === 'pdf' ? '.pdf' : '.docx'}`,
      meta: isCombined ? `${entries.length} invoice${entries.length === 1 ? '' : 's'} · Combined PDF` : `${first.documentLabel} · ${formatLabel(first.format)}`,
      status: failed ? 'failed' as const : 'success' as const,
      completedAt,
      error: failed?.error,
    };
  });
  return groups.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function GenerationOverlay({ percent, label, detail, completed, total }: { percent: number; label: string; detail?: string; completed?: number; total?: number }) {
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return <div className="generation-overlay" role="dialog" aria-modal="true" aria-label={label}>
    <div className="generation-overlay-card">
      <div className="generation-overlay-ring" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <svg viewBox="0 0 168 168" aria-hidden="true">
          <circle className="generation-overlay-track" cx="84" cy="84" r={radius} />
          <circle className="generation-overlay-value" cx="84" cy="84" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }} />
        </svg>
        <strong>{percent}%</strong>
      </div>
      <div className="generation-overlay-blink">{label}</div>
      {typeof completed === 'number' && typeof total === 'number' ? <div className="generation-overlay-count">Invoice {Math.min(total, completed + 1)} of {total}</div> : null}
      {detail ? <div className="generation-overlay-detail">{detail}</div> : null}
      <small>Please keep this window open. You can continue working after generation finishes.</small>
    </div>
  </div>;
}

function formatLabel(format: GenerationFormat) {
  if (format === 'docx-exact') return 'DOCX Exact';
  if (format === 'docx-editable') return 'DOCX Editable';
  return 'PDF';
}
