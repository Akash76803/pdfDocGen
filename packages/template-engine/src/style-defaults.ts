import type { Alignment,BlockLayout,BorderStyle,CellPadding,BoxStyle,CellStyle,RequiredBlockLayout,RequiredBorderStyle,RequiredBoxStyle,RequiredCellPadding,RequiredCellStyle,RequiredTextStyle,TextStyle } from '@document-tool/contracts';

export const DEFAULT_TEXT_STYLE:RequiredTextStyle={fontFamily:'Arial',fontSize:12,bold:false,italic:false,underline:false,textColor:'#000000',backgroundColor:'#FFFFFF',alignment:'LEFT',lineHeight:1.2};
export const DEFAULT_BLOCK_LAYOUT:RequiredBlockLayout={widthPercent:100,alignment:'LEFT',marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:false,breakBefore:false,breakAfter:false};
export const DEFAULT_BORDER_STYLE:RequiredBorderStyle={width:1,color:'#CBD5E1',style:'SOLID'};
export const DEFAULT_CELL_PADDING:RequiredCellPadding={top:2,right:2,bottom:2,left:2};
export const DEFAULT_BOX_STYLE:RequiredBoxStyle={widthMode:'AUTO',widthPercent:100,widthMm:0,heightMode:'AUTO',heightMm:0,minHeightMm:0,overflow:'EXPAND',backgroundColor:'#FFFFFF',border:{width:1,color:'#CBD5E1',style:'SOLID'},borderRadiusMm:0,padding:{top:2,right:2,bottom:2,left:2},horizontalAlignment:'LEFT',verticalAlignment:'TOP'};
export const DEFAULT_ROW_CELL_STYLE:RequiredCellStyle={...DEFAULT_BOX_STYLE,border:{width:0,color:'#CBD5E1',style:'NONE'},minHeight:0};

export function resolveTextStyle(style?:TextStyle,base:RequiredTextStyle=DEFAULT_TEXT_STYLE):RequiredTextStyle{return{...base,...style,alignment:style?.alignment??base.alignment};}
export function resolveBlockLayout(layout?:BlockLayout,defaults:Partial<RequiredBlockLayout>={}):RequiredBlockLayout{return{...DEFAULT_BLOCK_LAYOUT,...defaults,...layout};}
export function resolveBorderStyle(border?:BorderStyle):RequiredBorderStyle{return{width:border?.width??border?.thickness??DEFAULT_BORDER_STYLE.width,color:border?.color??DEFAULT_BORDER_STYLE.color,style:border?.style==='DASHED'?'DASHED':border?.style==='NONE'?'NONE':'SOLID'};}
export function resolveCellPadding(padding?:CellPadding):RequiredCellPadding{return{...DEFAULT_CELL_PADDING,...padding};}
export function resolveBoxStyle(style?:BoxStyle):RequiredBoxStyle{return{widthMode:style?.widthMode??'AUTO',widthPercent:style?.widthPercent??100,widthMm:style?.widthMm??0,heightMode:style?.heightMode??'AUTO',heightMm:style?.heightMm??0,minHeightMm:style?.minHeightMm??0,overflow:style?.overflow??'EXPAND',backgroundColor:style?.backgroundColor??'#FFFFFF',border:style?.border?resolveBorderStyle(style.border):DEFAULT_BOX_STYLE.border,borderRadiusMm:style?.borderRadiusMm??0,padding:resolveCellPadding(style?.padding),horizontalAlignment:style?.horizontalAlignment??'LEFT',verticalAlignment:style?.verticalAlignment??'TOP'};}
export function resolveCellStyle(style?:CellStyle):RequiredCellStyle{const base=resolveBoxStyle({...style,minHeightMm:style?.minHeightMm??style?.minHeight??0});return{...base,minHeight:style?.minHeight??style?.minHeightMm??0,border:style?.border?resolveBorderStyle(style.border):DEFAULT_ROW_CELL_STYLE.border};}
export function withAlignment(style:RequiredTextStyle,alignment:Alignment):RequiredTextStyle{return{...style,alignment};}
