import type { MappingDefinition } from './grouping.js';

export type PageSize = 'A0'|'A1'|'A2'|'A3'|'A4'|'A5'|'A6'|'A7'|'A8'|'A9'|'A10'|'B0'|'B1'|'B2'|'B3'|'B4'|'B5'|'B6'|'LETTER'|'LEGAL'|'TABLOID'|'LEDGER'|'EXECUTIVE'|'CUSTOM';
export type PageOrientation = 'PORTRAIT' | 'LANDSCAPE';
export type Alignment = 'LEFT' | 'CENTER' | 'RIGHT';
export type BlockAlignment = Alignment;
export type TemplateRegionName = 'HEADER' | 'BODY' | 'FOOTER';
export type FontFamily = 'Arial'|'Calibri'|'Times New Roman'|'Georgia'|'Verdana'|'Tahoma'|'Courier New'|'Segoe UI'|'system-ui'|'sans-serif'|'serif'|'monospace';
export type FieldLayoutMode = 'INLINE'|'STACKED';
export type BorderLineStyle = 'NONE'|'SOLID'|'DASHED';
export type VerticalAlignment = 'TOP'|'CENTER'|'BOTTOM';
export type AggregateOperation = 'STATIC'|'FIELD'|'CALCULATED'|'SUM'|'FIRST'|'COUNT'|'AVG'|'MIN'|'MAX'|'FORMULA';
export type FooterAggregationType = 'SUM'|'AVG'|'COUNT'|'BLANK'|'CUSTOM_LABEL';
export type DisplayFormatType = 'RAW'|'NUMBER'|'INTEGER'|'PERCENT'|'CURRENCY'|'DATE'|'DATETIME'|'BOOLEAN'|'CUSTOM';
export type PercentInputMode = 'FRACTION'|'WHOLE';
export interface DisplayFormatDefinition { type?:DisplayFormatType; decimals?:number; percentInputMode?:PercentInputMode; currencyCode?:string; currencySymbol?:string; prefix?:string; suffix?:string; useGrouping?:boolean; negativeFormat?:'MINUS'|'PARENTHESES'; nullDisplay?:string; locale?:string; trueLabel?:string; falseLabel?:string; dateStyle?:'SHORT'|'MEDIUM'|'LONG'|'ISO'; customPattern?:string; }
export type ConditionOperator = 'EQUALS'|'NOT_EQUALS'|'IS_EMPTY'|'NOT_EMPTY'|'GREATER_THAN'|'GREATER_OR_EQUAL'|'LESS_THAN'|'LESS_OR_EQUAL'|'IN'|'CONTAINS'|'NOT_CONTAINS'|'STARTS_WITH'|'ENDS_WITH';
export interface VisibilityCondition { path:string; operator:ConditionOperator; value?:string|number|boolean; values?:Array<string|number|boolean>; caseSensitive?:boolean; }
/** Phase 4.12 reusable boolean visibility rule. Legacy single VisibilityCondition objects remain valid. */
export interface VisibilityConditionGroup { logic:'ALL'|'ANY'; conditions:VisibilityRule[]; negate?:boolean; }
export type VisibilityRule = VisibilityCondition|VisibilityConditionGroup;

/** Phase 4.13 reusable filtered collection. `alias` is exposed under `views.<alias>`. */
export interface DataViewDefinition { id:string; name:string; alias:string; sourcePath:string; filter?:VisibilityRule; }
/** Phase 4.13 reusable calculated scalar. `alias` is exposed under `calc.<alias>`. */
export interface CalculatedFieldDefinition { id:string; name:string; alias:string; value:AggregateValueDefinition; }
export type TableColumnKind = 'SOURCE'|'FORMULA'|'STATIC_TEXT'|'IMAGE'|'ROW_NUMBER'|'QR';
export interface TableHeaderGroupDefinition { id:string; label:string; startColumnId:string; colspan:number; alignment?:Alignment; style?:TextStyle; }
export interface QrCodeOptions { errorCorrection?:'L'|'M'|'Q'|'H'; cellSize?:number; margin?:number; altText?:string; widthMm?:number; heightMm?:number; }
export interface FormulaFieldBinding { id:string; label:string; path:string; sourceField?:string; targetPath?:string; sourcePath?:string; }
export type SummaryDataMode = 'MANUAL'|'GROUP_BY';
export type CustomGridContentType = 'BLANK'|'TEXT'|'FIELD'|'VALUE'|'IMAGE';
export type BoxWidthMode = 'AUTO'|'PERCENT'|'FIXED_MM';
export type BoxHeightMode = 'AUTO'|'MINIMUM'|'FIXED';
export type BoxOverflowMode = 'EXPAND'|'CLIP'|'SHRINK_CONTENT';

