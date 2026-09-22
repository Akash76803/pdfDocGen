# CLOUD-6.4 — GCP Monitoring & Alert Runbook

## Objective
Turn the structured `api_metric` events emitted by the private Cloud Run API into operationally useful Cloud Logging queries, log-based metrics, and alert-ready monitoring signals without exposing request bodies, bearer tokens, raw error messages, or document data.

## Service
- Project: `pdf-gen-509308`
- Region: `us-central1`
- Cloud Run service: `pdf-doc-gen-api-staging`
- Runtime remains private.

## Structured metric events
The API emits JSON log records with:
- `event = api_metric`
- `service = document-builder-api`
- `metric`
- `value`
- `labels`

Supported metric names:
- `api.request.count`
- `api.request.error_count`
- `api.request.duration_ms`
- `api.operation.count`
- `api.operation.failure_count`
- `api.operation.duration_ms`

Safe labels may include:
- `method`
- `path`
- `statusClass`
- `operation`
- `outcome`
- `format`
- `errorCode`

Do not add template IDs, authorization headers, request payloads, generated content, raw error messages, or secret values to monitoring labels.

## Verify logs in Cloud Logging
After deploying the CLOUD-6 runtime, make authenticated requests and query:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="pdf-doc-gen-api-staging" AND jsonPayload.event="api_metric"' \
  --project=pdf-gen-509308 \
  --limit=50 \
  --freshness=30m \
  --format=json
```

Expected evidence:
- request count metric events
- request duration metric events
- operation count/duration events for generation
- failure metrics after an intentional rejected request
- no bearer token or payload values

## Recommended log-based metrics
Create metrics only after verifying the JSON field shape in hosted logs.

### Request errors
Filter:
```
resource.type="cloud_run_revision"
resource.labels.service_name="pdf-doc-gen-api-staging"
jsonPayload.event="api_metric"
jsonPayload.metric="api.request.error_count"
```

Suggested metric name:
`pdf_doc_gen_api_request_errors`

### Operation failures
Filter:
```
resource.type="cloud_run_revision"
resource.labels.service_name="pdf-doc-gen-api-staging"
jsonPayload.event="api_metric"
jsonPayload.metric="api.operation.failure_count"
```

Suggested metric name:
`pdf_doc_gen_api_operation_failures`

### Request latency
Filter:
```
resource.type="cloud_run_revision"
resource.labels.service_name="pdf-doc-gen-api-staging"
jsonPayload.event="api_metric"
jsonPayload.metric="api.request.duration_ms"
```

Suggested distribution metric:
`pdf_doc_gen_api_request_duration_ms`

## Initial alert policy guidance
Start conservatively in staging.

Recommended signals:
1. Request error count > 5 in 5 minutes.
2. Operation failure count > 3 in 5 minutes.
3. Request latency p95 > 10 seconds for 10 minutes.

Tune thresholds after real traffic exists. Do not page on one-off staging failures.

## Hosted acceptance
CLOUD-6.4 is complete when:
1. Latest CLOUD-6 code is deployed to private staging.
2. Hosted smoke requests generate `api_metric` entries.
3. Cloud Logging query returns expected metric records.
4. At least one intentional failure generates error/failure metric records.
5. No secret or request payload content is present.
6. Monitoring metric/alert plan is documented and ready for production hardening.

## Rollback
Observability is additive. If runtime logging causes a regression:
- route traffic to the prior known-good Cloud Run revision
- keep Cloud Run private
- rerun security audit and hosted auth smoke
- investigate logs without weakening IAM/authentication controls
