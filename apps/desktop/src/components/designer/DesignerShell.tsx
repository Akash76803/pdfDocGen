import React from 'react';

export type DesignerShellProps = {
  header: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  statusBar?: React.ReactNode;
};

export const DesignerShell: React.FC<DesignerShellProps> = ({
  header,
  toolbar,
  children,
  statusBar
}) => {
  return (
    <div className="dg-designer-shell">
      <div className="dg-designer-shell__header">
        {header}
      </div>
      {toolbar && (
        <div className="dg-designer-shell__toolbar">
          {toolbar}
        </div>
      )}
      <main className="dg-designer-shell__body">
        {children}
      </main>
      {statusBar && (
        <div className="dg-designer-shell__status">
          {statusBar}
        </div>
      )}
    </div>
  );
};
