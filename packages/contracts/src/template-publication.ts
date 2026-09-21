export const TEMPLATE_PUBLICATION_FORMAT = 'document-builder-template-publication/v1' as const;

export type TemplatePublicationStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type TemplatePublicationMetadata = {
  documentType?: string;
  category?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type PublishTemplateRequest = {
  templateId: string;
  name: string;
  version: number;
  expectedVersion?: number;
  status: TemplatePublicationStatus;
  metadata: TemplatePublicationMetadata;
  template: unknown;
};

export type PublishedTemplateRecord = {
  format: typeof TEMPLATE_PUBLICATION_FORMAT;
  templateId: string;
  name: string;
  version: number;
  status: TemplatePublicationStatus;
  metadata: TemplatePublicationMetadata;
  publishedAt: string;
  updatedAt: string;
  template: unknown;
};

export type PublishTemplateResponse = {
  status: 'published' | 'updated';
  templateId: string;
  version: number;
  publicationStatus: TemplatePublicationStatus;
  publishedAt: string;
};
