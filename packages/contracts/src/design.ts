

/** Phase 6.0 shared Visual Design Studio contracts. Physical geometry is canonical in millimetres. */
export type DesignTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type DesignUnit = 'MM' | 'IN';
export type DesignHorizontalAlignment = 'LEFT' | 'CENTER' | 'RIGHT';
export type DesignVerticalAlignment = 'TOP' | 'CENTER' | 'BOTTOM';
export type GuideOrientation = 'HORIZONTAL' | 'VERTICAL';
export type DesignElementKind = 'TEXT' | 'SHAPE' | 'IMAGE' | 'SVG' | 'QR' | 'BARCODE' | 'PATH' | 'CUSTOM';
export type DesignShapeKind = 'RECTANGLE' | 'SQUARE' | 'ROUNDED_RECTANGLE' | 'CAPSULE' | 'CIRCLE' | 'ELLIPSE' | 'LINE' | 'TRIANGLE' | 'RIGHT_TRIANGLE' | 'DIAMOND' | 'PENTAGON' | 'HEXAGON' | 'OCTAGON' | 'TRAPEZOID' | 'PARALLELOGRAM' | 'ARROW' | 'DOUBLE_ARROW' | 'CURVED_ARROW' | 'CHEVRON' | 'DOUBLE_CHEVRON' | 'STAR' | 'POLYGON' | 'HEART' | 'CLOUD' | 'SPEECH_BUBBLE' | 'CALLOUT' | 'DOCUMENT' | 'CYLINDER' | 'CROSS' | 'PLUS' | 'BANNER' | 'SHIELD' | 'RIBBON' | 'BADGE' | 'HALF_CIRCLE' | 'ARC' | 'BRACKET' | 'LABEL_TAG' | 'FLEXIBLE_LINE';
export type DesignBindingSource = 'FIELD' | 'CALCULATED' | 'STATIC';

export type ArtboardRole = 'FRONT' | 'BACK' | 'INSIDE' | 'OUTSIDE' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'GENERIC';
export type ArtboardTargetMode = 'CURRENT' | 'SELECTED' | 'ALL';

export interface DesignPoint { xMm:number; yMm:number; }
export interface DesignSize { widthMm:number; heightMm:number; }
export interface DesignInsets { topMm:number; rightMm:number; bottomMm:number; leftMm:number; }
export type DesignStrokeStyle='SOLID'|'DASHED'|'DOTTED'|'CUSTOM'|'NONE';
export type DesignStrokeLineCap='BUTT'|'ROUND'|'SQUARE';
export type DesignStrokeLineJoin='MITER'|'ROUND'|'BEVEL';
export interface DesignStroke {
  color:string;
  widthMm:number;
  style:DesignStrokeStyle;
  opacity?:number;
  lineCap?:DesignStrokeLineCap;
  lineJoin?:DesignStrokeLineJoin;
  miterLimit?:number;
  dashArray?:number[];
  dashOffset?:number;
}
export interface DesignShadow { enabled:boolean; offsetXmm:number; offsetYmm:number; blurMm:number; color:string; opacity:number; }
export interface DesignGradientStop { offset:number; color:string; opacity?:number; }
export interface DesignLinearGradient { type:'LINEAR'; angleDeg:number; stops:DesignGradientStop[]; }
export interface DesignRadialGradient { type:'RADIAL'; centerX:number; centerY:number; radius:number; focalX?:number; focalY?:number; stops:DesignGradientStop[]; }
export type DesignPatternKind='HATCH'|'DOT'|'CHECKER';
export interface DesignPatternFill { kind:DesignPatternKind; foreground:string; background:string; scale:number; rotationDeg:number; opacity?:number; }
/** Image fill crop transform. offsetX/offsetY are percentages of the mask bounds; scale 1 = default fit. */
export interface DesignImageTransform { scale:number; offsetX:number; offsetY:number; rotationDeg:number; }
export type DesignFill =
  | { type:'NONE' }
  | { type:'SOLID'; color:string; opacity?:number }
  | { type:'LINEAR_GRADIENT'; gradient:DesignLinearGradient }
  | { type:'RADIAL_GRADIENT'; gradient:DesignRadialGradient }
  | { type:'PATTERN'; pattern:DesignPatternFill }
  | { type:'IMAGE'; assetId:string; fit:'FIT'|'FILL'|'STRETCH'; opacity?:number; transform?:DesignImageTransform };

