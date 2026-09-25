# AUTH-UX-3: Backend Google OAuth exchange

## Objective
A user clicks **Generate Token** on Windows, signs in with Google and receives one `pdfdg_*` integration credential. The same issued token can be used on Desktop and Salesforce. End users never enter or generate a Google OAuth client secret.

## Architecture
1. Native Tauri desktop creates a PKCE verifier and random state, opens Google's standard system-browser authorization page, and receives the one-use code on an ephemeral `http://127.0.0.1:<port>/callback` listener. State is validated locally.
2. Desktop posts the short-lived `{code, codeVerifier, redirectUri, label}` to the hosted API Gateway's **POST /api/v1/auth/google/exchange** over HTTPS.
3. Cloud Run exchanges the one-use code with Google using the server-only OAuth client secret. It verifies Google's signed ID token (signature, expected Desktop client ID/audience, issuer, expiry, verified email and optional email allowlist).
4. Cloud Run issues an integration token and persists only its hash in the existing Firestore token store. Desktop keeps the issued token in Windows Credential Manager. Salesforce can use that token via its configured custom authorization header.

**Never** put the OAuth client secret in any `VITE_*` variable, Desktop installer, repository, log, or message. Authorization grants and issued integration tokens must not appear in screenshots or diagnostic output. End users must not repeat the Cloud Shell setup.

## New server configuration
- `API_AUTH_MODE=token-hybrid` (already configured in staging)
- `API_AUTH_GOOGLE_CLIENT_ID` = same installed Desktop OAuth client ID as Desktop `VITE_GOOGLE_OAUTH_CLIENT_ID`
- **NEW** `API_AUTH_GOOGLE_CLIENT_SECRET` = server-side environment variable backed by Google Secret Manager (never a literal in shell history)
- Existing `API_AUTH_STATIC_BEARER_TOKEN`, Firestore project, storage settings and API Gateway backend authentication remain unchanged.
- If the new secret is absent, the new exchange endpoint returns `503 GOOGLE_OAUTH_NOT_CONFIGURED`; existing API endpoints remain available.

## One-time administrator configuration (no secret shared in chat)
1. In Google Cloud Console > **Secret Manager**, create a secret named `pdfdocgen-google-oauth-client-secret`. Paste the user's current **Desktop OAuth client secret** there using the secure web interface. If the secret was ever exposed, rotate it first in Google Auth Platform. Grant **Secret Manager Secret Accessor** for this one secret to the runtime service account `pdf-doc-gen-api@pdf-gen-509308.iam.gserviceaccount.com` (verify that this is still the active runtime service account).
2. In Cloud Run > `pdf-doc-gen-api-staging` > Edit & Deploy New Revision > Variables & Secrets, add the secret as environment variable `API_AUTH_GOOGLE_CLIENT_SECRET` from the named Secret Manager secret. Preserve existing variables and service account. Do not switch live traffic before staging checks.
3. Deploy the updated combined source with this PR merged to `deploy/auth-ux2-cloud` using a **no-traffic tag**. Confirm `/health` and OPTIONS CORS on the tag. Confirm malformed POST to the **new** exchange path returns 400, not Gateway 404 or 503. Do not issue real user tokens during diagnostic shell tests.
4. Publish an **immutable new** API Gateway config from `deploy/api-gateway-openapi.yaml` with backend-auth service account `pdf-doc-gen-gateway@pdf-gen-509308.iam.gserviceaccount.com`. The OpenAPI managed service `host` and `allowCors` must be preserved. Promote the new config only after the backend tagged revision is ready. Keep existing `auth-ux2-20260925` for rollback.
5. Promote tagged Cloud Run revision once staging route checks pass. Verify Gateway `/health` (200), OPTIONS `/api/v1/auth/google/exchange` (204 and `access-control-allow-origin`), and malformed JSON POST (400). Verify existing document generation route still requires authentication.
6. Build a new Windows Tauri NSIS installer from the **same source commit**, with *only* `VITE_GOOGLE_OAUTH_CLIENT_ID` and `VITE_CLOUD_API_BASE_URL` in `apps/desktop/.env.production`. Never bundle `VITE_GOOGLE_OAUTH_CLIENT_SECRET`.
7. Click Generate Token: Google login must complete, Desktop must receive an issued `pdfdg_*` credential and securely store it. Confirm an authorized Salesforce test callout accepts the **same** token; do not paste or log the raw token.

## Rollback
- Cloud Run: previous verified revision `pdf-doc-gen-api-staging-00037-fuf` can be restored if still available; verify revision IDs before using.
- Gateway: previous config `auth-ux2-20260925` supports the prior API routes and remains a rollback option.
- The existing `POST /api/v1/auth/tokens` and `DELETE /api/v1/auth/tokens/current` routes remain intact for compatibility.
- If the new backend secret binding or Google exchange fails, pause Desktop rollout and inspect **redacted error codes only**. Never request real OAuth codes, tokens or secrets in support.

## Testing
`npm ci && npm run typecheck && npm test && npm run build`; Windows `cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`.
New unit/integration tests cover PKCE callback input validation, signed identity verification delegation, sanitization of upstream error responses, missing server secret, invalid redirect and issuing a hashed reusable token. Live Google/Cloud Gateway/Windows/Salesforce end-to-end tests remain separate manual acceptance gates.
