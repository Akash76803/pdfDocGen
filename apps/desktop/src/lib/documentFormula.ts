export type DocumentFormulaFormat = 'number' | 'decimal' | 'currency' | 'percentage';

export type DocumentFormulaDefinition = {
  id: string;
  name: string;
  expression: string;
  format: DocumentFormulaFormat;
  precision: number;
  currency?: string;
};

export type FormulaField = { name: string; label?: string };

type EvalContext = {
  currentRecord: Record<string, unknown> | null;
  rows: Array<Record<string, unknown>>;
  fields: FormulaField[];
  formulas: DocumentFormulaDefinition[];
  cache: Map<string, number>;
  stack: Set<string>;
};

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '!=' }
  | { kind: 'lparen' | 'rparen' | 'comma' };

export function validateDocumentFormula(expression: string): string | null {
  try {
    new Parser(tokenize(expression), {
      currentRecord: {}, rows: [], fields: [], formulas: [], cache: new Map(), stack: new Set(),
    }, true).parse();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid formula.';
  }
}

export function evaluateDocumentFormulas(
  definitions: DocumentFormulaDefinition[],
  currentRecord: Record<string, unknown> | null,
  rows: Array<Record<string, unknown>>,
  fields: FormulaField[],
) {
  const cache = new Map<string, number>();
  const errors = new Map<string, string>();
  const context: EvalContext = { currentRecord, rows, fields, formulas: definitions, cache, stack: new Set() };
  for (const formula of definitions) {
    try { evaluateOne(formula, context); }
    catch (error) { errors.set(formula.id, error instanceof Error ? error.message : 'Invalid formula.'); }
  }
  const values: Record<string, number> = {};
  for (const formula of definitions) {
    const value = cache.get(formula.id);
    if (value !== undefined) values[formula.name] = value;
  }
  return { values, errors };
}

export function formatDocumentFormulaValue(value: number | undefined, definition: DocumentFormulaDefinition | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '';
  const precision = Math.max(0, Math.min(8, definition?.precision ?? 2));
  if (definition?.format === 'currency') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: definition.currency || 'INR', minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value);
  }
  if (definition?.format === 'percentage') {
    return new Intl.NumberFormat('en-IN', { style: 'percent', minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value / 100);
  }
  if (definition?.format === 'decimal') {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value);
  }
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: precision }).format(value);
}

