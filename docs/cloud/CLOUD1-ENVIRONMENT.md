# CLOUD-1 Environment and Deployment Configuration

This file defines the runtime configuration contract for the Document Builder headless API.

## Runtime variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `8787` local / supplied by Cloud Run | HTTP listen port. |
| `HOST` | No | `127.0.0.1` local, `0.0.0.0` on Cloud Run | HTTP bind address. |
| `K_SERVICE` | Cloud Run managed | unset locally | Presence identifies Cloud Run and selects the cloud-safe host default. |
| `API_MAX_BODY_MB` | No | `20` | Requested JSON request body limit. |
| `API_ABSOLUTE_MAX_BODY_MB` | No | `50` | Hard cap; effective body limit can never exceed it. |
| `API_TEMPLATE_REPOSITORY_MODE` | No | `filesystem` | `filesystem` or `cloud`. Cloud mode requires a persistent cloud driver. |
| `API_TEMPLATE_DIR` | Filesystem mode only | OS application-data directory | Writable template directory used by local/offline mode. |
| `API_FALLBACK_TEMPLATE_DIR` | No | `./data/templates` | Read fallback location for bundled templates. |
| `API_GCP_TEMPLATE_BUCKET` | Cloud mode | none | Cloud Storage bucket for immutable templates and assets. |
| `API_GCP_FIRESTORE_DATABASE` | No | `(default)` | Firestore database containing current/version metadata. |
| `API_GCP_TEMPLATE_PREFIX` | No | `document-builder/templates` | Template object prefix. |
| `API_GCP_ASSET_PREFIX` | No | `document-builder/assets` | Content-addressed asset object prefix. |

## Local development

Recommended:

```text
HOST=127.0.0.1
PORT=8787
API_TEMPLATE_REPOSITORY_MODE=filesystem
API_MAX_BODY_MB=20
API_ABSOLUTE_MAX_BODY_MB=50
```

Local mode stays loopback-only by default.

## CI / container smoke

The Linux container smoke runs a Cloud Run-like environment:

```text
K_SERVICE=document-builder-api
PORT=8080
API_TEMPLATE_REPOSITORY_MODE=filesystem
```

Filesystem mode is acceptable only for the ephemeral smoke fixture. It is not the intended durable production template store.

## Staging

CLOUD-1 staging should use the same container as production. Until CLOUD-3 provides the persistent driver, staged generation may use controlled filesystem fixtures strictly for smoke verification.

Once CLOUD-3 is ready:

```text
API_TEMPLATE_REPOSITORY_MODE=cloud
API_GCP_TEMPLATE_BUCKET=PROJECT_ID-document-builder-assets
```

Startup must fail if cloud mode is selected without a configured persistent cloud driver. Silent fallback to ephemeral filesystem storage is intentionally forbidden.

## Production

Production readiness requires:

- Cloud Run container deployment
- persistent template/asset repository from CLOUD-3
- authentication/authorization from CLOUD-5
- production logging/monitoring/audit from CLOUD-6
- secrets supplied through the cloud secret/config mechanism, never committed to source
- no wildcard CORS for browser clients
- no durable business data written to Cloud Run local filesystem

## Startup diagnostics

The API emits one structured startup line containing only safe operational fields:

- service
- runtime: local/cloud
- host
- port
- repository mode
- effective request-body limit
- absolute request-body cap

Environment maps, tokens, credentials, passwords, API keys and secret values are not logged.
