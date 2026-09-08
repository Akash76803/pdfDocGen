import React from 'react';
import { Undo2, Redo2, Save, Download, Copy, ClipboardPaste, FilePlus2, LayoutTemplate, House, Keyboard } from 'lucide-react';

export type DesignerHeaderProps = {
  title?: string;
  onTitleChange?: (newTitle: string) => void;
  statusLabel?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
  onBack?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onNew?: () => void;
  onTemplateAction?: () => void;
  onPreview?: () => void;
  onExport?: () => void;
  onShortcuts?: () => void;
};

export const DesignerHeader: React.FC<DesignerHeaderProps> = ({
  title = 'Untitled Design',
  onTitleChange,
  statusLabel,
  canUndo = false,
  canRedo = false,
  canCopy = false,
  canPaste = false,
  onBack,
  onSave,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onNew,
  onTemplateAction,
  onPreview,
  onExport,
  onShortcuts
}) => {
  return (
    <header className="dg-designer-header">
      <div className="dg-designer-header__left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onBack && (
          <button className="dg-icon-button dg-designer-header__home" onClick={onBack} aria-label="Home" title="Back to Home">
            <House size={17} />
          </button>
        )}
        <div className="dg-designer-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onTitleChange ? (
            <input 
              aria-label="Template name"
              value={title} 
              onChange={e => onTitleChange(e.target.value)}
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                color: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                fontFamily: 'inherit',
                outline: 'none',
                padding: '2px 4px',
                borderRadius: '4px',
                width: '200px',
                textOverflow: 'ellipsis'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--color-border-strong)'}
              onBlur={e => e.target.style.borderColor = 'transparent'}
            />
          ) : (
            <span style={{ padding: '2px 4px' }}>{title}</span>
          )}
        </div>
      </div>
      
      <div className="dg-designer-header__center">
        {statusLabel && <span className="dg-designer-header__status" style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)' }}>{statusLabel}</span>}
      </div>

      <div className="dg-designer-header__right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="dg-control-group" style={{ display: 'flex', flexDirection: 'row', gap: '4px' }}>
          {onUndo && (
            <button className="dg-icon-button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo">
              <Undo2 size={16} />
            </button>
          )}
          {onRedo && (
            <button className="dg-icon-button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo">
              <Redo2 size={16} />
            </button>
          )}
          {(onUndo || onRedo) && <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />}
          
          {onCopy && (
            <button className="dg-icon-button" onClick={onCopy} disabled={!canCopy} aria-label="Copy (Ctrl+C)" title="Copy (Ctrl+C)">
              <Copy size={16} />
            </button>
          )}
          {onPaste && (
            <button className="dg-icon-button" onClick={onPaste} disabled={!canPaste} aria-label="Paste (Ctrl+V)" title="Paste (Ctrl+V)">
              <ClipboardPaste size={16} />
            </button>
          )}
        </div>

        {(onCopy || onPaste) && <div style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />}
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {onShortcuts && (
            <button className="dg-button dg-button--ghost dg-button--sm" onClick={onShortcuts} title="View enabled keyboard and mouse shortcuts" aria-label="Shortcuts">
              <Keyboard size={14} />
              Shortcuts
            </button>
          )}
          {onNew && (
            <button className="dg-button dg-button--ghost dg-button--sm" onClick={onNew} title="New Design">
              <FilePlus2 size={14} />
              New
            </button>
          )}
          {onTemplateAction && (
            <button className="dg-button dg-button--ghost dg-button--sm" onClick={onTemplateAction} title="Load editable CR80 Front + Back starter template">
              <LayoutTemplate size={14} />
              ID Card
            </button>
          )}
        </div>
        
        {onPreview && (
          <button className="dg-button dg-button--secondary dg-button--sm" onClick={onPreview}>
            Preview
          </button>
        )}
        
        {onSave && (
          <button className="dg-button dg-button--secondary dg-button--sm" onClick={onSave}>
            <Save size={14} />
            Save
          </button>
        )}
        
        {onExport && (
          <button className="dg-button dg-button--primary dg-button--sm" onClick={onExport}>
            <Download size={14} />
            Export
          </button>
        )}
      </div>
    </header>
  );
};
