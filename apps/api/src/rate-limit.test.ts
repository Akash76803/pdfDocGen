import { describe, expect, it } from 'vitest';
import { createInMemoryApiRateLimiter } from './rate-limit.js';

const principal={subject:'client-a',roles:['generator'],authType:'api-key' as const};

describe('CLOUD-7 authenticated client rate limiter',()=>{
  it('allows requests up to the configured window limit then rejects',()=>{
    let now=1_000;
    const limiter=createInMemoryApiRateLimiter({
      requestedPerMinute:2,
      absolutePerMinute:2,
      effectivePerMinute:2,
      windowMs:60_000,
    },()=>now);

    expect(limiter.check(principal)).toMatchObject({allowed:true,remaining:1});
    expect(limiter.check(principal)).toMatchObject({allowed:true,remaining:0});
    expect(limiter.check(principal)).toMatchObject({allowed:false,remaining:0,retryAfterSeconds:60});

    now+=60_000;
    expect(limiter.check(principal)).toMatchObject({allowed:true,remaining:1});
  });

  it('isolates counters by authenticated client identity',()=>{
    const limiter=createInMemoryApiRateLimiter({
      requestedPerMinute:1,
      absolutePerMinute:1,
      effectivePerMinute:1,
      windowMs:60_000,
    },()=>1_000);

    expect(limiter.check(principal).allowed).toBe(true);
    expect(limiter.check(principal).allowed).toBe(false);
    expect(limiter.check({...principal,subject:'client-b'}).allowed).toBe(true);
  });
});
