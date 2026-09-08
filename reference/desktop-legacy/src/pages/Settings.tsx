import React, { useState } from 'react';
import type { AppTheme } from '../app/App.tsx';
import { Save, Shield, HardDrive, Cpu, Palette } from 'lucide-react';

export const Settings: React.FC<{ theme: AppTheme; onThemeChange: (theme: AppTheme) => void }> = ({ theme, onThemeChange }) => {
  const [outputDir, setOutputDir] = useState('./output');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    window.localStorage.setItem('document-tool-output-directory', outputDir);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-container animated-fade-in">
      <div className="page-header"><div><h2>Application Settings</h2><p>Choose a comfortable theme and manage local workspace preferences.</p></div></div>

      <div className="settings-form">
        <div className="settings-section">
          <div className="section-title"><Palette size={18}/><h3>Appearance</h3></div>
          <div className="theme-choice-grid">
            {(['light','soft','ocean','lavender','forest','dark'] as AppTheme[]).map((item) => (
              <button key={item} className={`theme-choice ${theme === item ? 'active' : ''}`} onClick={() => onThemeChange(item)}>
                <span className={`theme-swatch ${item}`}/>
                <strong>{themeName(item)}</strong>
                <small>{themeDescription(item)}</small>
              </button>
            ))}
          </div>
          <span className="help-text">Text, panels, inputs and tool labels automatically follow the selected theme for readable contrast.</span>
        </div>

        <div className="settings-section">
          <div className="section-title"><HardDrive size={18}/><h3>Storage & Workspace</h3></div>
          <div className="form-group"><label>Output Directory Path</label><input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="e.g. ./output"/><span className="help-text">Where future rendered documents will be saved by default.</span></div>
          <div className="form-group"><label>Imported Source Workspace</label><input type="text" value="IndexedDB local workspace (source file + grouped preview)" disabled/><span className="help-text">Imported Excel/CSV sources are retained as a local Source Library on this device. Template Designer can switch between previously imported files and restore each file's mappings, headers, and preview groups.</span></div>
        </div>

        <div className="settings-section">
          <div className="section-title"><Shield size={18}/><h3>Security & Sandbox</h3></div>
          <div className="security-card"><h4>Offline Workspace</h4><p>Imported source data and templates stay in local browser/application storage. This phase does not upload source files to a cloud service.</p></div>
        </div>

        <div className="settings-section">
          <div className="section-title"><Cpu size={18}/><h3>System Status</h3></div>
          <div className="status-grid"><div className="status-item"><span className="label">Template Designer</span><span className="value success-text">Phase 4.3</span></div><div className="status-item"><span className="label">Renderer</span><span className="value">PDF active — shared HTML print + engine PDF; DOCX next</span></div></div>
        </div>

        <div className="form-actions"><button className="btn-primary" onClick={handleSave}><Save size={16}/> Save Configuration</button>{saved && <span className="save-indicator success-text">Settings saved</span>}</div>
      </div>
    </div>
  );
};

function themeName(theme:AppTheme):string{return({light:'Light',soft:'Soft',ocean:'Ocean',lavender:'Lavender',forest:'Forest',dark:'Dark'} as Record<AppTheme,string>)[theme];}
function themeDescription(theme:AppTheme):string{return({light:'Bright and clean',soft:'Warm low-contrast workspace',ocean:'Cool blue workspace',lavender:'Soft purple workspace',forest:'Calm green workspace',dark:'Dark workspace'} as Record<AppTheme,string>)[theme];}
