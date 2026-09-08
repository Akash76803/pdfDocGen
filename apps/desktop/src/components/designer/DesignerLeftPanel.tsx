import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { DesignerRailMode } from './DesignerToolRail.tsx';

export type DesignerLeftPanelProps = {
  activeMode: DesignerRailMode;
  title: string;
  collapsed: boolean;
  onCollapse: () => void;
  children: React.ReactNode;
};

export const DesignerLeftPanel: React.FC<DesignerLeftPanelProps> = ({
  activeMode,
  title,
  collapsed,
  onCollapse,
  children
}) => {
  if (collapsed) return null;

  return (
    <aside className={`dg-designer-left-panel dg-designer-left-panel--${activeMode.toLowerCase()}`}>
      <div className="dg-designer-left-panel__header">
        <h2 className="dg-designer-left-panel__title">{title}</h2>
        <button
          className="dg-designer-left-panel__collapse"
          onClick={onCollapse}
          aria-label="Collapse panel"
          aria-expanded={!collapsed}
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="dg-designer-left-panel__content">
        {children}
      </div>
    </aside>
  );
};
