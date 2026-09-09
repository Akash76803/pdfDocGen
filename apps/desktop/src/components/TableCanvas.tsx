import { Barcode, Image, QrCode } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { NormalizedRecord } from '@document-tool/contracts';
import { type BuilderDataSource } from '../lib/dataSourceStore.ts';
import { IMAGE_ASSET_EVENT, loadImageAsset } from '../lib/imageAssetStore.ts';
import { dynamicRows, evaluateTableFormula, formatTableValue, smartColumnWidths, type TableCell, type TableColumn, type TableDefinition, type TableRow, valueAtPath } from '../lib/tableModel.ts';

export function TableCanvas({ table, record, source, documentSource, onChange, onHeightChange }: { table: TableDefinition; record: NormalizedRecord | null; source?: BuilderDataSource | null; documentSource?: BuilderDataSource | null; onChange: (table: TableDefinition) => void; onHeightChange?: (height: number) => void }) {
  const selectCell = (cellId: string) => onChange({ ...table, selectedCellId: cellId });
  const runtime = dynamicRows(table, record, source, documentSource);
  const columnWidths = smartColumnWidths(table, runtime.map((row) => row.value));
  const tableRef = useRef<HTMLTableElement | null>(null);

  useLayoutEffect(() => {
    const node = tableRef.current;
    if (!node || !onHeightChange) return;
    let last = 0;
    const publish = () => {
      const next = Math.max(32, Math.ceil(node.offsetHeight));
      if (Math.abs(next - last) < 1) return;
      last = next;
      onHeightChange(next);
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [onHeightChange, table.id, table.mode, table.columns.length, table.headerRows.length, table.bodyRows.length, table.customRows.length, table.rows.length, runtime.length]);

  return <div className="db-table-shell" style={{ '--table-border': table.borderColor, '--table-border-width': `${table.borderWidth}px` } as CSSProperties}>
    <table ref={tableRef} className="db-table">
      {table.columns.length > 0 && <colgroup>{table.columns.map((column, index) => <col key={column.id} style={{ width: `${columnWidths[index] ?? (100 / table.columns.length)}%` }}/>)}</colgroup>}
      {table.headerRows.length > 0 && <thead>{table.headerRows.map((row) => <RenderRow key={row.id} row={row} table={table} onSelect={selectCell}/>)}</thead>}
      <tbody>
        {table.mode === 'custom' && table.rows.map((row) => <RenderRow key={row.id} row={row} table={table} runtimeValue={record ?? undefined} onSelect={selectCell}/>) }
        {table.mode === 'dynamic' && runtime.length === 0 && <tr><td className="db-table-empty" colSpan={Math.max(1, table.columns.length)}>{table.binding?.parentKey || table.binding?.parentKeys?.length ? <>No rows match the selected document ID in <b>{table.binding?.repeatSource || 'source'}</b></> : <>No line items for <b>{table.binding?.repeatSource || 'items'}</b></>}</td></tr>}
        {table.mode === 'dynamic' && runtime.flatMap((runtimeRow) => table.bodyRows.map((template) => <RenderRow key={`${runtimeRow.key}:${template.id}`} row={template} table={table} runtimeValue={runtimeRow.value} onSelect={selectCell}/>))}
        {table.mode === 'dynamic' && table.customRows.map((row) => <RenderRow key={row.id} row={row} table={table} onSelect={selectCell}/>)}
      </tbody>
    </table>
  </div>;
}

function RenderRow({ row, table, runtimeValue, onSelect }: { row: TableRow; table: TableDefinition; runtimeValue?: unknown; onSelect: (cellId: string) => void }) {
  let visualColumn = 0;
  return <tr style={{ height: row.autoHeight ? undefined : row.height }}>{row.cells.map((cell) => {
    const column = table.columns[visualColumn];
    visualColumn += Math.max(1, cell.colSpan);
    return <td key={cell.id} rowSpan={Math.max(1, cell.rowSpan)} colSpan={Math.max(1, cell.colSpan)} className={table.selectedCellId === cell.id ? 'selected-db-cell' : ''} style={{ background: cell.style.background, color: cell.style.color, fontSize: cell.style.fontSize, fontWeight: cell.style.bold ? 700 : 400, textAlign: cell.style.align, verticalAlign: cell.style.verticalAlign, padding: cell.type === 'image' ? 0 : cell.style.padding }} onPointerDown={(e) => { e.stopPropagation(); onSelect(cell.id); }}><CellValue cell={cell} column={column} runtimeValue={runtimeValue}/></td>;
  })}</tr>;
}

function CellValue({ cell, column, runtimeValue }: { cell: TableCell; column?: TableColumn; runtimeValue?: unknown }) {
  const mode = cell.valueMode ?? (cell.binding ? 'binding' : 'custom');
  const boundRaw = cell.binding ? valueAtPath(runtimeValue, cell.binding) : undefined;
  const raw = mode === 'formula' ? evaluateTableFormula(cell.formula, runtimeValue) : mode === 'binding' ? boundRaw : cell.content;
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
