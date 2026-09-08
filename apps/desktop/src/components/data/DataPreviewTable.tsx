import type { FieldDefinition, NormalizedData, NormalizedValue } from '@document-tool/contracts';
import { AlertTriangle, Table2 } from 'lucide-react';

interface DataPreviewTableProps {
  data: NormalizedData;
  maxRows?: number;
}

export function DataPreviewTable({ data, maxRows = 100 }: DataPreviewTableProps) {
  const previewRows = data.records.slice(0, maxRows);
  const totalRows = numberMeta(data.metadata?.totalRows, data.records.length);
  const totalColumns = numberMeta(data.metadata?.totalColumns, data.schema.fields.length);

  return (
    <section className="data-preview-card">
      <div className="data-preview-header">
        <div>
          <div className="section-title compact-title">
            <Table2 size={18} />
            <h3>Data Preview</h3>
          </div>
          <p className="muted-copy">
            Rows: {totalRows.toLocaleString()} &nbsp;•&nbsp; Columns: {totalColumns}
            {totalRows > maxRows ? ` • Showing first ${maxRows} rows` : ''}
          </p>
        </div>
      </div>

      {data.warnings && data.warnings.length > 0 && (
        <div className="warning-list">
          {data.warnings.map((warning, index) => (
            <div className="warning-item" key={`${warning.code}-${index}`}>
              <AlertTriangle size={14} />
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="schema-strip">
        {data.schema.fields.map((field: FieldDefinition) => (
          <div className="schema-pill" key={field.name}>
            <strong>{field.label}</strong>
            <span>{field.type}</span>
          </div>
        ))}
      </div>

      <div className="preview-table-wrapper phase1-preview-table">
        <table>
          <thead>
            <tr>
              <th className="row-index-cell">#</th>
              {data.schema.fields.map((field) => (
                <th key={field.name} title={field.originalLabel || field.label}>
                  {field.label}
                  <span className="column-type">{field.type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((record, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-index-cell">{rowIndex + 1}</td>
                {data.schema.fields.map((field) => (
                  <td key={field.name}>{displayValue(record[field.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function displayValue(value: NormalizedValue | undefined): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function numberMeta(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
