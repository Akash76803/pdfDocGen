import { useEffect, useMemo, useState } from 'react';
import { Plus, Table2, Trash2, X } from 'lucide-react';
import type { BuilderDataSource } from '../lib/dataSourceStore.ts';
import { createCustomTable, createDynamicTable, recommendedParentKey, recommendedRowKey, suggestedDataType, type DynamicColumnMapping, type TableDefinition, type TableMode } from '../lib/tableModel.ts';

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

function DynamicColumnFields({ source, mappings, onChange }: { source: BuilderDataSource; mappings: DynamicColumnMapping[]; onChange: (mappings: DynamicColumnMapping[]) => void }) {
  const safe = mappings.length ? mappings : [{ label: '', field: '' }];
  const update = (index: number, patch: Partial<DynamicColumnMapping>) => {
    const next = safe.map((item, i) => i === index ? { ...item, ...patch } : item);
    onChange(next);
  };
  return <div className="table-key-builder dynamic-column-builder">
    <div className="table-key-title"><strong>Columns</strong><button type="button" className="secondary compact" onClick={() => onChange([...safe, { label: '', field: '' }])}><Plus size={13}/>Add column</button></div>
    <small>Each Dynamic Table column has one header label and one repeating field from the imported source.</small>
    {safe.map((mapping, index) => <div className="dynamic-column-row" key={`dynamic-column-${index}`}>
      <div className="dynamic-column-index">{index + 1}</div>
      <label>Header label
        <input value={mapping.label} placeholder="e.g. Product" onChange={(e) => update(index, { label: e.target.value })}/>
      </label>
      <label>Repeat row field
        <select value={mapping.field} onChange={(e) => {
          const fieldName = e.target.value;
          const field = source.fields.find((item) => item.name === fieldName);
          update(index, { field: fieldName, label: mapping.label || field?.label || fieldName, dataType: suggestedDataType(field) });
        }}>
          <option value="">Select imported field</option>
          {source.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}
        </select>
      </label>
      {safe.length > 1 && <button type="button" className="icon-btn dynamic-column-remove" aria-label={`Remove column ${index + 1}`} onClick={() => onChange(safe.filter((_, i) => i !== index))}><Trash2 size={14}/></button>}
    </div>)}
  </div>;
}

export function TableCreateModal({ sources, activeSourceId, onCancel, onCreate }: { sources: BuilderDataSource[]; activeSourceId: string | null; onCancel: () => void; onCreate: (table: TableDefinition) => void }) {
  const [mode, setMode] = useState<TableMode>('dynamic');
  const [columns, setColumns] = useState(5);
  const [rows, setRows] = useState(8);
  const [sourceId, setSourceId] = useState(activeSourceId ?? sources[0]?.id ?? '');
  const source = useMemo(() => sources.find((item) => item.id === sourceId) ?? null, [sources, sourceId]);
  const [parentKeys, setParentKeys] = useState<string[]>([]);
  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumnMapping[]>([{ label: '', field: '' }]);

  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sourceId, sources]);
  useEffect(() => {
    const parent = recommendedParentKey(source?.fields ?? []);
    const row = recommendedRowKey(source?.fields ?? []);
    setParentKeys(parent ? [parent] : ['']);
    setRowKeys(row ? [row] : ['']);
    setDynamicColumns([{ label: '', field: '' }]);
  }, [sourceId, source]);

  const validParentKeys = parentKeys.filter(Boolean);
  const validRowKeys = rowKeys.filter(Boolean);
  const validDynamicColumns = dynamicColumns.filter((item) => item.field);

  function create() {
    if (mode === 'custom') {
      onCreate(createCustomTable(Math.min(20, Math.max(1, columns)), Math.min(100, Math.max(1, rows))));
      return;
    }
    if (!source || validParentKeys.length === 0 || validDynamicColumns.length === 0) return;
    onCreate(createDynamicTable(
      validDynamicColumns.length, source.name, 1,
      {
        sourceId: source.id,
        parentKey: validParentKeys[0], parentKeys: validParentKeys,
        rowKey: validRowKeys[0], rowKeys: validRowKeys,
      },
      validDynamicColumns,
    ));
  }

  return <div className="table-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="table-modal" role="dialog" aria-modal="true" aria-label="Create table">
      <div className="table-modal-title"><span><Table2 size={18}/>Create Table</span><button onClick={onCancel} aria-label="Close"><X size={18}/></button></div>
      <div className="table-mode-cards">
        <button className={mode === 'dynamic' ? 'active' : ''} onClick={() => setMode('dynamic')}><strong>Dynamic Table</strong><small>Map imported fields once; body rows repeat automatically from data</small></button>
        <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}><strong>Custom Table</strong><small>Fixed rows/columns with cell-wise content and binding</small></button>
      </div>
      {mode === 'dynamic' ? <div className="table-modal-fields dynamic-table-create-fields">
        <label>Data source
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={sources.length === 0}>
            {sources.length === 0 ? <option value="">No Data Source loaded</option> : sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}
          </select>
          <small>Parent/header fields and repeating line-item fields come from this same imported source.</small>
        </label>
        {source && <>
          <KeyFields label="Parent / Document ID" fields={source.fields} values={parentKeys} onChange={setParentKeys} help="Groups flat rows into one document, e.g. InvoiceNo or CompanyCode + InvoiceNo."/>
          <KeyFields label="Child / Row ID" fields={source.fields} values={rowKeys} onChange={setRowKeys} help="Stable identity for each repeated line item, e.g. LineItemNo or InvoiceNo + LineItemNo. Index is fallback if omitted."/>
          <DynamicColumnFields source={source} mappings={dynamicColumns} onChange={setDynamicColumns}/>
        </>}
        <div className="table-relation-summary"><strong>Dynamic body</strong><span>One header row + one body template. Runtime row count comes only from matching imported records.</span></div>
      </div> : <div className="table-modal-fields two-col">
        <label>Columns<input type="number" min="1" max="20" value={columns} onChange={(e) => setColumns(Number(e.target.value) || 1)}/></label>
        <label>Rows<input type="number" min="1" max="100" value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)}/></label>
      </div>}
      <div className="table-modal-note">Dynamic tables repeat imported records automatically. Manual Rows × Columns is available only for Custom Table.</div>
      <div className="table-modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={create} disabled={mode === 'dynamic' && (!source || validParentKeys.length === 0 || validDynamicColumns.length === 0)}>Create Table</button></div>
    </div>
  </div>;
}
