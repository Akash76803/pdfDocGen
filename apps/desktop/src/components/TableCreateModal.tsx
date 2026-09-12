import { useEffect, useMemo, useState } from 'react';
import { Plus, Table2, Trash2, X } from 'lucide-react';
import type { BuilderDataSource } from '../lib/dataSourceStore.ts';
import {
  createCustomTable,
  createDynamicTable,
  createGroupedSummaryTable,
  reconfigureGroupedSummaryTable,
  applyGroupedFinalSummary,
  defaultGroupedFinalSummaryConfig,
  groupedFinalSummaryConfigFromTable,
  recommendedParentKey,
  recommendedRowKey,
  suggestedDataType,
  type DynamicColumnMapping,
  type GroupedAggregateOperation,
  type GroupedColumnMapping,
  type GroupedFinalSummaryConfig,
  type GroupedFinalSummaryOperation,
  type TableDefinition,
} from '../lib/tableModel.ts';

type CreateTableMode = 'dynamic' | 'grouped' | 'custom';

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

const GROUP_OPERATIONS: Array<{ value: GroupedAggregateOperation; label: string }> = [
  { value: 'group', label: 'Group value' },
  { value: 'sum', label: 'SUM' },
  { value: 'count', label: 'COUNT' },
  { value: 'avg', label: 'AVG' },
  { value: 'min', label: 'MIN' },
  { value: 'max', label: 'MAX' },
  { value: 'first', label: 'FIRST' },
  { value: 'last', label: 'LAST' },
  { value: 'formula', label: 'FORMULA' },
];

function GroupedColumnFields({ source, mappings, onChange }: { source: BuilderDataSource; mappings: GroupedColumnMapping[]; onChange: (mappings: GroupedColumnMapping[]) => void }) {
  const safe = mappings.length ? mappings : [{ label: '', field: '', operation: 'sum' as GroupedAggregateOperation }];
  const update = (index: number, patch: Partial<GroupedColumnMapping>) => onChange(safe.map((item, i) => i === index ? { ...item, ...patch } : item));
  const insertFormulaRef = (index: number, label: string) => {
    if (!label) return;
    const current = safe[index]?.formula ?? '';
    update(index, { formula: `${current}${current && !/\s$/.test(current) ? ' ' : ''}[${label}]` });
  };
  return <div className="table-key-builder grouped-column-builder">
    <div className="table-key-title"><strong>Grouped output columns</strong><button type="button" className="secondary compact" onClick={() => onChange([...safe, { label: '', field: '', operation: 'sum' }])}><Plus size={13}/>Add column</button></div>
    <small>Aggregate columns resolve first. Formula columns can reference grouped output labels such as [Taxable] + [Total GST].</small>
    {safe.map((mapping, index) => <div className="grouped-column-row" key={`grouped-column-${index}`}>
      <div className="dynamic-column-index">{index + 1}</div>
      <label>Header label
        <input value={mapping.label} placeholder={mapping.operation === 'group' ? 'e.g. HSN' : mapping.operation === 'formula' ? 'e.g. Total GST' : 'e.g. Taxable'} onChange={(e) => update(index, { label: e.target.value })}/>
      </label>
      {mapping.operation !== 'formula' ? <label>Source field
        <select value={mapping.field} onChange={(e) => {
          const fieldName = e.target.value;
          const field = source.fields.find((item) => item.name === fieldName);
          update(index, { field: fieldName, label: mapping.label || field?.label || fieldName, dataType: suggestedDataType(field) });
        }}>
          <option value="">Select imported field</option>
          {source.fields.map((field) => <option key={field.name} value={field.name}>{field.label || field.name} ({field.name})</option>)}
        </select>
      </label> : <label>Formula
        <input value={mapping.formula ?? ''} placeholder="[CGST] + [SGST] + [IGST]" onChange={(e) => update(index, { formula: e.target.value, field: '' })}/>
      </label>}
      <label>Operation
        <select value={mapping.operation} onChange={(e) => {
          const operation = e.target.value as GroupedAggregateOperation;
          update(index, operation === 'formula' ? { operation, field: '', dataType: mapping.dataType ?? 'decimal' } : { operation });
        }}>
          {GROUP_OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}
        </select>
      </label>
      {mapping.operation === 'formula' && <label>Insert column
        <select value="" onChange={(e) => insertFormulaRef(index, e.target.value)}>
          <option value="">Select output column…</option>
          {safe.filter((item, itemIndex) => itemIndex !== index && item.label.trim()).map((item, itemIndex) => <option key={`${item.label}-${itemIndex}`} value={item.label.trim()}>{item.label.trim()}</option>)}
        </select>
      </label>}
      {mapping.operation === 'formula' && <small className="table-cell-help">Supports +, -, *, /, parentheses and chained output columns. Circular/self references resolve blank safely.</small>}
      {safe.length > 1 && <button type="button" className="icon-btn dynamic-column-remove" aria-label={`Remove grouped column ${index + 1}`} onClick={() => onChange(safe.filter((_, i) => i !== index))}><Trash2 size={14}/></button>}
    </div>)}
  </div>;
}

