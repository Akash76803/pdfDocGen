import { useEffect, useMemo, useState } from 'react';
import { Plus, Table2, Trash2, X } from 'lucide-react';
import type { BuilderDataSource } from '../lib/dataSourceStore.ts';
import { createCustomTable, createDynamicTable, recommendedParentKey, recommendedRowKey, type TableDefinition, type TableMode } from '../lib/tableModel.ts';

function KeyFields({ label, fields, values, onChange, help }: { label: string; fields: BuilderDataSource['fields']; values: string[]; onChange: (values: string[]) => void; help: string }) {
  const safe = values.length ? values : [''];
  return <div className="table-key-builder">
    <div className="table-key-title"><strong>{label}</strong><button type="button" className="secondary compact" onClick={() => onChange([...safe, ''])}><Plus size={13}/>Add field</button></div>
    {safe.map((value, index) => <div className="table-key-row" key={`${label}-${index}`}>
      <select value={value} onChange={(e) => { const next = [...safe]; next[index] = e.target.value; onChange(next); }}>
        <option value="">Select field</option>
        {fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}
      </select>
      {safe.length > 1 && <button type="button" className="icon-btn" aria-label="Remove key field" onClick={() => onChange(safe.filter((_, i) => i !== index))}><Trash2 size={14}/></button>}
    </div>)}
    <small>{help}</small>
  </div>;
}

export function TableCreateModal({ sources, activeSourceId, onCancel, onCreate }: { sources: BuilderDataSource[]; activeSourceId: string | null; onCancel: () => void; onCreate: (table: TableDefinition) => void }) {
  const [mode, setMode] = useState<TableMode>('dynamic');
  const [columns, setColumns] = useState(5);
  const [rows, setRows] = useState(8);
  const [headerRows, setHeaderRows] = useState(1);
  const [sourceId, setSourceId] = useState(activeSourceId ?? sources[0]?.id ?? '');
  const source = useMemo(() => sources.find((item) => item.id === sourceId) ?? null, [sources, sourceId]);
  const [parentKeys, setParentKeys] = useState<string[]>([]);
  const [rowKeys, setRowKeys] = useState<string[]>([]);

  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sourceId, sources]);
  useEffect(() => {
    const parent = recommendedParentKey(source?.fields ?? []);
    const row = recommendedRowKey(source?.fields ?? []);
    setParentKeys(parent ? [parent] : ['']);
    setRowKeys(row ? [row] : ['']);
  }, [sourceId, source]);

  const validParentKeys = parentKeys.filter(Boolean);
  const validRowKeys = rowKeys.filter(Boolean);

  function create() {
    if (mode === 'custom') {
      onCreate(createCustomTable(Math.min(20, Math.max(1, columns)), Math.min(100, Math.max(1, rows))));
      return;
    }
    if (!source || validParentKeys.length === 0) return;
    onCreate(createDynamicTable(
      Math.min(20, Math.max(1, columns)), source.name, Math.min(5, Math.max(0, headerRows)),
      {
        sourceId: source.id,
        parentKey: validParentKeys[0], parentKeys: validParentKeys,
        rowKey: validRowKeys[0], rowKeys: validRowKeys,
      },
    ));
  }

  return <div className="table-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="table-modal" role="dialog" aria-modal="true" aria-label="Create table">
      <div className="table-modal-title"><span><Table2 size={18}/>Create Table</span><button onClick={onCancel} aria-label="Close"><X size={18}/></button></div>
      <div className="table-mode-cards">
        <button className={mode === 'dynamic' ? 'active' : ''} onClick={() => setMode('dynamic')}><strong>Dynamic Table</strong><small>Group one loaded source by parent/document ID and repeat its line-item rows</small></button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}><strong>Custom Table</strong><small>Fixed rows/columns with cell-wise content and binding</small></button>
      </div>
      {mode === 'dynamic' ? <div className="table-modal-fields">
        <label>Data source
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={sources.length === 0}>
            {sources.length === 0 ? <option value="">No Data Source loaded</option> : sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}
          </select>
          <small>Parent/header fields and line-item fields can live in the same imported CSV / Excel / JSON source.</small>
        </label>
        {source && <>
          <KeyFields label="Parent / Document ID" fields={source.fields} values={parentKeys} onChange={setParentKeys} help="Example: InvoiceNo. Add more fields to create a composite parent key such as CompanyCode + InvoiceNo."/>
          <KeyFields label="Child / Row ID" fields={source.fields} values={rowKeys} onChange={setRowKeys} help="Example: LineItemNo. Add more fields for a composite row identity such as InvoiceNo + LineItemNo. If omitted, runtime index is the fallback."/>
        </>}
        <label>Columns<input type="number" min="1" max="20" value={columns} onChange={(e) => setColumns(Number(e.target.value) || 1)}/></label>
        <label>Header rows<input type="number" min="0" max="5" value={headerRows} onChange={(e) => setHeaderRows(Number(e.target.value) || 0)}/></label>
        <div className="table-relation-summary"><strong>Document context</strong><span>Selected record → same Parent ID rows only → Child/Row ID keeps each line item stable</span></div>
      </div> : <div className="table-modal-fields two-col">
        <label>Columns<input type="number" min="1" max="20" value={columns} onChange={(e) => setColumns(Number(e.target.value) || 1)}/></label>
        <label>Rows<input type="number" min="1" max="100" value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)}/></label>
      </div>}
      <div className="table-modal-note">Both table types use the same row / column / cell model. Row span and column span remain available at cell level.</div>
      <div className="table-modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={create} disabled={mode === 'dynamic' && (!source || validParentKeys.length === 0)}>Create Table</button></div>
    </div>
  </div>;
}
