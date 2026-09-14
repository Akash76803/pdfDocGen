export type PdfRenderProfileId = 'standard' | 'balanced' | 'print';

export type PdfRenderProfile = {
  id: PdfRenderProfileId;
  label: string;
  description: string;
  dpi: number;
  jpegQuality: number;
};

export const PDF_RENDER_PROFILE_STORAGE_KEY = 'document-builder.pdf-render-profile.v1';

export const PDF_RENDER_PROFILES: Record<PdfRenderProfileId, PdfRenderProfile> = {
  standard: { id: 'standard', label: 'Standard / Fast', description: 'Recommended for invoices and normal sharing', dpi: 144, jpegQuality: 0.90 },
  balanced: { id: 'balanced', label: 'Balanced', description: 'Sharper output with moderate render time', dpi: 192, jpegQuality: 0.94 },
  print: { id: 'print', label: 'Print Quality', description: 'High-resolution output for print workflows', dpi: 300, jpegQuality: 0.96 },
};

export function normalizePdfRenderProfile(value: unknown): PdfRenderProfileId {
  return value === 'balanced' || value === 'print' || value === 'standard' ? value : 'standard';
}

export function readPdfRenderProfile(storage: Pick<Storage, 'getItem'>): PdfRenderProfileId {
  return normalizePdfRenderProfile(storage.getItem(PDF_RENDER_PROFILE_STORAGE_KEY));
}

export function writePdfRenderProfile(storage: Pick<Storage, 'setItem'>, profile: PdfRenderProfileId) {
  storage.setItem(PDF_RENDER_PROFILE_STORAGE_KEY, profile);
}

export function getPdfRenderProfile(profile: PdfRenderProfileId | undefined): PdfRenderProfile {
  return PDF_RENDER_PROFILES[normalizePdfRenderProfile(profile)];
}
