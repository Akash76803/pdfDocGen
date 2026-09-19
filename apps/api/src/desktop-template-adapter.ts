import { toApiSafePath, type DisplayFormatDefinition, type TemplateBlock, type TemplateDefinition, type TextStyle, type VisibilityRule, type ConditionOperator } from '@document-tool/contracts';

type UnknownRecord = Record<string, unknown>;
type DesktopTemplateEntry = { id:string; name?:string; version?:number; payload:UnknownRecord };
type FormulaSpec = { id:string; name:string; alias:string; expression:string };
type GroupedTableSpec = {
  tableId:string; sourcePath:string; groupBy:string[];
  columns:Array<{field?:string;operation:string;outputKey:string;label?:string;formula?:string}>;
};

const PX_TO_MM = 25.4 / 96;
const PX_TO_PT = 72 / 96;
const pxToMm = (value: unknown, fallback = 0) => { const number=Number(value); return Number.isFinite(number)?number*PX_TO_MM:fallback; };
const numberValue = (value: unknown, fallback: number) => { const number=Number(value); return Number.isFinite(number)?number:fallback; };
const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const recordValue = (value: unknown):UnknownRecord => value && typeof value==='object' && !Array.isArray(value) ? value as UnknownRecord : {};
const arrayValue = (value: unknown):UnknownRecord[] => Array.isArray(value) ? value.filter((item):item is UnknownRecord => !!item && typeof item==='object' && !Array.isArray(item)) : [];
const stringArray = (value: unknown):string[] => Array.isArray(value) ? value.map((item)=>stringValue(item).trim()).filter(Boolean) : [];
const align = (value: unknown):'LEFT'|'CENTER'|'RIGHT' => value==='center'?'CENTER':value==='right'?'RIGHT':'LEFT';
const isIdentifierBoundary = (value:string|undefined) => !value || !/[A-Za-z0-9_.$]/.test(value);
function replaceBareCalculatedReferences(expression:string, references:Array<{name:string;path:string}>, replace:(name:string,path:string)=>string):string {
  if(!expression.trim()||!references.length)return expression;
  const candidates=[...references].filter((ref)=>ref.name.trim()).sort((a,b)=>b.name.length-a.name.length);
  let output=''; let index=0;
  while(index<expression.length){
    if(expression.startsWith('{{',index)){
      const end=expression.indexOf('}}',index+2); if(end>=0){output+=expression.slice(index,end+2);index=end+2;continue;}
    }
    let matched=false;
    for(const ref of candidates){
      if(expression.slice(index,index+ref.name.length).toLocaleLowerCase()!==ref.name.toLocaleLowerCase())continue;
      if(!isIdentifierBoundary(index>0?expression[index-1]:undefined)||!isIdentifierBoundary(expression[index+ref.name.length]))continue;
      let lookahead=index+ref.name.length; while(/\s/.test(expression[lookahead]??''))lookahead++;
      if(expression[lookahead]==='(')continue; // function call, e.g. DISCOUNT(...)
      output+=replace(ref.name,ref.path); index+=ref.name.length; matched=true; break;
    }
    if(!matched){output+=expression[index];index++;}
  }
  return output;
}
const safeAlias = (value:string) => toApiSafePath(value) || `formula${Math.random().toString(36).slice(2,8)}`;
const groupedSourcePath = (tableId:string) => `__db5g_group_${safeAlias(tableId)}`;

function buildFormulaState(pages:UnknownRecord[]) {
  const specs:FormulaSpec[]=[]; const map=new Map<string,string>();
  for (const page of pages) for (const element of arrayValue(page.elements)) {
    if (stringValue(element.type)!=='formula') continue;
    const name=stringValue(element.formulaName).trim(); const expression=stringValue(element.formulaExpression).trim();
    if (!name || !expression) continue;
    const alias=safeAlias(name); specs.push({id:stringValue(element.id,alias),name,alias,expression}); map.set(name.toLocaleLowerCase(),alias);
  }
  return {specs,map};
}

