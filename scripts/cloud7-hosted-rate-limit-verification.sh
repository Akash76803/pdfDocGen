#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pdf-doc-gen-api-staging}"

restore() {
  echo
  echo "Restoring normal CLOUD-7 staging guardrails..."
  MAX_INSTANCES=10 \
  API_RATE_LIMIT_PER_MINUTE=120 \
  API_ABSOLUTE_RATE_LIMIT_PER_MINUTE=1000 \
  bash scripts/cloud7-apply-runtime-guardrails.sh

  echo
  bash scripts/cloud7-verify-runtime-guardrails.sh
}
trap restore EXIT

echo "Applying deterministic hosted quota-test guardrails..."
MAX_INSTANCES=1 \
API_RATE_LIMIT_PER_MINUTE=2 \
API_ABSOLUTE_RATE_LIMIT_PER_MINUTE=1000 \
bash scripts/cloud7-apply-runtime-guardrails.sh

echo
echo "Verifying temporary single-instance quota-test configuration..."
MAX_INSTANCES=1 \
API_RATE_LIMIT_PER_MINUTE=2 \
API_ABSOLUTE_RATE_LIMIT_PER_MINUTE=1000 \
bash scripts/cloud7-verify-runtime-guardrails.sh

echo
echo "Running hosted 429 quota smoke..."
EXPECTED_LIMIT=2 bash scripts/cloud7-hosted-rate-limit-smoke.sh

echo
echo "CLOUD-7.2 deterministic hosted quota verification PASS"
