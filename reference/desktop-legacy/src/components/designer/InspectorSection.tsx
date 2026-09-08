import React from 'react';
import { Settings, MoveDiagonal, Palette, Type, Database, Sliders } from 'lucide-react';
import { InspectorSectionKey } from './DesignerInspectorRail.tsx';

export type InspectorSectionProps = {
  sectionKey: InspectorSectionKey;
  title: string;
  children: React.ReactNode;
};

const iconMap: Record<InspectorSectionKey, React.ReactNode> = {
  GENERAL: <Settings size={16} strokeWidth={1.5} />,
  TRANSFORM: <MoveDiagonal size={16} strokeWidth={1.5} />,
  APPEARANCE: <Palette size={16} strokeWidth={1.5} />,
  TYPOGRAPHY: <Type size={16} strokeWidth={1.5} />,
  DATA_BINDING: <Database size={16} strokeWidth={1.5} />,
  ADVANCED: <Sliders size={16} strokeWidth={1.5} />,
};

export const InspectorSection: React.FC<InspectorSectionProps> = ({
  sectionKey,
  title,
  children
}) => {
  return (
    <div className="dg-inspector-section" data-section-key={sectionKey}>
      <div className="dg-inspector-section__header">
        <span className="dg-inspector-section__icon">{iconMap[sectionKey]}</span>
        <h3 className="dg-inspector-section__title">{title}</h3>
      </div>
      <div className="dg-inspector-section__body">
        {children}
      </div>
    </div>
  );
};
