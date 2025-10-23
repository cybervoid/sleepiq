#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${ROOT_DIR}/terraform"

# Load environment variables from .env and/or .env.lambda if present
# This allows Terraform to "pick up" credentials from your local .env
set -a
[[ -f "${ROOT_DIR}/.env" ]] && source "${ROOT_DIR}/.env"
[[ -f "${ROOT_DIR}/.env.lambda" ]] && source "${ROOT_DIR}/.env.lambda"
set +a

echo "🔐 Validating required environment variables..."

# Required variables
: "${SLEEPIQ_USERNAME:?SLEEPIQ_USERNAME is required}"
: "${SLEEPIQ_PASSWORD:?SLEEPIQ_PASSWORD is required}"
: "${API_USERNAME:?API_USERNAME is required}"
: "${API_PASSWORD:?API_PASSWORD is required}"
: "${SESSION_BUCKET_NAME:?SESSION_BUCKET_NAME is required}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "✅ Environment variables validated"

# Export TF_VAR_* so Terraform reads them as input variables
export TF_VAR_sleepiq_username="${SLEEPIQ_USERNAME}"
export TF_VAR_sleepiq_password="${SLEEPIQ_PASSWORD}"
export TF_VAR_api_username="${API_USERNAME}"
export TF_VAR_api_password="${API_PASSWORD}"
export TF_VAR_s3_bucket_name="${SESSION_BUCKET_NAME}"
export TF_VAR_aws_region="${AWS_REGION}"

# Optional: override layer ARN via TF_VAR_chrome_layer_arn if needed
# export TF_VAR_chrome_layer_arn="..."

echo ""
echo "🏗️  Building Lambda package..."
bash "${ROOT_DIR}/scripts/build-lambda.sh"

echo ""
echo "🚀 Deploying with Terraform..."
echo "   Region: ${AWS_REGION}"
echo "   Bucket: ${SESSION_BUCKET_NAME}"
echo ""

# Terraform deploy
terraform -chdir="${TF_DIR}" init

echo ""
terraform -chdir="${TF_DIR}" plan

echo ""
# Set AUTO_APPROVE=1 to skip interactive approval
if [[ "${AUTO_APPROVE:-0}" == "1" ]]; then
  terraform -chdir="${TF_DIR}" apply -auto-approve
else
  terraform -chdir="${TF_DIR}" apply
fi

echo ""
echo "📋 Deployment outputs:"
terraform -chdir="${TF_DIR}" output

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Test your API with:"
echo "  curl -X POST \"\$(terraform -chdir=${TF_DIR} output -raw api_invoke_url)\" \\"
echo "    -H \"Authorization: Basic \$(echo -n \"\${API_USERNAME}:\${API_PASSWORD}\" | base64)\""
