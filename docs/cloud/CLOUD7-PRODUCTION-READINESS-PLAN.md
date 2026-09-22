# CLOUD-7 — Production Readiness / Release Hardening

## Objective
Prepare the hosted Document Builder API for controlled production release without weakening the security, persistence, generation, or observability guarantees completed in CLOUD-1 through CLOUD-6.

## Scope
CLOUD-7 covers:
1. Scaling and concurrency controls
2. Request quotas and abuse protection
3. Retry and idempotency strategy
4. Rollback and release safety
5. Firestore and GCS backup / recovery readiness
6. Cost controls and budget visibility
7. Production deployment checklist
8. Final staging-to-production verification

## CLOUD-7.1 — Scaling & Runtime Guardrails
Define and verify:
- Cloud Run min/max instances
- concurrency
- request timeout alignment with API generation timeout
- CPU/memory sizing
- startup behavior
- graceful failure under saturation
- no change to private IAM/auth posture

## CLOUD-7.2 — Quotas, Rate Limits & Abuse Protection
Define:
- per-client request limits
- batch-generation limits
- payload limits
- protection against retry storms
- 429/503 behavior
- safe client retry guidance

## CLOUD-7.3 — Retry, Idempotency & Recovery
Define:
- operations safe to retry
- publish/version conflict behavior
- generation request idempotency expectations
- client retry backoff
- transient vs permanent error categories

## CLOUD-7.4 — Backup & Restore Readiness
Verify:
- Firestore recovery strategy
- GCS object/version recovery strategy
- retention expectations
- restore runbook
- recovery testing evidence

## CLOUD-7.5 — Cost Controls
Define:
- Cloud Run scaling caps
- Cloud Build/storage/logging cost considerations
- budget alerts
- log retention strategy
- monitoring for abnormal usage

## CLOUD-7.6 — Release & Rollback Strategy
Define:
- immutable image/version naming
- staging verification gate
- production promotion
- traffic migration
- rollback to known-good revision
- secret/config verification before promotion

## CLOUD-7.7 — Production Readiness Verification
Final acceptance should include:
- local typecheck/test/build PASS
- GitHub Code Health PASS
- container smoke PASS
- security audit PASS
- authenticated hosted generation PASS
- monitoring verification PASS
- rollback procedure verified
- backup/recovery plan documented
- release checklist signed off

## Non-goals
- public Cloud Run access
- weakening authentication
- exposing secrets in source or logs
- major editor UX changes
- unrelated desktop feature work

## Starting principle
Prefer configuration-as-code, explicit limits, reversible deployment steps, and testable operational controls.