export interface PageMargins { top:number; right:number; bottom:number; left:number; }
export interface PageBorder { enabled?:boolean; style?:BorderLineStyle; width?:number; color?:string; offset?:number; }
export type PageNumberPosition = 'BOTTOM_LEFT'|'BOTTOM_CENTER'|'BOTTOM_RIGHT';
export type FooterMode = 'REPEAT_PAGE'|'FLOW'|'LAST_PAGE_ONLY';
export interface PaginationSettings { repeatHeader?:boolean; /** @deprecated use footerMode */ repeatFooter?:boolean; footerMode?:FooterMode; showPageNumbers?:boolean; pageNumberPosition?:PageNumberPosition; keepSummaryTogether?:boolean; keepCustomGridTogether?:boolean; }
export interface PageDefinition { size:PageSize; orientation:PageOrientation; margins:PageMargins; customWidthMm?:number; customHeightMm?:number; backgroundColor?:string; border?:PageBorder; pagination?:PaginationSettings; }

export interface PageDimensions { widthMm:number; heightMm:number; }
export const PAGE_SIZE_DIMENSIONS: Readonly<Record<Exclude<PageSize,'CUSTOM'>, PageDimensions>> = {
  A0:{widthMm:841,heightMm:1189}, A1:{widthMm:594,heightMm:841}, A2:{widthMm:420,heightMm:594}, A3:{widthMm:297,heightMm:420},
  A4:{widthMm:210,heightMm:297}, A5:{widthMm:148,heightMm:210}, A6:{widthMm:105,heightMm:148}, A7:{widthMm:74,heightMm:105},
  A8:{widthMm:52,heightMm:74}, A9:{widthMm:37,heightMm:52}, A10:{widthMm:26,heightMm:37},
  B0:{widthMm:1000,heightMm:1414}, B1:{widthMm:707,heightMm:1000}, B2:{widthMm:500,heightMm:707}, B3:{widthMm:353,heightMm:500},
  B4:{widthMm:250,heightMm:353}, B5:{widthMm:176,heightMm:250}, B6:{widthMm:125,heightMm:176},
  LETTER:{widthMm:215.9,heightMm:279.4}, LEGAL:{widthMm:215.9,heightMm:355.6}, TABLOID:{widthMm:279.4,heightMm:431.8},
  LEDGER:{widthMm:431.8,heightMm:279.4}, EXECUTIVE:{widthMm:184.15,heightMm:266.7},
} as const;
export const PAGE_SIZE_OPTIONS: readonly PageSize[] = ['A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','B0','B1','B2','B3','B4','B5','B6','LETTER','LEGAL','TABLOID','LEDGER','EXECUTIVE','CUSTOM'] as const;
export function getPageDimensions(page: Pick<PageDefinition,'size'|'orientation'|'customWidthMm'|'customHeightMm'>): PageDimensions {
  const base = page.size === 'CUSTOM'
    ? { widthMm: page.customWidthMm ?? 210, heightMm: page.customHeightMm ?? 297 }
    : PAGE_SIZE_DIMENSIONS[page.size];
  return page.orientation === 'LANDSCAPE' ? { widthMm: base.heightMm, heightMm: base.widthMm } : base;
}

