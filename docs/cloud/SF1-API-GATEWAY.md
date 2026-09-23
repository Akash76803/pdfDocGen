# SF-1.1 — Salesforce API Gateway Foundation

## Objective

Expose only the document-generation API surface needed by Salesforce through Google Cloud API Gateway while keeping the Cloud Run service private.

## Request path

Salesforce -> API Gateway -> private Cloud Run -> pdfDocGen application auth -> generation service.

API Gateway authenticates to Cloud Run with its backend service account. Cloud Run remains protected by IAM and grants only the gateway service account `roles/run.invoker`.

The pdfDocGen application still performs its own client authentication. Because API Gateway replaces the backend `Authorization` header with its Cloud Run ID token, the original client bearer token is read from `X-Forwarded-Authorization` when present. Direct desktop/proxy calls continue to use the normal `Authorization` header.

## Public gateway surface

The initial Salesforce gateway exposes only:

- `GET /health`
- `POST /api/v1/documents/generate`
- `POST /api/v1/documents/generate/batch`

Template publishing and administrative template routes are intentionally not exposed through this gateway in SF-1.

## Files

- `deploy/api-gateway-openapi.yaml` — API Gateway OpenAPI 2.0 definition.
- `scripts/sf1-deploy-api-gateway.sh` — enables required services, creates gateway identity, grants Cloud Run invoker, creates an immutable API config, and creates/updates the gateway.
- `apps/api/src/auth.ts` — supports API Gateway forwarded client bearer authentication.

## Deployment

From Cloud Shell on the approved branch:

```bash
bash scripts/sf1-deploy-api-gateway.sh
```

The command prints the generated `gateway.dev` hostname. Do not replace the private Cloud Run service URL with a public Cloud Run deployment.

## Important ordering

The gateway can be provisioned before the new API code is deployed, but authenticated generation through the gateway will work only after the forwarded-authorization compatibility change is deployed to Cloud Run.

## Security rules

- Cloud Run stays private.
- Gateway backend identity receives only `roles/run.invoker` on the target service.
- Salesforce/client bearer tokens are never stored in source control.
- Apex must not hardcode a bearer token.
- SF-1.3 will store Salesforce-side credentials using External Credential / Named Credential.
- The OpenAPI surface intentionally excludes template mutation endpoints.

## Acceptance

SF-1.1 is complete when:

1. branch CI passes;
2. gateway-compatible API build is deployed;
3. API Gateway is created successfully;
4. `GET /health` succeeds through the gateway;
5. missing/invalid client token is rejected by the application;
6. valid client token successfully generates a PDF through the gateway;
7. direct private Cloud Run security remains unchanged.
