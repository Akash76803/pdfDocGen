#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pdf-gen-509308}"
MONTHLY_BUDGET_USD="${MONTHLY_BUDGET_USD:-}"
DISPLAY_NAME="${DISPLAY_NAME:-pdfDocGen monthly staging budget}"

[[ -n "$MONTHLY_BUDGET_USD" ]] || {
  echo "ERROR: MONTHLY_BUDGET_USD is required, for example MONTHLY_BUDGET_USD=20." >&2
  exit 1
}

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BILLING_ACCOUNT_NAME="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)')"
BILLING_ACCOUNT="${BILLING_ACCOUNT_NAME#billingAccounts/}"

[[ -n "$PROJECT_NUMBER" && -n "$BILLING_ACCOUNT" ]] || {
  echo "ERROR: could not resolve project number or linked billing account." >&2
  exit 1
}

echo "Creating alerts-only monthly budget"
echo "Project: $PROJECT_ID"
echo "Amount: USD $MONTHLY_BUDGET_USD"
echo "Thresholds: 50%, 80%, 100% actual"

gcloud billing budgets create   --billing-account="$BILLING_ACCOUNT"   --display-name="$DISPLAY_NAME"   --budget-amount="${MONTHLY_BUDGET_USD}USD"   --filter-projects="projects/$PROJECT_NUMBER"   --threshold-rule=percent=0.5,basis=current-spend   --threshold-rule=percent=0.8,basis=current-spend   --threshold-rule=percent=1.0,basis=current-spend

echo
echo "CLOUD-7.5 budget created."
echo "NOTE: Cloud Billing budgets are alerts/monitoring controls; they do not automatically stop service usage."
