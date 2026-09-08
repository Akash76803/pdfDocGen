import type { FieldDefinition, FieldRole, MappingDefinition, GroupingMode, SummaryAggregation } from '@document-tool/contracts';

interface Props {
  fields: FieldDefinition[];
  mappings: MappingDefinition[];
  mode: GroupingMode;
  onModeChange: (mode: GroupingMode) => void;
  onChange: (mappings: MappingDefinition[]) => void;
}

const roles: { value: FieldRole; label: string }[] = [
  { value: 'GROUP_KEY', label: 'Group Key' },
  { value: 'HEADER_FIELD', label: 'Header Field' },
  { value: 'LINE_ITEM_FIELD', label: 'Line Item' },
  { value: 'SUMMARY_FIELD', label: 'Summary Field' },
  { value: 'IGNORE', label: 'Ignore' },
];

export function MappingConfigurator({ fields, mappings, mode, onModeChange, onChange }: Props) {
  const update = (id: string, patch: Partial<MappingDefinition>) => {
    const next = mappings.map((mapping) => {
      if (mapping.id === id) return { ...mapping, ...patch };
      if (patch.role === 'GROUP_KEY' && mapping.role === 'GROUP_KEY') return { ...mapping, role: 'HEADER_FIELD' as const };
      return mapping;
    });
    onChange(next);
  };

  return (
    <div className="mapping-configurator">
      <div className="mapping-mode-row">
        <label>Document grouping mode</label>
        <select value={mode} onChange={(e) => onModeChange(e.target.value as GroupingMode)}>
          <option value="GROUP_BY_FIELD">Group rows by a field</option>
          <option value="ONE_ROW_PER_DOCUMENT">One row per document</option>
          <option value="FULL_FILE_REPORT">Full file report</option>
        </select>
      </div>
      <div className="mapping-table-wrap">
        <table className="mapping-table">
          <thead><tr><th>Source Column</th><th>Role</th><th>Summary</th><th>Target Path</th><th>Type</th></tr></thead>
          <tbody>
            {fields.map((field) => {
              const mapping = mappings.find((item) => item.sourceField === field.name)!;
              return <tr key={field.name}>
                <td><strong>{field.label}</strong></td>
                <td>
                  <select value={mapping.role} onChange={(e) => update(mapping.id, { role: e.target.value as FieldRole })}>
                    {roles.map((role) => <option key={role.value} value={role.value} disabled={role.value === 'GROUP_KEY' && mode !== 'GROUP_BY_FIELD'}>{role.label}</option>)}
                  </select>
                </td>
                <td>{mapping.role === 'SUMMARY_FIELD' ? <select value={mapping.summaryAggregation ?? 'SUM'} onChange={(e) => update(mapping.id, { summaryAggregation: e.target.value as SummaryAggregation })}><option>SUM</option><option>FIRST</option><option>AVG</option><option>MIN</option><option>MAX</option><option>COUNT</option></select> : <span className="mapping-not-applicable">—</span>}</td>
                <td><input value={mapping.targetPath ?? ''} disabled={mapping.role === 'IGNORE'} onChange={(e) => update(mapping.id, { targetPath: e.target.value })} /></td>
                <td><span className="column-type-badge">{field.type}</span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