const GROUPED_SUMMARY_OPERATIONS: Array<{ value: GroupedFinalSummaryOperation; label: string }> = [
  { value: 'blank', label: 'Blank' },
  { value: 'label', label: 'Custom text' },
  { value: 'sum', label: 'SUM' },
  { value: 'count', label: 'COUNT' },
  { value: 'avg', label: 'AVG' },
  { value: 'min', label: 'MIN' },
  { value: 'max', label: 'MAX' },
  { value: 'formula', label: 'FORMULA' },
];

function GroupedFinalSummaryFields({ mappings, config, onChange }: { mappings: GroupedColumnMapping[]; config: GroupedFinalSummaryConfig; onChange: (config: GroupedFinalSummaryConfig) => void }) {
  const columns = mappings.map((_, index) => config.columns[index] ?? { operation: index === 0 ? 'label' as const : 'sum' as const, text: index === 0 ? 'TOTAL' : undefined });
  const update = (index: number, patch: Partial<(typeof columns)[number]>) => {
    const next = columns.map((item, i) => i === index ? { ...item, ...patch } : item);
    onChange({ ...config, columns: next });
  };
  const insertRef = (index: number, label: string) => {
    if (!label) return;
    const current = columns[index]?.formula ?? '';
    update(index, { formula: `${current}${current && !/\s$/.test(current) ? ' ' : ''}[${label}]` });
  };
  return <div className="table-key-builder grouped-final-summary-builder">
    <div className="table-key-title"><strong>Final Summary Row</strong><label className="inline-check"><input type="checkbox" checked={config.enabled} onChange={(e) => onChange({ ...config, enabled: e.target.checked })}/>Enable</label></div>
    <small>Calculated after HSN/category grouping. SUM/AVG/etc. use the grouped output rows, not raw line items. The row is kept together and renders once on the final grouped page.</small>
    {config.enabled && mappings.map((mapping, index) => {
      const setting = columns[index] ?? { operation: 'blank' as const };
      return <div className="grouped-column-row" key={`grouped-summary-${index}`}>
        <div className="dynamic-column-index">{index + 1}</div>
        <label>Column<input value={mapping.label} readOnly/></label>
        <label>Summary operation<select value={setting.operation} onChange={(e) => update(index, { operation: e.target.value as GroupedFinalSummaryOperation })}>{GROUPED_SUMMARY_OPERATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {setting.operation === 'label' && <label>Text<input value={setting.text ?? ''} placeholder="TOTAL" onChange={(e) => update(index, { text: e.target.value })}/></label>}
        {setting.operation === 'formula' && <label>Formula<input value={setting.formula ?? ''} placeholder="[Taxable] + [Total GST]" onChange={(e) => update(index, { formula: e.target.value })}/></label>}
        {setting.operation === 'formula' && <label>Insert summary value<select value="" onChange={(e) => insertRef(index, e.target.value)}><option value="">Select column…</option>{mappings.filter((item, itemIndex) => itemIndex !== index && item.label.trim()).map((item) => <option key={item.label} value={item.label.trim()}>{item.label.trim()}</option>)}</select></label>}
      </div>;
    })}
  </div>;
}

export function TableCreateModal({ sources, activeSourceId, initialTable, onCancel, onCreate }: { sources: BuilderDataSource[]; activeSourceId: string | null; initialTable?: TableDefinition; onCancel: () => void; onCreate: (table: TableDefinition) => void }) {
  const initialGrouped = initialTable?.binding?.grouping;
  const editing = Boolean(initialTable);
  const [mode, setMode] = useState<CreateTableMode>(initialGrouped ? 'grouped' : initialTable?.mode === 'custom' ? 'custom' : 'dynamic');
  const [columns, setColumns] = useState(initialTable?.columns.length ?? 5);
  const [rows, setRows] = useState(initialTable?.mode === 'custom' ? initialTable.rows.length : 8);
  const [sourceId, setSourceId] = useState(initialTable?.binding?.sourceId ?? activeSourceId ?? sources[0]?.id ?? '');
  const source = useMemo(() => sources.find((item) => item.id === sourceId) ?? null, [sources, sourceId]);
  const [parentKeys, setParentKeys] = useState<string[]>(initialTable?.binding?.parentKeys?.length ? initialTable.binding.parentKeys : initialTable?.binding?.parentKey ? [initialTable.binding.parentKey] : []);
  const [rowKeys, setRowKeys] = useState<string[]>(initialTable?.binding?.rowKeys?.length ? initialTable.binding.rowKeys : initialTable?.binding?.rowKey ? [initialTable.binding.rowKey] : []);
  const [groupBy, setGroupBy] = useState<string[]>(initialGrouped?.groupBy ?? []);
  const [dynamicColumns, setDynamicColumns] = useState<DynamicColumnMapping[]>([{ label: '', field: '' }]);
  const [groupedColumns, setGroupedColumns] = useState<GroupedColumnMapping[]>(initialGrouped?.columns.map(({ outputKey: _outputKey, ...mapping }) => mapping) ?? [
    { label: 'Group', field: '', operation: 'group', dataType: 'text' },
    { label: 'Total', field: '', operation: 'sum', dataType: 'decimal' },
  ]);
  const [finalSummary, setFinalSummary] = useState<GroupedFinalSummaryConfig>(() => initialTable && initialGrouped
    ? groupedFinalSummaryConfigFromTable(initialTable)
    : defaultGroupedFinalSummaryConfig([
      { label: 'Group', field: '', operation: 'group', dataType: 'text' },
      { label: 'Total', field: '', operation: 'sum', dataType: 'decimal' },
    ]));

  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sourceId, sources]);
  useEffect(() => {
    if (editing) return;
    const parent = recommendedParentKey(source?.fields ?? []);
    const row = recommendedRowKey(source?.fields ?? []);
    setParentKeys(parent ? [parent] : ['']);
    setRowKeys(row ? [row] : ['']);
    setGroupBy(['']);
    setDynamicColumns([{ label: '', field: '' }]);
    setGroupedColumns([
      { label: 'Group', field: '', operation: 'group', dataType: 'text' },
      { label: 'Total', field: '', operation: 'sum', dataType: 'decimal' },
    ]);
    setFinalSummary(defaultGroupedFinalSummaryConfig([
      { label: 'Group', field: '', operation: 'group', dataType: 'text' },
      { label: 'Total', field: '', operation: 'sum', dataType: 'decimal' },
    ]));
  }, [sourceId, source, editing]);

  const validParentKeys = parentKeys.filter(Boolean);
  const validRowKeys = rowKeys.filter(Boolean);
  const validGroupBy = groupBy.filter(Boolean);
  const validDynamicColumns = dynamicColumns.filter((item) => item.field);
  const validGroupedColumns = groupedColumns.filter((item) => item.operation && (item.operation === 'formula' ? item.formula?.trim() : item.field));

  function create() {
    if (mode === 'custom') {
      onCreate(createCustomTable(Math.min(20, Math.max(1, columns)), Math.min(100, Math.max(1, rows))));
      return;
    }
    if (!source || validParentKeys.length === 0) return;
    if (mode === 'grouped') {
      if (validGroupBy.length === 0 || validGroupedColumns.length === 0) return;
      const configured = initialTable
        ? reconfigureGroupedSummaryTable(initialTable, source.name, validGroupBy, validGroupedColumns, { sourceId: source.id, parentKey: validParentKeys[0], parentKeys: validParentKeys })
        : createGroupedSummaryTable(source.name, validGroupBy, validGroupedColumns, { sourceId: source.id, parentKey: validParentKeys[0], parentKeys: validParentKeys });
      onCreate(applyGroupedFinalSummary(configured, { ...finalSummary, columns: validGroupedColumns.map((_, index) => finalSummary.columns[index] ?? defaultGroupedFinalSummaryConfig(validGroupedColumns).columns[index]) }));
      return;
    }
    if (validDynamicColumns.length === 0) return;
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

  const groupedDisabled = mode === 'grouped' && (!source || validParentKeys.length === 0 || validGroupBy.length === 0 || validGroupedColumns.length === 0);
  const dynamicDisabled = mode === 'dynamic' && (!source || validParentKeys.length === 0 || validDynamicColumns.length === 0);

  return <div className="table-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
    <div className="table-modal" role="dialog" aria-modal="true" aria-label={editing ? "Edit table configuration" : "Create table"}>
      <div className="table-modal-title"><span><Table2 size={18}/>{editing ? 'Edit Table Configuration' : 'Create Table'}</span><button onClick={onCancel} aria-label="Close"><X size={18}/></button></div>
      <div className="table-mode-cards three">
        <button disabled={editing} className={mode === 'dynamic' ? 'active' : ''} onClick={() => setMode('dynamic')}><strong>Dynamic Table</strong><small>Repeat matching line-item records from imported data</small></button>
        <button disabled={editing} className={mode === 'grouped' ? 'active' : ''} onClick={() => setMode('grouped')}><strong>Grouped Summary</strong><small>Group by HSN/category/etc.; aggregate or calculate Formula columns</small></button>
        <button disabled={editing} className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}><strong>Custom Table</strong><small>Fixed rows/columns with cell-wise content and binding</small></button>
      </div>

      {mode === 'dynamic' ? <div className="table-modal-fields dynamic-table-create-fields">
        <label>Data source
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={sources.length === 0}>
            {sources.length === 0 ? <option value="">No Data Source loaded</option> : sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}
          </select>
          <small>Parent/header fields and repeating line-item fields come from this same imported source.</small>
        </label>
        {source && <>
          <KeyFields label="Parent / Document ID" fields={source.fields} values={parentKeys} onChange={setParentKeys} help="Restricts line items to the selected document, e.g. InvoiceNo or CompanyCode + InvoiceNo."/>
          <KeyFields label="Child / Row ID" fields={source.fields} values={rowKeys} onChange={setRowKeys} help="Stable identity for each repeated line item. Index is fallback if omitted."/>
          <DynamicColumnFields source={source} mappings={dynamicColumns} onChange={setDynamicColumns}/>
        </>}
        <div className="table-relation-summary"><strong>Dynamic body</strong><span>One design body row repeats once per matching imported record.</span></div>
      </div> : mode === 'grouped' ? <div className="table-modal-fields dynamic-table-create-fields grouped-summary-create-fields">
        <label>Data source
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={sources.length === 0}>
            {sources.length === 0 ? <option value="">No Data Source loaded</option> : sources.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.records.length} records)</option>)}
          </select>
          <small>Grouping happens only inside the currently selected Parent / Document.</small>
        </label>
        {source && <>
          <KeyFields label="Parent / Document ID" fields={source.fields} values={parentKeys} onChange={setParentKeys} help="First filter the flat source to the active invoice/order/document."/>
          <KeyFields label="Group By" fields={source.fields} values={groupBy} onChange={setGroupBy} help="Rows with the same key become one summary row. Example: HSN, TaxRate, Category, Warehouse."/>
          <GroupedColumnFields source={source} mappings={groupedColumns} onChange={(next) => {
            setGroupedColumns(next);
            setFinalSummary((current) => ({ ...current, columns: next.map((mapping, index) => current.columns[index] ?? defaultGroupedFinalSummaryConfig(next).columns[index] ?? (mapping.operation === 'group' ? { operation: 'blank' } : { operation: 'sum' })) }));
          }}/>
          <GroupedFinalSummaryFields mappings={groupedColumns} config={finalSummary} onChange={setFinalSummary}/>
        </>}
        <div className="table-relation-summary"><strong>Example</strong><span>Group By HSN → aggregate Taxable/CGST/SGST/IGST, Formula Total GST/Total, then one final TOTAL row across the grouped HSN output.</span></div>
      </div> : <div className="table-modal-fields two-col">
        <label>Columns<input type="number" min="1" max="20" value={columns} onChange={(e) => setColumns(Number(e.target.value) || 1)}/></label>
        <label>Rows<input type="number" min="1" max="100" value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)}/></label>
      </div>}

      <div className="table-modal-note">Grouped Summary filters the active document, resolves Group/Aggregate columns, evaluates Formula columns, then calculates the optional Final Summary Row over the grouped output. Create and Edit use this same configuration UI.</div>
      <div className="table-modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={create} disabled={dynamicDisabled || groupedDisabled}>{editing ? 'Apply Changes' : 'Create Table'}</button></div>
    </div>
  </div>;
}
