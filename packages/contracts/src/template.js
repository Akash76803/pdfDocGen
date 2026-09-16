export const PAGE_SIZE_DIMENSIONS = {
    A0: { widthMm: 841, heightMm: 1189 }, A1: { widthMm: 594, heightMm: 841 }, A2: { widthMm: 420, heightMm: 594 }, A3: { widthMm: 297, heightMm: 420 },
    A4: { widthMm: 210, heightMm: 297 }, A5: { widthMm: 148, heightMm: 210 }, A6: { widthMm: 105, heightMm: 148 }, A7: { widthMm: 74, heightMm: 105 },
    A8: { widthMm: 52, heightMm: 74 }, A9: { widthMm: 37, heightMm: 52 }, A10: { widthMm: 26, heightMm: 37 },
    B0: { widthMm: 1000, heightMm: 1414 }, B1: { widthMm: 707, heightMm: 1000 }, B2: { widthMm: 500, heightMm: 707 }, B3: { widthMm: 353, heightMm: 500 },
    B4: { widthMm: 250, heightMm: 353 }, B5: { widthMm: 176, heightMm: 250 }, B6: { widthMm: 125, heightMm: 176 },
    LETTER: { widthMm: 215.9, heightMm: 279.4 }, LEGAL: { widthMm: 215.9, heightMm: 355.6 }, TABLOID: { widthMm: 279.4, heightMm: 431.8 },
    LEDGER: { widthMm: 431.8, heightMm: 279.4 }, EXECUTIVE: { widthMm: 184.15, heightMm: 266.7 },
};
export const PAGE_SIZE_OPTIONS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'LETTER', 'LEGAL', 'TABLOID', 'LEDGER', 'EXECUTIVE', 'CUSTOM'];
export function getPageDimensions(page) {
    const base = page.size === 'CUSTOM'
        ? { widthMm: page.customWidthMm ?? 210, heightMm: page.customHeightMm ?? 297 }
        : PAGE_SIZE_DIMENSIONS[page.size];
    return page.orientation === 'LANDSCAPE' ? { widthMm: base.heightMm, heightMm: base.widthMm } : base;
}
export const OFFLINE_FONT_FAMILIES = ['Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Courier New', 'Segoe UI', 'system-ui', 'sans-serif', 'serif', 'monospace'];
