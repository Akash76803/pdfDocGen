import type {
  DocumentGroup,
  RenderBlock,
  RenderRowChildBlock,
  RowChildBlock,
  TemplateBlock,
  TemplateDefinition,
  TemplateError,
  TemplateRenderResult,
  TemplateWarning,
  AggregateValueDefinition,
  SummaryRowDefinition,
  DisplayFormatDefinition,
  TableColumnDefinition,
} from '@document-tool/contracts';
import { resolvePath } from './path-resolver.js';
import { evaluateFormula } from './formula-engine.js';
import { TemplateValidator } from './template-validator.js';
import { createQrSvgDataUrl } from './qr-code.js';
import { displayString, formatDisplayValue } from './display-format.js';
import { evaluateVisibilityRule } from './condition-evaluator.js';
import { buildRawSourceContext } from './raw-source-path.js';
import {
  DEFAULT_TEXT_STYLE,
  resolveBlockLayout,
  resolveBorderStyle,
  resolveBoxStyle,
  resolveCellPadding,
  resolveCellStyle,
  resolveTextStyle,
  withAlignment,
} from './style-defaults.js';

export class TemplateEngine {
  constructor(private readonly validator = new TemplateValidator()) {}

  validate(template: TemplateDefinition) {
    return this.validator.validate(template);
  }

