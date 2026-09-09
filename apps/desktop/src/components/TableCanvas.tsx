import { Barcode, Image, QrCode } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { NormalizedRecord } from '@document-tool/contracts';
import { displayValue, type BuilderDataSource } from '../lib/dataSourceStore.ts';
import { IMAGE_ASSET_EVENT, loadImageAsset } from '../lib/imageAssetStore.ts';
import { dynamicRows, type TableCell, type TableDefinition, type TableRow, valueAtPath } from '../lib/tableModel.ts';

export function TableCanvas({ table, record, source, documentSource, onChange }: { table: TableDefinition; record: NormalizedRecord | null; source?: BuilderDataSource | null; documentSource?: BuilderDataSource | null; onChange: (table: TableDefinition) => void }) {
  const selectCell = (cellId: string) => onChange({ ...table, selectedCellId: cellId });
  const runtime = dynamicRows(table, record, source, documentSource);

  return <div className="db-table-shell" style={{ '--table-border': table.borderColor, '--table-border-width': `${table.borderWidth}px` } as CSSProperties}>
    <table className="db-table">
      {table.columns.length > 0 && <colgroup>{table.columns.map((column) => <col key={column.id} style={{ width: column.width }}/>)}</colgroup>}
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
  return <tr style={{ height: row.autoHeight ? undefined : row.height }}>{row.cells.map((cell) => <td key={cell.id} rowSpan={Math.max(1, cell.rowSpan)} colSpan={Math.max(1, cell.colSpan)} className={table.selectedCellId === cell.id ? 'selected-db-cell' : ''} style={{ background: cell.style.background, color: cell.style.color, fontSize: cell.style.fontSize, fontWeight: cell.style.bold ? 700 : 400, textAlign: cell.style.align, verticalAlign: cell.style.verticalAlign, padding: cell.type === 'image' ? 0 : cell.style.padding }} onPointerDown={(e) => { e.stopPropagation(); onSelect(cell.id); }}><CellValue cell={cell} runtimeValue={runtimeValue}/></td>)}</tr>;
}

function CellValue({ cell, runtimeValue }: { cell: TableCell; runtimeValue?: unknown }) {
  const raw = cell.binding ? valueAtPath(runtimeValue, cell.binding) : undefined;
  const value = raw === undefined ? cell.content : displayValue(raw as never);
  if (cell.type === 'image') return <TableCellImage cell={cell} boundValue={raw}/>;
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
