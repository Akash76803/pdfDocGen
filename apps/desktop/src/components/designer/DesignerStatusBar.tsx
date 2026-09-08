import React from 'react';

export type DesignerStatusBarProps = {
  artboardLabel?: string;
  selectionLabel?: string;
  zoomPercent?: number;
};

export const DesignerStatusBar: React.FC<DesignerStatusBarProps> = ({
  artboardLabel,
  selectionLabel,
  zoomPercent
}) => {
  return (
    <div className="dg-designer-statusbar">
      <div className="dg-designer-statusbar__left">
        {artboardLabel && <span>{artboardLabel}</span>}
      </div>
      
      <div className="dg-designer-statusbar__center">
        {selectionLabel && <span>{selectionLabel}</span>}
      </div>
      
      <div className="dg-designer-statusbar__right">
        {zoomPercent !== undefined && <span>{zoomPercent}%</span>}
      </div>
    </div>
  );
};