function normalizeBinding(raw:string, formulas:Map<string,string>):string {
  const value=raw.trim(); if(!value) return '';
  const formula=formulas.get(value.toLocaleLowerCase()); if(formula) return `calc.${formula}`;
  if(/^calc\./i.test(value)) return value;
  if(/^(pageNumber|totalPages)$/i.test(value)) return value;
  return toApiSafePath(value);
}
function normalizeTemplateTokens(text:string, formulas:Map<string,string>):string {
  return String(text??'').replace(/\{\{([^{}\n]+)\}\}/g,(full,rawPath:string)=>{
    const path=String(rawPath).trim(); if(!path)return full;
    const normalized=normalizeBinding(path,formulas); return normalized?`{{${normalized}}}`:full;
  });
}
const conditionOperatorMap:Record<string,ConditionOperator>={
  equals:'EQUALS',notEquals:'NOT_EQUALS',contains:'CONTAINS',notContains:'NOT_CONTAINS',
  startsWith:'STARTS_WITH',endsWith:'ENDS_WITH',isEmpty:'IS_EMPTY',isNotEmpty:'NOT_EMPTY',
  greaterThan:'GREATER_THAN',greaterThanOrEqual:'GREATER_OR_EQUAL',lessThan:'LESS_THAN',lessThanOrEqual:'LESS_OR_EQUAL',
};
function builderTableColumnRole(table:UnknownRecord,index:number):'CONTENT'|'SPACER'{
  const rows=[...arrayValue(table.headerRows),...arrayValue(table.bodyRows),...arrayValue(table.customRows),...arrayValue(table.rows)];
  let seen=false;
  for(const rowValue of rows){
    const row=recordValue(rowValue); const cell=recordValue(arrayValue(row.cells)[index]);
    if(!Object.keys(cell).length) continue;
    seen=true;
    const meaningful=Boolean(
      stringValue(cell.content).trim() ||
      stringValue(cell.binding).trim() ||
      stringValue(cell.formula).trim() ||
      stringValue(cell.summaryFormula).trim() ||
      stringValue(cell.summaryName).trim() ||
      stringValue(recordValue(cell.aggregate).field).trim() ||
      stringValue(cell.imageSource).trim() ||
      stringValue(cell.imageAssetId).trim() ||
      stringValue(cell.type)==='image'
    );
    if(meaningful) return 'CONTENT';
  }
  return seen?'SPACER':'CONTENT';
}
function builderVisibility(element:UnknownRecord,formulas:Map<string,string>):VisibilityRule|undefined{
  const current=recordValue(element.conditionalRendering);
  let enabled=current.enabled===true;
  let action=stringValue(current.action,'show');
  let match=stringValue(current.match,'all');
  let rules=arrayValue(current.rules);
  if(!Object.keys(current).length){
    enabled=element.conditionEnabled===true;
    action='show'; match='all';
    if(stringValue(element.conditionField))rules=[{field:stringValue(element.conditionField),operator:stringValue(element.conditionOperator,'equals'),value:stringValue(element.conditionValue)}];
  }
  if(!enabled)return undefined;
  const mapped=rules.map((rule)=>{
    const rawField=stringValue(rule.field).trim(); if(!rawField)return null;
    const path=normalizeBinding(rawField,formulas)||toApiSafePath(rawField); if(!path)return null;
    const operator=conditionOperatorMap[stringValue(rule.operator,'equals')]??'EQUALS';
    const noValue=operator==='IS_EMPTY'||operator==='NOT_EMPTY';
    return {path,operator,...(!noValue?{value:stringValue(rule.value)}:{})};
  }).filter((rule):rule is NonNullable<typeof rule>=>!!rule);
  if(!mapped.length)return undefined;
  if(mapped.length===1&&action!=='hide')return mapped[0] as VisibilityRule;
  return {logic:match==='any'?'ANY':'ALL',conditions:mapped,negate:action==='hide'} as VisibilityRule;
}

function textStyle(element:UnknownRecord):TextStyle {
  const font=stringValue(element.fontFamily,'Arial');
  const safeFont=['Arial','Calibri','Times New Roman','Georgia','Verdana','Tahoma','Courier New','Segoe UI','system-ui','sans-serif','serif','monospace'].includes(font)?font:'Arial';
  return {fontFamily:safeFont as TextStyle['fontFamily'],fontSize:Math.max(5,numberValue(element.fontSize,14)*PX_TO_PT),bold:numberValue(element.fontWeight,400)>=600,italic:Boolean(element.italic),underline:Boolean(element.underline),textColor:stringValue(element.color,'#111827'),alignment:align(element.textAlign),lineHeight:numberValue(element.lineHeight,1.2)};
}
function cellTextStyle(cell:UnknownRecord):TextStyle|undefined {
  const style=recordValue(cell.style); if(!Object.keys(style).length)return undefined;
  return {fontSize:Math.max(5,numberValue(style.fontSize,12)*PX_TO_PT),bold:Boolean(style.bold),textColor:stringValue(style.color,'#111827'),backgroundColor:stringValue(style.background,'#FFFFFF'),alignment:align(style.align)};
}
function absoluteLayout(element:UnknownRecord,pageIndex:number,breakBefore=false){
  // Preserve the Builder distinction between true floating objects and flow
  // content. The native PDF renderer still receives projected x/y/width
  // geometry for both, but FLOW blocks may reflow when a dynamic table grows
  // beyond its design-time height.
  const positionMode=stringValue(element.layoutMode,'floating')==='flow'?'FLOW':'ABSOLUTE';
  return {widthPercent:Math.max(1,Math.min(100,numberValue(element.flowWidthPercent,100))),alignment:align(element.textAlign),marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,keepTogether:stringValue(element.type)!=='table',breakBefore,positionMode:positionMode as 'FLOW'|'ABSOLUTE',xMm:pxToMm(element.x),yMm:pxToMm(element.y),widthMm:Math.max(0.1,pxToMm(element.width,10)),heightMm:Math.max(0.1,pxToMm(element.height,5)),pageIndex};
}

