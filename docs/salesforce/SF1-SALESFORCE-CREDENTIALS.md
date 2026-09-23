# SF-1.3 — Salesforce External Credential + Named Credential

## Goal

Configure Salesforce so Apex can call the secured pdfDocGen API Gateway without hardcoding the gateway URL or client bearer token.

## Endpoint

Use the API Gateway base URL:

```
https://pdf-doc-gen-gateway-bwn8vuu6.uc.gateway.dev
```

The Cloud Run backend remains private.

## Salesforce setup

### 1. Create External Credential

Setup -> Named Credentials -> External Credentials -> New.

Use:

- Label: `PDF Doc Gen External Credential`
- Name: `PDF_Doc_Gen_External_Credential`
- Authentication Protocol: `Custom`

Save it.

### 2. Create Principal

On the External Credential, create a principal:

- Parameter Name: `PDFDocGenIntegration`
- Sequence Number: `1`
- Identity Type: Named Principal

Add Authentication Parameter:

- Name: `ClientToken`
- Value: the current pdfDocGen application bearer token

Do not store this token in Apex, Custom Labels, Custom Metadata, source control, or logs.

### 3. Create Custom Header

On the same External Credential, create:

- Header Name: `X-PdfDocGen-Authorization`
- Header Value:

```
{!'Bearer ' & $Credential.PDF_Doc_Gen_External_Credential.ClientToken}
```

- Sequence Number: `1`

This matches the SF-1.1/SF-1.2 gateway authentication contract.

### 4. Create Named Credential

Setup -> Named Credentials -> Named Credentials -> New.

Use:

- Label: `PDF Doc Gen API`
- Name: `PDF_Doc_Gen_API`
- URL: `https://pdf-doc-gen-gateway-bwn8vuu6.uc.gateway.dev`
- External Credential: `PDF_Doc_Gen_External_Credential`
- Generate Authorization Header: disabled
- Allow Formulas in HTTP Header: enabled if shown by the org UI

Save it.

### 5. Grant principal access

Create or reuse a permission set for users/integration context that will make the callout.

Grant access to the External Credential principal `PDFDocGenIntegration`.

The user running the Apex callout must have access to the external credential principal.

## Apex endpoint contract

Apex must call the Named Credential alias, not a literal URL:

```apex
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:PDF_Doc_Gen_API/api/v1/documents/generate');
req.setMethod('POST');
req.setHeader('Content-Type', 'application/json');
```

Do not set `X-PdfDocGen-Authorization` in Apex. Salesforce injects it from the External Credential.

## Validation target

SF-1.3 is complete when:

1. External Credential exists with Custom authentication.
2. Named Principal exists with encrypted `ClientToken` authentication parameter.
3. Custom header resolves to `X-PdfDocGen-Authorization: Bearer <token>`.
4. Named Credential points to the API Gateway hostname.
5. Required users/permission sets can access the external credential principal.
6. A simple Apex callout using `callout:PDF_Doc_Gen_API` reaches the gateway without hardcoded URL/token.

The end-to-end PDF generation logic itself is implemented in SF-1.4.