function evaluateOne(definition: DocumentFormulaDefinition, context: EvalContext): number {
  const cached = context.cache.get(definition.id);
  if (cached !== undefined) return cached;
  if (context.stack.has(definition.id)) throw new Error(`Circular formula reference: ${definition.name}`);
  context.stack.add(definition.id);
  try {
    const value = new Parser(tokenize(definition.expression), context, false).parse();
    if (!Number.isFinite(value)) throw new Error('Formula result is not finite.');
    context.cache.set(definition.id, value);
    return value;
  } finally {
    context.stack.delete(definition.id);
  }
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private context: EvalContext, private validationOnly: boolean) {}
  parse() {
    if (!this.tokens.length) throw new Error('Formula expression is required.');
    const value = this.comparison();
    if (this.pos !== this.tokens.length) throw new Error('Unexpected token in formula.');
    return value;
  }
  private comparison(): number {
    let left = this.expr();
    const token = this.peek();
    if (token?.kind === 'op' && ['>','<','>=','<=','==','!='].includes(token.value)) {
      this.take(); const right = this.expr();
      switch (token.value) {
        case '>': return left > right ? 1 : 0;
        case '<': return left < right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
      }
    }
    return left;
  }
  private expr(): number {
    let value = this.term();
    while (this.isOp('+') || this.isOp('-')) { const op = (this.take() as Extract<Token,{kind:'op'}>).value; const rhs = this.term(); value = op === '+' ? value + rhs : value - rhs; }
    return value;
  }
  private term(): number {
    let value = this.factor();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.take() as Extract<Token,{kind:'op'}>).value; const rhs = this.factor();
      if (op === '/' && rhs === 0 && !this.validationOnly) throw new Error('Division by zero.');
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }
  private factor(): number {
    if (this.isOp('-')) { this.take(); return -this.factor(); }
    const token = this.peek(); if (!token) throw new Error('Unexpected end of formula.');
    if (token.kind === 'number') { this.take(); return token.value; }
    if (token.kind === 'ref') { this.take(); return this.resolveRef(token.value); }
    if (token.kind === 'lparen') { this.take(); const value = this.comparison(); this.expect('rparen'); return value; }
    if (token.kind === 'name') return this.func();
    throw new Error('Expected a number, field, formula, function, or parentheses.');
  }
  private func(): number {
    const name = (this.take() as Extract<Token,{kind:'name'}>).value;
    const allowed = ['SUM','AVG','MIN','MAX','COUNT','FIRST','ROUND','ABS','IF'];
    if (!allowed.includes(name)) throw new Error(`Unsupported formula function ${name}.`);
    this.expect('lparen');
    if (name === 'ROUND') {
      const value = this.comparison(); let digits = 0;
      if (this.peek()?.kind === 'comma') { this.take(); digits = Math.max(0, Math.min(8, Math.trunc(this.comparison()))); }
      this.expect('rparen'); const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor;
    }
    if (name === 'ABS') { const value = this.comparison(); this.expect('rparen'); return Math.abs(value); }
    if (name === 'IF') {
      const condition = this.comparison(); this.expect('comma'); const yes = this.comparison(); this.expect('comma'); const no = this.comparison(); this.expect('rparen'); return condition ? yes : no;
    }
    const ref = this.take();
    if (!ref || ref.kind !== 'ref') throw new Error(`${name} requires a [Field] reference.`);
    this.expect('rparen');
    return this.aggregate(name, ref.value);
  }
  private aggregate(name: string, refName: string) {
    if (this.validationOnly) return 0;
    const values = this.context.rows.map((row) => resolveRecordField(row, refName, this.context.fields)).filter((value) => value !== undefined && value !== null);
    if (name === 'COUNT') return values.length;
    if (name === 'FIRST') return toNumber(values[0]);
    const numbers = values.map(toNumber).filter(Number.isFinite);
    if (name === 'SUM') return numbers.reduce((sum, value) => sum + value, 0);
    if (name === 'AVG') return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
    if (name === 'MIN') return numbers.length ? Math.min(...numbers) : 0;
    return numbers.length ? Math.max(...numbers) : 0;
  }
  private resolveRef(name: string): number {
    if (this.validationOnly) return 0;
    const formula = this.context.formulas.find((item) => item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
    if (formula) return evaluateOne(formula, this.context);
    return toNumber(resolveRecordField(this.context.currentRecord, name, this.context.fields));
  }
  private peek(){ return this.tokens[this.pos]; }
  private take(){ return this.tokens[this.pos++]; }
  private expect(kind: Token['kind']) { const token = this.take(); if (!token || token.kind !== kind) throw new Error(`Expected ${kind}.`); }
  private isOp(value: string) { const token = this.peek(); return token?.kind === 'op' && token.value === value; }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []; let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === '[') { const end = input.indexOf(']', index + 1); if (end < 0) throw new Error('Formula reference is not closed.'); const value = input.slice(index + 1, end).trim(); if (!value) throw new Error('Formula reference is empty.'); tokens.push({ kind:'ref', value }); index = end + 1; continue; }
    if (/[0-9.]/.test(char)) { let end = index + 1; while (end < input.length && /[0-9.]/.test(input[end]!)) end += 1; const value = Number(input.slice(index, end)); if (!Number.isFinite(value)) throw new Error('Invalid number.'); tokens.push({ kind:'number', value }); index = end; continue; }
    if (/[A-Za-z_]/.test(char)) { let end = index + 1; while (end < input.length && /[A-Za-z0-9_]/.test(input[end]!)) end += 1; tokens.push({ kind:'name', value: input.slice(index, end).toUpperCase() }); index = end; continue; }
    const pair = input.slice(index, index + 2);
    if (['>=','<=','==','!='].includes(pair)) { tokens.push({ kind:'op', value: pair as any }); index += 2; continue; }
    if ('+-*/><'.includes(char)) { tokens.push({ kind:'op', value: char as any }); index += 1; continue; }
    if (char === '(') { tokens.push({ kind:'lparen' }); index += 1; continue; }
    if (char === ')') { tokens.push({ kind:'rparen' }); index += 1; continue; }
    if (char === ',') { tokens.push({ kind:'comma' }); index += 1; continue; }
    throw new Error(`Unsupported formula character "${char}".`);
  }
  return tokens;
}

function resolveRecordField(record: Record<string, unknown> | null, name: string, fields: FormulaField[]) {
  if (!record) return undefined;
  const lowered = name.trim().toLocaleLowerCase();
  const field = fields.find((candidate) => candidate.name.trim().toLocaleLowerCase() === lowered || (candidate.label ?? '').trim().toLocaleLowerCase() === lowered);
  const key = field?.name ?? name;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  const directKey = Object.keys(record).find((candidate) => candidate.toLocaleLowerCase() === key.toLocaleLowerCase());
  return directKey ? record[directKey] : undefined;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') { const parsed = Number(value.replace(/,/g,'').trim()); return Number.isFinite(parsed) ? parsed : 0; }
  return 0;
}
