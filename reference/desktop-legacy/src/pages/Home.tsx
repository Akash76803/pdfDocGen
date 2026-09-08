import React from 'react';
import { FileSpreadsheet, Layers, FileText, Settings, Play, CheckCircle, Palette } from 'lucide-react';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const recentGenerations = [
    { id: '1', template: 'Standard Invoice Template', format: 'PDF', date: '2026-08-20 14:10', status: 'Success', count: 12 },
    { id: '2', template: 'Employment Agreement', format: 'DOCX', date: '2026-08-19 16:34', status: 'Success', count: 1 },
    { id: '3', template: 'Monthly Sales Report', format: 'PDF', date: '2026-08-18 11:05', status: 'Success', count: 54 },
  ];

  return (
    <div className="home-container animated-fade-in">
      <div className="welcome-banner">
        <div className="welcome-text">
          <h1>Document Tool</h1>
          <p>Extensible offline-first document generation engine.</p>
        </div>
        <div className="status-badge">
          <span className="status-indicator"></span>
          Offline Ready
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card" onClick={() => onNavigate('generate')}>
          <div className="card-icon excel-color">
            <FileSpreadsheet size={28} />
          </div>
          <div className="card-content">
            <h3>Import Data</h3>
            <p>Load Excel sheet or CSV files to preview record rows.</p>
          </div>
          <Play size={18} className="arrow-icon" />
        </div>

        <div className="dashboard-card" onClick={() => onNavigate('templates')}>
          <div className="card-icon template-color">
            <Layers size={28} />
          </div>
          <div className="card-content">
            <h3>Manage Templates</h3>
            <p>Design, edit, and configure reusable document schemas.</p>
          </div>
          <Play size={18} className="arrow-icon" />
        </div>

        <div className="dashboard-card" onClick={() => onNavigate('card-designer')}><div className="card-icon template-color"><Palette size={28} /></div><div className="card-content"><h3>Card Designer</h3><p>Create fixed-size, multi-artboard visual designs for print and digital output.</p></div><Play size={18} className="arrow-icon" /></div>

        <div className="dashboard-card" onClick={() => onNavigate('generate')}>
          <div className="card-icon generate-color">
            <FileText size={28} />
          </div>
          <div className="card-content">
            <h3>Generate Documents</h3>
            <p>Map fields, perform calculations, and render PDF/DOCX.</p>
          </div>
          <Play size={18} className="arrow-icon" />
        </div>

        <div className="dashboard-card" onClick={() => onNavigate('settings')}>
          <div className="card-icon settings-color">
            <Settings size={28} />
          </div>
          <div className="card-content">
            <h3>App Settings</h3>
            <p>Configure local database, folders, and output directories.</p>
          </div>
          <Play size={18} className="arrow-icon" />
        </div>
      </div>

      <div className="recent-section">
        <h2>Recent Generations</h2>
        <div className="recent-list">
          {recentGenerations.map((item) => (
            <div key={item.id} className="recent-item">
              <div className="item-main">
                <CheckCircle size={18} className="success-icon" />
                <div>
                  <h4>{item.template}</h4>
                  <span>Generated {item.count} {item.format}s</span>
                </div>
              </div>
              <div className="item-meta">
                <span className="item-date">{item.date}</span>
                <span className="format-badge">{item.format}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