  buildRenderModel(template: TemplateDefinition, data: DocumentGroup): TemplateRenderResult {
    const validation = this.validator.validate(template);
    if (!validation.valid) return { model: null, warnings: [], errors: validation.errors };

    const warnings: TemplateWarning[] = [];
    const errors: TemplateError[] = [];
    const root: Record<string, unknown> = {
      ...data.header,
      header: data.header,
      items: data.items.length ? data.items : (data.sourceItems ?? []),
      sourceItems: data.sourceItems ?? [],
      itemDetails: data.itemDetails,
      group: { key: data.key, id: data.id },
      page: { number: 1, total: 1 },
      views: {},
      calc: {},
    };

    // Phase 4.13: derive reusable filtered collections without mutating DocumentGroup.items.
    let dataViewState:ReturnType<typeof resolveDataViews>;
    try {
      dataViewState = resolveDataViews(template.dataViews ?? [], root, data);
    } catch (error) {
      return {
        model:null,
        warnings,
        errors:[{code:'TEMPLATE_RENDER_FAILED',message:error instanceof Error ? error.message : 'Data View resolution failed.'}],
      };
    }
    (root.views as Record<string, unknown[]>) = dataViewState.views;
    const sourcePair = (sourcePath: string) => resolveSourceRowsWithRaw(root, data, sourcePath, dataViewState.rawRowsByPath);
    // Calculated fields intentionally resolve after data views so formulas can aggregate views.*.
    resolveNamedCalculatedFields(template.calculatedFields ?? [], root, sourcePair);

    const isVisible = (block: { visibility?: import('@document-tool/contracts').VisibilityRule }) => evaluateVisibilityRule(block.visibility, root);

    const convertCommon = (block: Exclude<RowChildBlock, { type: 'TABLE' | 'SUMMARY_TABLE' | 'CUSTOM_TABLE' | 'BOX' }>): RenderRowChildBlock => {
      switch (block.type) {
        case 'TEXT':
          return {
            id: block.id,
            type: 'TEXT',
            text: resolveRichText(block.text, block.fieldTokens, root, warnings, block.id),
            style: resolveTextStyle(block.style),
            layout: resolveBlockLayout(block.layout),
          };
        case 'FIELD': {
          const result = resolvePath(root, block.path);
          const value = !result.found || result.value == null ? block.fallback ?? '' : displayString(result.value, block.format);
          if (!result.found || result.value == null) {
            warnings.push({
              code: 'FIELD_VALUE_MISSING',
              message: `No preview value found for ${block.path}.`,
              blockId: block.id,
              path: block.path,
            });
          }
          const textAlignment = block.textAlignment ?? block.valueStyle?.alignment ?? block.labelStyle?.alignment ?? 'LEFT';
          return {
            id: block.id,
            type: 'FIELD',
            label: block.label,
            value,
            labelStyle: withAlignment(resolveTextStyle(block.labelStyle), block.labelStyle?.alignment ?? textAlignment),
            valueStyle: withAlignment(resolveTextStyle(block.valueStyle), block.valueStyle?.alignment ?? textAlignment),
            layout: resolveBlockLayout(block.layout),
            layoutMode: block.layoutMode ?? 'INLINE',
            spacing: block.spacing ?? 2,
            textAlignment,
          };
        }
        case 'IMAGE': {
          if (block.sourceType === 'LOCAL_ASSET' || !block.source) {
            warnings.push({
              code: 'IMAGE_PREVIEW_UNAVAILABLE',
              message: 'Local image asset cannot be resolved in browser preview until a local raster image is selected.',
              blockId: block.id,
            });
          }
          return {
            id: block.id,
            type: 'IMAGE',
            sourceType: block.sourceType,
            source: block.source,
            altText: block.altText ?? 'Image',
            width: block.width ?? 40,
            height: block.height,
            maintainAspectRatio: block.maintainAspectRatio ?? true,
            alignment: block.alignment ?? block.layout?.alignment ?? 'LEFT',
            layout: resolveBlockLayout(block.layout, { alignment: block.alignment ?? 'LEFT' }),
          };
        }
        case 'SPACER':
          return { id: block.id, type: 'SPACER', height: block.height, layout: resolveBlockLayout(block.layout) };
        case 'DIVIDER':
          return {
            id: block.id,
            type: 'DIVIDER',
            thickness: block.thickness,
            color: block.color ?? block.border?.color ?? '#94A3B8',
            style:
              block.style ??
              (block.border?.style === 'DASHED' ? 'DASHED' : block.border?.style === 'NONE' ? 'NONE' : 'SOLID'),
            layout: resolveBlockLayout(block.layout, {
              widthPercent: 100,
              marginTop: block.spacing ?? 3,
              marginBottom: block.spacing ?? 3,
            }),
          };
      }
    };

    const convert = (block: TemplateBlock): RenderBlock => {
      if (block.type === 'BOX') {
        const style = resolveBoxStyle(block.style);
        return {
          id: block.id,
          type: 'BOX',
          name: block.name,
          style,
          children: block.children.filter(isVisible).map((child) => convert(child as TemplateBlock) as import('@document-tool/contracts').RenderBoxChildBlock),
          layout: resolveBlockLayout(block.layout, { widthPercent: block.style?.widthMode === 'PERCENT' ? block.style.widthPercent ?? 100 : block.layout?.widthPercent ?? 100, keepTogether: block.layout?.keepTogether ?? true }),
        };
      }
      if (block.type === 'ROW') {
        const renderLegacyChildren = () => {
          const visibleChildren = block.children.filter(isVisible);
          const explicitTotal = visibleChildren.reduce((sum, child) => sum + (child.layout?.widthPercent ?? 0), 0);
          const automaticCount = visibleChildren.filter((child) => child.layout?.widthPercent === undefined).length;
          const automaticWidth = automaticCount > 0 ? Math.max(1, (100 - explicitTotal) / automaticCount) : 0;
          return visibleChildren.map((child) => {
            const rendered = convert(child as TemplateBlock) as RenderRowChildBlock;
            return { ...rendered, layout: { ...rendered.layout, widthPercent: child.layout?.widthPercent ?? automaticWidth } };
          });
        };
        const legacyChildren = block.columns?.length ? [] : renderLegacyChildren();
        const explicitColumnTotal = (block.columns ?? []).reduce((sum, column) => sum + (column.widthPercent ?? 0), 0);
        const automaticColumnCount = (block.columns ?? []).filter((column) => column.widthPercent === undefined).length;
        const automaticColumnWidth = automaticColumnCount > 0 ? Math.max(1, (100 - explicitColumnTotal) / automaticColumnCount) : 0;
        const columns = (block.columns ?? []).map((column) => {
          const resolvedStyle = resolveCellStyle({
            ...column.style,
            // Backward compatibility: legacy RowColumn.widthPercent means an explicit
            // percentage column unless the newer cell widthMode was configured.
            widthMode: column.style?.widthMode ?? (column.widthPercent !== undefined ? 'PERCENT' : 'AUTO'),
            widthPercent: column.style?.widthPercent ?? column.widthPercent ?? automaticColumnWidth,
          });
          return {
          id: column.id,
          widthPercent: resolvedStyle.widthMode === 'PERCENT' ? resolvedStyle.widthPercent : column.widthPercent ?? automaticColumnWidth,
          style: resolvedStyle,
          children: column.children.filter(isVisible).map((child) => {
            const rendered = convert(child as TemplateBlock) as RenderRowChildBlock;
            return { ...rendered, layout: { ...rendered.layout, widthPercent: 100, alignment: 'LEFT' as const } };
          }),
        };
        });
        return {
          id: block.id,
          type: 'ROW',
          gap: block.gap ?? 0,
          verticalAlignment: block.verticalAlignment ?? 'TOP',
          layout: resolveBlockLayout(block.layout),
          children: legacyChildren,
          columns,
        };
      }

      if (block.type === 'CUSTOM_TABLE') {
        const style = block.tableStyle;
        const renderContent = (cell: (typeof block.cells)[number]) => {
          const content = cell.content;
          const textStyle = resolveTextStyle(content.style, resolveTextStyle(style?.cellStyle, DEFAULT_TEXT_STYLE));
          if (content.type === 'BLANK') return { type: 'BLANK' as const, value: '', style: textStyle };
          if (content.type === 'TEXT') return { type: 'TEXT' as const, value: resolveRichText(content.text ?? '', content.fieldTokens, root, warnings, block.id), style: textStyle };
          if (content.type === 'FIELD') {
            const result = resolvePath(root, content.path ?? '');
            const value = result.found && result.value != null ? displayString(result.value, content.format) : content.fallback ?? '';
            if (!result.found && content.path) warnings.push({ code: 'FIELD_VALUE_MISSING', message: `No preview value found for ${content.path}.`, blockId: block.id, path: content.path });
            return { type: 'FIELD' as const, value, style: textStyle };
          }
          if (content.type === 'VALUE') {
            const activeSource = content.value?.sourcePath ?? 'items';
            const pair = sourcePair(activeSource);
            const value = evaluateAggregate(content.value ?? { operation: 'STATIC', staticValue: '' }, root, pair.rows, pair.rawRows, activeSource);
            return { type: 'VALUE' as const, value, style: textStyle };
          }
          return { type: 'IMAGE' as const, sourceType: content.sourceType ?? 'DATA_URL', source: content.source ?? '', altText: content.altText ?? 'Image', width: content.width ?? 30, height: content.height, maintainAspectRatio: content.maintainAspectRatio ?? true, style: textStyle };
        };
        return {
          id: block.id,
          type: 'CUSTOM_TABLE',
          rowCount: block.rowCount,
          columnCount: block.columnCount,
          showBorder: style?.showBorder ?? true,
          cells: block.cells.map((cell) => ({
            id: cell.id,
            row: cell.row,
            column: cell.column,
            rowSpan: cell.rowSpan ?? 1,
            colSpan: cell.colSpan ?? 1,
            content: renderContent(cell),
            style: resolveCellStyle(cell.style),
          })),
          widthPercent: style?.widthPercent ?? block.layout?.widthPercent ?? 100,
          alignment: style?.alignment ?? block.layout?.alignment ?? 'LEFT',
          border: resolveBorderStyle(style?.border),
          cellPadding: resolveCellPadding(style?.cellPadding),
          layout: resolveBlockLayout(block.layout, { widthPercent: style?.widthPercent ?? 100, alignment: style?.alignment ?? 'LEFT' }),
        };
      }

      if (block.type === 'SUMMARY_TABLE') {
        const style = block.tableStyle;
        const headerStyle = resolveTextStyle(style?.headerStyle, { ...DEFAULT_TEXT_STYLE, fontSize: 10, bold: true, backgroundColor: '#F3F4F6' });
        const cellStyle = resolveTextStyle(style?.cellStyle, { ...DEFAULT_TEXT_STYLE, fontSize: 10 });
        const columns = block.columns.map((column) => ({
          id: column.id, label: column.label, widthPercent: column.widthPercent,
          alignment: column.alignment ?? cellStyle.alignment,
          headerAlignment: column.headerAlignment ?? column.alignment ?? headerStyle.alignment,
          style: resolveTextStyle(column.style, cellStyle),
        }));
        const renderSummaryRow = (row: SummaryRowDefinition, scope: Record<string, unknown>, sourceRows: unknown[], rawRows: unknown[] = []) => {
          const resolvedRowStyle = resolveTextStyle(row.style, row.bold ? { ...cellStyle, bold: true } : cellStyle);
          return {
            id: row.id,
            cells: row.cells.map((cell) => ({
              id: cell.id, columnId: cell.columnId,
              value: evaluateAggregate(cell.value, scope, sourceRows, rawRows, block.sourcePath),
              alignment: cell.alignment ?? cell.style?.alignment ?? resolvedRowStyle.alignment,
              // Summary styling precedence is deliberately hierarchical:
              // Cell override > Row override > Table cell default.
              style: resolveTextStyle(cell.style, resolvedRowStyle),
            })),
            style: resolvedRowStyle,
            backgroundColor: row.backgroundColor ?? resolvedRowStyle.backgroundColor ?? '#FFFFFF',
            bold: row.bold ?? resolvedRowStyle.bold ?? false,
          };
        };
        let rows = [] as ReturnType<typeof renderSummaryRow>[];
        if (block.dataMode === 'GROUP_BY') {
          const activeSource = block.sourcePath ?? 'items';
          const requestedSourcePair = sourcePair(activeSource);
          // Backward compatibility: older/manual summary blocks sometimes persisted a scalar
          // sourcePath (for example `fields`) while aggregate bindings still target `items.*`.
          // Only summaries fall back here; Data Views and Tables keep strict collection semantics.
          const sourcePairValue = requestedSourcePair.found ? requestedSourcePair : sourcePair('items');
          const sourceRows = sourcePairValue.rows;
          const groups = new Map<string, Array<{ row: unknown; raw: unknown }>>();
          sourceRows.forEach((item, index) => {
            const keyResult = resolveAggregatePath(item, block.groupByPath ?? '', block.sourcePath);
            const raw = sourcePairValue.rawRows[index];
            const rawKey = !keyResult.found && raw ? resolvePath(raw, block.groupByPath ?? '') : keyResult;
            const key = rawKey.found ? display(rawKey.value) : '';
            const list = groups.get(key) ?? []; list.push({ row: item, raw }); groups.set(key, list);
          });
          const templateRow = block.rows?.[0];
          if (templateRow) rows = [...groups.entries()].map(([key, grouped]) => renderSummaryRow(templateRow, { ...root, groupKey: key, current: grouped[0]?.row }, grouped.map(x => x.row), grouped.map(x => x.raw)));
        } else {
          const activeSource = block.sourcePath ?? 'items';
          const requestedSourcePair = sourcePair(activeSource);
          const sourcePairValue = requestedSourcePair.found ? requestedSourcePair : sourcePair('items');
          rows = (block.rows ?? []).map((row) => renderSummaryRow(row, root, sourcePairValue.rows, sourcePairValue.rawRows));
        }
        const requestedTotalPair = sourcePair(block.sourcePath ?? 'items');
        const totalPair = requestedTotalPair.found ? requestedTotalPair : sourcePair('items');
        return {
          id: block.id, type: 'SUMMARY_TABLE', title: block.title, showHeader: block.showHeader ?? style?.showHeader ?? true, showBorder: style?.showBorder ?? true, columns, rows,
          totalRow: block.totalRow ? renderSummaryRow(block.totalRow, root, totalPair.rows, totalPair.rawRows) : undefined,
          widthPercent: style?.widthPercent ?? block.layout?.widthPercent ?? 100,
          alignment: style?.alignment ?? block.layout?.alignment ?? 'LEFT',
          headerStyle, cellStyle, border: resolveBorderStyle(style?.border), cellPadding: resolveCellPadding(style?.cellPadding),
          layout: resolveBlockLayout(block.layout, { widthPercent: style?.widthPercent ?? 100, alignment: style?.alignment ?? 'LEFT' }),
        };
      }

      if (block.type !== 'TABLE') return convertCommon(block);

      const tableSource = sourcePair(block.sourcePath);
      const style = block.tableStyle;
      const headerStyle = resolveTextStyle(style?.headerStyle, {
        ...DEFAULT_TEXT_STYLE,
        fontSize: 11,
        bold: true,
        backgroundColor: '#F3F4F6',
      });
      const cellStyle = resolveTextStyle(style?.cellStyle, { ...DEFAULT_TEXT_STYLE, fontSize: 10 });
      const visibleSourceColumns = block.columns.filter((column) => evaluateVisibilityRule(column.visibility, root));
      const columns = visibleSourceColumns.map((column) => ({
        id: column.id,
        label: column.label,
        path: column.path,
        kind: column.kind ?? 'SOURCE',
        sourceField: column.sourceField,
        targetPath: column.targetPath,
        widthPercent: column.widthPercent,
        alignment: column.alignment ?? cellStyle.alignment,
        headerAlignment: column.headerAlignment ?? column.alignment ?? headerStyle.alignment,
        headerStyle: resolveTextStyle(column.headerStyle, headerStyle),
        cellStyle: resolveTextStyle(column.cellStyle, cellStyle),
        imageWidthMm: column.imageWidthMm ?? column.qr?.widthMm ?? 18,
        imageHeightMm: column.imageHeightMm ?? column.qr?.heightMm ?? column.imageWidthMm ?? column.qr?.widthMm ?? 18,
      }));
      const visibleIds=new Set(columns.map((column)=>column.id));
      const filteredTableSource = applyRowFilter(tableSource.rows, tableSource.rawRows, block.rowFilter, root);
      const tableSourceRows = filteredTableSource.rows;
      const tableRawRows = filteredTableSource.rawRows;
      const footerRows = (block.footerRows ?? []).map((row) => {
        const rowStyle = resolveTextStyle(row.style, { ...DEFAULT_TEXT_STYLE, fontSize: 10, bold: true });
        return {
          id: row.id,
          cells: row.cells.filter((cell)=>!cell.columnId || visibleIds.has(cell.columnId)).map((cell) => ({
            id: cell.id, columnId: cell.columnId, colspan: Math.min(cell.colspan ?? 1,Math.max(1,columns.length)),
            value: evaluateAggregate({ ...cell.value, sourcePath: cell.value.sourcePath ?? block.sourcePath }, root, tableSourceRows, tableRawRows, block.sourcePath),
            alignment: cell.alignment ?? cell.style?.alignment ?? 'RIGHT',
            style: resolveTextStyle(cell.style, rowStyle),
          })),
          style: rowStyle,
          backgroundColor: row.backgroundColor ?? '#FFFFFF',
        };
      }).filter((row)=>row.cells.length>0);
      const headerGroups=(block.headerGroups ?? []).flatMap((group)=>{
        const originalStart=block.columns.findIndex((column)=>column.id===group.startColumnId);
        if(originalStart<0) return [];
        const memberIds=new Set(block.columns.slice(originalStart,originalStart+Math.max(1,group.colspan)).map((column)=>column.id));
        const visibleMembers=columns.filter((column)=>memberIds.has(column.id));
        if(!visibleMembers.length) return [];
        return [{id:group.id,label:group.label,startColumnId:visibleMembers[0]!.id,colspan:visibleMembers.length,alignment:group.alignment ?? 'CENTER',style:resolveTextStyle(group.style,headerStyle)}];
      });
      const common = {
        id: block.id,
        type: 'TABLE' as const,
        showHeader: style?.showHeader ?? true,
        showBorder: style?.showBorder ?? true,
        columns,
        headerGroups,
        footerRows,
        widthPercent: style?.widthPercent ?? block.layout?.widthPercent ?? 100,
        alignment: style?.alignment ?? block.layout?.alignment ?? 'LEFT',
        headerStyle,
        cellStyle,
        border: resolveBorderStyle(style?.border),
        cellPadding: resolveCellPadding(style?.cellPadding),
        layout: resolveBlockLayout(block.layout, {
          widthPercent: style?.widthPercent ?? 100,
          alignment: style?.alignment ?? 'LEFT',
        }),
      };
      if (!tableSource.found) {
        warnings.push({
          code: 'TABLE_SOURCE_NOT_ARRAY',
          message: `Table source ${block.sourcePath} is not an array.`,
          blockId: block.id,
          path: block.sourcePath,
        });
        return { ...common, rows: [], empty: true };
      }
      const rows = tableSourceRows.map((item, rowIndex) =>
        visibleSourceColumns.map((column) => resolveTableColumnValue(column,item,tableRawRows[rowIndex],rowIndex,block.sourcePath,root)),
      );
      return { ...common, rows, empty: rows.length === 0 };
    };

    try {
      return {
        model: {
          variables: root,
          page: template.page,
          header: template.header.blocks.filter(isVisible).map(convert),
          body: template.body.blocks.filter(isVisible).map(convert),
          footer: template.footer.blocks.filter(isVisible).map(convert),
          metadata: {
            templateId: template.id,
            templateVersion: template.version,
            groupKey: data.key,
            groupId: data.id,
          },
        },
        warnings,
        errors,
      };
    } catch (error) {
      return {
        model: null,
        warnings,
        errors: [
          {
            code: 'TEMPLATE_RENDER_FAILED',
            message: error instanceof Error ? error.message : 'Template preview failed.',
          },
        ],
      };
    }
  }
}



