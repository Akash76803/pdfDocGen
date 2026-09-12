export type PagePreset = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid' | 'Executive' | 'Custom';
export type PageOrientation = 'Portrait' | 'Landscape';
export type PageUnit = 'mm' | 'cm' | 'in';
export type PageRepeatMode = 'every' | 'first' | 'exceptFirst';

export type EdgeValues = { top: number; right: number; bottom: number; left: number };
export type PageBandSettings = { enabled: boolean; heightMm: number; gapMm: number; repeat: PageRepeatMode };

export type PageSettings = {
  preset: PagePreset;
  orientation: PageOrientation;
  unit: PageUnit;
  customWidthMm: number;
  customHeightMm: number;
  marginsMm: EdgeValues;
  bleedMm: EdgeValues;
  safeAreaMm: number;
  background: string;
  borderColor: string;
  borderWidth: number;
  showGuides: boolean;
  header: PageBandSettings;
  footer: PageBandSettings;
};

export const PAGE_PRESETS: Record<Exclude<PagePreset, 'Custom'>, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  Tabloid: { widthMm: 279.4, heightMm: 431.8 },
  Executive: { widthMm: 184.15, heightMm: 266.7 },
};

export function defaultPageSettings(): PageSettings {
  return {
    preset: 'A4', orientation: 'Portrait', unit: 'mm', customWidthMm: 210, customHeightMm: 297,
    marginsMm: { top: 15, right: 15, bottom: 15, left: 15 },
    bleedMm: { top: 0, right: 0, bottom: 0, left: 0 }, safeAreaMm: 5,
    background: '#ffffff', borderColor: '#d2d8e0', borderWidth: 1, showGuides: true,
    header: { enabled: false, heightMm: 20, gapMm: 5, repeat: 'every' },
    footer: { enabled: false, heightMm: 15, gapMm: 5, repeat: 'every' },
  };
}

export function normalizePageSettings(input?: Partial<PageSettings> | null): PageSettings {
  const defaults = defaultPageSettings();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    marginsMm: { ...defaults.marginsMm, ...(input.marginsMm ?? {}) },
    bleedMm: { ...defaults.bleedMm, ...(input.bleedMm ?? {}) },
    header: { ...defaults.header, ...(input.header ?? {}) },
    footer: { ...defaults.footer, ...(input.footer ?? {}) },
  };
}

export function pageSizeMm(settings: PageSettings) {
  const base = settings.preset === 'Custom'
    ? { widthMm: Math.max(20, settings.customWidthMm), heightMm: Math.max(20, settings.customHeightMm) }
    : PAGE_PRESETS[settings.preset];
  return settings.orientation === 'Portrait'
    ? base
    : { widthMm: base.heightMm, heightMm: base.widthMm };
}

export function mmToPx(mm: number) { return mm * 96 / 25.4; }
export function pxToMm(px: number) { return px * 25.4 / 96; }
export function mmToUnit(mm: number, unit: PageUnit) { return unit === 'mm' ? mm : unit === 'cm' ? mm / 10 : mm / 25.4; }
export function unitToMm(value: number, unit: PageUnit) { return unit === 'mm' ? value : unit === 'cm' ? value * 10 : value * 25.4; }
export function unitLabel(unit: PageUnit) { return unit === 'in' ? 'in' : unit; }

export function pagePixelSize(settings: PageSettings) {
  const size = pageSizeMm(settings);
  return { width: Math.round(mmToPx(size.widthMm)), height: Math.round(mmToPx(size.heightMm)) };
}

export function horizontalContentBoundsPx(settings: PageSettings) {
  const page = pagePixelSize(settings);
  return {
    x: mmToPx(settings.marginsMm.left),
    width: Math.max(40, page.width - mmToPx(settings.marginsMm.left + settings.marginsMm.right)),
  };
}

export function headerBoundsPx(settings: PageSettings) {
  const horizontal = horizontalContentBoundsPx(settings);
  return { ...horizontal, y: mmToPx(settings.marginsMm.top), height: settings.header.enabled ? Math.max(0, mmToPx(settings.header.heightMm)) : 0 };
}

export function footerBoundsPx(settings: PageSettings) {
  const page = pagePixelSize(settings);
  const horizontal = horizontalContentBoundsPx(settings);
  const height = settings.footer.enabled ? Math.max(0, mmToPx(settings.footer.heightMm)) : 0;
  return { ...horizontal, y: page.height - mmToPx(settings.marginsMm.bottom) - height, height };
}

export function contentBoundsPx(settings: PageSettings) {
  const page = pagePixelSize(settings);
  const headerOffset = settings.header.enabled ? mmToPx(settings.header.heightMm + settings.header.gapMm) : 0;
  const footerOffset = settings.footer.enabled ? mmToPx(settings.footer.heightMm + settings.footer.gapMm) : 0;
  const y = mmToPx(settings.marginsMm.top) + headerOffset;
  const bottom = page.height - mmToPx(settings.marginsMm.bottom) - footerOffset;
  return {
    x: mmToPx(settings.marginsMm.left), y,
    width: Math.max(40, page.width - mmToPx(settings.marginsMm.left + settings.marginsMm.right)),
    height: Math.max(40, bottom - y),
  };
}

export function repeatModeShows(mode: PageRepeatMode, virtualPageIndex: number) {
  if (mode === 'first') return virtualPageIndex === 0;
  if (mode === 'exceptFirst') return virtualPageIndex > 0;
  return true;
}