export interface BlockLayout { widthPercent?:number; alignment?:BlockAlignment; marginTop?:number; marginRight?:number; marginBottom?:number; marginLeft?:number; keepTogether?:boolean; breakBefore?:boolean; breakAfter?:boolean; }
export interface TextStyle { fontFamily?:FontFamily; fontSize?:number; bold?:boolean; italic?:boolean; underline?:boolean; textColor?:string; backgroundColor?:string; alignment?:Alignment; lineHeight?:number; }
export interface BorderStyle { width?:number; thickness?:number; color?:string; style?:BorderLineStyle|'DOTTED'; }
export interface CellPadding { top?:number; right?:number; bottom?:number; left?:number; }
export interface TableStyle {
  /** Common table visibility controls. Defaults are ON for backward compatibility. */
  showHeader?:boolean;
  showBorder?:boolean;
  widthPercent?:number;
  alignment?:BlockAlignment;
  headerStyle?:TextStyle;
  cellStyle?:TextStyle;
  border?:BorderStyle;
  cellPadding?:CellPadding;
}
export interface ImageStyle extends BlockLayout { width?:number; height?:number; maintainAspectRatio?:boolean; }
export interface BoxStyle { widthMode?:BoxWidthMode; widthPercent?:number; widthMm?:number; heightMode?:BoxHeightMode; heightMm?:number; minHeightMm?:number; overflow?:BoxOverflowMode; backgroundColor?:string; border?:BorderStyle; borderRadiusMm?:number; padding?:CellPadding; horizontalAlignment?:Alignment; verticalAlignment?:VerticalAlignment; }
/** CellStyle keeps legacy minHeight for version-1 templates while sharing the BoxStyle contract. */
export interface CellStyle extends BoxStyle { minHeight?:number; }
export interface DividerStyle extends BlockLayout { thickness?:number; color?:string; style?:BorderLineStyle; }