type SourceRowsWithRaw = { rows:unknown[]; rawRows:unknown[]; found:boolean };

function resolveSourceRowsWithRaw(root:Record<string,unknown>, data:DocumentGroup, sourcePath:string, dataViewRawRows:Map<string,unknown[]>):SourceRowsWithRaw {
  if(sourcePath==='items') return {rows:data.items.length?data.items:(data.sourceItems ?? []),rawRows:data.sourceItems ?? [],found:true};
  if(sourcePath==='sourceItems') return {rows:data.sourceItems ?? [],rawRows:data.sourceItems ?? [],found:true};
  const result=resolvePath(root,sourcePath);
  if(!result.found || !Array.isArray(result.value)) return {rows:[],rawRows:[],found:false};
  return {rows:result.value,rawRows:dataViewRawRows.get(sourcePath) ?? [],found:true};
}

function rowRuleContext(root:Record<string,unknown>, row:unknown, rawRow:unknown, index:number):Record<string,unknown> {
  const rowFields=row && typeof row==='object' && !Array.isArray(row) ? row as Record<string,unknown> : {};
  return {...root,...rowFields,row,$row:row,rawRow,$raw:rawRow,source:buildRawSourceContext(rawRow),index,$index:index};
}

function applyRowFilter(rows:unknown[], rawRows:unknown[], rule:import('@document-tool/contracts').VisibilityRule|undefined, root:Record<string,unknown>):{rows:unknown[];rawRows:unknown[]} {
  if(!rule) return {rows:[...rows],rawRows:[...rawRows]};
  const filteredRows:unknown[]=[]; const filteredRaw:unknown[]=[];
  rows.forEach((row,index)=>{
    const raw=rawRows[index];
    if(evaluateVisibilityRule(rule,rowRuleContext(root,row,raw,index))){filteredRows.push(row);filteredRaw.push(raw);}
  });
  return {rows:filteredRows,rawRows:filteredRaw};
}

