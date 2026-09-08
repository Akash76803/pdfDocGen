import React from 'react';

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions
}) => {
  return (
    <header className="dg-page-header">
      <div className="dg-page-header__title-area">
        <h1 className="dg-page-header__title">{title}</h1>
        {subtitle && <p className="dg-page-header__subtitle">{subtitle}</p>}
      </div>

      {actions && (
        <div className="dg-page-header__actions">
          {actions}
        </div>
      )}
    </header>
  );
};