const PAGE_SIZES:Record<string,{widthMm:number;heightMm:number}>={
  A3:{widthMm:297,heightMm:420},A4:{widthMm:210,heightMm:297},A5:{widthMm:148,heightMm:210},
  LETTER:{widthMm:215.9,heightMm:279.4},LEGAL:{widthMm:215.9,heightMm:355.6},TABLOID:{widthMm:279.4,heightMm:431.8},EXECUTIVE:{widthMm:184.15,heightMm:266.7},
};
function projectFlowElements(page:UnknownRecord):UnknownRecord {
  const settings=recordValue(page.settings); const elements=arrayValue(page.elements);
  const preset=stringValue(settings.preset,'A4').toUpperCase(); const base=PAGE_SIZES[preset]??{widthMm:numberValue(settings.customWidthMm,210),heightMm:numberValue(settings.customHeightMm,297)};
  const landscape=stringValue(settings.orientation)==='Landscape'; const pageWidthPx=(landscape?base.heightMm:base.widthMm)/PX_TO_MM;
  const margins=recordValue(settings.marginsMm); const header=recordValue(settings.header); const footer=recordValue(settings.footer);
  const leftMm=numberValue(margins.left,15),rightMm=numberValue(margins.right,15),topMm=numberValue(margins.top,15);
  const headerOffset=header.enabled===true ? numberValue(header.heightMm,20)+numberValue(header.gapMm,5) : 0;
  const bounds={x:leftMm/PX_TO_MM,y:(topMm+headerOffset)/PX_TO_MM,width:Math.max(40,pageWidthPx-(leftMm+rightMm)/PX_TO_MM)};
  void footer;
  const flow=elements.filter((e)=>(stringValue(e.region,'body')==='body')&&(stringValue(e.layoutMode,'floating')==='flow'));
  const rowOrder:string[]=[]; const rows=new Map<string,UnknownRecord[]>();
  for(const element of flow){const key=stringValue(element.flowRowId)||`legacy-row-${stringValue(element.id)}`;if(!rows.has(key)){rows.set(key,[]);rowOrder.push(key);}rows.get(key)!.push(element);}
  const projected=new Map<string,UnknownRecord>(); let cursorY=bounds.y;
  for(const rowId of rowOrder){
    const row=rows.get(rowId)!; const gapBefore=Math.max(0,...row.map((e)=>numberValue(e.flowGapBeforeMm,0)))/PX_TO_MM; const gapAfter=Math.max(0,...row.map((e)=>numberValue(e.flowGapAfterMm,4)))/PX_TO_MM; const columnGap=Math.max(0,numberValue(row[0]?.flowColumnGapMm,4))/PX_TO_MM; const rowAlign=stringValue(row[0]?.flowAlign,'left'); cursorY+=gapBefore;
    const requested=row.map((e)=>Math.min(100,Math.max(5,numberValue(e.flowWidthPercent,stringValue(e.flowWidth)==='custom'?Math.min(100,Math.max(5,(numberValue(e.width,10)/bounds.width)*100)):100)))); const totalPct=requested.reduce((a,b)=>a+b,0); const scale=totalPct>100?100/totalPct:1; const distribution=row.length>1?stringValue(row[0]?.flowDistribution,'packed'):'packed'; let widths:number[]; let x:number; let gap=columnGap;
    if(distribution==='packed'){const gapTotal=Math.max(0,row.length-1)*columnGap;const available=Math.max(20,bounds.width-gapTotal);widths=requested.map((pct)=>available*((pct*scale)/100));const occupied=widths.reduce((a,b)=>a+b,0)+gapTotal;x=rowAlign==='center'?bounds.x+Math.max(0,(bounds.width-occupied)/2):rowAlign==='right'?bounds.x+Math.max(0,bounds.width-occupied):bounds.x;}
    else {widths=requested.map((pct)=>bounds.width*((pct*scale)/100));const occupied=widths.reduce((a,b)=>a+b,0);const free=Math.max(0,bounds.width-occupied);if(distribution==='space-between'){gap=row.length>1?free/(row.length-1):0;x=bounds.x;}else if(distribution==='space-around'){gap=row.length?free/row.length:0;x=bounds.x+gap/2;}else{gap=free/(row.length+1);x=bounds.x+gap;}}
    const rowHeight=Math.max(...row.map((e)=>Math.max(stringValue(e.type)==='divider'?4:20,numberValue(e.height,20),numberValue(e.flowRowHeightPx,0))));
    row.forEach((element,index)=>{const width=widths[index]??numberValue(element.width,10);projected.set(stringValue(element.id),{...element,x,y:cursorY,width});x+=width+gap;}); cursorY+=rowHeight+gapAfter;
  }
  return {...page,elements:elements.map((element)=>projected.get(stringValue(element.id))??element)};
}
function toDisplayFormat(type?:string,formatInput?:unknown):DisplayFormatDefinition|undefined{
  const format=recordValue(formatInput);if(!type||type==='text')return undefined;
  if(type==='number'||type==='decimal')return {type:'NUMBER',decimals:type==='number'?0:numberValue(format.decimals,2),useGrouping:format.thousandsSeparator!==false};
  if(type==='currency')return {type:'CURRENCY',decimals:numberValue(format.decimals,2),useGrouping:format.thousandsSeparator!==false,currencyCode:stringValue(format.currencyCode),currencySymbol:stringValue(format.currencySymbol)};
  if(type==='percentage')return {type:'PERCENT',decimals:numberValue(format.decimals,2),percentInputMode:format.percentInputMode==='whole'?'WHOLE':'FRACTION'};
  if(type==='date')return {type:'DATE',dateStyle:'SHORT'};if(type==='datetime')return {type:'DATETIME',dateStyle:'SHORT'};if(type==='checkbox')return {type:'BOOLEAN',trueLabel:stringValue(format.trueValue),falseLabel:stringValue(format.falseValue)};return undefined;
}
function footerCellValue(cell:UnknownRecord,columns:UnknownRecord[],bodyCells:UnknownRecord[],formulas:Map<string,string>,sourcePath:string):Record<string,unknown>{
  const summaryMode=stringValue(cell.summaryMode);
  if(summaryMode==='formula'&&stringValue(cell.summaryFormula).trim()){const bindings:any[]=[];let idx=0;const converted=stringValue(cell.summaryFormula).replace(/\[([^\]]+)\]/g,(_m,nameRaw:string)=>{const name=nameRaw.trim();const colIndex=columns.findIndex((c)=>[stringValue(c.label),stringValue(c.key),stringValue(c.id)].some((v)=>v.trim().toLocaleLowerCase()===name.toLocaleLowerCase()));const col=colIndex>=0?columns[colIndex]:undefined;const bodyCell=colIndex>=0?bodyCells[colIndex]:undefined;const formulaPath=stringValue(bodyCell?.valueMode)==='formula'?(normalizeBinding(stringValue(col?.label)||name,formulas)||toApiSafePath(stringValue(col?.label)||name)):'';const rawPath=stringValue(bodyCell?.binding)||formulaPath||stringValue(col?.key)||name;const path=sourcePath.startsWith('__db5g_group_')?rawPath:(normalizeBinding(rawPath,formulas)||toApiSafePath(rawPath));const id=`f${idx++}`;bindings.push({id,label:name,path,sourceField:name,targetPath:path,sourcePath});return `{{${id}}}`;});return {operation:'FORMULA',expression:converted,formulaBindings:bindings,sourcePath};}
  if(summaryMode==='aggregate'){const agg=recordValue(cell.aggregate);const field=stringValue(agg.field);const colIndex=columns.findIndex((c)=>[stringValue(c.label),stringValue(c.key),stringValue(c.id)].some((v)=>v.trim().toLocaleLowerCase()===field.trim().toLocaleLowerCase()));const col=colIndex>=0?columns[colIndex]:undefined;const bodyCell=colIndex>=0?bodyCells[colIndex]:undefined;const formulaPath=stringValue(bodyCell?.valueMode)==='formula'?(normalizeBinding(stringValue(col?.label)||field,formulas)||toApiSafePath(stringValue(col?.label)||field)):'';const rawPath=stringValue(bodyCell?.binding)||formulaPath||stringValue(col?.key)||field;const path=sourcePath.startsWith('__db5g_group_')?rawPath:(normalizeBinding(rawPath,formulas)||toApiSafePath(rawPath));return {operation:stringValue(agg.operation,'sum').toUpperCase(),path,sourceField:field,targetPath:path,sourcePath};}
  if(stringValue(cell.valueMode)==='binding'&&stringValue(cell.binding))return {operation:'FIELD',path:normalizeBinding(stringValue(cell.binding),formulas)||stringValue(cell.binding)};
  return {operation:'STATIC',staticValue:normalizeTemplateTokens(stringValue(cell.content),formulas)};
}
function tableBlock(element:UnknownRecord,formulas:Map<string,string>,pageIndex:number,groupedTablesOut:GroupedTableSpec[]):TemplateBlock|null {
  const visibility=builderVisibility(element,formulas);
  const table=recordValue(element.table);if(!Object.keys(table).length)return null;const columns=arrayValue(table.columns);if(!columns.length)return null;const layout=absoluteLayout(element,pageIndex);const elementId=stringValue(element.id,`table-${Math.random()}`);
  if(stringValue(table.mode)==='custom'){
    const rows=arrayValue(table.rows).length?arrayValue(table.rows):arrayValue(table.customRows);const cells:any[]=[];
    rows.forEach((row,rowIndex)=>arrayValue(row.cells).forEach((cell,columnIndex)=>{const content=stringValue(cell.valueMode)==='binding'&&stringValue(cell.binding)?{type:'FIELD',path:normalizeBinding(stringValue(cell.binding),formulas),style:cellTextStyle(cell)}:{type:'TEXT',text:normalizeTemplateTokens(stringValue(cell.content),formulas),style:cellTextStyle(cell)};cells.push({id:stringValue(cell.id,`cell-${rowIndex}-${columnIndex}`),row:rowIndex,column:columnIndex,rowSpan:numberValue(cell.rowSpan,1),colSpan:numberValue(cell.colSpan,1),content,style:{backgroundColor:stringValue(recordValue(cell.style).background,'#FFFFFF'),border:{width:numberValue(table.borderWidth,1),color:stringValue(table.borderColor,'#CBD5E1'),style:stringValue(table.borderStyle)==='none'?'NONE':stringValue(table.borderStyle)==='dashed'?'DASHED':'SOLID'},padding:{top:pxToMm(recordValue(cell.style).padding,2),right:pxToMm(recordValue(cell.style).padding,2),bottom:pxToMm(recordValue(cell.style).padding,2),left:pxToMm(recordValue(cell.style).padding,2)},verticalAlignment:stringValue(recordValue(cell.style).verticalAlign)==='bottom'?'BOTTOM':stringValue(recordValue(cell.style).verticalAlign)==='middle'?'CENTER':'TOP'}});}));
    return {id:elementId,type:'CUSTOM_TABLE',...(visibility?{visibility}:{}),rowCount:rows.length,columnCount:columns.length,cells,tableStyle:{showBorder:stringValue(table.borderStyle,'solid')!=='none'&&numberValue(table.borderWidth,1)>0,widthPercent:layout.widthPercent,border:{width:Math.max(.2,numberValue(table.borderWidth,1)),color:stringValue(table.borderColor,'#CBD5E1'),style:stringValue(table.borderStyle)==='dashed'?'DASHED':'SOLID'},cellPadding:{top:pxToMm(table.defaultPadding,2),right:pxToMm(table.defaultPadding,2),bottom:pxToMm(table.defaultPadding,2),left:pxToMm(table.defaultPadding,2)}},layout} as TemplateBlock;
  }
  const binding=recordValue(table.binding);const grouping=recordValue(binding.grouping);const isGrouped=stringArray(grouping.groupBy).length>0&&arrayValue(grouping.columns).length>0;const sourcePath=isGrouped?groupedSourcePath(stringValue(table.id,elementId)):'items';
  if(isGrouped)groupedTablesOut.push({tableId:stringValue(table.id,elementId),sourcePath,groupBy:stringArray(grouping.groupBy),columns:arrayValue(grouping.columns).map((col)=>({field:stringValue(col.field),operation:stringValue(col.operation),outputKey:stringValue(col.outputKey),label:stringValue(col.label),formula:stringValue(col.formula)}))});
  const headerRows=arrayValue(table.headerRows),bodyRows=arrayValue(table.bodyRows),headerCells=arrayValue(headerRows[0]?.cells),bodyCells=arrayValue(bodyRows[0]?.cells);const totalWidth=Math.max(1,columns.reduce((sum,column)=>sum+Math.max(1,numberValue(column.width,1)),0));
  const calculatedRefs=columns.flatMap((column,index)=>{const bodyCell=bodyCells[index]??{};if(stringValue(bodyCell.valueMode)!=='formula')return[];const headerCell=headerCells[index]??{};const label=stringValue(headerCell.content)||stringValue(column.label)||stringValue(column.key,`column${index+1}`);const path=normalizeBinding(label,formulas)||toApiSafePath(label);return Array.from(new Set([label,stringValue(column.label),stringValue(column.key)].filter(Boolean))).map((name)=>({name,path}));});
  const mappedColumns=columns.map((column,index)=>{const bodyCell=bodyCells[index]??{},headerCell=headerCells[index]??{};const label=stringValue(headerCell.content)||stringValue(column.label)||stringValue(column.key,`column${index+1}`);const isFormula=stringValue(bodyCell.valueMode)==='formula'&&Boolean(stringValue(bodyCell.formula).trim());const groupedCol=isGrouped?arrayValue(grouping.columns).find((gc)=>stringValue(gc.label).trim().toLocaleLowerCase()===label.trim().toLocaleLowerCase()):undefined;const summaryAlias=isFormula?arrayValue(table.customRows).map((row)=>arrayValue(row.cells)[index]).map((cell)=>recordValue(cell)).map((cell)=>stringValue(recordValue(cell.aggregate).field)).find(Boolean):undefined;const defaultPath=groupedCol?stringValue(groupedCol.outputKey):stringValue(bodyCell.binding)||(isFormula?(summaryAlias||label):stringValue(column.key))||`column${index+1}`;const path=isGrouped?defaultPath:(normalizeBinding(defaultPath,formulas)||toApiSafePath(defaultPath));const columnVisibility=builderVisibility(recordValue(column),formulas);const visibilityScope=stringValue(column.conditionScope,'document')==='anyRow'?'ANY_ROW':stringValue(column.conditionScope,'document')==='allRows'?'ALL_ROWS':'DOCUMENT';const base:Record<string,unknown>={id:stringValue(column.id,`column-${index+1}`),label,path,layoutRole:builderTableColumnRole(table,index),sourceField:path,targetPath:path,widthPercent:(Math.max(1,numberValue(column.width,1))/totalWidth)*100,alignment:align(column.align),headerAlignment:align(recordValue(headerCell.style).align??column.align),headerStyle:cellTextStyle(headerCell),cellStyle:cellTextStyle(bodyCell),format:toDisplayFormat(stringValue(column.dataType),column.format),...(columnVisibility?{visibility:columnVisibility,visibilityScope}:{})};
    if(isFormula&&!isGrouped){const bindings:any[]=[];let i=0;const byKey=new Map<string,string>();const addBinding=(bindingLabel:string,bindingPath?:string)=>{const key=`${bindingLabel.toLocaleLowerCase()}::${bindingPath??''}`;const existing=byKey.get(key);if(existing)return`{{${existing}}}`;const id=`b${i++}`,p=bindingPath||normalizeBinding(bindingLabel,formulas);bindings.push({id,label:bindingLabel,path:p,sourceField:p,targetPath:p,sourcePath:'items'});byKey.set(key,id);return`{{${id}}}`;};let expression=stringValue(bodyCell.formula).replace(/\[([^\]]+)\]/g,(_m,nameRaw:string)=>addBinding(nameRaw.trim()));expression=replaceBareCalculatedReferences(expression,calculatedRefs,(name,refPath)=>addBinding(name,refPath));base.kind='FORMULA';base.formulaExpression=expression;base.formulaBindings=bindings;}return base;});
  const footerRows=arrayValue(table.customRows).map((row)=>({id:stringValue(row.id,`footer-${Math.random().toString(36).slice(2,8)}`),cells:arrayValue(row.cells).map((cell,index)=>({id:stringValue(cell.id,`fcell-${index}`),columnId:stringValue(columns[index]?.id),colspan:Math.max(1,numberValue(cell.colSpan,1)),value:footerCellValue(cell,columns,bodyCells,formulas,sourcePath),alignment:align(recordValue(cell.style).align??'right'),style:cellTextStyle(cell)})),backgroundColor:stringValue(recordValue(arrayValue(row.cells)[0]?.style).background,'#FFFFFF')}));
  const rowFilter=builderVisibility({conditionalRendering:table.rowConditionalRendering} as UnknownRecord,formulas);
  return {id:elementId,type:'TABLE',...(visibility?{visibility}:{}),...(rowFilter?{rowFilter}:{}),sourcePath,columns:mappedColumns as never,footerRows:footerRows as never,tableStyle:{showHeader:headerRows.length>0,showBorder:stringValue(table.borderStyle,'solid')!=='none'&&numberValue(table.borderWidth,1)>0,widthPercent:100,headerStyle:headerCells[0]?cellTextStyle(headerCells[0]):undefined,cellStyle:bodyCells[0]?cellTextStyle(bodyCells[0]):undefined,border:{width:Math.max(.2,numberValue(table.borderWidth,1)),color:stringValue(table.borderColor,'#CBD5E1'),style:stringValue(table.borderStyle)==='dashed'?'DASHED':'SOLID'},cellPadding:{top:pxToMm(table.defaultPadding,6),right:pxToMm(table.defaultPadding,6),bottom:pxToMm(table.defaultPadding,6),left:pxToMm(table.defaultPadding,6)}},layout:{...layout,keepTogether:false}} as TemplateBlock;
}
function convertElement(element:UnknownRecord,formulas:Map<string,string>,pageIndex:number,groupedTablesOut:GroupedTableSpec[]):TemplateBlock|null {
  const type=stringValue(element.type); const id=stringValue(element.id,`block-${Math.random()}`); const layout=absoluteLayout(element,pageIndex); const style=textStyle(element); const binding=normalizeBinding(stringValue(element.binding),formulas); const visibility=builderVisibility(element,formulas);
  if(type==='text') return binding?{id,type:'FIELD',...(visibility?{visibility}:{}),path:binding,valueStyle:style,textAlignment:align(element.textAlign),layout} as TemplateBlock:{id,type:'TEXT',...(visibility?{visibility}:{}),text:normalizeTemplateTokens(stringValue(element.text),formulas),style,layout} as TemplateBlock;
  if(type==='divider') return {id,type:'DIVIDER',...(visibility?{visibility}:{}),thickness:Math.max(.2,pxToMm(element.height,.2)),color:stringValue(element.color,'#94A3B8'),style:'SOLID',layout} as TemplateBlock;
  if(type==='shape'){
    const child=binding?{id:`${id}:value`,type:'FIELD' as const,path:binding,valueStyle:style,textAlignment:align(element.textAlign)}:{id:`${id}:text`,type:'TEXT' as const,text:normalizeTemplateTokens(stringValue(element.text),formulas),style};
    return {id,type:'BOX',...(visibility?{visibility}:{}),style:{widthMode:'FIXED_MM',widthMm:layout.widthMm,heightMode:'FIXED',heightMm:layout.heightMm,backgroundColor:stringValue(element.fill,'#FFFFFF'),border:{width:Math.max(0,numberValue(element.shapeStrokeWidth,0)),color:stringValue(element.shapeStrokeColor,stringValue(element.color,'#000000')),style:stringValue(element.shapeStrokeStyle)==='none'?'NONE':stringValue(element.shapeStrokeStyle)==='dashed'?'DASHED':'SOLID'},padding:{top:pxToMm(element.shapePadding,4),right:pxToMm(element.shapePadding,4),bottom:pxToMm(element.shapePadding,4),left:pxToMm(element.shapePadding,4)},horizontalAlignment:align(element.textAlign),verticalAlignment:stringValue(element.shapeTextVerticalAlign)==='top'?'TOP':stringValue(element.shapeTextVerticalAlign)==='bottom'?'BOTTOM':'CENTER'},children:[child] as never,layout} as TemplateBlock;
  }
  if(type==='image'||type==='signature'){
    const source=stringValue(element.imageSource)||stringValue(element.imageOriginalSource); if(!source.startsWith('data:image/'))return null;
    return {id,type:'IMAGE',...(visibility?{visibility}:{}),sourceType:'DATA_URL',source,altText:type==='signature'?'Signature':'Image',width:layout.widthMm,height:layout.heightMm,maintainAspectRatio:stringValue(element.imageFit,'contain')!=='fill',alignment:align(element.textAlign),layout} as TemplateBlock;
  }
  if(type==='table')return tableBlock(element,formulas,pageIndex,groupedTablesOut);
  return null;
}
function defaultPageSettings(payload:UnknownRecord){return{preset:stringValue(payload.pageSize,'A4'),orientation:stringValue(payload.orientation,'Portrait'),customWidthMm:210,customHeightMm:297,marginsMm:{top:15,right:15,bottom:15,left:15},background:'#ffffff',borderColor:'#d2d8e0',borderWidth:0,borderOffsetMm:0,header:{enabled:false},footer:{enabled:false}};}
function pageDefinition(settingsInput:unknown,formulas:Map<string,string>=new Map()):TemplateDefinition['page']{
  const settings={...defaultPageSettings({}),...recordValue(settingsInput)} as UnknownRecord; const preset=stringValue(settings.preset,'A4').toUpperCase(); const size=preset==='LETTER'||preset==='LEGAL'||preset==='TABLOID'||preset==='LEDGER'||preset==='EXECUTIVE'||/^[AB][0-9]+$/.test(preset)?preset:'CUSTOM'; const margins=recordValue(settings.marginsMm); const watermark=recordValue(settings.watermark); const watermarkPosition=stringValue(watermark.position,'center').replace(/-/g,'_').toUpperCase();
  return {size:size as TemplateDefinition['page']['size'],orientation:stringValue(settings.orientation)==='Landscape'?'LANDSCAPE':'PORTRAIT',margins:{top:numberValue(margins.top,15),right:numberValue(margins.right,15),bottom:numberValue(margins.bottom,15),left:numberValue(margins.left,15)},customWidthMm:numberValue(settings.customWidthMm,210),customHeightMm:numberValue(settings.customHeightMm,297),backgroundColor:stringValue(settings.background,'#ffffff'),border:{enabled:numberValue(settings.borderWidth,0)>0,style:'SOLID',width:numberValue(settings.borderWidth,0),color:stringValue(settings.borderColor,'#d2d8e0'),offset:numberValue(settings.borderOffsetMm,0)},pagination:{repeatHeader:false,headerMode:'FIRST_PAGE_ONLY',footerMode:'FLOW',showPageNumbers:false,keepSummaryTogether:true,keepCustomGridTogether:true},watermark:{enabled:watermark.enabled===true,type:stringValue(watermark.type,'text')==='image'?'IMAGE':'TEXT',text:stringValue(watermark.text,'CONFIDENTIAL'),imageSource:stringValue(watermark.imageSource),opacity:Math.max(0,Math.min(1,numberValue(watermark.opacity,20)/100)),rotation:numberValue(watermark.rotation,-45),fontSize:Math.max(6,numberValue(watermark.fontSize,56)*PX_TO_PT),color:stringValue(watermark.color,'#64748B'),position:(['CENTER','TOP_LEFT','TOP_RIGHT','BOTTOM_LEFT','BOTTOM_RIGHT','CUSTOM'].includes(watermarkPosition)?watermarkPosition:'CENTER') as NonNullable<TemplateDefinition['page']['watermark']>['position'],scale:Math.max(.05,Math.min(2,numberValue(watermark.scale,60)/100)),customXPercent:Math.max(0,Math.min(100,numberValue(watermark.customXPercent,50))),customYPercent:Math.max(0,Math.min(100,numberValue(watermark.customYPercent,50))),applyTo:stringValue(watermark.applyTo,'all')==='first'?'FIRST_PAGE':'ALL',layer:stringValue(watermark.layer,'behind')==='above'?'ABOVE':'BEHIND',...(builderVisibility(recordValue(watermark),formulas)?{visibility:builderVisibility(recordValue(watermark),formulas)}:{})}};
}
export function isDesktopTemplateEntry(value:unknown):value is DesktopTemplateEntry {if(!value||typeof value!=='object'||Array.isArray(value))return false;const candidate=value as Partial<DesktopTemplateEntry>;return typeof candidate.id==='string'&&!!candidate.payload&&typeof candidate.payload==='object'&&!Array.isArray(candidate.payload);}
export function adaptDesktopTemplateEntry(entry:DesktopTemplateEntry):TemplateDefinition {
  const payload=entry.payload; const rawPages=arrayValue(payload.pages); const basePages=rawPages.length?rawPages:[{id:'page-1',name:'Page 1',settings:defaultPageSettings(payload),elements:Array.isArray(payload.elements)?payload.elements:[]}]; const globalWatermark=recordValue(payload.watermark); const pages=basePages.map((page)=>projectFlowElements({...page,settings:{...recordValue(page.settings),...(Object.keys(globalWatermark).length?{watermark:{...globalWatermark}}:{})}})); const firstPage=pages[0]??{}; const firstSettings=recordValue(firstPage.settings); const {specs:formulaSpecs,map:formulaMap}=buildFormulaState(pages);
  const headerBlocks:TemplateBlock[]=[]; const bodyBlocks:TemplateBlock[]=[]; const footerBlocks:TemplateBlock[]=[]; const groupedTables:GroupedTableSpec[]=[];
  pages.forEach((page,pageIndex)=>{for(const element of arrayValue(page.elements)){if(stringValue(element.type)==='formula')continue;const region=stringValue(element.region,'body');const block=convertElement(element,formulaMap,pageIndex,groupedTables);if(!block)continue;if(region==='header'&&pageIndex===0)headerBlocks.push(block);else if(region==='footer'&&pageIndex===0)footerBlocks.push(block);else if(region==='body')bodyBlocks.push(block);}});
  const margins=recordValue(firstSettings.marginsMm); const headerSettings=recordValue(firstSettings.header); const footerSettings=recordValue(firstSettings.footer);
  const bodyTopMm=numberValue(margins.top,15)+(headerSettings.enabled===true?numberValue(headerSettings.heightMm,20)+numberValue(headerSettings.gapMm,5):0);
  const bodyBottomMm=numberValue(margins.bottom,15)+(footerSettings.enabled===true?numberValue(footerSettings.heightMm,15)+numberValue(footerSettings.gapMm,5):0);
  return {id:entry.id,name:entry.name||stringValue(payload.name,'Document'),version:entry.version??numberValue(payload.version,1),page:pageDefinition(Object.keys(firstSettings).length?firstSettings:defaultPageSettings(payload),formulaMap),header:{blocks:headerBlocks},body:{blocks:bodyBlocks},footer:{blocks:footerBlocks},calculatedFields:[],metadata:{source:'desktop-local-template',builderPageCount:pages.length,updatedAt:stringValue(payload.updatedAt),adapter:'UX-8-Conditional-Rendering',desktopAbsoluteLayout:true,desktopFormulaFields:formulaSpecs,desktopGroupedTables:groupedTables,desktopFlowProjected:true,desktopBodyTopMm:bodyTopMm,desktopBodyBottomMm:bodyBottomMm}};
}