function resolveDataViews(definitions:import('@document-tool/contracts').DataViewDefinition[], root:Record<string,unknown>, data:DocumentGroup){
  const views:Record<string,unknown[]>={};
  const rawRowsByPath=new Map<string,unknown[]>();
  const byAlias=new Map<string,import('@document-tool/contracts').DataViewDefinition>();
  for(const def of definitions){
    const alias=String(def.alias ?? '').trim();
    if(!alias || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`Invalid Data View alias "${alias}".`);
    if(byAlias.has(alias)) throw new Error(`Duplicate Data View alias "${alias}".`);
    byAlias.set(alias,def);
  }
  const resolving=new Set<string>(); const resolved=new Set<string>();
  const resolveOne=(alias:string):unknown[]=>{
    if(resolved.has(alias)) return views[alias] ?? [];
    if(resolving.has(alias)) throw new Error(`DATA_VIEW_CYCLE: ${[...resolving,alias].join(' -> ')}`);
    const def=byAlias.get(alias); if(!def) return [];
    resolving.add(alias);
    const sourcePath=def.sourcePath || 'items';
    let sourceRows:unknown[]=[]; let rawRows:unknown[]=[];
    if(sourcePath.startsWith('views.')){
      const sourceAlias=sourcePath.slice('views.'.length).split('.')[0]!;
      sourceRows=resolveOne(sourceAlias);
      rawRows=rawRowsByPath.get(`views.${sourceAlias}`) ?? [];
    }else if(sourcePath==='items'){
      sourceRows=data.items.length?data.items:(data.sourceItems ?? []); rawRows=data.sourceItems ?? [];
    }else if(sourcePath==='sourceItems'){
      sourceRows=data.sourceItems ?? []; rawRows=data.sourceItems ?? [];
    }else{
      const source=resolvePath(root,sourcePath);
      if(!source.found || !Array.isArray(source.value)) throw new Error(`Data View ${alias} source ${sourcePath} is not an array.`);
      sourceRows=source.value; rawRows=[];
    }
    const filtered=applyRowFilter(sourceRows,rawRows,def.filter,root);
    views[alias]=filtered.rows; rawRowsByPath.set(`views.${alias}`,filtered.rawRows);
    (root.views as Record<string,unknown[]>)[alias]=filtered.rows;
    resolving.delete(alias); resolved.add(alias); return filtered.rows;
  };
  for(const alias of byAlias.keys()) resolveOne(alias);
  return {views,rawRowsByPath};
}

