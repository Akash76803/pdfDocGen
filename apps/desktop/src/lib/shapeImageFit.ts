/**
 * UX-9.1: A deliberate one-click conversion, not an implicit change to all
 * existing Shape/media layouts. Existing text+media compositions are kept;
 * text-only/empty Shapes switch to image-only.
 */
export type ShapeImageFitFields = {
  shapeContentMode?: 'none' | 'text' | 'media' | 'text-media';
  shapeMediaPosition?: 'left' | 'right' | 'top' | 'bottom' | 'background' | 'center';
  shapeClipMedia?: boolean;
  shapePadding?: number;
  imageFit?: 'contain' | 'cover' | 'fill';
  imageObjectPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  imageZoomPercent?: number;
  shapeMediaOverlayOpacity?: number;
};
export function fitImageToShapePatch(
  selected: ShapeImageFitFields,
): ShapeImageFitFields {
  return {
    // Keep deliberately configured text overlays, not the default placeholder.
    shapeContentMode: selected.shapeContentMode === 'text-media' ? 'text-media' : 'media',
    shapeMediaPosition: 'background',
    shapeClipMedia: true,
    shapePadding: selected.shapeContentMode === 'text-media' ? selected.shapePadding : 0,
    imageFit: 'cover',
    imageObjectPosition: 'center',
    imageZoomPercent: 100,
    shapeMediaOverlayOpacity: 100,
  };
}
