import React from 'react';
import { Type, Image as ImageIcon, Database, Layers, LayoutPanelLeft } from 'lucide-react';

export type DesignerRailMode = 'ELEMENTS' | 'ASSETS' | 'DATA' | 'LAYERS' | 'ARTBOARDS';

export type DesignerToolRailProps = {
  activeMode: DesignerRailMode;
  onModeChange: (mode: DesignerRailMode) => void;
};

export const DesignerToolRail: React.FC<DesignerToolRailProps> = ({ activeMode, onModeChange }) => {
  const items: { mode: DesignerRailMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'ELEMENTS', icon: <Type size={20} strokeWidth={1.5} />, label: 'Elements' },
    { mode: 'ASSETS', icon: <ImageIcon size={20} strokeWidth={1.5} />, label: 'Assets' },
    { mode: 'DATA', icon: <Database size={20} strokeWidth={1.5} />, label: 'Data' },
    { mode: 'LAYERS', icon: <Layers size={20} strokeWidth={1.5} />, label: 'Layers' },
    { mode: 'ARTBOARDS', icon: <LayoutPanelLeft size={20} strokeWidth={1.5} />, label: 'Artboards' },
  ];

  return (
    <nav className="dg-designer-tool-rail" role="navigation" aria-label="Designer Tools">
      {items.map(item => (
        <button
          key={item.mode}
          className={`dg-designer-tool-rail__item ${activeMode === item.mode ? 'dg-designer-tool-rail__item--active' : ''}`}
          onClick={() => onModeChange(item.mode)}
          aria-label={item.label}
          aria-pressed={activeMode === item.mode}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
};
