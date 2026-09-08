import { Database, FileOutput, FilePlus2, FileText, Layers3, Plus } from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function Dashboard({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const actions = [
    { title: 'New Document', text: 'Start an A4 business document template.', icon: FilePlus2, route: 'builder' as const },
    { title: 'Templates', text: 'Open and manage reusable document templates.', icon: Layers3, route: 'templates' as const },
    { title: 'Data Sources', text: 'Prepare Excel and CSV data for dynamic documents.', icon: Database, route: 'data' as const },
    { title: 'Generate Documents', text: 'Preview bindings and export PDF, DOCX or images.', icon: FileOutput, route: 'generate' as const },
  ];
  return <div className="page"><PageHeader eyebrow="Workspace" title="Document automation, without the CAD clutter" description="Build reusable templates, bind business data and generate professional documents from one focused workspace." actions={<button className="primary" onClick={() => onNavigate('builder')}><Plus size={17}/>New template</button>} />
    <section className="action-grid">{actions.map(({ title, text, icon: Icon, route }) => <button className="action-card" key={title} onClick={() => onNavigate(route)}><span className="action-icon"><Icon size={22}/></span><span><strong>{title}</strong><small>{text}</small></span><span className="card-arrow">→</span></button>)}</section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Recent</span><h2>Templates</h2></div><button className="secondary" onClick={() => onNavigate('templates')}>View all</button></div><div className="empty-state"><FileText size={28}/><strong>No recent templates yet</strong><span>Create your first template in Template Builder. Saved templates will appear here.</span></div></section>
  </div>;
}
