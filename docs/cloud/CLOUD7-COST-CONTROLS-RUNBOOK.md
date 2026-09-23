# CLOUD-7.5 — Cost Controls Runbook

## Goal
Keep staging spend observable and bounded without weakening reliability, security, or recovery controls.

## Existing runtime cap
Cloud Run remains bounded by the CLOUD-7.1 service-level maximum of 10 instances, with concurrency 4 and 1 CPU / 1 GiB per instance.

## Cloud Storage lifecycle
The live persistence bucket uses Object Versioning for recovery. Versioning without lifecycle pruning can accumulate noncurrent objects over time.

Staging policy:
- live objects are never age-deleted by the cost lifecycle
- noncurrent versions are deleted after 14 days
- noncurrent versions are also deleted when 3 newer versions exist
- backup snapshot objects are retained for 30 days

Files:
- `config/cloud7-source-bucket-lifecycle.json`
- `config/cloud7-backup-bucket-lifecycle.json`

Dry run:

```bash
bash scripts/cloud7-apply-storage-lifecycle.sh
```

Apply:

```bash
APPLY_COST_CONTROLS=APPLY bash scripts/cloud7-apply-storage-lifecycle.sh
```

Cloud Storage lifecycle actions are eventually applied and configuration changes can take time to propagate.

## Logging retention
For staging, keep the project `_Default` log bucket at 30 days unless a longer compliance/debugging need is approved.

Verify:

```bash
bash scripts/cloud7-verify-cost-controls.sh
```

Do not lock the log bucket during staging; locking is irreversible.

## Budget visibility
Create a project-scoped alerts-only monthly budget using an amount chosen by the operator:

```bash
MONTHLY_BUDGET_USD=<amount> bash scripts/cloud7-create-budget.sh
```

Default thresholds:
- 50% actual spend
- 80% actual spend
- 100% actual spend

A standard Cloud Billing budget is an alerting mechanism; it does not automatically stop services or hard-cap spend.

## Abnormal usage signals
Review:
- Cloud Run instance growth versus the max-instance cap
- API request count and request error count
- rate-limit rejection frequency
- generation duration growth
- Cloud Build frequency
- GCS bucket growth and noncurrent-version count
- Logging ingestion/storage growth

Existing `api_metric` logs provide request/operation count, duration, and error-count signals.

## Release gate
Before production promotion:
1. runtime max instances verified
2. storage lifecycle reviewed
3. backup lifecycle reviewed
4. log retention reviewed
5. project budget configured
6. recent backup snapshot confirmed
7. monitoring verification PASS
