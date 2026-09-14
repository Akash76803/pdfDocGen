import { FilePlus2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NewTemplateRequest, TemplateDocumentType, TemplateStarter } from '../lib/templateLibrary.ts';

type Props = {
  onCancel: () => void;
  onCreate: (request: NewTemplateRequest) => void;
};

const documentTypes: TemplateDocumentType[] = ['Invoice', 'Quotation', 'Report', 'Certificate', 'Agreement', 'Letter', 'Document'];
const pageSizes: NewTemplateRequest['pageSize'][] = ['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid', 'Executive'];

export function NewTemplateModal({ onCancel, onCreate }: Props) {
  const [name, setName] = useState('Untitled Document');
  const [documentType, setDocumentType] = useState<TemplateDocumentType>('Document');
  const [pageSize, setPageSize] = useState<NewTemplateRequest['pageSize']>('A4');
  const [orientation, setOrientation] = useState<NewTemplateRequest['orientation']>('Portrait');
  const [starter, setStarter] = useState<TemplateStarter>('blank');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const create = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    onCreate({ name: cleanName, documentType, pageSize, orientation, starter });
  };

  return <div className="table-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="table-modal new-template-modal" role="dialog" aria-modal="true" aria-label="Create new template">
      <div className="table-modal-title"><span><FilePlus2 size={18}/>Create New Template</span><button onClick={onCancel} aria-label="Close"><X size={18}/></button></div>
      <div className="new-template-fields">
        <label className="span-two"><span>Template name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) create(); }}/><small>This name appears in the Templates library.</small></label>
        <label><span>Document type</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value as TemplateDocumentType)}>{documentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Page size</span><select value={pageSize} onChange={(event) => setPageSize(event.target.value as NewTemplateRequest['pageSize'])}>{pageSizes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Orientation</span><select value={orientation} onChange={(event) => setOrientation(event.target.value as NewTemplateRequest['orientation'])}><option>Portrait</option><option>Landscape</option></select></label>
      </div>
      <div className="new-template-starter">
        <strong>Start with</strong>
        <div className="table-mode-cards">
          <button type="button" className={starter === 'blank' ? 'active' : ''} onClick={() => setStarter('blank')}><b>Blank</b><small>Clean page with default margins. No elements or data bindings.</small></button>
          <button type="button" className={starter === 'invoice' ? 'active' : ''} onClick={() => { setStarter('invoice'); if (documentType === 'Document') setDocumentType('Invoice'); if (name === 'Untitled Document') setName('New Invoice'); }}><b>Invoice Starter</b><small>Starts with an invoice title, invoice/customer labels and a divider. Everything remains editable.</small></button>
        </div>
      </div>
      <div className="table-modal-note">A Draft is created in the library immediately. Creating this template never overwrites another saved template.</div>
      <div className="table-modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={create} disabled={!name.trim()}>Create Template</button></div>
    </div>
  </div>;
}
