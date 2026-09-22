import type { ApiPrincipal } from './auth.js';
import type { ApiRateLimitConfig } from './config.js';

export type ApiRateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type ApiRateLimiter = {
  check(principal: ApiPrincipal): ApiRateLimitDecision;
};

type Bucket = { count: number; resetAt: number };

export function createInMemoryApiRateLimiter(
  config: ApiRateLimitConfig,
  now: () => number = Date.now,
): ApiRateLimiter {
  const buckets = new Map<string,Bucket>();

  return {
    check(principal) {
      const key = principal.clientId || principal.subject;
      const current = now();
      let bucket = buckets.get(key);
      if (!bucket || current >= bucket.resetAt) {
        bucket = { count:0, resetAt:current + config.windowMs };
        buckets.set(key,bucket);
      }

      const retryAfterSeconds = Math.max(1,Math.ceil((bucket.resetAt-current)/1000));
      if (bucket.count >= config.effectivePerMinute) {
        return {allowed:false,remaining:0,retryAfterSeconds};
      }

      bucket.count += 1;
      return {
        allowed:true,
        remaining:Math.max(0,config.effectivePerMinute-bucket.count),
        retryAfterSeconds,
      };
    },
  };
}
