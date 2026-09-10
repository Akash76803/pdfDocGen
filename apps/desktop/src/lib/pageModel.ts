export type PagePreset = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid' | 'Executive' | 'Custom';
export type PageOrientation = 'Portrait' | 'Landscape';
export type PageUnit = 'mm' | 'cm' | 'in';

export type EdgeValues = { top: number; right: number; bottom: number; left: number };

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

export function contentBoundsPx(settings: PageSettings) {
  const page = pagePixelSize(settings);
  return {
    x: mmToPx(settings.marginsMm.left), y: mmToPx(settings.marginsMm.top),
    width: Math.max(40, page.width - mmToPx(settings.marginsMm.left + settings.marginsMm.right)),
    height: Math.max(40, page.height - mmToPx(settings.marginsMm.top + settings.marginsMm.bottom)),
  };
}
