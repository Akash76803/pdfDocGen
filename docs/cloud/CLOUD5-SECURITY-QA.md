# CLOUD-5.6 — Security QA

## Objective

Verify the authentication and authorization behavior implemented for the current pdfDocGen hosted security model before final staging sign-off and merge.

Current hosted authentication mode is the transitional `static-bearer` mode backed by Secret Manager. OIDC-specific token validation cases such as expiry, issuer and audience checks are not applicable until an OIDC authenticator is introduced.

## Automated security regression coverage

The API suite verifies:

- public `GET /health` remains available at the application layer;
- protected routes reject missing credentials with `401 UNAUTHORIZED`;
- malformed Authorization headers reject with `401 UNAUTHORIZED`;
- wrong bearer values reject with `401 UNAUTHORIZED`;
- valid bearer credentials preserve normal generation behavior;
- callers without the required capability receive `403 FORBIDDEN`;
- denied callers do not execute generation or batch-generation handlers;
- generator callers cannot publish templates;
- admin callers can perform privileged template deletion;
- local desktop CORS preflight allows the `Authorization` header;
- unknown protected routes are authenticated first: unauthenticated callers receive 401, authenticated callers receive 404;
- hosted Cloud Run configuration fails closed if application authentication is disabled;
- startup diagnostics expose only auth mode and never bearer values.

## Hosted controls already verified

CLOUD-5.5 staging verification established:

- Cloud Run has no public principals;
- dedicated runtime service account is attached;
- Secret Manager access is scoped to the auth secret;
- bucket role is `roles/storage.objectUser`;
- Firestore role is `roles/datastore.user`;
- hosted no-token generation returns `401 UNAUTHORIZED`;
- authorized generation returns a valid PDF;
- secret rotation successfully moved from version 1 to version 2;
- old secret version 1 was disabled only after the version 2 revision passed security audit and hosted smoke;
- final security audit passed all six controls.

## CLOUD-5.6 acceptance checklist

1. Local typecheck passes.
2. Full automated test suite passes with the new negative security cases.
3. Production build passes.
4. Code Health workflow passes on the latest branch head.
5. Container Smoke workflow passes on the latest branch head.
6. No secret values are committed or emitted by startup diagnostics.
7. Hosted security audit remains green.
8. Hosted auth smoke remains green.
9. Dependency audit is reviewed and actionable production dependency findings are resolved or explicitly documented before final production-readiness sign-off.

## Deferred to the future OIDC/front-door implementation

The following checks belong to an OIDC-capable authenticator and must not be claimed as covered by static-bearer authentication:

- expired token rejection;
- wrong issuer rejection;
- wrong audience rejection;
- signature/key rotation validation;
- tenant/client claim validation.

These remain requirements for the future external identity/front-door implementation.

## Next

After CLOUD-5.6 passes, continue to CLOUD-5.7 Staging Verification & Runbook, complete PR #10 readiness checks, merge to `main`, verify post-merge CI, and then start CLOUD-6 Logging, Monitoring & Audit.
