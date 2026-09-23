#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"
GATEWAY_ID="${GATEWAY_ID:-pdf-doc-gen-gateway}"
GATEWAY_SA_NAME="${GATEWAY_SA_NAME:-pdf-doc-gen-gateway}"
AUTH_SECRET="${AUTH_SECRET:-pdf-doc-gen-api-auth-token}"
AUTH_SECRET_VERSION="${AUTH_SECRET_VERSION:-2}"
EXPECTED_GATEWAY_SA="${GATEWAY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

echo "SF-1.2 gateway security audit"
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE"
echo "Gateway: $GATEWAY_ID"
echo

echo "[1/7] Cloud Run remains private"
POLICY="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"
if printf '%s' "$POLICY" | grep -Eq '"(allUsers|allAuthenticatedUsers)"'; then
  fail "public Cloud Run principal found"
fi
pass "no public Cloud Run principals"

echo "[2/7] Gateway service account exists"
gcloud iam service-accounts describe "$EXPECTED_GATEWAY_SA" --project="$PROJECT_ID" >/dev/null
pass "gateway service account exists: $EXPECTED_GATEWAY_SA"

echo "[3/7] Gateway service account can invoke Cloud Run"
INVOCERS="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --flatten='bindings[].members' --filter='bindings.role=roles/run.invoker' --format='value(bindings.members)')"
printf '%s
' "$INVOCERS" | grep -Fx "serviceAccount:$EXPECTED_GATEWAY_SA" >/dev/null   || fail "gateway service account is missing roles/run.invoker"
pass "gateway service account has roles/run.invoker"

echo "[4/7] Gateway is active"
GATEWAY_HOST="$(gcloud api-gateway gateways describe "$GATEWAY_ID" --project="$PROJECT_ID" --location="$REGION" --format='value(defaultHostname)')"
GATEWAY_STATE="$(gcloud api-gateway gateways describe "$GATEWAY_ID" --project="$PROJECT_ID" --location="$REGION" --format='value(state)')"
[[ "$GATEWAY_STATE" == "ACTIVE" ]] || fail "gateway state is $GATEWAY_STATE"
[[ -n "$GATEWAY_HOST" ]] || fail "gateway hostname is empty"
pass "gateway ACTIVE at https://$GATEWAY_HOST"

echo "[5/7] Public gateway rejects missing and invalid client credentials"
NO_TOKEN_STATUS="$(curl -sS -o /tmp/sf1-security-no-token.json -w '%{http_code}' -X POST "https://$GATEWAY_HOST/api/v1/documents/generate" -H 'Content-Type: application/json' -d '{"templateId":"security-check","output":{"format":"pdf"},"data":{}}')"
[[ "$NO_TOKEN_STATUS" == "401" ]] || fail "missing-token request returned HTTP $NO_TOKEN_STATUS"
pass "missing client token rejected with 401"

BAD_TOKEN_STATUS="$(curl -sS -o /tmp/sf1-security-bad-token.json -w '%{http_code}' -X POST "https://$GATEWAY_HOST/api/v1/documents/generate" -H 'Content-Type: application/json' -H 'X-PdfDocGen-Authorization: Bearer definitely-invalid-token' -d '{"templateId":"security-check","output":{"format":"pdf"},"data":{}}')"
[[ "$BAD_TOKEN_STATUS" == "401" ]] || fail "invalid-token request returned HTTP $BAD_TOKEN_STATUS"
pass "invalid client token rejected with 401"

echo "[6/7] Valid client credential works only through protected application auth"
TOKEN="$(gcloud secrets versions access "$AUTH_SECRET_VERSION" --secret="$AUTH_SECRET" --project="$PROJECT_ID")"
[[ -n "$TOKEN" ]] || fail "resolved client token is empty"
GOOD_STATUS="$(curl -sS -o /tmp/sf1-security-auth-response.bin -w '%{http_code}' -X POST "https://$GATEWAY_HOST/api/v1/documents/generate" -H "X-PdfDocGen-Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H "Idempotency-Key: sf1-security-$(date -u +%Y%m%d%H%M%S)" -d '{"templateId":"cloud3-hosted-smoke-20260921","templateVersion":2,"output":{"format":"pdf"},"data":{"name":"SF1 Security Audit"}}')"
[[ "$GOOD_STATUS" == "200" ]] || fail "valid client credential returned HTTP $GOOD_STATUS"
MAGIC="$(head -c 4 /tmp/sf1-security-auth-response.bin || true)"
[[ "$MAGIC" == "%PDF" ]] || fail "authenticated response is not a PDF"
pass "valid protected gateway generation returned PDF"

echo "[7/7] Administrative template routes are not exposed by the Salesforce gateway"
ADMIN_STATUS="$(curl -sS -o /tmp/sf1-security-admin-route.json -w '%{http_code}' -X PUT "https://$GATEWAY_HOST/api/v1/templates/security-check/publish" -H "X-PdfDocGen-Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')"
if [[ "$ADMIN_STATUS" == "200" || "$ADMIN_STATUS" == "201" ]]; then
  fail "administrative template route is exposed through the Salesforce gateway"
fi
pass "template publishing route is not available through the Salesforce gateway (HTTP $ADMIN_STATUS)"

echo
echo "SF-1.2 gateway security audit PASS"
echo "Secrets were not printed."
