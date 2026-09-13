import { Barcode, Image, QrCode } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { NormalizedRecord } from '@document-tool/contracts';
import { type BuilderDataSource } from '../lib/dataSourceStore.ts';
import { IMAGE_ASSET_EVENT, loadImageAsset } from '../lib/imageAssetStore.ts';
import { dynamicRows, evaluateTableFormula, evaluateTableFormulaColumns, evaluateTableSummaryRows, formatTableValue, smartColumnWidths, paginateDynamicTable, type TableCell, type TableColumn, type TableDefinition, type TableRow, valueAtPath } from '../lib/tableModel.ts';
import { resolveTemplateTokens, templateHasTokens } from '../lib/templateTokens.ts';

export function TableCanvas({ table, record, source, documentSource, availableHeight, continuationAvailableHeight, availableWidth, fragmentIndex, virtualPageMode = false, onChange, onSelectionChange, onInteractionStart, onInteractionEnd, onHeightChange }: { table: TableDefinition; record: NormalizedRecord | null; source?: BuilderDataSource | null; documentSource?: BuilderDataSource | null; availableHeight?: number; continuationAvailableHeight?: number; availableWidth?: number; fragmentIndex?: number; virtualPageMode?: boolean; onChange: (table: TableDefinition) => void; onSelectionChange?: (table: TableDefinition) => void; onInteractionStart?: () => void; onInteractionEnd?: () => void; onHeightChange?: (height: number) => void }) {
  const selectCell = (cellId: string) => (onSelectionChange ?? onChange)({ ...table, selectedCellId: cellId });
  const runtime = dynamicRows(table, record, source, documentSource);
  const columnWidths = smartColumnWidths(table, runtime.map((row) => row.value));
  const summaryResults = table.mode === 'dynamic' ? evaluateTableSummaryRows(table, runtime.map((row) => row.value)) : { byCellId: {}, byName: {} };
  const paginationPages = table.mode === 'dynamic' ? paginateDynamicTable(table, runtime, Math.max(80, availableHeight ?? 999999), Math.max(80, continuationAvailableHeight ?? availableHeight ?? 999999), Math.max(80, availableWidth ?? 760)) : [];
  const renderedPages = fragmentIndex === undefined ? paginationPages : paginationPages.filter((page) => page.index === fragmentIndex);
  const tableRef = useRef<HTMLTableElement | null>(null);
  // Height publication must not be coupled to the callback identity. TemplateBuilder
  // recreates its callback during render, so keeping `onHeightChange` in the effect
  // dependency list caused the layout effect to remount, publish the same height,
  // update parent state, render again and eventually hit React's maximum update depth.
  // Keep the latest callback in a ref and remember the last published DOM height
  // across renders.
  const onHeightChangeRef = useRef(onHeightChange);
  const lastPublishedHeightRef = useRef<number | null>(null);
  useEffect(() => { onHeightChangeRef.current = onHeightChange; }, [onHeightChange]);

  useLayoutEffect(() => {
    const node = tableRef.current;
    if (!node || !onHeightChangeRef.current) return;
    const publish = () => {
      const next = Math.max(32, Math.ceil(node.offsetHeight));
      if (lastPublishedHeightRef.current !== null && Math.abs(next - lastPublishedHeightRef.current) < 1) return;
      lastPublishedHeightRef.current = next;
      onHeightChangeRef.current?.(next);
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [table.id, table.mode, table.columns.length, table.headerRows.length, table.bodyRows.length, table.customRows.length, table.rows.length, runtime.length]);

  const startColumnResize = (event: ReactPointerEvent<HTMLSpanElement>, columnIndex: number) => {
    if (columnIndex < 0 || columnIndex >= table.columns.length - 1) return;
    event.preventDefault();
    event.stopPropagation();
    onInteractionStart?.();
    const node = tableRef.current;
    if (!node) return;
    const startX = event.clientX;
    const tableWidth = Math.max(1, node.getBoundingClientRect().width);
    const startPercents = [...columnWidths];
    const leftPct = startPercents[columnIndex] ?? (100 / table.columns.length);
    const rightPct = startPercents[columnIndex + 1] ?? (100 / table.columns.length);
    const pairPct = leftPct + rightPct;
    const minPct = Math.min(pairPct / 2, Math.max(2.5, (Math.max(table.columns[columnIndex].minWidth, table.columns[columnIndex + 1].minWidth) / tableWidth) * 100));
    const onMove = (move: PointerEvent) => {
      const deltaPct = ((move.clientX - startX) / tableWidth) * 100;
      const nextLeft = Math.max(minPct, Math.min(pairPct - minPct, leftPct + deltaPct));
      const nextRight = pairPct - nextLeft;
      const nextPercents = [...startPercents];
      nextPercents[columnIndex] = nextLeft;
      nextPercents[columnIndex + 1] = nextRight;
      onChange({
        ...table,
        columns: table.columns.map((column, index) => ({
          ...column,
          width: Math.max(24, (nextPercents[index] ?? (100 / table.columns.length)) * 10),
          manualWidth: true,
        })),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      onInteractionEnd?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  };

  return <div className="db-table-shell" style={{ '--table-border': table.borderColor, '--table-border-width': `${table.borderWidth}px` } as CSSProperties}>
    {table.mode === 'dynamic' && paginationPages.length > 1 && !virtualPageMode ? <div className="db-pagination-status">{paginationPages.length} pages · automatic overflow</div> : null}
    {(table.mode === 'dynamic' ? renderedPages : [{ index: 0, runtimeRows: [], includeHeader: true, includeSummary: true }]).map((page, renderedIndex) => { const pageIndex = page.index; return <div className="db-table-page-fragment" key={`fragment-${page.index}`}>
    {pageIndex === 0 && table.selectedCellId && table.columns.length > 1 && <div className="db-column-ruler" aria-label="Column resize ruler">
      {columnWidths.map((width, index) => <div key={table.columns[index]?.id ?? index} className="db-column-ruler-segment" style={{ width: `${width}%` }}>
        <span>{Math.round(width)}%</span>
        {index < table.columns.length - 1 && <button type="button" className="db-column-ruler-handle" title={`Resize column ${index + 1} / ${index + 2}`} onPointerDown={(e) => startColumnResize(e as unknown as ReactPointerEvent<HTMLSpanElement>, index)} aria-label={`Resize column ${index + 1}`}/>}
      </div>)}
    </div>}
    {!virtualPageMode && renderedIndex > 0 && <div className="db-page-break-marker"><span>Page break</span><small>Continuation {pageIndex + 1}</small></div>}
    <table ref={pageIndex === 0 ? tableRef : undefined} className="db-table">
      {table.columns.length > 0 && <colgroup>{table.columns.map((column, index) => <col key={column.id} style={{ width: `${columnWidths[index] ?? (100 / table.columns.length)}%` }}/>)}</colgroup>}
      {table.headerRows.length > 0 && page.includeHeader && <thead>{table.headerRows.filter((row) => pageIndex === 0 || !table.pagination.repeatHeader || row.repeatOnEveryPage !== false).map((row) => <RenderRow key={row.id} row={row} table={table} runtimeValue={record ?? undefined} onSelect={selectCell} onResizeColumn={startColumnResize}/>)}</thead>}
      <tbody>
        {table.mode === 'custom' && table.rows.map((row) => <RenderRow key={row.id} row={row} table={table} runtimeValue={record ?? undefined} onSelect={selectCell}/>) }
        {table.mode === 'dynamic' && runtime.length === 0 && <tr><td className="db-table-empty" colSpan={Math.max(1, table.columns.length)}>{table.binding?.parentKey || table.binding?.parentKeys?.length ? <>No rows match the selected document ID in <b>{table.binding?.repeatSource || 'source'}</b></> : <>No line items for <b>{table.binding?.repeatSource || 'items'}</b></>}</td></tr>}
        {table.mode === 'dynamic' && page.runtimeRows.flatMap((runtimeRow) => { const formulaResults = evaluateTableFormulaColumns(table, runtimeRow.value); return table.bodyRows.map((template) => <RenderRow key={`${runtimeRow.key}:${template.id}`} row={template} table={table} runtimeValue={runtimeRow.value} formulaResults={formulaResults} onSelect={selectCell}/>); })}
        {table.mode === 'dynamic' && page.includeSummary && table.customRows.map((row) => <RenderRow key={row.id} row={row} table={table} runtimeValue={record ?? undefined} summaryResults={summaryResults.byCellId} onSelect={selectCell} onResizeColumn={startColumnResize}/>)}
      </tbody>
    </table>
    </div>})}
  </div>;
}

function RenderRow({ row, table, runtimeValue, formulaResults, summaryResults, onSelect, onResizeColumn }: { row: TableRow; table: TableDefinition; runtimeValue?: unknown; formulaResults?: Record<string, number | null>; summaryResults?: Record<string, unknown>; onSelect: (cellId: string) => void; onResizeColumn?: (event: ReactPointerEvent<HTMLSpanElement>, columnIndex: number) => void }) {
  let visualColumn = 0;
  return <tr style={{ height: row.autoHeight ? undefined : row.height }}>{row.cells.map((cell) => {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    const startColumn = visualColumn - Math.max(1, cell.colSpan);
    const endColumn = visualColumn - 1;
    return <td key={cell.id} rowSpan={Math.max(1, cell.rowSpan)} colSpan={Math.max(1, cell.colSpan)} className={`${table.selectedCellId === cell.id ? 'selected-db-cell' : ''}${row.kind === 'header' ? ' db-table-header-cell' : ''}`} style={{ background: cell.style.background, color: cell.style.color, fontSize: cell.style.fontSize, fontWeight: cell.style.bold ? 700 : 400, textAlign: cell.style.align, verticalAlign: cell.style.verticalAlign, padding: cell.type === 'image' ? 0 : cell.style.padding }} onPointerDown={(e) => { e.stopPropagation(); onSelect(cell.id); }}><CellValue cell={cell} column={column} table={table} runtimeValue={runtimeValue} formulaResults={formulaResults} summaryValue={summaryResults?.[cell.id]}/>{row.kind === 'header' && cell.colSpan === 1 && endColumn < table.columns.length - 1 && onResizeColumn && <span className="db-column-resize-handle" title="Drag to resize this column" onPointerDown={(e) => onResizeColumn(e, startColumn)} aria-hidden="true"/>}</td>;
  })}</tr>;
}

function CellValue({ cell, column, table, runtimeValue, formulaResults, summaryValue }: { cell: TableCell; column?: TableColumn; table: TableDefinition; runtimeValue?: unknown; formulaResults?: Record<string, number | null>; summaryValue?: unknown }) {
  const mode = cell.valueMode ?? (cell.binding ? 'binding' : 'custom');
  const useMixedTemplate = templateHasTokens(cell.content);
  const boundRaw = cell.binding ? valueAtPath(runtimeValue, cell.binding) : undefined;
  const percentageFields: Record<string, { inputMode?: 'fraction' | 'whole' }> = {};
  const designRows = table.mode === 'dynamic' ? table.bodyRows : table.rows;
  for (const designRow of designRows) {
    let visualColumn = 0;
    for (const designCell of designRow.cells) {
      const designColumn = table.columns[visualColumn];
      visualColumn += Math.max(1, designCell.colSpan);
      const binding = designCell.binding;
      const type = designCell.dataType ?? designColumn?.dataType;
      if (binding && type === 'percentage') {
        percentageFields[binding] = { inputMode: (designCell.format?.percentInputMode ?? designColumn?.format?.percentInputMode ?? 'fraction') as 'fraction' | 'whole' };
      }
    }
  }
  const raw = cell.summaryMode === 'aggregate' || cell.summaryMode === 'formula' ? summaryValue : mode === 'formula' ? (column && formulaResults && Object.prototype.hasOwnProperty.call(formulaResults, column.id) ? formulaResults[column.id] : evaluateTableFormula(cell.formula, runtimeValue, { percentageFields })) : mode === 'binding' && !useMixedTemplate ? boundRaw : resolveTemplateTokens(cell.content, (field) => valueAtPath(runtimeValue, field), { preserveUnknown: runtimeValue == null });
  const dataType = cell.dataType ?? column?.dataType ?? 'text';
  const format = { ...(column?.format ?? {}), ...(cell.format ?? {}) };
  const value = formatTableValue(raw, dataType, format);
  if (cell.type === 'image') return <TableCellImage cell={cell} boundValue={boundRaw}/>;
  if (cell.type === 'qr') return <span className="db-table-media-placeholder"><QrCode size={18}/>{value || 'QR'}</span>;
  if (cell.type === 'barcode') return <span className="db-table-media-placeholder"><Barcode size={22}/>{value || 'Barcode'}</span>;
  return <span>{value}</span>;
}

function TableCellImage({ cell, boundValue }: { cell: TableCell; boundValue?: unknown }) {
  const boundSource = typeof boundValue === 'string' && (/^data:image\//i.test(boundValue) || /^https?:\/\//i.test(boundValue)) ? boundValue : '';
  const directSource = cell.imageSource && (/^data:image\//i.test(cell.imageSource) || /^https?:\/\//i.test(cell.imageSource)) ? cell.imageSource : '';
  const [assetUrl, setAssetUrl] = useState('');

  useEffect(() => {
    let revoked = '';
    let cancelled = false;
    const refresh = async () => {
      if (!cell.imageAssetId || boundSource || directSource) { setAssetUrl(''); return; }
      try {
        const blob = await loadImageAsset(cell.imageAssetId);
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setAssetUrl(url);
      } catch {
        if (!cancelled) setAssetUrl('');
      }
    };
    void refresh();
    const onAssetsChanged = () => { if (!cancelled) void refresh(); };
    window.addEventListener(IMAGE_ASSET_EVENT, onAssetsChanged);
    return () => { cancelled = true; window.removeEventListener(IMAGE_ASSET_EVENT, onAssetsChanged); if (revoked) URL.revokeObjectURL(revoked); };
  }, [cell.imageAssetId, boundSource, directSource]);

  const src = boundSource || directSource || assetUrl;
  return src
    ? <span className="db-table-cell-image-host">
        <span className="db-table-cell-image-spacer" aria-hidden="true"/>
        <img className="db-table-cell-image" src={src} alt="" style={{ objectFit: cell.imageFit === 'fill' ? 'fill' : (cell.imageFit ?? 'cover') }}/>
      </span>
    : <span className="db-table-media-placeholder"><Image size={15}/>Image</span>;
}