export interface DesignBindingFormat {
  type?: 'TEXT' | 'NUMBER' | 'DATE' | 'DATETIME' | 'CURRENCY' | 'PERCENT';
  locale?: string;
  pattern?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export interface DesignBinding {
  id: string;
  targetProperty: string;
  sourceType: DesignBindingSource;

  // Generic resolved path, datasource agnostic
  fieldPath?: string;

  // For future calculated/global fields
  calculatedFieldId?: string;

  // Optional static fallback/default
  fallbackValue?: unknown;

  // Formatting metadata only
  format?: DesignBindingFormat;

  // Future-safe metadata
  metadata?: Record<string, unknown>;
}

export interface DesignDataContext {
  record?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  calculated?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AssetReference {
  id:string;
  name:string;
  kind:'IMAGE'|'SVG'|'LOGO'|'ICON'|'DECORATION'|'FRAME'|'OTHER';
  sourceType:'DATA_URL'|'LOCAL_ASSET'|'EMBEDDED';
  source:string;
  mimeType?:string;
  widthPx?:number;
  heightPx?:number;
  metadata?:AssetMetadata;
}

export interface AssetMetadata extends Record<string,unknown> {
  originalFileName?:string;
  source?:string;
  license?:string;
  category?:string;
  subcategory?:string;
  folder?:string;
  tags?:string[];
  format?:'SVG'|'RASTER';
  builtIn?:boolean;
  userUploaded?:boolean;
  importedAt?:string;
  originalWidth?:number;
  originalHeight?:number;
  viewBox?:string;
  aspectRatio?:number;
  fingerprint?:string;
  sanitized?:boolean;
  normalized?:boolean;
  fallbackDimensions?:boolean;
  recolorable?:boolean;
}

export interface Guide {
  id:string;
  orientation:GuideOrientation;
  positionMm:number;
  locked?:boolean;
}

export type VisibilityOperator = 
  | 'EQUALS' | 'NOT_EQUALS'
  | 'CONTAINS' | 'NOT_CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  | 'GREATER_THAN' | 'GREATER_OR_EQUAL' | 'LESS_THAN' | 'LESS_OR_EQUAL'
  | 'BEFORE' | 'AFTER' | 'ON_OR_BEFORE' | 'ON_OR_AFTER'
  | 'IS_EMPTY' | 'IS_NOT_EMPTY';

export interface ElementVisibilityRule {
  id: string;
  enabled: boolean;
  fieldPath: string;
  operator: VisibilityOperator;
  value?: unknown;
}

export interface DesignGroup {
  id:string;
  name:string;
  elementIds:string[];
  parentGroupId?:string;
  locked?:boolean;
  visible?:boolean;
  visibilityRule?:ElementVisibilityRule;
}

export interface BaseDesignElement {
  id:string;
  type:DesignElementKind;
  name:string;
  position:DesignPoint;
  size:DesignSize;
  rotationDeg:number;
  opacity:number;
  visible:boolean;
  locked:boolean;
  zIndex:number;
  groupId?:string;
  bindings?:DesignBinding[];
  metadata?:Record<string,unknown>;
  visibilityRule?:ElementVisibilityRule;
  runtimeHidden?:boolean; // Runtime evaluation result, never persisted
}


export interface TextStyleRunStyle {
  fontFamily?:string;
  fontSizePt?:number;
  fontWeight?:number;
  italic?:boolean;
  underline?:boolean;
  strikethrough?:boolean;
  color?:string;
  baselineShift?:'NORMAL'|'SUPERSCRIPT'|'SUBSCRIPT';
}

export interface TextStyleRun {
  id:string;
  start:number;
  end:number;
  style:TextStyleRunStyle;
}


export type TextLayerEffectType = 'STROKE'|'COLOR_OVERLAY'|'GRADIENT_OVERLAY'|'PATTERN_OVERLAY'|'INNER_SHADOW'|'INNER_GLOW'|'OUTER_GLOW'|'DROP_SHADOW'|'BEVEL_EMBOSS'|'SATIN';
export type TextLayerEffectBlendMode = 'NORMAL'|'MULTIPLY'|'SCREEN'|'OVERLAY'|'SOFT_LIGHT';
export interface TextLayerEffect {
  id:string;
  type:TextLayerEffectType;
  enabled:boolean;
  name?:string;
  opacity?:number;
  blendMode?:TextLayerEffectBlendMode;
  settings:{
    color?:string;
    widthMm?:number;
    position?:'INSIDE'|'CENTER'|'OUTSIDE';
    offsetXmm?:number;
    offsetYmm?:number;
    angleDeg?:number;
    distanceMm?:number;
    blurMm?:number;
    spread?:number;
    gradient?:DesignLinearGradient|DesignRadialGradient;
    gradientScalePct?:number;
    gradientReverse?:boolean;
    pattern?:DesignPatternFill;
    patternOffsetX?:number;
    patternOffsetY?:number;
    depthMm?:number;
    depthPct?:number;
    sizeMm?:number;
    softenMm?:number;
    direction?:'UP'|'DOWN';
    bevelStyle?:'INNER_BEVEL'|'OUTER_BEVEL'|'EMBOSS'|'PILLOW_EMBOSS'|'STROKE_EMBOSS';
    bevelTechnique?:'SMOOTH'|'CHISEL_HARD'|'CHISEL_SOFT';
    useGlobalLight?:boolean;
    altitudeDeg?:number;
    highlightColor?:string;
    highlightOpacity?:number;
    highlightBlendMode?:TextLayerEffectBlendMode;
    shadowColor?:string;
    shadowOpacity?:number;
    shadowBlendMode?:TextLayerEffectBlendMode;
    glossContour?:'LINEAR'|'CONE'|'CONE_INVERTED'|'RING'|'GAUSSIAN'|'DOUBLE_RING'|'ROUNDED_STEPS';
    contourStrength?:number;
    satinInvert?:boolean;
    noise?:number;
    choke?:number;
    texturePattern?:DesignPatternFill;
    textureDepth?:number;
    textureInvert?:boolean;
    textureLinked?:boolean;
  };
}

export interface TextDesignElement extends BaseDesignElement {
  type:'TEXT';
  text:string;
  style:{
    fontFamily:string;
    fontSizePt:number;
    fontWeight:number;
    italic:boolean;
    underline:boolean;
    strikethrough?:boolean;
    color:string;
    alignment:DesignHorizontalAlignment;
    paragraphAlignment?:DesignHorizontalAlignment|'JUSTIFY';
    verticalAlignment?:DesignVerticalAlignment;
    lineHeight:number;
    letterSpacingPt:number;
    paddingMm?:number;
    textCase?:'NONE'|'UPPERCASE'|'LOWERCASE'|'TITLE';
    fill?:DesignFill;
    stroke?:{ color:string; widthMm:number; opacity?:number };
    glow?:{ enabled:boolean; color:string; blurMm:number; opacity:number };
    materialPreset?:'CUSTOM'|'GOLD'|'SILVER'|'CHROME'|'NEON'|'GLASS'|'VINTAGE'|'ROSE_GOLD'|'BRONZE'|'COPPER'|'STEEL'|'HOLOGRAPHIC'|'GLITTER'|'FOIL'|'PLASTIC'|'CANDY'|'FROSTED_GLASS'|'RETRO'|'COMIC'|'GRUNGE'|'INK_STAMP'|'EMBOSSED_PAPER'|'ENGRAVED'|'WOOD'|'STONE'|'LEATHER'|'GRADIENT_NEON'|'OUTLINE_NEON';
    advancedEffects?:{
      bevel?:{ enabled:boolean; depthMm:number; highlightColor:string; shadowColor:string; intensity:number };
      highlight?:{ enabled:boolean; color:string; offsetYmm:number; blurMm:number; opacity:number };
      longShadow?:{ enabled:boolean; color:string; distanceMm:number; angleDeg:number; opacity:number };
      innerShadow?:{ enabled:boolean; color:string; offsetXmm:number; offsetYmm:number; blurMm:number; opacity:number };
      innerGlow?:{ enabled:boolean; color:string; blurMm:number; opacity:number };
      secondaryStroke?:{ enabled:boolean; color:string; widthMm:number; opacity:number };
      reflection?:{ enabled:boolean; color:string; offsetYmm:number; blurMm:number; opacity:number };
      grain?:{ enabled:boolean; color:string; amount:number; opacity:number };
    };
    textPath?:{
      mode:'BOX'|'ARC_UP'|'ARC_DOWN'|'CIRCLE'|'PATH';
      pathElementId?:string;
      startOffsetPct?:number;
      reverse?:boolean;
      side?:'OUTSIDE'|'INSIDE';
    };
    autoFit?:{
      enabled:boolean;
      minFontSizePt:number;
    };
    runs?:TextStyleRun[];
    layerEffects?:TextLayerEffect[];
  };
  shadow?:DesignShadow;
  textBindingMode?:'FULL'|'TEMPLATE';
}

export interface ShapeTextStyle {
  text:string;
  enabled:boolean;
  fontFamily:string;
  fontSizePt:number;
  fontWeight:number;
  italic:boolean;
  underline:boolean;
  color:string;
  alignment:DesignHorizontalAlignment;
  verticalAlignment:DesignVerticalAlignment;
  paddingMm:number;
  lineHeight:number;
}

export interface ShapeDesignElement extends BaseDesignElement {
  type:'SHAPE';
  shape:DesignShapeKind;
  fill:DesignFill;
  stroke:DesignStroke;
  cornerRadiusMm?:number;
  points?:DesignPoint[];
  shadow?:DesignShadow;
  label?:ShapeTextStyle;
  flipX?:boolean;
  flipY?:boolean;
}

export type PathPointMode = 'CORNER' | 'SMOOTH' | 'SYMMETRIC';

export interface PathPoint {
  id: string;
  x: number;
  y: number;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
  mode?: PathPointMode;
}

export type PathSegment = 
  | { id: string; type: 'LINE'; fromPointId: string; toPointId: string; }
  | { id: string; type: 'CUBIC_BEZIER'; fromPointId: string; toPointId: string; };

export interface PathGeometry {
  points: PathPoint[];
  segments: PathSegment[];
  closed: boolean;
  subpaths?: {
    closed: boolean;
    segmentIds: string[];
  }[];
}

export interface PathDesignElement extends BaseDesignElement {
  type: 'PATH';
  geometry: PathGeometry;
  fill: DesignFill;
  stroke: DesignStroke;
  shadow?: DesignShadow;
  label?: ShapeTextStyle;
}

export interface ImageDesignElement extends BaseDesignElement {
  type:'IMAGE';
  assetId:string;
  fit:'FIT'|'FILL'|'STRETCH';
  flipX?:boolean;
  flipY?:boolean;
  maintainAspectRatio?:boolean;
  cornerRadiusMm?:number;
  stroke?:DesignStroke;
  shadow?:DesignShadow;
}

export interface SvgDesignElement extends BaseDesignElement {
  type:'SVG';
  assetId:string;
  preserveVector?:boolean;
  stroke?:DesignStroke;
  shadow?:DesignShadow;
  tintColor?:string;
  flipX?:boolean;
  flipY?:boolean;
}

export interface QrDesignElement extends BaseDesignElement {
  type:'QR';
  value:string;
  foreground:string;
  background:string;
  errorCorrection:'L'|'M'|'Q'|'H';
}

export interface BarcodeDesignElement extends BaseDesignElement {
  type:'BARCODE';
  value:string;
  symbology:string;
  foreground:string;
  background:string;
}

/** Extension point for future/shared Design Engine element types without renderer one-offs. */
export interface CustomDesignElement extends BaseDesignElement {
  type:'CUSTOM';
  customType:string;
  props:Record<string,unknown>;
}

export type DesignElement = TextDesignElement|ShapeDesignElement|ImageDesignElement|SvgDesignElement|QrDesignElement|BarcodeDesignElement|PathDesignElement|CustomDesignElement;

export interface ArtboardPrintSettings {
  bleed:DesignInsets;
  safeArea:DesignInsets;
  cropMarksEnabledForExport?:boolean;
  showBleedInEditor?:boolean;
  showSafeAreaInEditor?:boolean;
  showCropMarksInEditor?:boolean;
  minimumRasterDpi?:number;
  preferredRasterDpi?:number;
  profileId?:string;
  profileVersion?:number;
}

export type PrintQualityStatus='GOOD'|'WARNING'|'LOW'|'UNKNOWN'|'VECTOR';
export interface RasterDpiResult {dpiX?:number;dpiY?:number;effectiveDpi?:number;status:PrintQualityStatus;message:string;}
export type PrintValidationSeverity='INFO'|'WARNING'|'ERROR';
export interface PrintValidationIssue {id:string;code:string;severity:PrintValidationSeverity;artboardId:string;elementId?:string;message:string;details?:Record<string,unknown>;}
export interface ArtboardPrintValidationResult {artboardId:string;issues:PrintValidationIssue[];errors:number;warnings:number;info:number;}
export interface DesignPrintValidationResult {artboards:ArtboardPrintValidationResult[];issues:PrintValidationIssue[];errors:number;warnings:number;info:number;}

export interface Artboard {
  id:string;
  name:string;
  order:number;
  widthMm:number;
  heightMm:number;
  displayUnit:DesignUnit;
  background:DesignFill;
  backgroundBindings?:DesignBinding[];
  print:ArtboardPrintSettings;
  guides:Guide[];
  groups:DesignGroup[];
  elements:DesignElement[];
  role?:ArtboardRole;
  pairId?:string;
  metadata?:Record<string,unknown>;
}

export interface CardDataConfiguration {
  sourceId?:string;
  groupKeyPath?:string;
  metadata?:Record<string,unknown>;
}

export interface DesignTemplate {
  kind:'CARD_DESIGN';
  schemaVersion:number;
  id:string;
  name:string;
  version:number;
  status:DesignTemplateStatus;
  artboards:Artboard[];
  sharedAssets:AssetReference[];
  dataConfiguration?:CardDataConfiguration;
  metadata?:Record<string,unknown>;
}

/** Renderer-ready values. Bindings/business rules are resolved before this model is created. */
export interface ResolvedDesignElement extends Omit<BaseDesignElement,'binding'> {
  type:DesignElementKind;
  sourceElementType:string;
  content:Record<string,unknown>;
}

export interface ResolvedArtboard {
  id:string;
  name:string;
  order:number;
  widthMm:number;
  heightMm:number;
  background:DesignFill;
  backgroundBindings?:DesignBinding[];
  print:ArtboardPrintSettings;
  elements:ResolvedDesignElement[];
  role?:ArtboardRole;
  pairId?:string;
}

export interface ArtboardTarget {
  mode:ArtboardTargetMode;
  artboardIds:string[];
  orderedArtboards:Artboard[];
}

export interface CardRenderModel {
  modelVersion:1;
  templateId:string;
  templateVersion:number;
  recordKey?:string;
  artboards:ResolvedArtboard[];
  metadata?:Record<string,unknown>;
}

export type DesignValidationSeverity='ERROR'|'WARNING';
export type DesignValidationCode =
  | 'DESIGN_TEMPLATE_INVALID'
  | 'ARTBOARD_REQUIRED'
  | 'ARTBOARD_ID_DUPLICATE'
  | 'ARTBOARD_NAME_REQUIRED'
  | 'ARTBOARD_DIMENSION_INVALID'
  | 'ARTBOARD_ORDER_DUPLICATE'
  | 'ARTBOARD_PAIR_INVALID'
  | 'ELEMENT_ID_DUPLICATE'
  | 'ELEMENT_TYPE_UNSUPPORTED'
  | 'ELEMENT_GEOMETRY_INVALID'
  | 'ELEMENT_OPACITY_INVALID'
  | 'ELEMENT_GROUP_MISSING'
  | 'GROUP_ID_DUPLICATE'
  | 'GROUP_ELEMENT_MISSING'
  | 'GROUP_PARENT_MISSING'
  | 'GROUP_CYCLE'
  | 'GUIDE_ID_DUPLICATE'
  | 'GUIDE_POSITION_INVALID'
  | 'ASSET_ID_DUPLICATE'
  | 'ASSET_REFERENCE_MISSING'
  | 'BINDING_INVALID';
export interface DesignValidationIssue { code:DesignValidationCode; severity:DesignValidationSeverity; message:string; artboardId?:string; elementId?:string; }
export interface DesignValidationResult { valid:boolean; errors:DesignValidationIssue[]; warnings:DesignValidationIssue[]; }