function calculatedDependencies(def:import('@document-tool/contracts').CalculatedFieldDefinition):string[]{
  const paths=[def.value.path,def.value.targetPath,...(def.value.formulaBindings ?? []).flatMap((b)=>[b.path,b.targetPath])].filter((x):x is string=>!!x);
  return [...new Set(paths.filter((path)=>path.startsWith('calc.')).map((path)=>path.slice(5).split('.')[0]!).filter(Boolean))];
}

function resolveNamedCalculatedFields(definitions:import('@document-tool/contracts').CalculatedFieldDefinition[], root:Record<string,unknown>, sourcePair:(sourcePath:string)=>SourceRowsWithRaw):void {
  const byAlias=new Map<string,import('@document-tool/contracts').CalculatedFieldDefinition>();
  for(const def of definitions){
    const alias=String(def.alias ?? '').trim();
    if(!alias || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`Invalid calculated field alias "${alias}".`);
    if(byAlias.has(alias)) throw new Error(`Duplicate calculated field alias "${alias}".`);
    byAlias.set(alias,def);
  }
  const resolving=new Set<string>(); const resolved=new Set<string>();
  const resolveOne=(alias:string):unknown=>{
    if(resolved.has(alias)) return (root.calc as Record<string,unknown>)[alias];
    if(resolving.has(alias)) throw new Error(`CALCULATED_FIELD_CYCLE: ${[...resolving,alias].join(' -> ')}`);
    const def=byAlias.get(alias); if(!def) return undefined;
    resolving.add(alias);
    for(const dependency of calculatedDependencies(def)) if(byAlias.has(dependency)) resolveOne(dependency);
    const sourcePath=def.value.sourcePath ?? 'items'; const pair=sourcePair(sourcePath);
    const value=evaluateAggregateRaw(def.value,root,pair.rows,pair.rawRows,sourcePath);
    (root.calc as Record<string,unknown>)[alias]=value;
    resolving.delete(alias); resolved.add(alias); return value;
  };
  for(const alias of byAlias.keys()) resolveOne(alias);
}


