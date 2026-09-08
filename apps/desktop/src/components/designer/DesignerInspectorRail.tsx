import React from 'react';
import { Settings, MoveDiagonal, Palette, Type, Database, Sliders, ChevronRight } from 'lucide-react';

export type InspectorSectionKey = 'GENERAL' | 'TRANSFORM' | 'APPEARANCE' | 'TYPOGRAPHY' | 'DATA_BINDING' | 'ADVANCED';

export type DesignerInspectorRailProps = {
  activeSection: InspectorSectionKey;
  onSectionChange: (section: InspectorSectionKey) => void;
  availableSections: InspectorSectionKey[];
  onCollapse: () => void;
};

const iconMap: Record<InspectorSectionKey, React.ReactNode> = {
  GENERAL: <Settings size={20} strokeWidth={1.5} />,
  TRANSFORM: <MoveDiagonal size={20} strokeWidth={1.5} />,
  APPEARANCE: <Palette size={20} strokeWidth={1.5} />,
  TYPOGRAPHY: <Type size={20} strokeWidth={1.5} />,
  DATA_BINDING: <Database size={20} strokeWidth={1.5} />,
  ADVANCED: <Sliders size={20} strokeWidth={1.5} />,
};

const labelMap: Record<InspectorSectionKey, string> = {
  GENERAL: 'General',
  TRANSFORM: 'Transform',
  APPEARANCE: 'Appearance',
  TYPOGRAPHY: 'Text Styling',
  DATA_BINDING: 'Data Binding',
  ADVANCED: 'Advanced',
};

export const DesignerInspectorRail: React.FC<DesignerInspectorRailProps> = ({
  activeSection,
  onSectionChange,
  availableSections,
  onCollapse
}) => {
  return (
    <nav className="dg-designer-inspector-rail" role="navigation" aria-label="Inspector Sections">
      <div className="dg-designer-inspector-rail__top">
        {availableSections.map(key => (
          <button
            key={key}
            className={`dg-designer-inspector-rail__item ${activeSection === key ? 'dg-designer-inspector-rail__item--active' : ''}`}
            onClick={() => onSectionChange(key)}
            aria-label={labelMap[key]}
            aria-pressed={activeSection === key}
            title={labelMap[key]}
          >
            {iconMap[key]}
          </button>
        ))}
      </div>
      <div className="dg-designer-inspector-rail__bottom">
        <button
          className="dg-designer-inspector-rail__item"
          onClick={onCollapse}
          aria-label="Collapse inspector"
          title="Collapse"
        >
          <ChevronRight size={20} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
};
