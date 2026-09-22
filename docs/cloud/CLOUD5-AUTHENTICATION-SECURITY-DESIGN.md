# CLOUD-5 Authentication & Security — Design & Threat Model

## Status
CLOUD-5.1 started on 2026-09-21 from main commit `196f0bbdf9eef1e798f44ed5e368b86a4236bb95`.

Branch: `feat/cloud5-auth-security`

## Current-state audit

The hosted API currently has no application-level authentication or authorization middleware.

Observed behavior:
- `apps/api/src/app.ts` handles health, template publish/save/delete, single generation and batch generation directly.
- CORS currently allows localhost / 127.0.0.1 and `tauri://localhost`, but CORS is not an authentication boundary.
- `apps/desktop/src/lib/cloudTemplatePublisher.ts` calls the hosted API with only `content-type: application/json`; no `Authorization` or client identity header is sent.
- Cloud Run staging is private and hosted QA currently works through an authenticated proxy path.
- Direct human identity-token invocation was not adopted as the product API contract.

## Security goals

1. Keep the Cloud Run generation service private by default.
2. Require every non-health hosted operation to have a verified caller identity.
3. Separate authentication (who are you?) from authorization (what may you do?).
4. Return stable structured `401 Unauthorized` and `403 Forbidden` errors.
5. Never embed long-lived privileged credentials in the desktop application.
6. Use least-privilege IAM for runtime, deployment and storage access.
7. Support secure integration from desktop, Salesforce and future connectors.
8. Keep the design OAuth2/OIDC compatible.
9. Make auth context available to later CLOUD-6 audit/logging work.

## Assets and trust boundaries

Protected assets:
- Published templates and template versions.
- GCS-hosted image/font/assets.
- Generated PDFs/DOCX.
- Generation capacity and batch processing resources.
- Firestore metadata.
- Service configuration and credentials.

Trust boundaries:
- Desktop/Tauri client.
- Salesforce org / Apex callout.
- Future local connectors (Tally/BUSY/DMS).
- Public internet/front door.
- Private Cloud Run API.
- Firestore and GCS.
- CI/CD and deploy identities.

## Threats to address

- Unauthenticated generation requests.
- Stolen or replayed bearer tokens.
- Expired, wrong-audience or wrong-issuer tokens.
- Authenticated caller invoking forbidden endpoints.
- Cross-client / cross-tenant access.
- Long-lived API keys embedded in desktop binaries.
- Secrets committed to Git or exposed in logs.
- Excessive IAM permissions.
- Direct bypass of intended front-door controls.
- Request abuse against generation/batch endpoints.
- Identity spoofing via untrusted headers.

## Access model decision

### Backend service boundary
Cloud Run remains private. Direct invocation is allowed only to explicitly authorized Google identities/service accounts.

### External client boundary
External clients should not receive a privileged Cloud Run service-account credential.

The target architecture is:

```
Desktop / Salesforce / Connector
        |
        | authenticated HTTPS
        v
Secure front door / identity-aware gateway
        |
        | service-to-service authenticated call
        v
Private Cloud Run pdfDocGen API
        |
        +--> Firestore
        +--> GCS
```

The front door may later be implemented with an OAuth2/OIDC-capable gateway or equivalent trusted auth layer. CLOUD-5 must keep that boundary swappable and must not couple the API contract to one vendor-specific user-login flow.

### Transitional trusted service-to-service path
For controlled backend integrations, Google service-account OIDC/IAM invocation is supported as the trusted direct path to private Cloud Run.

### Desktop rule
Do not store a reusable privileged API secret inside the shipped desktop application. Desktop auth must ultimately use a short-lived user/session token or a brokered flow.

### Salesforce rule
Prefer Salesforce Named Credential / External Credential or another server-side credential flow. Do not place reusable secrets in LWC/browser code.

## Application-level auth contract

The API will gain a centralized auth boundary before protected routes.

Proposed normalized auth context:

