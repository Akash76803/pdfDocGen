# CLOUD-5.4 Secure Client Integration

## Goal
Give clients a secure way to call the protected pdfDocGen API without embedding reusable privileged credentials in shipped/browser code.

## Desktop / Tauri

The desktop publisher now accepts a `CloudApiAccessTokenProvider`.

Behavior:
- the publisher asks the provider for a token immediately before the API request;
- a non-empty token is sent as `Authorization: Bearer <token>`;
- the token is not written to LocalStorage by the publisher;
- if a configured provider returns no token, publishing fails closed with `CLOUD_AUTH_REQUIRED`;
- provider errors surface as `CLOUD_AUTH_UNAVAILABLE`;
- the existing no-provider path remains available for local/backward-compatible development while hosted enforcement is configured separately.

The provider abstraction is intentionally independent of a specific identity vendor so a later OAuth2/OIDC, Supabase Auth, enterprise IdP, or brokered desktop session can supply short-lived tokens without changing the publish contract.

## Salesforce

Recommended boundary:
- LWC must not contain a reusable cloud secret.
- Apex performs the server-side callout.
- Use Salesforce Named Credential / External Credential for managed authentication where applicable.
- The callout sends a short-lived bearer/access token or uses the eventual trusted gateway flow.
- API `401` means the caller is not authenticated.
- API `403` means the identity is valid but lacks the required capability.

Conceptual flow:

```
LWC action
   |
   v
Apex service
   |
   v
Named Credential / External Credential
   |
   v
Authenticated HTTPS front door
   |
   v
Private pdfDocGen Cloud Run API
```

## Future local connectors

Tally/BUSY/DMS/local agents should use the same rule:
- no shared privileged secret compiled into distributable client code;
- prefer short-lived tokens, device/brokered credentials, or a managed service identity;
- keep token acquisition outside the document payload mapper;
- inject `Authorization` at the HTTP transport boundary.

## Security properties

- Token retrieval is separated from business payload generation.
- Callers cannot spoof server principal fields through request JSON.
- Authorization decisions remain server-side.
- Tokens must never be logged.
- Token values must never be committed to source control.
- Hosted secret/configuration wiring belongs to CLOUD-5.5.

## Verification

Desktop unit coverage must prove:
1. token provider is called once per publish;
2. token is injected as a Bearer header;
3. token is not persisted by the publisher;
4. missing token fails before network I/O;
5. provider failure fails before network I/O;
6. existing publish/version-conflict behavior remains compatible.

## Next
CLOUD-5.5 will harden hosted IAM and secrets, choose the staging authentication mode, and wire protected configuration without committing credential values.
