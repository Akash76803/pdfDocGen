# CLOUD-7.6 — Release & Rollback Runbook

## Objective

Provide a repeatable, reversible release process for the private hosted Document Builder API without weakening authentication, IAM, runtime guardrails, persistence, or monitoring.

## Current environment

- Project: `pdf-gen-509308`
- Region: `us-central1`
- Staging service: `pdf-doc-gen-api-staging`
- Runtime remains private.
- Application auth remains static bearer backed by Secret Manager and pinned to a numeric secret version.
- Existing deployment entry point: `scripts/cloud7-deploy-staging-code.sh`.

## Release naming

Runtime images continue to be built from the Git commit and tagged as:

```text
cloud7-<8-char-git-sha>
```

Cloud Run creates an immutable revision for each deployment. Release evidence must record:

1. Git commit SHA.
2. deployed image reference;
3. latest ready Cloud Run revision;
4. numeric auth secret version;
5. release-gate results.

Do not use a mutable human label such as `latest` as release evidence.

## Pre-deploy: capture known-good revision

Run:

```bash
bash scripts/cloud7-capture-known-good.sh
```

Copy the printed non-secret values into release evidence:

```text
KNOWN_GOOD_REVISION=...
KNOWN_GOOD_IMAGE=...
```

This is the rollback target for the release.

## Deploy candidate

From a clean, reviewed branch or the approved `main` commit:

```bash
bash scripts/cloud7-deploy-staging-code.sh
```

The deployment script builds the image from the current Git commit, deploys it to the private staging service, reapplies normal CLOUD-7 runtime guardrails, and runs the security audit.

## Release gate

After deployment:

```bash
bash scripts/cloud7-release-gate.sh
```

The gate fails if:

- the Git working tree is dirty;
- the latest created Cloud Run revision is not ready;
- the deployed image cannot be resolved;
- the auth secret is not pinned to a numeric version;
- runtime guardrails fail;
- security audit fails;
- authenticated hosted generation fails;
- hosted idempotency verification fails.

The gate must end with:

```text
CLOUD-7.6 release gate PASS.
```

## Rollback

If the candidate fails release verification or introduces a runtime regression, route 100% traffic back to the recorded known-good revision:

```bash
bash scripts/cloud7-rollback-staging.sh <KNOWN_GOOD_REVISION>
```

The rollback script validates the revision, moves all traffic to it, and re-runs runtime guardrails, security audit, authenticated hosted generation, and idempotency verification.

Successful rollback ends with:

```text
CLOUD-7.6 rollback PASS.
```

## Manual rollback equivalent

If the helper script cannot be used:

```bash
gcloud run services update-traffic pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --to-revisions=<KNOWN_GOOD_REVISION>=100
```

Then run:

```bash
bash scripts/cloud7-verify-runtime-guardrails.sh
bash scripts/cloud5-security-audit.sh
bash scripts/cloud5-hosted-auth-smoke.sh
bash scripts/cloud7-hosted-idempotency-smoke.sh
```

## Safety rules

- Never make Cloud Run public as a rollback technique.
- Never paste bearer-token values into the repo, tracker, PR comments, logs, or shell commands.
- Do not broaden IAM roles to recover a failed release.
- Do not roll back Firestore/GCS data merely because application code failed. Data restoration is governed by the CLOUD-7.4 backup/restore runbook.
- Prefer traffic rollback to a known-good Cloud Run revision over rebuilding an old commit during an incident.

## Production promotion

CLOUD-7.6 establishes the release and rollback mechanism on staging. Production promotion should reuse the same controls:

1. identify the exact verified Git SHA/image;
2. deploy that artifact/configuration to the production service;
3. verify private IAM and numeric secret pinning;
4. run the final CLOUD-7.7 production-readiness checks;
5. keep the previous production revision as the immediate rollback target.

No production service should be made public to support Salesforce or other client integrations; external access must be provided through an authenticated gateway/integration layer.

## Acceptance criteria

CLOUD-7.6 is complete when:

- release scripts/runbook are merged;
- release gate passes against the UAT-approved candidate;
- a known-good revision is recorded;
- rollback is exercised to a known-good revision;
- post-rollback security/auth/idempotency smoke tests pass;
- the approved candidate can be restored after the rollback test.
