import React from 'react';

export type DesignerInspectorProps = {
  collapsed: boolean;
  children: React.ReactNode;
};

export const DesignerInspector: React.FC<DesignerInspectorProps> = ({
  collapsed,
  children
}) => {
  if (collapsed) return null;

  return (
    <aside className="dg-designer-inspector">
      <div className="dg-designer-inspector__content">
        {children}
      </div>
    </aside>
  );
};
