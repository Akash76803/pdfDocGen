# SF-1.4 — Apex Integration Service

## Scope

SF-1.4 introduces a reusable Salesforce Apex client for the secured pdfDocGen generation endpoint.

Files:

- `salesforce/main/default/classes/PdfDocGenService.cls`
- `salesforce/main/default/classes/PdfDocGenServiceTest.cls`

## Named Credential dependency

The service calls:

```
callout:Shree_Tech__PDF_Doc_Gen_API/api/v1/documents/generate
```

Authentication remains fully owned by the Salesforce Named/External Credential configured in SF-1.3. The bearer token is not present in Apex.

## Service behavior

`PdfDocGenService.generatePdf(...)`:

1. validates template id/version/data;
2. builds the existing hosted generation JSON contract;
3. adds a unique Idempotency-Key;
4. sends the request using the Named Credential;
5. requires HTTP 200;
6. validates that the response has a PDF signature;
7. returns structured metadata plus the PDF as Base64;
8. converts structured API failures into `PdfDocGenException` without logging arbitrary response bodies.

## Salesforce deployment

Deploy the two Apex classes and their metadata files into the Salesforce org/package source.

Then run:

```apex
PdfDocGenService.GenerationResult result = PdfDocGenService.generatePdf(
    'cloud3-hosted-smoke-20260921',
    2,
    new Map<String, Object>{ 'name' => 'SF-1.4 Hosted Smoke' },
    'sf1-apex-service-smoke.pdf'
);

System.debug('STATUS=' + result.statusCode);
System.debug('SIZE=' + result.sizeBytes);
System.debug('JOB=' + result.jobId);
System.debug('PAGE COUNT=' + result.pageCount);
```

Expected:

- statusCode = 200
- sizeBytes > 0
- bodyBase64 starts with `JVBER`
- pageCount = 1 for the current smoke template

## Unit tests

`PdfDocGenServiceTest` uses `HttpCalloutMock` and covers:

- successful PDF generation;
- structured 401 API error;
- HTTP 200 with a non-PDF payload;
- input validation before callout.

## Next phase

SF-1.5 will consume the returned PDF and create/link a Salesforce `ContentVersion` / File to the target business record.
