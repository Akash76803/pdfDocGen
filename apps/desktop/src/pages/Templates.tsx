import { FileText, Plus, Search } from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function Templates({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  return <div className="page"><PageHeader eyebrow="Library" title="Templates" description="Reusable layouts for invoices, quotations, reports, certificates, agreements and letters." actions={<button className="primary" onClick={() => onNavigate('builder')}><Plus size={17}/>New template</button>} />
    <div className="toolbar"><label className="search"><Search size={17}/><input placeholder="Search templates" /></label><select aria-label="Template type"><option>All document types</option><option>Invoice</option><option>Quotation</option><option>Report</option><option>Certificate</option><option>Agreement</option></select></div>
    <section className="panel"><div className="empty-state tall"><FileText size={32}/><strong>Your template library is ready</strong><span>DB-1 establishes the standalone library shell. Template persistence/editor wiring follows in DB-2.</span><button className="primary" onClick={() => onNavigate('builder')}>Create first template</button></div></section>
  </div>;
}