```ts
type ApiPrincipal = {
  subject: string;
  clientId?: string;
  tenantId?: string;
  roles: string[];
  authType: 'oidc' | 'service-account' | 'api-key';
};
```

Protected handlers receive a verified `ApiPrincipal`; they must never trust caller-supplied identity headers directly.

### Public route
- `GET /health` stays unauthenticated but reveals only non-sensitive service health/config limits.

### Protected routes
- `PUT /api/v1/templates/:id/publish`
- `PUT /api/v1/templates/:id`
- `DELETE /api/v1/templates/:id`
- `POST /api/v1/documents/generate`
- `POST /api/v1/documents/generate/batch`

## Authorization model

Initial capability groups:

- `template:publish`
- `template:write`
- `template:delete`
- `document:generate`
- `document:generate-batch`

Role mapping can remain simple initially:
- `publisher` -> template publish/write
- `generator` -> document generation
- `admin` -> all capabilities

Tenant/client isolation must be represented in the principal/context even if the first deployment has one tenant, so future multi-tenant enforcement does not require a contract rewrite.

## Error contract

### 401
Missing, malformed, invalid, expired, wrong-issuer or wrong-audience credentials:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication is required."
  }
}
```

### 403
Valid identity without permission:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "The authenticated caller is not allowed to perform this operation."
  }
}
```

Do not disclose token parsing internals or secret material in responses.

## Configuration plan

New configuration family, names to be finalized during CLOUD-5.2:
- `API_AUTH_MODE`
- trusted issuer / audience configuration
- optional controlled API-key secret reference for non-desktop transitional integrations
- allowed client / role mapping
- Secret Manager bindings for hosted secrets

Rules:
- no real secret values in `.env.example`
- no secrets committed to Git
- production secret values sourced from Secret Manager or equivalent protected deployment config
- startup diagnostics must report auth mode without printing secrets

## CORS hardening

Current CORS allows localhost/Tauri origins and only `content-type`.

When bearer authentication is enabled:
- add `authorization` to allowed request headers for approved browser-like clients.
- do not use wildcard origins with credentialed access.
- keep CORS configuration independent from auth decisions.

## CLOUD-5 implementation sequence

### CLOUD-5.1 — Security Design & Threat Model
Deliverable: this document + tracker status + implementation contract.

### CLOUD-5.2 — Authentication Middleware
- auth config parser
- token/credential verifier abstraction
- centralized request auth guard
- principal context
- 401 tests
- keep `/health` public

### CLOUD-5.3 — Authorization
- route capability map
- 403 behavior
- role/client/tenant checks
- authorization tests

### CLOUD-5.4 — Secure Client Integration
- desktop auth-provider hook / token injection abstraction
- Salesforce integration guidance/fixture
- no long-lived privileged desktop secret

### CLOUD-5.5 — IAM & Secrets Hardening
- least-privilege runtime/deployer/invoker roles
- Secret Manager bindings where needed
- staging deployment settings
- verify Cloud Run remains private

### CLOUD-5.6 — Security QA
Required cases:
- no credential
- malformed credential
- invalid signature/secret
- expired token
- wrong audience
- wrong issuer
- valid identity, missing capability
- valid authorized caller
- template publish protected
- single generation protected
- batch generation protected
- health remains available
- secret rotation/config change
- regression: existing generation behavior unchanged after successful auth

### CLOUD-5.7 — Staging Verification & Runbook
- hosted auth smokes
- CI
- deployment/rollback guide
- PR review/merge
- post-merge CI

## CLOUD-5.1 acceptance

CLOUD-5.1 is complete when:
- current auth gap is documented;
- trust boundaries and threats are documented;
- private Cloud Run boundary is retained;
- client credential rules are defined;
- protected/public route policy is explicit;
- 401/403 contract is explicit;
- implementation sequence is fixed enough to start middleware work.

## Next implementation step

Start CLOUD-5.2 by adding an auth configuration model and a verifier/guard abstraction to `apps/api`, with tests first. The first implementation should support a testable local auth mode without weakening private Cloud Run staging.
