# CLOUD-7.4 — Backup, Restore & Recovery Runbook

## Objective
Provide a repeatable recovery path for the hosted Document Builder persistence layer without weakening the existing private IAM/security posture.

## Persistence covered
The hosted API currently depends on:
- Firestore `documentBuilderTemplates`
- Firestore `versions` collection group under template records
- Firestore `documentBuilderIdempotency`
- GCS template objects
- GCS asset objects
- GCS idempotency replay objects

The default source bucket is:
`pdf-gen-509308-document-builder-assets`

## Recovery model

### Layer 1 — GCS object versioning
Enable object versioning on the source bucket to protect against accidental replacement or deletion of individual GCS objects.

Recommended command:

```bash
gcloud storage buckets update gs://pdf-gen-509308-document-builder-assets \
  --versioning \
  --project=pdf-gen-509308
```

Verify:

```bash
BACKUP_BUCKET=<separate-backup-bucket> \
bash scripts/cloud7-verify-backup-readiness.sh
```

### Layer 2 — Timestamped backup snapshot
Use a dedicated backup bucket separate from the live source bucket.

The backup script exports:
- Firestore collections: `documentBuilderTemplates`, `versions`, `documentBuilderIdempotency`
- the current contents of the live GCS persistence bucket
- a snapshot manifest

Run:

```bash
BACKUP_BUCKET=<separate-backup-bucket> \
bash scripts/cloud7-create-backup.sh
```

The script prints a timestamped snapshot URI. Preserve the timestamp because restore requires it.

## Restore safety

Restore is guarded by `CONFIRM_RESTORE=RESTORE`.

Dry run:

```bash
BACKUP_BUCKET=<separate-backup-bucket> \
BACKUP_STAMP=<timestamp> \
bash scripts/cloud7-restore-backup.sh
```

Actual restore:

```bash
BACKUP_BUCKET=<separate-backup-bucket> \
BACKUP_STAMP=<timestamp> \
CONFIRM_RESTORE=RESTORE \
bash scripts/cloud7-restore-backup.sh
```

Important semantics:
- Firestore import restores documents from the export.
- It does not automatically delete unrelated documents created after the snapshot.
- GCS restore copies snapshot objects back to the live bucket.
- It does not automatically delete unrelated objects created after the snapshot.
- A destructive point-in-time reset therefore requires a separately approved cleanup plan. Do not add deletion to the normal restore script.

## Recovery verification
After a restore:
1. Run `bash scripts/cloud7-verify-runtime-guardrails.sh`.
2. Run `bash scripts/cloud5-security-audit.sh`.
3. Run `bash scripts/cloud5-hosted-auth-smoke.sh`.
4. Run `bash scripts/cloud7-hosted-idempotency-smoke.sh`.
5. Run `bash scripts/cloud6-hosted-monitoring-verification.sh`.
6. Verify a known published template/version can still generate the expected PDF.
7. Verify no secret values appear in logs.

Do not declare recovery complete until these checks pass.

## Suggested retention
For staging:
- retain at least the most recent 7 daily snapshots
- retain a snapshot before destructive schema/storage changes
- retain a snapshot before production promotion/rollback testing

Production retention and lifecycle rules should be finalized in CLOUD-7.5 together with cost controls.

## Permissions
The operator running backup/restore needs permissions for:
- Firestore export/import
- reading the source GCS bucket
- writing/reading the backup bucket
- restoring objects to the source bucket

Keep runtime service-account permissions unchanged unless a runtime feature requires them. Backup/restore is an operator/admin workflow, not an API-runtime responsibility.

## Definition of done
CLOUD-7.4 is complete when:
- source persistence resources are accessible
- source bucket versioning state is explicitly verified
- a separate backup bucket is configured
- a timestamped Firestore + GCS backup succeeds
- manifest exists
- restore script dry run succeeds
- one controlled recovery test is executed and the post-restore verification suite passes
