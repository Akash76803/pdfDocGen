public with sharing class PdfDocGenService {
    private static final String NAMED_CREDENTIAL = 'callout:Shree_Tech__PDF_Doc_Gen_API';
    private static final String GENERATE_PATH = '/api/v1/documents/generate';
    private static final Integer TIMEOUT_MS = 120000;

    public class PdfDocGenException extends Exception {}

    public class GenerationResult {
        @AuraEnabled public Integer statusCode;
        @AuraEnabled public String contentType;
        @AuraEnabled public String fileName;
        @AuraEnabled public Integer sizeBytes;
        @AuraEnabled public String jobId;
        @AuraEnabled public String templateId;
        @AuraEnabled public Integer templateVersion;
        @AuraEnabled public Integer pageCount;
        @AuraEnabled public String requestId;
        @AuraEnabled public String bodyBase64;
    }

    public static GenerationResult generatePdf(
        String templateId,
        Integer templateVersion,
        Map<String, Object> data,
        String fileName
    ) {
        validateInput(templateId, templateVersion, data);

        HttpRequest req = new HttpRequest();
        req.setEndpoint(NAMED_CREDENTIAL + GENERATE_PATH);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Idempotency-Key', buildIdempotencyKey(templateId));
        req.setTimeout(TIMEOUT_MS);

        Map<String, Object> output = new Map<String, Object>{
            'format' => 'pdf'
        };
        if (String.isNotBlank(fileName)) {
            output.put('fileName', fileName);
        }

        Map<String, Object> payload = new Map<String, Object>{
            'templateId' => templateId,
            'output' => output,
            'data' => data
        };
        if (templateVersion != null) {
            payload.put('templateVersion', templateVersion);
        }

        req.setBody(JSON.serialize(payload));

        HttpResponse res = new Http().send(req);
        Integer statusCode = res.getStatusCode();

        if (statusCode != 200) {
            throw buildHttpException(res);
        }

        Blob pdf = res.getBodyAsBlob();
        if (pdf == null || pdf.size() == 0) {
            throw new PdfDocGenException('pdfDocGen returned an empty PDF response.');
        }

        String encoded = EncodingUtil.base64Encode(pdf);
        if (!encoded.startsWith('JVBER')) {
            throw new PdfDocGenException('pdfDocGen response is not a valid PDF payload.');
        }

        GenerationResult result = new GenerationResult();
        result.statusCode = statusCode;
        result.contentType = res.getHeader('Content-Type');
        result.fileName = resolveFileName(res.getHeader('Content-Disposition'), fileName, templateId);
        result.sizeBytes = pdf.size();
        result.jobId = res.getHeader('X-Document-Job-Id');
        result.templateId = res.getHeader('X-Document-Template-Id');
        result.templateVersion = parseIntegerHeader(res.getHeader('X-Document-Template-Version'));
        result.pageCount = parseIntegerHeader(res.getHeader('X-Document-Page-Count'));
        result.requestId = res.getHeader('X-Request-Id');
        result.bodyBase64 = encoded;
        return result;
    }

    private static void validateInput(
        String templateId,
        Integer templateVersion,
        Map<String, Object> data
    ) {
        if (String.isBlank(templateId)) {
            throw new PdfDocGenException('templateId is required.');
        }
        if (templateVersion != null && templateVersion < 1) {
            throw new PdfDocGenException('templateVersion must be a positive integer.');
        }
        if (data == null) {
            throw new PdfDocGenException('data is required.');
        }
    }

    private static String buildIdempotencyKey(String templateId) {
        String seed = templateId + ':' + String.valueOf(Datetime.now().getTime()) + ':' +
            String.valueOf(Crypto.getRandomLong());
        String digest = EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(seed))
        ).toLowerCase();
        return 'sf-' + digest.substring(0, 40);
    }

    private static PdfDocGenException buildHttpException(HttpResponse res) {
        String message = 'pdfDocGen callout failed with HTTP ' + res.getStatusCode();
        String body = res.getBody();
        if (String.isNotBlank(body)) {
            try {
                Object parsed = JSON.deserializeUntyped(body);
                if (parsed instanceof Map<String, Object>) {
                    Map<String, Object> root = (Map<String, Object>) parsed;
                    Object errorValue = root.get('error');
                    if (errorValue instanceof Map<String, Object>) {
                        Map<String, Object> errorObj = (Map<String, Object>) errorValue;
                        String code = String.valueOf(errorObj.get('code'));
                        String apiMessage = String.valueOf(errorObj.get('message'));
                        message += ' [' + code + '] ' + apiMessage;
                    }
                }
            } catch (Exception ignored) {
                // Keep the HTTP-only message; do not echo arbitrary response bodies.
            }
        }
        return new PdfDocGenException(message);
    }

    private static Integer parseIntegerHeader(String value) {
        if (String.isBlank(value)) return null;
        try {
            return Integer.valueOf(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String resolveFileName(
        String contentDisposition,
        String requestedFileName,
        String templateId
    ) {
        if (String.isNotBlank(contentDisposition)) {
            Matcher m = Pattern.compile('filename="([^"]+)"').matcher(contentDisposition);
            if (m.find()) {
                return m.group(1);
            }
        }
        if (String.isNotBlank(requestedFileName)) return requestedFileName;
        return templateId + '.pdf';
    }
}
