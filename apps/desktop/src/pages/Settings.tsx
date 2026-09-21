import { useState } from 'react';
import { Cloud, Moon, Sun } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import { CLOUD_API_BASE_URL_KEY, saveCloudApiBaseUrl, TemplatePublishError } from '../lib/cloudTemplatePublisher.ts';
export function Settings({ theme, onThemeChange }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const [cloudApiUrl, setCloudApiUrl] = useState(() => window.localStorage.getItem(CLOUD_API_BASE_URL_KEY) ?? '');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  function saveCloudEndpoint() {
    try { setCloudApiUrl(saveCloudApiBaseUrl(window.localStorage, cloudApiUrl)); setCloudMessage('Hosted Document API URL saved.'); }
    catch (error) { setCloudMessage(error instanceof TemplatePublishError ? error.message : 'Unable to save the API URL.'); }
  }
  return <div className="page"><PageHeader eyebrow="Application" title="Settings" description="Configure the standalone Document Builder workspace." /><section className="panel settings-list"><div><span><strong>Appearance</strong><small>Choose a comfortable workspace theme.</small></span><button className="secondary" onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16}/> : <Sun size={16}/>}Switch to {theme === 'light' ? 'dark' : 'light'}</button></div><div className="cloud-api-setting"><span><strong><Cloud size={15}/>Hosted Document API</strong><small>Used only by Publish to Cloud. Local/offline template saving remains enabled.</small></span><label><input aria-label="Hosted Document API URL" placeholder="https://document-api.example.com" value={cloudApiUrl} onChange={(event) => { setCloudApiUrl(event.target.value); setCloudMessage(null); }}/><button className="secondary" type="button" onClick={saveCloudEndpoint}>Save</button></label>{cloudMessage ? <small className="cloud-api-message">{cloudMessage}</small> : null}</div><div><span><strong>Storage</strong><small>Templates and workspace data remain local-first.</small></span><span className="status-pill">Local-first</span></div><div><span><strong>Desktop runtime</strong><small>Tauri remains on the extracted version; no runtime upgrade in CLOUD-2.</small></span><span className="status-pill">Preserved</span></div></section></div>;
}
