import { useEffect, useState } from 'react';
import { Cloud, LogIn, LogOut, Moon, Sun } from 'lucide-react';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  CLOUD_API_BASE_URL_KEY,
  saveCloudApiBaseUrl,
  TemplatePublishError,
} from '../lib/cloudTemplatePublisher.ts';
import {
  CLOUD_AUTH_EVENT,
  getCloudAuthState,
  signInToCloud,
  signOutFromCloud,
  type CloudAuthState,
} from '../lib/cloudAuth.ts';

export function Settings({ theme, onThemeChange }: { theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const [cloudApiUrl, setCloudApiUrl] = useState(() => window.localStorage.getItem(CLOUD_API_BASE_URL_KEY) ?? '');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudAuth, setCloudAuth] = useState<CloudAuthState>({ signedIn:false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const refresh = () => { void getCloudAuthState().then(setCloudAuth); };
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

  async function signIn() {
    if (authBusy) return;
    setAuthBusy(true);
    setCloudMessage(null);
    try {
      const state=await signInToCloud(email,password);
      setCloudAuth(state);
      setPassword('');
      setCloudMessage(`Signed in${state.email ? ` as ${state.email}` : ''}. Cloud publishing is ready.`);
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Cloud sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (authBusy) return;
    setAuthBusy(true);
    setCloudMessage(null);
    try {
      await signOutFromCloud();
      setCloudAuth({signedIn:false});
      setCloudMessage('Signed out from cloud publishing.');
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setAuthBusy(false);
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
          <strong><Cloud size={15}/>Cloud publishing</strong>
          <small>Sign in once. The desktop app refreshes short-lived tokens automatically; users never need Secret Manager or gcloud.</small>
        </span>

        {cloudAuth.signedIn ? <>
          <div className="compact-info-row"><span>Status</span><strong>Connected{cloudAuth.email ? ` · ${cloudAuth.email}` : ''}</strong></div>
          <button className="secondary" type="button" disabled={authBusy} onClick={() => void signOut()}><LogOut size={15}/>Sign out</button>
        </> : <>
          <label><span>Email</span><input aria-label="Cloud account email" type="email" autoComplete="username" placeholder="name@example.com" value={email} onChange={(event)=>{setEmail(event.target.value);setCloudMessage(null);}}/></label>
          <label><span>Password</span><input aria-label="Cloud account password" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event)=>{setPassword(event.target.value);setCloudMessage(null);}} onKeyDown={(event)=>{if(event.key==='Enter') void signIn();}}/></label>
          <button className="primary" type="button" disabled={authBusy || !email.trim() || !password} onClick={() => void signIn()}><LogIn size={15}/>{authBusy ? 'Signing in…' : 'Sign in'}</button>
        </>}

        <small>Production desktop builds keep the refresh credential in the operating system credential store. Browser dev mode keeps it only for the current session.</small>
      </div>

      <div className="cloud-api-setting">
        <span><strong>Hosted Document API</strong><small>Normally preconfigured by the app build. Change this only for staging/UAT environments.</small></span>
        <label><input aria-label="Hosted Document API URL" placeholder="https://document-api.example.com" value={cloudApiUrl} onChange={(event) => { setCloudApiUrl(event.target.value); setCloudMessage(null); }}/><button className="secondary" type="button" onClick={saveCloudEndpoint}>Save</button></label>
      </div>

      {cloudMessage ? <div><span><strong>Cloud status</strong><small className="cloud-api-message">{cloudMessage}</small></span></div> : null}
      <div><span><strong>Storage</strong><small>Templates and workspace data remain local-first.</small></span><span className="status-pill">Local-first</span></div>
      <div><span><strong>Desktop runtime</strong><small>Tauri remains on the current v1 runtime during AUTH-UX-1.</small></span><span className="status-pill">Preserved</span></div>
    </section>
  </div>;
}
