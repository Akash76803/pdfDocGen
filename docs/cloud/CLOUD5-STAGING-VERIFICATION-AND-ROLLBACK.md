# CLOUD-5.7 — Staging Verification & Rollback Runbook

## Objective

Perform the final hosted verification for CLOUD-5 before PR #10 is merged, capture non-secret staging evidence, and provide a safe rollback procedure.

## Preconditions

- Branch: `feat/cloud5-auth-security`
- Local/CI security regression gates are green.
- Cloud Run staging remains private.
- Secret Manager auth is pinned to a numeric secret version.
- The currently deployed application code already contains the CLOUD-5 runtime security implementation.
- Test/document-only commits do not require a new runtime deployment unless application runtime code changed after the last verified deployment.

## Final staging verification

From Google Cloud Shell in the repository:

```bash
git fetch origin
git checkout feat/cloud5-auth-security
git reset --hard origin/feat/cloud5-auth-security

bash scripts/cloud5-final-staging-verification.sh
```

The script prints only non-secret evidence:

- latest ready and created Cloud Run revisions;
- deployed image reference;
- runtime service account;
- application auth mode;
- Secret Manager secret name and numeric version;
- service URL;
- six-control IAM/security audit result;
- hosted health, no-token 401 and authorized PDF smoke result.

It must end with:

```text
CLOUD-5.7 final staging verification PASS
No secret payload was printed.
```

## Required acceptance evidence

Record the following without copying any bearer token or secret payload:

1. Latest branch head SHA.
2. Latest ready Cloud Run revision.
3. Deployed image reference.
4. Active numeric secret version.
5. Security audit: PASS 6/6.
6. Hosted auth smoke:
   - health PASS;
   - protected no-token request = 401 UNAUTHORIZED;
   - authorized PDF generation PASS.
7. GitHub Code Health workflow PASS.
8. GitHub Container Smoke workflow PASS.
9. Local typecheck/tests/build PASS.

## Runtime deployment rule

If only tests, scripts or documentation changed after the last verified runtime deployment, do not redeploy merely to change the Cloud Run revision. Run the final audit and hosted smoke against the existing verified runtime.

If any `apps/api` runtime code, runtime package dependency, container configuration, or startup behavior changed after the last deployment, deploy the latest code first:

```bash
bash scripts/cloud5-deploy-staging-code.sh
bash scripts/cloud5-final-staging-verification.sh
```

## Rollback — application revision

List revisions:

```bash
gcloud run revisions list \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --service=pdf-doc-gen-api-staging
```

Move 100% traffic to the last known-good revision:

```bash
gcloud run services update-traffic pdf-doc-gen-api-staging \
  --project=pdf-gen-509308 \
  --region=us-central1 \
  --to-revisions=<KNOWN_GOOD_REVISION>=100
```

Immediately re-run:

```bash
bash scripts/cloud5-security-audit.sh
bash scripts/cloud5-hosted-auth-smoke.sh
```

Do not make the service public as a rollback technique.

## Rollback — auth secret

Current expected state after CLOUD-5.5 rotation:

- secret version 2 is active/pinned;
- secret version 1 is disabled.

Do not re-enable an old secret unless an explicit incident response requires it and the old credential is confirmed safe.

Preferred recovery is to create a fresh secret version, pin a new Cloud Run revision to that version, verify it, and only then retire the broken version:

```bash
bash scripts/cloud5-rotate-auth-secret.sh
```

The rotation script verifies the replacement before disabling the previous version.

## Rollback — IAM/storage

Do not restore broad roles such as Owner, Editor, Datastore Owner or Storage Object Admin to solve an application failure.

Expected runtime permissions remain:

- project: `roles/datastore.user`;
- bucket: `roles/storage.objectUser`;
- auth secret: secret-scoped `roles/secretmanager.secretAccessor`.

If an IAM change causes an outage, restore only the exact previously verified least-privilege binding and re-run `scripts/cloud5-security-audit.sh`.

## Secret-handling rule

Never paste the bearer secret into:

- GitHub;
- documentation;
- tracker;
- PR comments;
- shell history as a literal value;
- normal environment-variable deployment commands.

Use Secret Manager references and ephemeral shell variables only.

## PR #10 merge gate

PR #10 can move from Draft to Ready and be merged only after:

- CLOUD-5.6 local + CI gates PASS;
- this final staging verification PASS;
- PR head matches the verified branch head;
- PR is mergeable;
- no unresolved security blocker remains.

After merge:

1. verify post-merge Code Health and Container Smoke;
2. sync local `main`;
3. mark CLOUD-5 100% complete in the tracker;
4. start CLOUD-6 Logging, Monitoring & Audit.

## Dependency audit note

Earlier container installation reported npm vulnerability findings. Do not use `npm audit fix --force` blindly. Review `npm audit` and `npm audit --omit=dev` output and carry unresolved production-dependency remediation into production-readiness work if it is not a CLOUD-5 runtime blocker.
