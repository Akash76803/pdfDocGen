# SF-1.2 — Gateway Security

## Goal

Harden and verify the Salesforce-facing API Gateway without making the Cloud Run backend public.

## Security model

Salesforce calls the public API Gateway. API Gateway authenticates to the private Cloud Run service with its dedicated backend service account. The pdfDocGen application performs a second, application-level client authentication check using the Salesforce integration credential.

For Salesforce calls, the application token is sent in:

```
X-PdfDocGen-Authorization: Bearer <client-token>
```

The token must be stored in Salesforce External Credential / Named Credential configuration in SF-1.3. It must not be hardcoded in Apex.

Direct desktop/proxy flows can continue to use normal `Authorization: Bearer ...`.

## Required controls

1. Cloud Run has no `allUsers` or `allAuthenticatedUsers` invoker binding.
2. The API Gateway backend service account exists.
3. That service account has `roles/run.invoker` on the target Cloud Run service.
4. Gateway state is ACTIVE.
5. Missing application credentials return HTTP 401.
6. Invalid application credentials return HTTP 401.
7. Valid credentials can generate a PDF.
8. Salesforce-facing gateway does not expose template mutation/publish routes.
9. Secrets are not printed by verification scripts or stored in source control.

## Audit

Run:

```bash
bash scripts/sf1-gateway-security-audit.sh
```

The audit retrieves the configured bearer token from Secret Manager only in-process and does not print it.

## Salesforce contract for SF-1.3

Salesforce will use:

- Named Credential base URL: the API Gateway `https://*.gateway.dev` hostname.
- External Credential: integration/service principal.
- Custom header: `X-PdfDocGen-Authorization`.
- Header value: secure credential merge field containing the bearer token.
- Apex endpoint form: `callout:<NamedCredential>/api/v1/documents/generate`.

Apex must not contain the gateway URL or token as literals.

## Non-goals

SF-1.2 does not yet create Salesforce metadata or Apex code. Those belong to SF-1.3 and SF-1.4.

## Acceptance

SF-1.2 is complete when the security audit passes against hosted staging and CI passes for this branch.