function resolveRichText(text:string, fieldTokens:Record<string,{format?:DisplayFormatDefinition;fallback?:string}>|undefined, root:Record<string,unknown>, warnings:TemplateWarning[], blockId:string):string {
  // Escape literal opening braces with \{{. Malformed tokens remain literal text.
  const ESC='\uE000';
  const source=String(text ?? '').replace(/\\\{\\\{/g,ESC);
  const resolved=source.replace(/\{\{([^{}\n]+)\}\}/g, (full, rawPath:string) => {
    const path=String(rawPath).trim();
    if(!path) return full;
    const result=resolvePath(root,path);
    const settings=fieldTokens?.[path];
    if(!result.found || result.value == null){
      warnings.push({code:'FIELD_VALUE_MISSING',message:`No preview value found for ${path}.`,blockId,path});
      return settings?.fallback ?? '';
    }
    return displayString(result.value,settings?.format);
  });
  return resolved.replace(new RegExp(ESC,'g'),'{{');
}

function resolveTableColumnValue(column:TableColumnDefinition,item:unknown,rawRow:unknown,rowIndex:number,sourcePath:string,root?:Record<string,unknown>):string|number|boolean|null {
  const kind=column.kind ?? 'SOURCE';
  if(kind==='ROW_NUMBER') return rowIndex+1;
  if(kind==='STATIC_TEXT') return formatDisplayValue(column.staticValue ?? '',column.format);
  if(kind==='FORMULA'){
    try { return formatDisplayValue(evaluateFormula(column.formulaExpression ?? '',column.formulaBindings ?? [],{rows:[item],rawRows:rawRow?[rawRow]:[],defaultSourcePath:sourcePath,root}),column.format); }
    catch { return ''; }
  }
  const resolved=resolvePath(item,column.path);
  let value=resolved.found?resolved.value:undefined;
  if(value===undefined && column.sourceField && rawRow && typeof rawRow==='object') value=(rawRow as Record<string,unknown>)[column.sourceField];
  if(kind==='IMAGE') return typeof value==='string'?value:'';
  if(kind==='QR'){
    const text=value==null?'':String(value);
    return text?createQrSvgDataUrl(text,column.qr?.errorCorrection ?? 'M',column.qr?.margin ?? 4):'';
  }
  if(value==null) return null;
  // Backward compatibility: ordinary SOURCE columns historically preserved the
  // native scalar type in RenderModel rows (for example Qty stayed number 2,
  // not display string "2"). Phase 4.10 formatting is opt-in: only an
  // explicit non-RAW display format (or RAW with prefix/suffix) should convert
  // the source value to display text. This keeps existing templates/tests and
  // downstream renderer/type-sensitive consumers stable while still allowing
  // PERCENT/NUMBER/CURRENCY formatting when configured.
  const format=column.format;
  const rawWithoutDecoration=!format || ((format.type ?? 'RAW')==='RAW' && !format.prefix && !format.suffix);
  if(rawWithoutDecoration && (typeof value==='string' || typeof value==='number' || typeof value==='boolean')) return value;
  return formatDisplayValue(value,format);
}

function evaluateAggregateRaw(def: AggregateValueDefinition, root: Record<string, unknown>, sourceRows: unknown[], rawRows: unknown[] = [], defaultSourcePath?: string): unknown {
  if (def.operation === 'STATIC') return def.staticValue ?? '';
  if (def.operation === 'FIELD' || def.operation === 'CALCULATED') {
    const r = resolvePath(root, def.path ?? def.targetPath ?? '');
    return r.found ? r.value : '';
  }
  if (def.operation === 'FORMULA') {
    return evaluateFormula(def.expression ?? '', def.formulaBindings ?? [], { rows: sourceRows, rawRows, defaultSourcePath: def.sourcePath ?? defaultSourcePath, root });
  }
  const rows = sourceRows;
  if (def.operation === 'COUNT') {
    if (!def.path && !def.sourceField && !def.targetPath) return rows.length;
    return rows.filter((row, index) => resolveAggregateCell(row, rawRows[index], def, defaultSourcePath).found).length;
  }
  const resolved = rows.map((row, index) => resolveAggregateCell(row, rawRows[index], def, defaultSourcePath));
  if (def.operation === 'FIRST') return resolved.find((r) => r.found)?.value ?? '';
  const nums = resolved.filter((r) => r.found).map((r) => Number(r.value)).filter(Number.isFinite);
  if (def.operation === 'SUM') return nums.reduce((a,b) => a+b, 0);
  if (def.operation === 'AVG') return nums.length ? nums.reduce((a,b) => a+b,0)/nums.length : 0;
  if (def.operation === 'MIN') return nums.length ? Math.min(...nums) : 0;
  if (def.operation === 'MAX') return nums.length ? Math.max(...nums) : 0;
  return '';
}

function evaluateAggregate(def: AggregateValueDefinition, root: Record<string, unknown>, sourceRows: unknown[], rawRows: unknown[] = [], defaultSourcePath?: string): string | number {
  const prefix = def.prefix ?? ''; const suffix = def.suffix ?? '';
  let value = evaluateAggregateRaw(def, root, sourceRows, rawRows, defaultSourcePath);
  if (def.displayFormat) {
    const formatted = formatDisplayValue(value, def.displayFormat);
    return formatted == null ? '' : formatted as string|number;
  }
  if (def.format === 'WORDS') {
    const numeric = Number(value);
    value = Number.isFinite(numeric) ? numberToWords(numeric) : String(value ?? '');
  } else if (typeof value === 'number' && (def.format === 'NUMBER' || def.decimals !== undefined)) {
    value = value.toFixed(def.decimals ?? 2);
  }
  return `${prefix}${value == null ? '' : String(value)}${suffix}`;
}

function resolveAggregateCell(row: unknown, rawRow: unknown, def: AggregateValueDefinition, defaultSourcePath?: string) {
  const sourcePath = def.sourcePath ?? defaultSourcePath;
  const candidates = Array.from(new Set([def.path, def.targetPath].filter((value): value is string => !!value)));
  for (const candidate of candidates) {
    const resolved = resolveAggregatePath(row, candidate, sourcePath);
    if (resolved.found) return resolved;
  }

  // Generate mappings retain the original imported header. This fallback is
  // critical for compact/lazy groups and for templates created before a role/path change.
  if (def.sourceField && rawRow && typeof rawRow === 'object') {
    const raw = resolvePath(rawRow, def.sourceField);
    if (raw.found) return raw;
    const directRaw = (rawRow as Record<string, unknown>)[def.sourceField];
    if (directRaw !== undefined) return { found: true, value: directRaw };
  }
  return { found: false, value: undefined };
}

function resolveAggregatePath(row: unknown, path: string, sourcePath?: string) {
  if (!path) return { found: false, value: undefined };
  const attempts = new Set<string>();
  attempts.add(path);

  // Aggregates operate on one collection row at a time. A Generate mapping may
  // store the canonical path as `items.finalAmount`, while a row may be either
  // `{ items: { finalAmount: 10 } }` (mapped shape) or `{ finalAmount: 10 }`
  // (renderer/table-relative shape). Support both without changing the template.
  if (sourcePath && path.startsWith(`${sourcePath}.`)) attempts.add(path.slice(sourcePath.length + 1));

  const parts = path.split('.').filter(Boolean);
  if (parts.length > 1) {
    attempts.add(parts[parts.length - 1]!);
    // Some legacy mappings use `fields.x` while line-item rows were normalized
    // beneath the active collection root. Try the suffix below either wrapper.
    if (parts[0] === 'fields' || parts[0] === sourcePath) attempts.add(parts.slice(1).join('.'));
  }

  for (const candidate of attempts) {
    const result = resolvePath(row, candidate);
    if (result.found) return result;
  }

  // If the row itself contains the collection wrapper, explicitly resolve the
  // relative path inside it as a final mapped-shape fallback.
  if (sourcePath && row && typeof row === 'object') {
    const wrapper = resolvePath(row, sourcePath);
    if (wrapper.found && wrapper.value && typeof wrapper.value === 'object') {
      const relative = path.startsWith(`${sourcePath}.`) ? path.slice(sourcePath.length + 1) : path;
      const nested = resolvePath(wrapper.value, relative);
      if (nested.found) return nested;
    }
  }
  return { found: false, value: undefined };
}


function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const decimals = Math.round((absolute - whole) * 100);
  const wholeWords = integerToWords(whole);
  const decimalWords = decimals ? ` and ${integerToWords(decimals)} Paise` : '';
  return `${negative ? 'Minus ' : ''}${wholeWords}${decimalWords}`.trim();
}
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const under1000 = (x:number) => {
    const out:string[]=[];
    if (x>=100) { out.push(`${ones[Math.floor(x/100)]} Hundred`); x%=100; }
    if (x>=20) { out.push(tens[Math.floor(x/10)]); if (x%10) out.push(ones[x%10]); }
    else if (x>0) out.push(ones[x]);
    return out.join(' ');
  };
  const units:[[number,string],...[number,string][]] = [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand']];
  let x=n; const parts:string[]=[];
  for (const [size,name] of units) if (x>=size) { const q=Math.floor(x/size); parts.push(`${integerToWords(q)} ${name}`); x%=size; }
  if (x) parts.push(under1000(x));
  return parts.join(' ');
}

function display(value: unknown): string {
  return value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
