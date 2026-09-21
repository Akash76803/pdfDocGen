import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Archive, Check, Clock3, CloudUpload, Copy, FileText, Layers3, Plus, Search, Send, Trash2 } from 'lucide-react';
import { NewTemplateModal } from '../components/NewTemplateModal.tsx';
import type { AppRoute } from '../components/AppShell.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  beginNewTemplate,
  createTemplateVersion,
  duplicateTemplate,
  migrateLegacyTemplateToLibrary,
  openTemplateFromLibrary,
  readTemplateLibrary,
  removeTemplateFromLibrary,
  recordCloudPublication,
  syncTemplateLibraryFromLocalFiles,
  updateTemplateMetadata,
  TEMPLATE_LIBRARY_EVENT,
  templateElementCount,
  templatePageCount,
  type NewTemplateRequest,
  type TemplateLibraryEntry,
} from '../lib/templateLibrary.ts';
import { publishTemplateToCloud, resolveCloudApiBaseUrl, TemplatePublishError } from '../lib/cloudTemplatePublisher.ts';

export function Templates({ onNavigate }: { onNavigate: (route: AppRoute) => void }) {
  const [templates, setTemplates] = useState<TemplateLibraryEntry[]>(() => migrateLegacyTemplateToLibrary(window.localStorage));
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All document types');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [publishingTemplateId, setPublishingTemplateId] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void syncTemplateLibraryFromLocalFiles(window.localStorage).then(setTemplates).catch(() => undefined);
    const refresh = () => setTemplates(migrateLegacyTemplateToLibrary(window.localStorage));
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener(TEMPLATE_LIBRARY_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(TEMPLATE_LIBRARY_EVENT, refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((item) => {
      const matchesSearch = !term || item.name.toLowerCase().includes(term) || item.documentType.toLowerCase().includes(term) || item.id.toLowerCase().includes(term);
      const matchesType = type === 'All document types' || item.documentType === type;
      const matchesStatus = statusFilter === 'All' || (statusFilter === 'Active' ? item.status !== 'Archived' : item.status === statusFilter);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [templates, search, type, statusFilter]);

  function createNew() {
    setNewTemplateOpen(true);
  }

  function createFromSetup(request: NewTemplateRequest) {
    beginNewTemplate(window.localStorage, request);
    setNewTemplateOpen(false);
    onNavigate('builder');
  }

  function openTemplate(id: string) {
    if (!openTemplateFromLibrary(window.localStorage, id)) return;
    onNavigate('builder');
  }

  function refreshLibrary() { setTemplates(readTemplateLibrary(window.localStorage)); }

  function duplicate(event: MouseEvent, item: TemplateLibraryEntry) { event.stopPropagation(); duplicateTemplate(window.localStorage, item.id); refreshLibrary(); }
  function version(event: MouseEvent, item: TemplateLibraryEntry) { event.stopPropagation(); createTemplateVersion(window.localStorage, item.id); refreshLibrary(); }
  async function publish(event: MouseEvent, item: TemplateLibraryEntry) {
    event.stopPropagation();
    if (publishingTemplateId) return;
    setPublishingTemplateId(item.id);
    setPublishNotice(null);
    try {
      const result = await publishTemplateToCloud(window.localStorage, item);
      recordCloudPublication(window.localStorage, item.id, { version:result.version, status:result.publicationStatus, publishedAt:result.publishedAt, apiBaseUrl:result.apiBaseUrl });
      refreshLibrary();
      setPublishNotice({ tone:'success', text:`${item.name} ${result.status === 'published' ? 'published' : 'updated'} successfully as cloud version ${result.version}.` });
    } catch (error) {
      const conflictVersion = error instanceof TemplatePublishError && error.code === 'TEMPLATE_VERSION_CONFLICT'
        && error.details && typeof error.details === 'object' && typeof (error.details as { currentVersion?: unknown }).currentVersion === 'number'
        ? (error.details as { currentVersion: number }).currentVersion : null;
      if (conflictVersion !== null) {
        recordCloudPublication(window.localStorage, item.id, {
          version: conflictVersion,
          status: 'ACTIVE',
          publishedAt: item.cloudPublication?.publishedAt ?? new Date().toISOString(),
          apiBaseUrl: item.cloudPublication?.apiBaseUrl ?? resolveCloudApiBaseUrl(window.localStorage),
        });
        refreshLibrary();
      }
      const message = conflictVersion !== null
        ? `Cloud is already at version ${conflictVersion}. Local cloud state was refreshed; review the template and click Update cloud template again.`
        : error instanceof TemplatePublishError ? `${error.message} (${error.code})` : error instanceof Error ? error.message : 'Template publish failed.';
      setPublishNotice({ tone:'error', text:message });
    } finally {
      setPublishingTemplateId(null);
    }
  }
  function archive(event: MouseEvent, item: TemplateLibraryEntry) { event.stopPropagation(); updateTemplateMetadata(window.localStorage, item.id, { status: item.status === 'Archived' ? 'Saved' : 'Archived' }); refreshLibrary(); }
  function rename(event: MouseEvent, item: TemplateLibraryEntry) { event.stopPropagation(); const value = window.prompt('Template name', item.name); if (!value?.trim()) return; updateTemplateMetadata(window.localStorage, item.id, { name: value }); refreshLibrary(); }

  async function copyTemplateId(event: MouseEvent, item: TemplateLibraryEntry) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.id);
      setCopiedTemplateId(item.id);
      window.setTimeout(() => setCopiedTemplateId((current) => current === item.id ? null : current), 1600);
    } catch {
      window.prompt('Copy template ID', item.id);
    }
  }

  function deleteTemplate(event: MouseEvent, item: TemplateLibraryEntry) {
    event.stopPropagation();
    if (!window.confirm(`Delete template “${item.name}”? This cannot be undone.`)) return;
    removeTemplateFromLibrary(window.localStorage, item.id);
    setTemplates(readTemplateLibrary(window.localStorage));
  }

  return <div className="page">
    {newTemplateOpen && <NewTemplateModal onCancel={() => setNewTemplateOpen(false)} onCreate={createFromSetup} />}
    <PageHeader eyebrow="Library" title="Templates" description="Reusable local-first layouts that can be published independently to the hosted Document API." actions={<button className="primary" onClick={createNew}><Plus size={17}/>New template</button>} />
    {publishNotice ? <div className={`template-publish-notice ${publishNotice.tone}`} role={publishNotice.tone === 'error' ? 'alert' : 'status'}>{publishNotice.tone === 'success' ? <Check size={16}/> : <CloudUpload size={16}/>}<span>{publishNotice.text}</span><button type="button" onClick={() => setPublishNotice(null)}>Dismiss</button></div> : null}
    <div className="toolbar"><label className="search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" /></label><select aria-label="Template type" value={type} onChange={(event) => setType(event.target.value)}><option>All document types</option><option>Invoice</option><option>Quotation</option><option>Report</option><option>Certificate</option><option>Agreement</option><option>Letter</option><option>Document</option></select><select aria-label="Template status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Active</option><option>All</option><option>Draft</option><option>Saved</option><option>Published</option><option>Archived</option></select></div>
    <section className="panel template-library-panel">
      {templates.length === 0 ? <div className="empty-state tall"><FileText size={32}/><strong>No saved templates yet</strong><span>Create a template, save it in Template Builder, and it will appear here automatically.</span><button className="primary" onClick={createNew}><Plus size={16}/>Create first template</button></div> : filtered.length === 0 ? <div className="empty-state"><Search size={28}/><strong>No matching templates</strong><span>Try another search term or document type.</span></div> : <div className="template-library-grid">
        {filtered.map((item) => <article key={item.id} className="template-library-card" role="button" tabIndex={0} onClick={() => openTemplate(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openTemplate(item.id); }}>
          <div className="template-card-preview"><FileText size={34}/><span>{item.documentType}</span></div>
          <div className="template-card-body">
            <div className="template-card-title"><div><strong>{item.name}</strong><small>{item.documentType} · v{item.version ?? 1} · {item.category ?? 'General'} <span className={`template-status ${item.status.toLowerCase()}`}>{item.status}</span>{item.cloudPublication ? ` · Cloud v${item.cloudPublication.version}` : ''}</small></div><div className="template-card-actions"><button title="Rename" onClick={(event) => rename(event,item)}>Aa</button><button title="Duplicate" onClick={(event) => duplicate(event,item)}><Copy size={14}/></button><button title="New version" onClick={(event) => version(event,item)}>v+</button><button title={item.cloudPublication ? 'Update cloud template' : 'Publish to Cloud'} disabled={publishingTemplateId !== null} onClick={(event) => void publish(event,item)}>{publishingTemplateId === item.id ? <Clock3 size={14}/> : <Send size={14}/>}</button><button title={item.status === 'Archived' ? 'Restore' : 'Archive'} onClick={(event) => archive(event,item)}><Archive size={14}/></button><button className="template-delete" title="Delete template" aria-label={`Delete ${item.name}`} onClick={(event) => deleteTemplate(event, item)}><Trash2 size={15}/></button></div></div>
            <div className="template-card-id" title={item.id}><span><strong>Template ID</strong><code>{item.id}</code></span><button type="button" title="Copy template ID" aria-label={`Copy template ID ${item.id}`} onClick={(event) => void copyTemplateId(event, item)}>{copiedTemplateId === item.id ? <Check size={13}/> : <Copy size={13}/>}<span>{copiedTemplateId === item.id ? 'Copied' : 'Copy'}</span></button></div>
            <div className="template-card-meta"><span><Layers3 size={13}/>{templatePageCount(item)} page{templatePageCount(item) === 1 ? '' : 's'}</span><span>{templateElementCount(item)} elements</span></div>
            <div className="template-card-updated"><Clock3 size={13}/>Updated {formatUpdated(item.updatedAt)}</div>
          </div>
        </article>)}
      </div>}
    </section>
  </div>;
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
