import { describe, expect, it } from 'vitest';
import {
  InMemoryApiIdempotencyStore,
  canonicalRequestFingerprint,
  readIdempotencyKey,
} from './idempotency.js';

describe('CLOUD-7.3 idempotency core',()=>{
  it('produces a stable fingerprint independent of object key order',()=>{
    expect(canonicalRequestFingerprint({b:2,a:{y:2,x:1}}))
      .toBe(canonicalRequestFingerprint({a:{x:1,y:2},b:2}));
  });

  it('validates Idempotency-Key input',()=>{
    expect(readIdempotencyKey(' retry-123 ')).toBe('retry-123');
    expect(()=>readIdempotencyKey('')).toThrow('Idempotency-Key cannot be empty.');
    expect(()=>readIdempotencyKey('bad key')).toThrow('unsupported characters');
    expect(()=>readIdempotencyKey('x'.repeat(129))).toThrow('cannot exceed 128 characters');
  });

  it('deduplicates same owner, operation, key and request fingerprint',async()=>{
    const store=new InMemoryApiIdempotencyStore<{jobId:string}>();
    const base={key:'retry-1',owner:'client-a',operation:'document.generate' as const,fingerprint:'abc'};
    expect((await store.begin(base)).state).toBe('started');
    expect((await store.begin(base)).state).toBe('in-progress');

    await store.complete({...base,result:{jobId:'job-1'}});
    const replay=await store.begin(base);
    expect(replay.state).toBe('replay');
    if (replay.state === 'replay') expect(replay.record.result).toEqual({jobId:'job-1'});
  });

  it('rejects key reuse for a different request fingerprint',async()=>{
    const store=new InMemoryApiIdempotencyStore();
    const base={key:'retry-1',owner:'client-a',operation:'document.generate' as const,fingerprint:'abc'};
    await store.begin(base);
    expect((await store.begin({...base,fingerprint:'different'})).state).toBe('conflict');
  });

  it('isolates identical keys by owner and operation',async()=>{
    const store=new InMemoryApiIdempotencyStore();
    expect((await store.begin({key:'same',owner:'a',operation:'document.generate',fingerprint:'x'})).state).toBe('started');
    expect((await store.begin({key:'same',owner:'b',operation:'document.generate',fingerprint:'x'})).state).toBe('started');
    expect((await store.begin({key:'same',owner:'a',operation:'document.generate-batch',fingerprint:'x'})).state).toBe('started');
  });

  it('releases a pending reservation after a failed operation so a retry can restart',async()=>{
    const store=new InMemoryApiIdempotencyStore();
    const base={key:'retry-2',owner:'client-a',operation:'document.generate' as const,fingerprint:'abc'};
    expect((await store.begin(base)).state).toBe('started');
    await store.release(base);
    expect((await store.begin(base)).state).toBe('started');
  });
});
