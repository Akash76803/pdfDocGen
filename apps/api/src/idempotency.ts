import { createHash } from 'node:crypto';

export type IdempotencyOperation = 'document.generate' | 'document.generate-batch';

export type IdempotencyRecord<T = unknown> = {
  key: string;
  owner: string;
  operation: IdempotencyOperation;
  fingerprint: string;
  status: 'pending' | 'completed';
  createdAt: string;
  updatedAt: string;
  result?: T;
};

export type IdempotencyBeginResult<T = unknown> =
  | { state:'started'; record:IdempotencyRecord<T> }
  | { state:'in-progress'; record:IdempotencyRecord<T> }
  | { state:'replay'; record:IdempotencyRecord<T> }
  | { state:'conflict'; record:IdempotencyRecord<T> };

export interface ApiIdempotencyStore<T = unknown> {
  begin(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<IdempotencyBeginResult<T>>;
  complete(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string;result:T}):Promise<void>;
  release(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<void>;
}

function canonicalize(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalRequestFingerprint(value:unknown):string {
  const payload=JSON.stringify(canonicalize(value));
  return createHash('sha256').update(payload).digest('hex');
}

export function readIdempotencyKey(header:string|string[]|undefined):string|undefined {
  if (header === undefined) return undefined;
  if (Array.isArray(header)) throw Object.assign(new Error('Idempotency-Key must be provided once.'),{code:'INVALID_IDEMPOTENCY_KEY'});
  const key=header.trim();
  if (!key) throw Object.assign(new Error('Idempotency-Key cannot be empty.'),{code:'INVALID_IDEMPOTENCY_KEY'});
  if (key.length > 128) throw Object.assign(new Error('Idempotency-Key cannot exceed 128 characters.'),{code:'INVALID_IDEMPOTENCY_KEY'});
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) throw Object.assign(new Error('Idempotency-Key contains unsupported characters.'),{code:'INVALID_IDEMPOTENCY_KEY'});
  return key;
}

export class InMemoryApiIdempotencyStore<T = unknown> implements ApiIdempotencyStore<T> {
  private readonly records=new Map<string,IdempotencyRecord<T>>();

  private compound(owner:string,operation:IdempotencyOperation,key:string) {
    return `${owner}\u0000${operation}\u0000${key}`;
  }

  async begin(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<IdempotencyBeginResult<T>> {
    const compound=this.compound(input.owner,input.operation,input.key);
    const existing=this.records.get(compound);
    if (existing) {
      if (existing.fingerprint !== input.fingerprint) return {state:'conflict',record:existing};
      return existing.status === 'completed'
        ? {state:'replay',record:existing}
        : {state:'in-progress',record:existing};
    }
    const now=new Date().toISOString();
    const record:IdempotencyRecord<T>={
      key:input.key,
      owner:input.owner,
      operation:input.operation,
      fingerprint:input.fingerprint,
      status:'pending',
      createdAt:now,
      updatedAt:now,
    };
    this.records.set(compound,record);
    return {state:'started',record};
  }

  async complete(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string;result:T}):Promise<void> {
    const compound=this.compound(input.owner,input.operation,input.key);
    const existing=this.records.get(compound);
    if (!existing || existing.fingerprint !== input.fingerprint) throw new Error('Idempotency record does not match the completion request.');
    this.records.set(compound,{
      ...existing,
      status:'completed',
      updatedAt:new Date().toISOString(),
      result:input.result,
    });
  }

  async release(input:{key:string;owner:string;operation:IdempotencyOperation;fingerprint:string}):Promise<void> {
    const compound=this.compound(input.owner,input.operation,input.key);
    const existing=this.records.get(compound);
    if (existing?.status === 'pending' && existing.fingerprint === input.fingerprint) this.records.delete(compound);
  }
}