interface BaseBlock { id:string; type:string; layout?:BlockLayout; /** Optional Phase 4.12 document-level visibility rule. Missing means visible for backward compatibility. */ visibility?:VisibilityRule; }
export interface RichTextFieldTokenDefinition { format?:DisplayFormatDefinition; fallback?:string; }
export interface TextBlock extends BaseBlock { type:'TEXT'; text:string; style?:TextStyle; /** Optional per-token settings keyed by dynamic field path used in {{path}} tokens. */ fieldTokens?:Record<string,RichTextFieldTokenDefinition>; }
export interface FieldBlock extends BaseBlock { type:'FIELD'; label?:string; path:string; fallback?:string; format?:DisplayFormatDefinition; labelStyle?:TextStyle; valueStyle?:TextStyle; layoutMode?:FieldLayoutMode; spacing?:number; textAlignment?:Alignment; }
export interface TableColumnDefinition { id:string; label:string; path:string; kind?:TableColumnKind; /** Original imported source header used as a safe fallback when the mapped path is not present in an item row. */ sourceField?:string; targetPath?:string; widthPercent?:number; alignment?:Alignment; headerAlignment?:Alignment; headerStyle?:TextStyle; cellStyle?:TextStyle; format?:DisplayFormatDefinition; visibility?:VisibilityRule; formulaExpression?:string; formulaBindings?:FormulaFieldBinding[]; staticValue?:string|number; imageWidthMm?:number; imageHeightMm?:number; qr?:QrCodeOptions; /** Optional footer behavior used by the designer to build/update total rows. Renderers still receive only resolved footer values. */ footerAggregation?:FooterAggregationType; footerCustomLabel?:string; }
export interface AggregateValueDefinition { operation:AggregateOperation; path?:string; sourcePath?:string; /** Friendly imported header fallback for aggregate resolution. */ sourceField?:string; /** Canonical Generate mapping target path. */ targetPath?:string; staticValue?:string|number; /** Safe dynamic expression, e.g. SUM({{f1}})+SUM({{f2}}). Never evaluated with JavaScript eval. */ expression?:string; formulaBindings?:FormulaFieldBinding[]; prefix?:string; suffix?:string; decimals?:number; format?:'RAW'|'NUMBER'|'WORDS'; /** Phase 4.11 shared display format. When present it takes precedence over legacy format/decimals. */ displayFormat?:DisplayFormatDefinition; }
export interface TableFooterCellDefinition { id:string; columnId?:string; colspan?:number; value:AggregateValueDefinition; alignment?:Alignment; style?:TextStyle; }
export interface TableFooterRowDefinition { id:string; cells:TableFooterCellDefinition[]; style?:TextStyle; backgroundColor?:string; }
export interface TableBlock extends BaseBlock { type:'TABLE'; sourcePath:string; /** Optional row-level filter evaluated against each source row. Footer totals use the filtered rows. */ rowFilter?:VisibilityRule; columns:TableColumnDefinition[]; tableStyle?:TableStyle; headerGroups?:TableHeaderGroupDefinition[]; footerRows?:TableFooterRowDefinition[]; }
export interface CustomGridCellContent { type:CustomGridContentType; text?:string; /** Phase 4.11 Fix1: same rich-text token settings used by normal TEXT blocks. Legacy plain text remains valid. */ fieldTokens?:Record<string,RichTextFieldTokenDefinition>; path?:string; fallback?:string; format?:DisplayFormatDefinition; value?:AggregateValueDefinition; sourceType?:'DATA_URL'|'LOCAL_ASSET'; source?:string; altText?:string; width?:number; height?:number; maintainAspectRatio?:boolean; style?:TextStyle; }
export interface CustomGridCellDefinition { id:string; row:number; column:number; rowSpan?:number; colSpan?:number; content:CustomGridCellContent; style?:CellStyle; }
export interface CustomTableBlock extends BaseBlock { type:'CUSTOM_TABLE'; rowCount:number; columnCount:number; cells:CustomGridCellDefinition[]; tableStyle?:TableStyle; }
export interface SummaryColumnDefinition { id:string; label:string; widthPercent?:number; alignment?:Alignment; headerAlignment?:Alignment; style?:TextStyle; }
export interface SummaryCellDefinition { id:string; columnId:string; value:AggregateValueDefinition; style?:TextStyle; alignment?:Alignment; }
export interface SummaryRowDefinition { id:string; cells:SummaryCellDefinition[]; style?:TextStyle; backgroundColor?:string; bold?:boolean; }
export interface SummaryTableBlock extends BaseBlock { type:'SUMMARY_TABLE'; title?:string; dataMode?:SummaryDataMode; sourcePath?:string; groupByPath?:string; showHeader?:boolean; columns:SummaryColumnDefinition[]; rows?:SummaryRowDefinition[]; totalRow?:SummaryRowDefinition; tableStyle?:TableStyle; }
export interface ImageBlock extends BaseBlock { type:'IMAGE'; sourceType:'DATA_URL'|'LOCAL_ASSET'; source:string; altText?:string; width?:number; height?:number; maintainAspectRatio?:boolean; alignment?:Alignment; }
export interface SpacerBlock extends BaseBlock { type:'SPACER'; height:number; }
export interface DividerBlock extends BaseBlock { type:'DIVIDER'; thickness:number; spacing?:number; border?:BorderStyle; color?:string; style?:BorderLineStyle; }
export type BoxChildBlock = TextBlock|FieldBlock|ImageBlock|SpacerBlock|DividerBlock|TableBlock|SummaryTableBlock|CustomTableBlock;
export interface BoxBlock extends BaseBlock { type:'BOX'; name?:string; style?:BoxStyle; children:BoxChildBlock[]; }
export type RowChildBlock = BoxChildBlock|BoxBlock;
export interface RowColumn { id:string; widthPercent?:number; style?:CellStyle; children:RowChildBlock[]; }
export interface RowBlock extends BaseBlock { type:'ROW'; /** Legacy Phase 3.2 children; retained for backward compatibility. */ children:RowChildBlock[]; /** Phase 3.3 structured grid cells. When present, columns are rendered instead of legacy children. */ columns?:RowColumn[]; gap?:number; verticalAlignment?:VerticalAlignment; }
export type TemplateBlock = TextBlock|FieldBlock|TableBlock|SummaryTableBlock|CustomTableBlock|ImageBlock|SpacerBlock|DividerBlock|BoxBlock|RowBlock;
export interface TemplateRegion { blocks:TemplateBlock[]; }
export type HeaderDefinition = TemplateRegion;
export type FooterDefinition = TemplateRegion;

