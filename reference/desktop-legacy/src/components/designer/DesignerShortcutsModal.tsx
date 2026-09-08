import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Search, X } from 'lucide-react';

import { DESIGNER_SHORTCUT_GROUPS } from './designerShortcutRegistry.ts';

export type DesignerShortcutsModalProps = {
  open: boolean;
  onClose: () => void;
};

export const DesignerShortcutsModal: React.FC<DesignerShortcutsModalProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return DESIGNER_SHORTCUT_GROUPS;
    return DESIGNER_SHORTCUT_GROUPS.map(group => ({
      ...group,
      items: group.items.filter(item =>
        `${group.title} ${item.keys.join(' ')} ${item.action} ${item.description}`.toLowerCase().includes(normalized),
      ),
    })).filter(group => group.items.length > 0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      data-designer-shortcuts-modal
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100020, background: 'rgba(15, 23, 42, 0.55)',
        display: 'grid', placeItems: 'center', padding: '24px',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="designer-shortcuts-title"
        style={{
          width: 'min(920px, 94vw)', maxHeight: '84vh', overflow: 'hidden',
          background: 'var(--bg-primary, #fff)', color: 'var(--text-primary, #111827)',
          border: '1px solid var(--border-color, #d1d5db)', borderRadius: '12px',
          boxShadow: '0 22px 60px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'16px 18px',borderBottom:'1px solid var(--border-color, #e5e7eb)'}}>
          <div style={{width:'36px',height:'36px',borderRadius:'8px',display:'grid',placeItems:'center',background:'var(--color-bg-subtle, #f3f4f6)'}}>
            <Keyboard size={19}/>
          </div>
          <div style={{minWidth:0,flex:1}}>
            <h2 id="designer-shortcuts-title" style={{margin:0,fontSize:'17px'}}>Designer Shortcuts</h2>
            <p style={{margin:'3px 0 0',fontSize:'12px',color:'var(--text-secondary, #6b7280)'}}>Keyboard and mouse controls currently enabled in Card Designer.</p>
          </div>
          <button type="button" className="dg-icon-button" onClick={onClose} aria-label="Close shortcuts" title="Close">
            <X size={18}/>
          </button>
        </div>

        <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border-color, #e5e7eb)'}}>
          <label style={{display:'flex',alignItems:'center',gap:'8px',border:'1px solid var(--border-color, #d1d5db)',borderRadius:'8px',padding:'7px 10px',background:'var(--bg-secondary, #f9fafb)'}}>
            <Search size={15}/>
            <input
              autoFocus
              aria-label="Search shortcuts"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search shortcut or action…"
              style={{border:0,outline:0,background:'transparent',color:'inherit',width:'100%',fontSize:'13px'}}
            />
          </label>
        </div>

        <div style={{overflowY:'auto',padding:'16px 18px 20px'}}>
          {filteredGroups.length === 0 ? (
            <div style={{padding:'36px 12px',textAlign:'center',fontSize:'13px',color:'var(--text-secondary, #6b7280)'}}>No matching shortcut found.</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(330px, 1fr))',gap:'16px'}}>
              {filteredGroups.map(group => (
                <section key={group.title} style={{border:'1px solid var(--border-color, #e5e7eb)',borderRadius:'9px',overflow:'hidden',alignSelf:'start'}}>
                  <div style={{padding:'9px 11px',fontWeight:700,fontSize:'12px',background:'var(--color-bg-subtle, #f3f4f6)',borderBottom:'1px solid var(--border-color, #e5e7eb)'}}>{group.title}</div>
                  <div>
                    {group.items.map((item, index) => (
                      <div key={`${group.title}-${item.action}-${index}`} style={{display:'grid',gridTemplateColumns:'minmax(118px, auto) 1fr',gap:'12px',padding:'10px 11px',borderBottom:index===group.items.length-1?'none':'1px solid var(--border-color, #eef0f2)'}}>
                        <div style={{display:'flex',gap:'4px',flexWrap:'wrap',alignContent:'start'}}>
                          {item.keys.map((key, keyIndex) => (
                            <React.Fragment key={`${key}-${keyIndex}`}>
                              {keyIndex > 0 && <span style={{fontSize:'11px',color:'var(--text-secondary, #6b7280)',alignSelf:'center'}}>+</span>}
                              <kbd style={{fontFamily:'inherit',fontWeight:650,fontSize:'11px',lineHeight:1,padding:'5px 7px',borderRadius:'5px',border:'1px solid var(--border-color, #cbd5e1)',background:'var(--bg-secondary, #fff)',boxShadow:'0 1px 0 rgba(15,23,42,.08)',whiteSpace:'nowrap'}}>{key}</kbd>
                            </React.Fragment>
                          ))}
                        </div>
                        <div>
                          <div style={{fontWeight:650,fontSize:'12px'}}>{item.action}</div>
                          <div style={{marginTop:'2px',fontSize:'11px',lineHeight:1.45,color:'var(--text-secondary, #6b7280)'}}>{item.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
