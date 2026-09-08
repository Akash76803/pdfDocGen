import type {
  BlockLayout,
  BoxStyle,
  CellStyle,
  FontFamily,
  RowChildBlock,
  TableBlock,
  SummaryTableBlock,
  AggregateValueDefinition,
  TemplateBlock,
  TemplateDefinition,
  TemplateValidationIssue,
  TemplateValidationResult,
  TextStyle,
  VisibilityRule,
} from '@document-tool/contracts';
import { OFFLINE_FONT_FAMILIES, PAGE_SIZE_OPTIONS, getPageDimensions } from '@document-tool/contracts';
import { isSafePath } from './path-resolver.js';
import { validateFormulaExpression } from './formula-engine.js';

const VALID_TYPES = new Set(['TEXT', 'FIELD', 'TABLE', 'SUMMARY_TABLE', 'CUSTOM_TABLE', 'IMAGE', 'SPACER', 'DIVIDER', 'BOX', 'ROW']);
const VALID_ALIGN = new Set(['LEFT', 'CENTER', 'RIGHT']);
const VALID_VERTICAL_ALIGN = new Set(['TOP', 'CENTER', 'BOTTOM']);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
const REMOTE = /^(?:https?:|javascript:|data:text\/html)/i;

export class TemplateValidator {
  validate(template: TemplateDefinition): TemplateValidationResult {
    const errors: TemplateValidationIssue[] = [];
    const warnings: TemplateValidationIssue[] = [];

    if (!template.name.trim()) errors.push({ code: 'TEMPLATE_NAME_REQUIRED', message: 'Template name is required.' });
    if (!PAGE_SIZE_OPTIONS.includes(template.page.size)) errors.push({ code: 'PAGE_SIZE_INVALID', message: 'Unsupported page size.' });
    if (template.page.size === 'CUSTOM' && ((!Number.isFinite(template.page.customWidthMm) || (template.page.customWidthMm ?? 0) <= 0) || (!Number.isFinite(template.page.customHeightMm) || (template.page.customHeightMm ?? 0) <= 0))) errors.push({ code: 'PAGE_SIZE_INVALID', message: 'Custom page width and height must be greater than zero.' });
    if (!['PORTRAIT', 'LANDSCAPE'].includes(template.page.orientation)) errors.push({ code: 'PAGE_ORIENTATION_INVALID', message: 'Unsupported page orientation.' });

    const margins = template.page.margins;
    const resolved = getPageDimensions(template.page);
    const dims = { w: resolved.widthMm, h: resolved.heightMm };
    if (
      [margins.top, margins.right, margins.bottom, margins.left].some((value) => !Number.isFinite(value) || value < 0) ||
      margins.top + margins.bottom >= dims.h ||
      margins.left + margins.right >= dims.w
    ) {
      errors.push({ code: 'PAGE_MARGIN_INVALID', message: 'Page margins are invalid or consume the page.' });
    }


    const pageBorder = template.page.border;
    if (template.page.backgroundColor !== undefined && !HEX.test(template.page.backgroundColor)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Page background color must be a valid HEX color.' });
    if (pageBorder?.enabled) {
      if (pageBorder.style !== undefined && !['NONE','SOLID','DASHED'].includes(pageBorder.style)) errors.push({ code: 'PAGE_BORDER_INVALID', message: 'Page border style is invalid.' });
      if (pageBorder.width !== undefined && (!Number.isFinite(pageBorder.width) || pageBorder.width < 0)) errors.push({ code: 'PAGE_BORDER_INVALID', message: 'Page border width must be zero or greater.' });
      if (pageBorder.color !== undefined && !HEX.test(pageBorder.color)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Page border color must be a valid HEX color.' });
      if (pageBorder.offset !== undefined && (!Number.isFinite(pageBorder.offset) || pageBorder.offset < 0)) errors.push({ code: 'PAGE_BORDER_INVALID', message: 'Page border offset must be zero or greater.' });
    }

    this.validateDataViews(template, errors);
    this.validateCalculatedFields(template, errors);

    const ids = new Set<string>();
    for (const block of [...template.header.blocks, ...template.body.blocks, ...template.footer.blocks]) {
      this.validateBlock(block, ids, errors);
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  private validateDataViews(template: TemplateDefinition, errors: TemplateValidationIssue[]): void {
    const defs=template.dataViews ?? []; const aliases=new Set<string>();
    for(const def of defs){
      const alias=String(def.alias ?? '').trim();
      if(!alias || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) errors.push({code:'DATA_VIEW_INVALID',message:`Data View "${def.name || def.id}" requires a safe alias (letters, numbers and underscore; cannot start with a number).`});
      else if(aliases.has(alias)) errors.push({code:'DATA_VIEW_INVALID',message:`Data View alias "${alias}" is duplicated.`}); else aliases.add(alias);
      if(!def.sourcePath || !isSafePath(def.sourcePath)) errors.push({code:'DATA_VIEW_INVALID',message:`Data View "${alias || def.id}" requires a valid collection source path.`});
      this.validateVisibility(def.filter, def.id, errors, `Data View "${alias || def.name}" filter`);
    }
    const byAlias=new Map(defs.map((def)=>[def.alias,def] as const)); const visiting=new Set<string>(); const done=new Set<string>();
    const walk=(alias:string)=>{if(done.has(alias))return;if(visiting.has(alias)){errors.push({code:'DATA_VIEW_CYCLE',message:`Data View dependency cycle detected at "${alias}".`});return;}visiting.add(alias);const def=byAlias.get(alias);if(def?.sourcePath.startsWith('views.')){const dep=def.sourcePath.slice(6).split('.')[0]!;if(byAlias.has(dep))walk(dep);}visiting.delete(alias);done.add(alias);};
    for(const alias of byAlias.keys()) if(alias) walk(alias);
  }

  private validateCalculatedFields(template: TemplateDefinition, errors: TemplateValidationIssue[]): void {
    const defs=template.calculatedFields ?? []; const aliases=new Set<string>();
    for(const def of defs){
      const alias=String(def.alias ?? '').trim();
      if(!alias || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) errors.push({code:'CALCULATED_FIELD_INVALID',message:`Calculated field "${def.name || def.id}" requires a safe alias.`});
      else if(aliases.has(alias)) errors.push({code:'CALCULATED_FIELD_INVALID',message:`Calculated field alias "${alias}" is duplicated.`}); else aliases.add(alias);
      this.validateAggregate(def.value, def.id, errors);
    }
    const byAlias=new Map(defs.map((def)=>[def.alias,def] as const)); const visiting=new Set<string>(); const done=new Set<string>();
    const dependencies=(def:(typeof defs)[number])=>[def.value.path,def.value.targetPath,...(def.value.formulaBindings ?? []).flatMap((binding)=>[binding.path,binding.targetPath])].filter((path):path is string=>!!path&&path.startsWith('calc.')).map((path)=>path.slice(5).split('.')[0]!);
    const walk=(alias:string)=>{if(done.has(alias))return;if(visiting.has(alias)){errors.push({code:'CALCULATED_FIELD_CYCLE',message:`Calculated field dependency cycle detected at "${alias}".`});return;}visiting.add(alias);const def=byAlias.get(alias);if(def)for(const dep of dependencies(def))if(byAlias.has(dep))walk(dep);visiting.delete(alias);done.add(alias);};
    for(const alias of byAlias.keys()) if(alias) walk(alias);
  }

  private validateBlock(block: TemplateBlock, ids: Set<string>, errors: TemplateValidationIssue[]): void {
    if (ids.has(block.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Block id "${block.id}" is duplicated.`, blockId: block.id });
    else ids.add(block.id);

    if (!VALID_TYPES.has(block.type)) {
      errors.push({ code: 'UNSUPPORTED_BLOCK_TYPE', message: `Unsupported block type ${(block as TemplateBlock).type}.`, blockId: block.id });
      return;
    }

    this.validateLayout(block.layout, block.id, errors);
    this.validateVisibility(block.visibility, block.id, errors);

    if (block.type === 'ROW') {
      const hasGridColumns = !!block.columns?.length;
      if (!hasGridColumns && block.children.length === 0) errors.push({ code: 'ROW_CHILD_REQUIRED', message: 'Row requires at least one child block or grid column.', blockId: block.id });
      if (block.columns && block.columns.length === 0) errors.push({ code: 'ROW_COLUMN_REQUIRED', message: 'Grid row requires at least one column.', blockId: block.id });
      if (block.gap !== undefined && (!Number.isFinite(block.gap) || block.gap < 0)) errors.push({ code: 'ROW_GAP_INVALID', message: 'Row gap must be zero or greater.', blockId: block.id });
      if (block.verticalAlignment !== undefined && !VALID_VERTICAL_ALIGN.has(block.verticalAlignment)) errors.push({ code: 'ROW_VERTICAL_ALIGNMENT_INVALID', message: 'Row vertical alignment is invalid.', blockId: block.id });
      if (hasGridColumns) {
        let total = 0;
        for (const column of block.columns!) {
          if (ids.has(column.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Row column id "${column.id}" is duplicated.`, blockId: block.id }); else ids.add(column.id);
          if (column.widthPercent !== undefined) {
            if (!Number.isFinite(column.widthPercent) || column.widthPercent <= 0 || column.widthPercent > 100) errors.push({ code: 'BLOCK_WIDTH_INVALID', message: 'Row column width must be greater than 0 and at most 100%.', blockId: block.id });
            else total += column.widthPercent;
          }
          this.validateCellStyle(column.style, block.id, errors);
          for (const child of column.children) this.validateRowChild(child, ids, errors);
        }
        if (total > 100) errors.push({ code: 'ROW_COLUMN_WIDTH_TOTAL_INVALID', message: `Explicit row column widths total ${total}% and must not exceed 100%.`, blockId: block.id });
      } else {
        let total = 0;
        for (const child of block.children) {
          this.validateRowChild(child, ids, errors);
          const width = child.layout?.widthPercent;
          if (width !== undefined && Number.isFinite(width) && width > 0 && width <= 100) total += width;
        }
        if (total > 100) errors.push({ code: 'ROW_CHILD_WIDTH_TOTAL_INVALID', message: `Explicit row child widths total ${total}% and must not exceed 100%.`, blockId: block.id });
      }
      return;
    }

    if (block.type === 'BOX') {
      this.validateBoxStyle(block.style, block.id, errors);
      for (const child of block.children) this.validateRowChild(child, ids, errors);
      return;
    }

    if (block.type === 'CUSTOM_TABLE') {
      if (!Number.isInteger(block.rowCount) || block.rowCount < 1 || block.rowCount > 100 || !Number.isInteger(block.columnCount) || block.columnCount < 1 || block.columnCount > 50) {
        errors.push({ code: 'CUSTOM_TABLE_INVALID', message: 'Custom table requires 1-100 rows and 1-50 columns.', blockId: block.id });
        return;
      }
      const occupied = new Set<string>();
      for (const cell of block.cells) {
        if (ids.has(cell.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Custom table cell id "${cell.id}" is duplicated.`, blockId: block.id }); else ids.add(cell.id);
        const rowSpan = cell.rowSpan ?? 1; const colSpan = cell.colSpan ?? 1;
        if (!Number.isInteger(rowSpan) || rowSpan < 1 || !Number.isInteger(colSpan) || colSpan < 1 || cell.row < 0 || cell.column < 0 || cell.row + rowSpan > block.rowCount || cell.column + colSpan > block.columnCount) {
          errors.push({ code: 'CUSTOM_TABLE_SPAN_INVALID', message: 'Custom table cell span exceeds the grid boundary.', blockId: block.id });
          continue;
        }
        const anchorKey = `${cell.row}:${cell.column}`;
        // A normal 1x1 base cell can be covered by a preceding merged anchor; it is
        // intentionally retained so Reset Merge restores its previous content.
        if (occupied.has(anchorKey)) {
          if (rowSpan > 1 || colSpan > 1) errors.push({ code: 'CUSTOM_TABLE_OVERLAP', message: `Merged custom table cells overlap at row ${cell.row + 1}, column ${cell.column + 1}.`, blockId: block.id });
          continue;
        }
        for (let r = cell.row; r < cell.row + rowSpan; r++) for (let c = cell.column; c < cell.column + colSpan; c++) occupied.add(`${r}:${c}`);
        this.validateCellStyle(cell.style, block.id, errors);
        if (cell.content.type === 'FIELD' && (!cell.content.path || !isSafePath(cell.content.path))) errors.push({ code: 'FIELD_PATH_REQUIRED', message: 'Custom table field cell requires a valid safe path.', blockId: block.id });
        if (cell.content.type === 'VALUE' && cell.content.value) this.validateAggregate(cell.content.value, block.id, errors);
        if (cell.content.type === 'IMAGE') {
          if (cell.content.sourceType === 'DATA_URL' && cell.content.source && !DATA_IMAGE.test(cell.content.source)) errors.push({ code: 'IMAGE_SOURCE_INVALID', message: 'Custom table image must be PNG, JPEG, or WEBP data URL.', blockId: block.id });
          if (cell.content.sourceType === 'LOCAL_ASSET' && cell.content.source && REMOTE.test(cell.content.source)) errors.push({ code: 'IMAGE_SOURCE_INVALID', message: 'Custom table local image must be a safe non-remote asset path.', blockId: block.id });
        }
        this.validateTextStyle(cell.content.style, block.id, errors);
      }
      return;
    }

    if (block.type === 'TABLE') this.validateTable(block, errors);
    else if (block.type === 'SUMMARY_TABLE') this.validateSummaryTable(block, errors);
    else this.validateCommonBlock(block, errors);
  }

  private validateRowChild(child: RowChildBlock, ids: Set<string>, errors: TemplateValidationIssue[]): void {
    if (ids.has(child.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Block id "${child.id}" is duplicated.`, blockId: child.id });
    else ids.add(child.id);
    this.validateLayout(child.layout, child.id, errors);
    this.validateVisibility(child.visibility, child.id, errors);
    if (child.type === 'BOX') { this.validateBoxStyle(child.style, child.id, errors); for (const nested of child.children) this.validateRowChild(nested, ids, errors); }
    else if (child.type === 'TABLE') this.validateTable(child, errors);
    else if (child.type === 'SUMMARY_TABLE') this.validateSummaryTable(child, errors);
    else this.validateCommonBlock(child, errors);
  }

  private validateCommonBlock(block: Exclude<TemplateBlock, { type: 'TABLE' | 'SUMMARY_TABLE' | 'ROW' }>, errors: TemplateValidationIssue[]): void {
    if (block.type === 'TEXT') this.validateTextStyle(block.style, block.id, errors);

    if (block.type === 'FIELD') {
      if (!isSafePath(block.path)) errors.push({ code: 'FIELD_PATH_REQUIRED', message: 'Dynamic field requires a valid safe path.', blockId: block.id });
      this.validateTextStyle(block.labelStyle, block.id, errors);
      this.validateTextStyle(block.valueStyle, block.id, errors);
      if (block.textAlignment !== undefined && !VALID_ALIGN.has(block.textAlignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Field text alignment is invalid.', blockId: block.id });
      if (block.spacing !== undefined && (!Number.isFinite(block.spacing) || block.spacing < 0)) errors.push({ code: 'BLOCK_MARGIN_INVALID', message: 'Field spacing must be zero or greater.', blockId: block.id });
    }

    if (block.type === 'IMAGE') {
      if (block.sourceType === 'DATA_URL' && !DATA_IMAGE.test(block.source)) errors.push({ code: 'IMAGE_SOURCE_INVALID', message: 'Image must be a PNG, JPEG, or WEBP data URL.', blockId: block.id });
      if (block.sourceType === 'LOCAL_ASSET' && REMOTE.test(block.source)) errors.push({ code: 'IMAGE_SOURCE_INVALID', message: 'Local image source must be a safe non-remote asset path.', blockId: block.id });
      if (block.width !== undefined && (!Number.isFinite(block.width) || block.width <= 0)) errors.push({ code: 'IMAGE_SIZE_INVALID', message: 'Image width must be greater than zero.', blockId: block.id });
      if (block.height !== undefined && (!Number.isFinite(block.height) || block.height <= 0)) errors.push({ code: 'IMAGE_SIZE_INVALID', message: 'Image height must be greater than zero.', blockId: block.id });
      if (block.alignment !== undefined && !VALID_ALIGN.has(block.alignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Image alignment is invalid.', blockId: block.id });
    }

    if (block.type === 'SPACER' && (!Number.isFinite(block.height) || block.height < 0)) errors.push({ code: 'SPACER_HEIGHT_INVALID', message: 'Spacer height must be zero or greater.', blockId: block.id });

    if (block.type === 'DIVIDER') {
      if (!Number.isFinite(block.thickness) || block.thickness <= 0) errors.push({ code: 'DIVIDER_STYLE_INVALID', message: 'Divider thickness must be greater than zero.', blockId: block.id });
      if (block.color !== undefined && !HEX.test(block.color)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Divider color must be a 3 or 6 digit HEX color.', blockId: block.id });
      if (block.style !== undefined && !['NONE', 'SOLID', 'DASHED'].includes(block.style)) errors.push({ code: 'DIVIDER_STYLE_INVALID', message: 'Divider style is invalid.', blockId: block.id });
    }
  }

  private validateBoxStyle(style: BoxStyle | undefined, blockId: string, errors: TemplateValidationIssue[]): void {
    if (!style) return;
    if (style.widthMode === 'PERCENT' && (style.widthPercent === undefined || !Number.isFinite(style.widthPercent) || style.widthPercent <= 0 || style.widthPercent > 100)) errors.push({ code:'CELL_STYLE_INVALID', message:'Box percentage width must be greater than 0 and at most 100%.', blockId });
    if (style.widthMode === 'FIXED_MM' && (style.widthMm === undefined || !Number.isFinite(style.widthMm) || style.widthMm <= 0)) errors.push({ code:'CELL_STYLE_INVALID', message:'Box fixed width must be greater than zero.', blockId });
    if (style.heightMode === 'FIXED' && (style.heightMm === undefined || !Number.isFinite(style.heightMm) || style.heightMm < 0)) errors.push({ code:'CELL_STYLE_INVALID', message:'Box fixed height is required and must be zero or greater.', blockId });
    if (style.minHeightMm !== undefined && (!Number.isFinite(style.minHeightMm) || style.minHeightMm < 0)) errors.push({ code:'CELL_STYLE_INVALID', message:'Box minimum height must be zero or greater.', blockId });
    if (style.borderRadiusMm !== undefined && (!Number.isFinite(style.borderRadiusMm) || style.borderRadiusMm < 0)) errors.push({ code:'CELL_STYLE_INVALID', message:'Box corner radius must be zero or greater.', blockId });
    if (style.backgroundColor !== undefined && !HEX.test(style.backgroundColor)) errors.push({ code:'STYLE_COLOR_INVALID', message:'Box background must be a valid HEX color.', blockId });
    if (style.horizontalAlignment !== undefined && !VALID_ALIGN.has(style.horizontalAlignment)) errors.push({ code:'STYLE_ALIGNMENT_INVALID', message:'Box horizontal alignment is invalid.', blockId });
    if (style.verticalAlignment !== undefined && !VALID_VERTICAL_ALIGN.has(style.verticalAlignment)) errors.push({ code:'ROW_VERTICAL_ALIGNMENT_INVALID', message:'Box vertical alignment is invalid.', blockId });
    const padding=style.padding; if (padding && Object.values(padding).some((value)=>value!==undefined&&(!Number.isFinite(value)||value<0))) errors.push({ code:'CELL_STYLE_INVALID', message:'Box padding must be zero or greater.', blockId });
    const border=style.border; if(border){const width=border.width??border.thickness;if(width!==undefined&&(!Number.isFinite(width)||width<0)) errors.push({code:'CELL_STYLE_INVALID',message:'Box border width must be zero or greater.',blockId});if(border.color!==undefined&&!HEX.test(border.color)) errors.push({code:'STYLE_COLOR_INVALID',message:'Box border color must be a valid HEX color.',blockId});if(border.style!==undefined&&!['NONE','SOLID','DASHED','DOTTED'].includes(border.style)) errors.push({code:'CELL_STYLE_INVALID',message:'Box border style is invalid.',blockId});}
  }

  private validateCellStyle(style: CellStyle | undefined, blockId: string, errors: TemplateValidationIssue[]): void {
    if (!style) return;
    this.validateBoxStyle(style, blockId, errors);
    if (style.backgroundColor !== undefined && !HEX.test(style.backgroundColor)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Cell background must be a valid HEX color.', blockId });
    if (style.minHeight !== undefined && (!Number.isFinite(style.minHeight) || style.minHeight < 0)) errors.push({ code: 'CELL_STYLE_INVALID', message: 'Cell minimum height must be zero or greater.', blockId });
    if (style.horizontalAlignment !== undefined && !VALID_ALIGN.has(style.horizontalAlignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Cell horizontal alignment is invalid.', blockId });
    if (style.verticalAlignment !== undefined && !VALID_VERTICAL_ALIGN.has(style.verticalAlignment)) errors.push({ code: 'ROW_VERTICAL_ALIGNMENT_INVALID', message: 'Cell vertical alignment is invalid.', blockId });
    const padding = style.padding;
    if (padding && Object.values(padding).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) errors.push({ code: 'CELL_STYLE_INVALID', message: 'Cell padding must be zero or greater.', blockId });
    const border = style.border;
    if (border) {
      const width = border.width ?? border.thickness;
      if (width !== undefined && (!Number.isFinite(width) || width < 0)) errors.push({ code: 'CELL_STYLE_INVALID', message: 'Cell border width must be zero or greater.', blockId });
      if (border.color !== undefined && !HEX.test(border.color)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Cell border color must be a valid HEX color.', blockId });
      if (border.style !== undefined && !['NONE','SOLID','DASHED','DOTTED'].includes(border.style)) errors.push({ code: 'CELL_STYLE_INVALID', message: 'Cell border style is invalid.', blockId });
    }
  }


  private validateAggregate(value: AggregateValueDefinition, blockId: string, errors: TemplateValidationIssue[]): void {
    const operation = value.operation;
    if (!['STATIC','FIELD','CALCULATED','SUM','FIRST','COUNT','AVG','MIN','MAX','FORMULA'].includes(operation)) {
      errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Unsupported summary calculation operation.', blockId });
      return;
    }
    if (operation === 'STATIC' && value.staticValue === undefined) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Static summary value is required.', blockId });
    if (operation === 'FORMULA') {
      const issue = validateFormulaExpression(value.expression ?? '', value.formulaBindings ?? []);
      if (issue) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: `Formula: ${issue}`, blockId });
    }
    const bindingPath = value.path ?? value.targetPath;
    if (operation === 'FIELD' && (!bindingPath || !isSafePath(bindingPath))) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Summary field requires a valid path.', blockId });
    if (operation === 'CALCULATED' && (!bindingPath || !isSafePath(bindingPath) || !bindingPath.startsWith('calc.'))) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Calculated value requires a valid calc.<alias> path.', blockId });
    if (['SUM','FIRST','AVG','MIN','MAX'].includes(operation) && ((!bindingPath && !value.sourceField) || (bindingPath !== undefined && !isSafePath(bindingPath)))) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: `${operation} requires a valid summary binding.`, blockId });
    if (value.sourcePath !== undefined && !isSafePath(value.sourcePath)) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Summary source path is invalid.', blockId });
    if (value.decimals !== undefined && (!Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 8)) errors.push({ code: 'SUMMARY_VALUE_INVALID', message: 'Summary decimal places must be between 0 and 8.', blockId });
  }

  private validateSummaryTable(block: SummaryTableBlock, errors: TemplateValidationIssue[]): void {
    if (!block.columns.length) errors.push({ code: 'SUMMARY_COLUMN_REQUIRED', message: 'Summary table requires at least one column.', blockId: block.id });
    if (block.dataMode === 'GROUP_BY') {
      if (!block.sourcePath || !isSafePath(block.sourcePath)) errors.push({ code: 'SUMMARY_TABLE_INVALID', message: 'Grouped summary requires a valid source path.', blockId: block.id });
      if (!block.groupByPath || !isSafePath(block.groupByPath)) errors.push({ code: 'SUMMARY_TABLE_INVALID', message: 'Grouped summary requires a valid group-by path.', blockId: block.id });
    }
    if (block.tableStyle?.widthPercent !== undefined) this.validateWidth(block.tableStyle.widthPercent, block.id, errors);
    this.validateTextStyle(block.tableStyle?.headerStyle, block.id, errors);
    this.validateTextStyle(block.tableStyle?.cellStyle, block.id, errors);
    const columnIds = new Set<string>(); let total = 0;
    for (const column of block.columns) {
      if (columnIds.has(column.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Summary column id "${column.id}" is duplicated.`, blockId: block.id });
      columnIds.add(column.id);
      if (column.widthPercent !== undefined) { if (column.widthPercent <= 0 || column.widthPercent > 100) errors.push({ code:'TABLE_COLUMN_WIDTH_INVALID', message:'Summary column width must be greater than 0 and at most 100.', blockId:block.id }); else total += column.widthPercent; }
      this.validateTextStyle(column.style, block.id, errors);
    }
    if (total > 100) errors.push({ code:'TABLE_COLUMN_WIDTH_TOTAL_INVALID', message:`Explicit summary column widths total ${total}% and must not exceed 100%.`, blockId:block.id });
    for (const row of [...(block.rows ?? []), ...(block.totalRow ? [block.totalRow] : [])]) {
      for (const cell of row.cells) {
        if (!columnIds.has(cell.columnId)) errors.push({ code:'SUMMARY_TABLE_INVALID', message:'Summary cell references an unknown column.', blockId:block.id });
        this.validateAggregate(cell.value, block.id, errors);
        this.validateTextStyle(cell.style, block.id, errors);
      }
      this.validateTextStyle(row.style, block.id, errors);
    }
  }
  private validateTable(block: TableBlock, errors: TemplateValidationIssue[]): void {
    if (!isSafePath(block.sourcePath)) errors.push({ code: 'TABLE_SOURCE_REQUIRED', message: 'Table requires a valid source path.', blockId: block.id });
    this.validateVisibility(block.rowFilter, block.id, errors, 'Table row filter');
    if (block.columns.length === 0) errors.push({ code: 'TABLE_COLUMN_REQUIRED', message: 'Table requires at least one column.', blockId: block.id });
    if (block.tableStyle?.widthPercent !== undefined) this.validateWidth(block.tableStyle.widthPercent, block.id, errors);
    if (block.tableStyle?.alignment !== undefined && !VALID_ALIGN.has(block.tableStyle.alignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Table alignment is invalid.', blockId: block.id });
    this.validateTextStyle(block.tableStyle?.headerStyle, block.id, errors);
    this.validateTextStyle(block.tableStyle?.cellStyle, block.id, errors);

    const border = block.tableStyle?.border;
    if (border) {
      const width = border.width ?? border.thickness;
      if (width !== undefined && (!Number.isFinite(width) || width < 0)) errors.push({ code: 'TABLE_BORDER_INVALID', message: 'Table border width must be zero or greater.', blockId: block.id });
      if (border.color !== undefined && !HEX.test(border.color)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Table border color must be a valid HEX color.', blockId: block.id });
      if (border.style !== undefined && !['NONE', 'SOLID', 'DASHED', 'DOTTED'].includes(border.style)) errors.push({ code: 'TABLE_BORDER_INVALID', message: 'Table border style is invalid.', blockId: block.id });
    }

    const padding = block.tableStyle?.cellPadding;
    if (padding && Object.values(padding).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) errors.push({ code: 'BLOCK_MARGIN_INVALID', message: 'Table cell padding must be zero or greater.', blockId: block.id });

    const columnIds = new Set<string>();
    let total = 0;
    for (const column of block.columns) {
      const kind=column.kind ?? 'SOURCE';
      if (['SOURCE','IMAGE','QR'].includes(kind) && !isSafePath(column.path)) errors.push({ code: 'TABLE_COLUMN_PATH_REQUIRED', message: `Column "${column.label}" requires a valid path.`, blockId: block.id });
      if (kind==='FORMULA') { const issue=validateFormulaExpression(column.formulaExpression ?? '',column.formulaBindings ?? []); if(issue) errors.push({code:'TABLE_COLUMN_PATH_REQUIRED',message:`Column "${column.label}" formula: ${issue}`,blockId:block.id}); }
      this.validateVisibility(column.visibility, block.id, errors, `Column \"${column.label}\"`);
      if (column.format?.decimals !== undefined && (!Number.isInteger(column.format.decimals)||column.format.decimals<0||column.format.decimals>8)) errors.push({code:'TABLE_COLUMN_PATH_REQUIRED',message:`Column "${column.label}" decimal places must be between 0 and 8.`,blockId:block.id});
      if ((kind==='IMAGE'||kind==='QR') && column.imageWidthMm !== undefined && (!Number.isFinite(column.imageWidthMm)||column.imageWidthMm<=0)) errors.push({code:'IMAGE_SIZE_INVALID',message:`Column "${column.label}" image width must be greater than zero.`,blockId:block.id});
      if (columnIds.has(column.id)) errors.push({ code: 'BLOCK_ID_DUPLICATE', message: `Table column id "${column.id}" is duplicated.`, blockId: block.id });
      columnIds.add(column.id);
      if (column.widthPercent !== undefined) {
        if (!Number.isFinite(column.widthPercent) || column.widthPercent <= 0 || column.widthPercent > 100) errors.push({ code: 'TABLE_COLUMN_WIDTH_INVALID', message: `Column "${column.label}" width must be greater than 0 and at most 100.`, blockId: block.id });
        else total += column.widthPercent;
      }
      if (column.alignment !== undefined && !VALID_ALIGN.has(column.alignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: `Column "${column.label}" alignment is invalid.`, blockId: block.id });
      if (column.headerAlignment !== undefined && !VALID_ALIGN.has(column.headerAlignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: `Column "${column.label}" header alignment is invalid.`, blockId: block.id });
      this.validateTextStyle(column.headerStyle, block.id, errors);
      this.validateTextStyle(column.cellStyle, block.id, errors);
    }
    if (total > 100) errors.push({ code: 'TABLE_COLUMN_WIDTH_TOTAL_INVALID', message: `Explicit table column widths total ${total}% and must not exceed 100%.`, blockId: block.id });
    for(const group of block.headerGroups ?? []){if(!columnIds.has(group.startColumnId)||!Number.isInteger(group.colspan)||group.colspan<1||group.colspan>block.columns.length)errors.push({code:'TABLE_COLUMN_WIDTH_INVALID',message:`Header group "${group.label}" has an invalid start column or colspan.`,blockId:block.id});this.validateTextStyle(group.style,block.id,errors);}
    for (const row of block.footerRows ?? []) {
      if (!row.cells.length) errors.push({ code:'TABLE_FOOTER_INVALID', message:'Table footer row requires at least one cell.', blockId:block.id });
      for (const cell of row.cells) {
        if (cell.colspan !== undefined && (!Number.isInteger(cell.colspan) || cell.colspan < 1 || cell.colspan > block.columns.length)) errors.push({ code:'TABLE_FOOTER_INVALID', message:'Footer colspan is invalid.', blockId:block.id });
        this.validateAggregate(cell.value, block.id, errors);
        this.validateTextStyle(cell.style, block.id, errors);
      }
      this.validateTextStyle(row.style, block.id, errors);
    }
  }

  private validateVisibility(rule: VisibilityRule | undefined, blockId: string, errors: TemplateValidationIssue[], label = 'Block', depth = 0): void {
    if (!rule) return;
    if (depth > 8) { errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} visibility nesting is too deep.`, blockId }); return; }
    if ('path' in rule) {
      if (!isSafePath(rule.path)) errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} visibility requires a valid document field path.`, blockId });
      const allowed = new Set(['EQUALS','NOT_EQUALS','IS_EMPTY','NOT_EMPTY','GREATER_THAN','GREATER_OR_EQUAL','LESS_THAN','LESS_OR_EQUAL','IN','CONTAINS','NOT_CONTAINS','STARTS_WITH','ENDS_WITH']);
      if (!allowed.has(rule.operator)) errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} visibility operator is invalid.`, blockId });
      if (rule.operator === 'IN' && rule.values !== undefined && !Array.isArray(rule.values)) errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} IN visibility rule requires a values list.`, blockId });
      return;
    }
    if (!['ALL','ANY'].includes(rule.logic)) errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} visibility group logic is invalid.`, blockId });
    if (!Array.isArray(rule.conditions) || rule.conditions.length > 50) { errors.push({ code:'VISIBILITY_RULE_INVALID', message:`${label} visibility group can contain at most 50 conditions.`, blockId }); return; }
    rule.conditions.forEach((child) => this.validateVisibility(child, blockId, errors, label, depth + 1));
  }

  private validateLayout(layout: BlockLayout | undefined, blockId: string, errors: TemplateValidationIssue[]): void {
    if (!layout) return;
    if (layout.widthPercent !== undefined) this.validateWidth(layout.widthPercent, blockId, errors);
    if (layout.alignment !== undefined && !VALID_ALIGN.has(layout.alignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Block alignment is invalid.', blockId });
    for (const value of [layout.marginTop, layout.marginRight, layout.marginBottom, layout.marginLeft]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) errors.push({ code: 'BLOCK_MARGIN_INVALID', message: 'Block margins must be zero or greater.', blockId });
    }
  }

  private validateWidth(width: number, blockId: string, errors: TemplateValidationIssue[]): void {
    if (!Number.isFinite(width) || width <= 0 || width > 100) errors.push({ code: 'BLOCK_WIDTH_INVALID', message: 'Block width must be greater than 0 and at most 100%.', blockId });
  }

  private validateTextStyle(style: TextStyle | undefined, blockId: string, errors: TemplateValidationIssue[]): void {
    if (!style) return;
    if (style.fontFamily !== undefined && !OFFLINE_FONT_FAMILIES.includes(style.fontFamily as FontFamily)) errors.push({ code: 'STYLE_FONT_FAMILY_INVALID', message: `Unsupported offline font family "${style.fontFamily}".`, blockId });
    if (style.fontSize !== undefined && (!Number.isFinite(style.fontSize) || style.fontSize < 6 || style.fontSize > 96)) errors.push({ code: 'STYLE_FONT_SIZE_INVALID', message: 'Font size must be between 6 and 96.', blockId });
    for (const color of [style.textColor, style.backgroundColor]) if (color !== undefined && !HEX.test(color)) errors.push({ code: 'STYLE_COLOR_INVALID', message: 'Colors must use 3 or 6 digit HEX values.', blockId });
    if (style.alignment !== undefined && !VALID_ALIGN.has(style.alignment)) errors.push({ code: 'STYLE_ALIGNMENT_INVALID', message: 'Text alignment is invalid.', blockId });
    if (style.lineHeight !== undefined && (!Number.isFinite(style.lineHeight) || style.lineHeight <= 0)) errors.push({ code: 'STYLE_FONT_SIZE_INVALID', message: 'Line height must be greater than zero.', blockId });
  }
}
