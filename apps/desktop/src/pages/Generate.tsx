import { FileOutput, FileText, Image, Sheet } from 'lucide-react';
import type { AppRoute } from '../components/AppShell.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
export function Generate({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  return <div className="page"><PageHeader eyebrow="Output" title="Generate Documents" description="Select a template and data source, preview records, then generate the required output." />
    <section className="workflow"><div className="workflow-step active"><b>1</b><span><strong>Template</strong><small>Choose document design</small></span></div><div className="workflow-step"><b>2</b><span><strong>Data</strong><small>Select source/record</small></span></div><div className="workflow-step"><b>3</b><span><strong>Preview</strong><small>Validate bindings</small></span></div><div className="workflow-step"><b>4</b><span><strong>Export</strong><small>Generate files</small></span></div></section>
    <section className="panel"><div className="empty-state tall"><FileOutput size={32}/><strong>Generation workflow shell is ready</strong><span>PDF, DOCX and image renderer packages remain in the workspace. Full orchestration is reconnected after Template Builder in later phases.</span><div className="format-row"><span><FileText size={16}/>PDF</span><span><Sheet size={16}/>DOCX</span><span><Image size={16}/>PNG / JPEG</span></div><button className="primary" onClick={() => onNavigate('templates')}>Choose template</button></div></section>
  </div>;
}
