import { Database, FileSpreadsheet, Upload } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
export function DataSources() {
  return <div className="page"><PageHeader eyebrow="Data" title="Data Sources" description="Bring structured Excel or CSV data into document generation workflows." />
    <section className="two-column"><div className="panel"><h2>Import source</h2><div className="drop-zone"><Upload size={30}/><strong>Drop Excel or CSV here</strong><span>Datasource engines are retained from docGen. UI integration is scheduled for DB-3.</span><button className="secondary" disabled>Choose file</button></div></div><div className="panel"><h2>Supported in extracted core</h2><div className="feature-list"><div><FileSpreadsheet size={18}/><span><strong>Excel</strong><small>Workbook inspection, sheets and row loading</small></span></div><div><Database size={18}/><span><strong>CSV</strong><small>Header inference and normalized records</small></span></div></div></div></section>
  </div>;
}