export interface TemplateMetadata { createdAt?:string; updatedAt?:string; description?:string; [key:string]:unknown; }

/** Renderer-independent template definition. Phase 3.1 styling fields are optional for version-1 backward compatibility. */
export interface TemplateDefinition {
  id:string;
  name:string;
  version:number;
  page:PageDefinition;
  header:HeaderDefinition;
  body:TemplateRegion;
  footer:FooterDefinition;
  metadata?:TemplateMetadata;
  description?:string;
  /** Reusable filtered collections resolved before blocks. */
  dataViews?:DataViewDefinition[];
  /** Reusable scalar calculations resolved after data views and exposed as calc.<alias>. */
  calculatedFields?:CalculatedFieldDefinition[];
  /** @deprecated legacy Phase 0 compatibility */ schemaVersion?:number;
  /** @deprecated legacy Phase 0 compatibility */ components?:TemplateComponent[];
  /** @deprecated legacy Phase 0 compatibility */ mappings?:MappingDefinition[];
  /** @deprecated legacy Phase 0 compatibility */ calculations?:CalculationDefinition[];
}

export type TemplateComponentType='TEXT'|'FIELD'|'IMAGE'|'TABLE'|'SIGNATURE'|'HEADER'|'FOOTER'|'PAGE_NUMBER'|'REPEAT_BLOCK';
export interface StyleDefinition { fontFamily?:string;fontSize?:number;fontWeight?:'normal'|'bold'|'500'|'600'|'700';fontStyle?:'normal'|'italic';color?:string;backgroundColor?:string;textAlign?:'left'|'center'|'right'|'justify';lineHeight?:number;padding?:PageMargins;margin?:PageMargins;borderWidth?:number;borderColor?:string;borderRadius?:number; }
export interface TemplateComponent { id:string;type:TemplateComponentType;name:string;styles?:StyleDefinition;content?:string;position?:{x:number;y:number;width?:number|string;height?:number|string};children?:TemplateComponent[];settings?:Record<string,unknown>; }
export interface CalculationDefinition { id:string;name:string;formula:'SUM'|'COUNT'|'AVG'|'MULTIPLY'|'ADD'|'CUSTOM';args:string[];groupBy?:string; }
export interface TemplateVersion { version:number;updatedAt:string;author?:string;definition:TemplateDefinition; }

export type TemplateValidationCode=
  'TEMPLATE_NAME_REQUIRED'|'PAGE_SIZE_INVALID'|'PAGE_ORIENTATION_INVALID'|'PAGE_MARGIN_INVALID'|'BLOCK_ID_DUPLICATE'|'BLOCK_TYPE_INVALID'|'FIELD_PATH_REQUIRED'|'TABLE_SOURCE_REQUIRED'|'TABLE_COLUMN_REQUIRED'|'TABLE_COLUMN_PATH_REQUIRED'|'UNSUPPORTED_BLOCK_TYPE'|
  'PAGE_BORDER_INVALID'|'CUSTOM_TABLE_INVALID'|'CUSTOM_TABLE_SPAN_INVALID'|'CUSTOM_TABLE_OVERLAP'|'SUMMARY_TABLE_INVALID'|'SUMMARY_COLUMN_REQUIRED'|'SUMMARY_VALUE_INVALID'|'TABLE_FOOTER_INVALID'|'CELL_STYLE_INVALID'|'ROW_COLUMN_REQUIRED'|'ROW_COLUMN_WIDTH_TOTAL_INVALID'|'STYLE_FONT_FAMILY_INVALID'|'STYLE_FONT_SIZE_INVALID'|'STYLE_COLOR_INVALID'|'STYLE_ALIGNMENT_INVALID'|'BLOCK_WIDTH_INVALID'|'BLOCK_MARGIN_INVALID'|'TABLE_COLUMN_WIDTH_INVALID'|'TABLE_COLUMN_WIDTH_TOTAL_INVALID'|'TABLE_BORDER_INVALID'|'IMAGE_SOURCE_INVALID'|'IMAGE_SIZE_INVALID'|'SPACER_HEIGHT_INVALID'|'DIVIDER_STYLE_INVALID'|'ROW_GAP_INVALID'|'ROW_VERTICAL_ALIGNMENT_INVALID'|'ROW_CHILD_WIDTH_TOTAL_INVALID'|'ROW_CHILD_REQUIRED'|'VISIBILITY_RULE_INVALID'|'DATA_VIEW_INVALID'|'DATA_VIEW_CYCLE'|'CALCULATED_FIELD_INVALID'|'CALCULATED_FIELD_CYCLE';
