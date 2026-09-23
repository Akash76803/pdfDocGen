@IsTest
private class PdfDocGenServiceTest {
    private class SuccessMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            System.assertEquals('POST', req.getMethod());
            System.assertEquals(
                'callout:Shree_Tech__PDF_Doc_Gen_API/api/v1/documents/generate',
                req.getEndpoint()
            );
            System.assertEquals('application/json', req.getHeader('Content-Type'));
            System.assertNotEquals(null, req.getHeader('Idempotency-Key'));

            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(req.getBody());
            System.assertEquals('cloud3-hosted-smoke-20260921', body.get('templateId'));
            System.assertEquals(2, Integer.valueOf(String.valueOf(body.get('templateVersion'))));

            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="sf1-test.pdf"');
            res.setHeader('X-Document-Job-Id', 'job-123');
            res.setHeader('X-Document-Template-Id', 'cloud3-hosted-smoke-20260921');
            res.setHeader('X-Document-Template-Version', '2');
            res.setHeader('X-Document-Page-Count', '1');
            res.setHeader('X-Request-Id', 'request-123');
            res.setBodyAsBlob(Blob.valueOf('%PDF-1.4\nmock'));
            return res;
        }
    }

    private class ErrorMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(401);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"error":{"code":"UNAUTHORIZED","message":"Authentication is required."}}');
            return res;
        }
    }

    private class NonPdfMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"status":"ok"}');
            return res;
        }
    }

    @IsTest
    static void generatePdf_success() {
        Test.setMock(HttpCalloutMock.class, new SuccessMock());

        Test.startTest();
        PdfDocGenService.GenerationResult result = PdfDocGenService.generatePdf(
            'cloud3-hosted-smoke-20260921',
            2,
            new Map<String, Object>{ 'name' => 'Salesforce Unit Test' },
            'sf1-test.pdf'
        );
        Test.stopTest();

        System.assertEquals(200, result.statusCode);
        System.assertEquals('application/pdf', result.contentType);
        System.assertEquals('sf1-test.pdf', result.fileName);
        System.assertEquals('job-123', result.jobId);
        System.assertEquals('cloud3-hosted-smoke-20260921', result.templateId);
        System.assertEquals(2, result.templateVersion);
        System.assertEquals(1, result.pageCount);
        System.assertEquals('request-123', result.requestId);
        System.assert(result.sizeBytes > 0);
        System.assert(result.bodyBase64.startsWith('JVBER'));
    }

    @IsTest
    static void generatePdf_surfacesStructuredApiError() {
        Test.setMock(HttpCalloutMock.class, new ErrorMock());

        try {
            PdfDocGenService.generatePdf(
                'cloud3-hosted-smoke-20260921',
                2,
                new Map<String, Object>(),
                'test.pdf'
            );
            System.assert(false, 'Expected PdfDocGenException');
        } catch (PdfDocGenService.PdfDocGenException ex) {
            System.assert(ex.getMessage().contains('HTTP 401'));
            System.assert(ex.getMessage().contains('UNAUTHORIZED'));
        }
    }

    @IsTest
    static void generatePdf_rejectsNonPdfSuccessBody() {
        Test.setMock(HttpCalloutMock.class, new NonPdfMock());

        try {
            PdfDocGenService.generatePdf(
                'cloud3-hosted-smoke-20260921',
                2,
                new Map<String, Object>(),
                'test.pdf'
            );
            System.assert(false, 'Expected PdfDocGenException');
        } catch (PdfDocGenService.PdfDocGenException ex) {
            System.assert(ex.getMessage().contains('not a valid PDF'));
        }
    }

    @IsTest
    static void generatePdf_validatesInputBeforeCallout() {
        try {
            PdfDocGenService.generatePdf('', 0, null, null);
            System.assert(false, 'Expected PdfDocGenException');
        } catch (PdfDocGenService.PdfDocGenException ex) {
            System.assertEquals('templateId is required.', ex.getMessage());
        }
    }
}
