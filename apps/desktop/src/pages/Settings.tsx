import { useEffect, useState } from 'react';
import { Check, Cloud, Copy, KeyRound, Moon, RotateCcw, Sun, Unplug } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  CLOUD_API_BASE_URL_KEY,
  resolveCloudApiBaseUrl,
  saveCloudApiBaseUrl,
  TemplatePublishError,
} from '../lib/cloudTemplatePublisher.ts';
import {
  CLOUD_AUTH_EVENT,
  generateIntegrationApiToken,
  getIntegrationApiToken,
  revokeIntegrationApiToken,
} from '../lib/cloudAuth.ts';

export function Settings({ theme, onThemeChange }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const [cloudApiUrl, setCloudApiUrl] = useState(() => window.localStorage.getItem(CLOUD_API_BASE_URL_KEY) ?? '');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => { void getIntegrationApiToken().then((token)=>setConnected(Boolean(token))).catch(()=>setConnected(false)); };
    refresh();
    window.addEventListener(CLOUD_AUTH_EVENT,refresh);
    return () => window.removeEventListener(CLOUD_AUTH_EVENT,refresh);
  },[]);

  function saveCloudEndpoint() {
    try {
      setCloudApiUrl(saveCloudApiBaseUrl(window.localStorage, cloudApiUrl));
      setCloudMessage('Hosted Document API URL saved.');
    } catch (error) {
      setCloudMessage(error instanceof TemplatePublishError ? error.message : 'Unable to save the API URL.');
    }
  }

  async function generateToken() {
    console.log('[Settings] generateToken clicked, busy:', busy, 'connected:', connected);
    if (busy) {
      console.warn('[Settings] generateToken ignored because busy is true');
      return;
    }
    setBusy(true);
    setCopied(false);
    setCloudMessage('Opening Google verification in your browser…');
    try {
      const apiBaseUrl = resolveCloudApiBaseUrl(window.localStorage);
      console.log('[Settings] Calling generateIntegrationApiToken with apiBaseUrl:', apiBaseUrl);
      const result = await generateIntegrationApiToken(apiBaseUrl);
      console.log('[Settings] generateIntegrationApiToken success:', result);
      setIssuedToken(result.token);
      setConnected(true);
      setCloudMessage('Connected. Your new API token is stored securely on this computer. Copy it now if you also want to configure an ERP/Salesforce callout.');
    } catch (error) {
      console.error('[Settings] generateToken caught error:', error);
      setCloudMessage(error instanceof Error ? error.message : 'Unable to generate API token.');
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if(!issuedToken) return;
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1600);
  }

  async function revokeToken() {
    if(busy) return;
    setBusy(true);
    try {
      const apiBaseUrl=resolveCloudApiBaseUrl(window.localStorage);
      await revokeIntegrationApiToken(apiBaseUrl);
      setConnected(false);
      setIssuedToken(null);
      setCloudMessage('API token revoked. Desktop and any ERP using that token will need a new token.');
    } catch(error) {
      setCloudMessage(error instanceof Error ? error.message : 'Unable to revoke API token.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="page">
    <PageHeader eyebrow="Application" title="Settings" description="Configure the standalone Document Builder workspace." />
    <section className="panel settings-list">
      <div>
        <span><strong>Appearance</strong><small>Choose a comfortable workspace theme.</small></span>
        <button className="secondary" onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16}/> : <Sun size={16}/>}Switch to {theme === 'light' ? 'dark' : 'light'}</button>
      </div>

      <div className="cloud-api-setting">
        <span>
          <strong><Cloud size={15}/>Cloud connection</strong>
          <small>Generate one reusable pdfDocGen API token after Google verification. Desktop stores it in the operating-system credential store; the same token can be used by ERP/Salesforce callouts.</small>
        </span>

        <div className="compact-info-row">
          <span>Status</span>
          <strong>{connected ? '● Connected' : '○ Not connected'}</strong>
        </div>

        {!connected ? <button className="primary" type="button" disabled={busy} onClick={() => void generateToken()}>
          <KeyRound size={15}/>{busy ? 'Waiting for Google…' : 'Generate Token'}
        </button> : <div className="button-row">
          <button className="secondary" type="button" disabled={busy} onClick={() => void generateToken()}><RotateCcw size={15}/>Generate New Token</button>
          <button className="secondary" type="button" disabled={busy} onClick={() => void revokeToken()}><Unplug size={15}/>Revoke Token</button>
        </div>}

        {issuedToken ? <div className="cloud-token-once">
          <small>This token is shown for this generation flow so you can configure ERP/Salesforce. Keep it secret.</small>
          <code>{issuedToken}</code>
          <button className="secondary" type="button" onClick={() => void copyToken()}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy Token'}</button>
        </div> : null}
      </div>

      <div className="cloud-api-setting">
        <span><strong>Hosted Document API</strong><small>Normally preconfigured by the app build. Change this only for staging/UAT environments.</small></span>
        <label><input aria-label="Hosted Document API URL" placeholder="https://document-api.example.com" value={cloudApiUrl} onChange={(event) => { setCloudApiUrl(event.target.value); setCloudMessage(null); }}/><button className="secondary" type="button" onClick={saveCloudEndpoint}>Save</button></label>
      </div>

      {cloudMessage ? <div><span><strong>Cloud status</strong><small className="cloud-api-message">{cloudMessage}</small></span></div> : null}
      <div><span><strong>Storage</strong><small>Templates and workspace data remain local-first.</small></span><span className="status-pill">Local-first</span></div>
      <div><span><strong>Desktop credential storage</strong><small>The reusable API token is stored in the operating-system credential manager, not localStorage.</small></span><span className="status-pill">Secure</span></div>
    </section>
  </div>;
}