export interface TemplateValidationIssue { code:TemplateValidationCode; message:string; blockId?:string; }
export interface TemplateValidationResult { valid:boolean; errors:TemplateValidationIssue[]; warnings:TemplateValidationIssue[]; }
export type TemplateWarningCode='FIELD_VALUE_MISSING'|'TABLE_SOURCE_NOT_ARRAY'|'IMAGE_PREVIEW_UNAVAILABLE';
export interface TemplateWarning { code:TemplateWarningCode; message:string; blockId?:string; path?:string; }
export interface TemplateError { code:TemplateValidationCode|'TEMPLATE_RENDER_FAILED'; message:string; blockId?:string; }

export interface RenderTextBlock { id:string;type:'TEXT';text:string;style:RequiredTextStyle;layout:RequiredBlockLayout; }
export interface RenderFieldBlock { id:string;type:'FIELD';label?:string;value:string;labelStyle:RequiredTextStyle;valueStyle:RequiredTextStyle;layout:RequiredBlockLayout;layoutMode:FieldLayoutMode;spacing:number;textAlignment:Alignment; }
export interface RenderTableColumnDefinition { id:string;label:string;path:string;kind?:TableColumnKind;sourceField?:string;targetPath?:string;widthPercent?:number;alignment:Alignment;headerAlignment:Alignment;headerStyle:RequiredTextStyle;cellStyle:RequiredTextStyle;imageWidthMm?:number;imageHeightMm?:number; }
export interface RenderTableFooterCell { id:string;columnId?:string;colspan:number;value:string|number;alignment:Alignment;style:RequiredTextStyle; }
export interface RenderTableFooterRow { id:string;cells:RenderTableFooterCell[];style:RequiredTextStyle;backgroundColor:string; }
export interface RenderTableHeaderGroup { id:string;label:string;startColumnId:string;colspan:number;alignment:Alignment;style:RequiredTextStyle; }
export interface RenderTableBlock { id:string;type:'TABLE';showHeader:boolean;showBorder:boolean;columns:RenderTableColumnDefinition[];headerGroups?:RenderTableHeaderGroup[];rows:Array<Array<string|number|boolean|null>>;footerRows:RenderTableFooterRow[];empty:boolean;widthPercent:number;alignment:BlockAlignment;headerStyle:RequiredTextStyle;cellStyle:RequiredTextStyle;border:RequiredBorderStyle;cellPadding:RequiredCellPadding;layout:RequiredBlockLayout; }
export interface RequiredBoxStyle { widthMode:BoxWidthMode; widthPercent:number; widthMm:number; heightMode:BoxHeightMode; heightMm:number; minHeightMm:number; overflow:BoxOverflowMode; backgroundColor:string; border:RequiredBorderStyle; borderRadiusMm:number; padding:RequiredCellPadding; horizontalAlignment:Alignment; verticalAlignment:VerticalAlignment; }
export interface RenderBoxBlock { id:string;type:'BOX';name?:string;style:RequiredBoxStyle;children:RenderBoxChildBlock[];layout:RequiredBlockLayout; }
export interface RenderCustomGridCell { id:string;row:number;column:number;rowSpan:number;colSpan:number;content:{type:'BLANK'|'TEXT'|'FIELD'|'VALUE'|'IMAGE';value?:string|number;sourceType?:'DATA_URL'|'LOCAL_ASSET';source?:string;altText?:string;width?:number;height?:number;maintainAspectRatio?:boolean;style:RequiredTextStyle};style:RequiredCellStyle; }
export interface RenderCustomTableBlock { id:string;type:'CUSTOM_TABLE';rowCount:number;columnCount:number;showBorder:boolean;cells:RenderCustomGridCell[];widthPercent:number;alignment:BlockAlignment;border:RequiredBorderStyle;cellPadding:RequiredCellPadding;layout:RequiredBlockLayout; }
export interface RenderSummaryColumnDefinition { id:string;label:string;widthPercent?:number;alignment:Alignment;headerAlignment:Alignment;style:RequiredTextStyle; }
export interface RenderSummaryRow { id:string;cells:Array<{id:string;columnId:string;value:string|number;alignment:Alignment;style:RequiredTextStyle}>;style:RequiredTextStyle;backgroundColor:string;bold:boolean; }
export interface RenderSummaryTableBlock { id:string;type:'SUMMARY_TABLE';title?:string;showHeader:boolean;showBorder:boolean;columns:RenderSummaryColumnDefinition[];rows:RenderSummaryRow[];totalRow?:RenderSummaryRow;widthPercent:number;alignment:BlockAlignment;headerStyle:RequiredTextStyle;cellStyle:RequiredTextStyle;border:RequiredBorderStyle;cellPadding:RequiredCellPadding;layout:RequiredBlockLayout; }
export interface RenderImageBlock { id:string;type:'IMAGE';sourceType:'DATA_URL'|'LOCAL_ASSET';source:string;altText:string;width:number;height?:number;maintainAspectRatio:boolean;alignment:Alignment;layout:RequiredBlockLayout; }
export interface RenderSpacerBlock { id:string;type:'SPACER';height:number;layout:RequiredBlockLayout; }
export interface RenderDividerBlock { id:string;type:'DIVIDER';thickness:number;color:string;style:BorderLineStyle;layout:RequiredBlockLayout; }
export type RenderBoxChildBlock=RenderTextBlock|RenderFieldBlock|RenderImageBlock|RenderSpacerBlock|RenderDividerBlock|RenderTableBlock|RenderSummaryTableBlock|RenderCustomTableBlock;
export type RenderRowChildBlock=RenderBoxChildBlock|RenderBoxBlock;
export interface RequiredCellStyle extends RequiredBoxStyle { minHeight:number; }
export interface RenderRowColumn { id:string;widthPercent:number;style:RequiredCellStyle;children:RenderRowChildBlock[]; }
export interface RenderRowBlock { id:string;type:'ROW';gap:number;verticalAlignment:VerticalAlignment;layout:RequiredBlockLayout;children:RenderRowChildBlock[];columns:RenderRowColumn[]; }
export type RenderBlock=RenderTextBlock|RenderFieldBlock|RenderTableBlock|RenderSummaryTableBlock|RenderCustomTableBlock|RenderImageBlock|RenderSpacerBlock|RenderDividerBlock|RenderBoxBlock|RenderRowBlock;
export interface TemplateRenderResult { model:import('./renderer.js').RenderModel|null; warnings:TemplateWarning[]; errors:TemplateError[]; }
export interface DiscoveredFieldPaths { scalarFields:string[]; collections:Array<{path:string;fields:string[]}>; }

export interface RequiredBlockLayout { widthPercent:number; alignment:BlockAlignment; marginTop:number; marginRight:number; marginBottom:number; marginLeft:number; keepTogether:boolean; breakBefore:boolean; breakAfter:boolean; }
export interface RequiredTextStyle { fontFamily:FontFamily; fontSize:number; bold:boolean; italic:boolean; underline:boolean; textColor:string; backgroundColor:string; alignment:Alignment; lineHeight:number; }
export interface RequiredBorderStyle { width:number; color:string; style:BorderLineStyle; }
export interface RequiredCellPadding { top:number;right:number;bottom:number;left:number; }

export const OFFLINE_FONT_FAMILIES:readonly FontFamily[]=['Arial','Calibri','Times New Roman','Georgia','Verdana','Tahoma','Courier New','Segoe UI','system-ui','sans-serif','serif','monospace'] as const;
