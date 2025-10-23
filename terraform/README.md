# SleepIQ Lambda + API Gateway (Terraform)

This directory contains Terraform Infrastructure as Code (IaC) for deploying the SleepIQ scraper as an AWS Lambda function with API Gateway.

## Architecture

- **AWS Lambda**: Node.js 20.x runtime, 2048 MB memory, 120s timeout
- **Chrome Layer**: Uses `@sparticuz/chromium` for headless Chrome support
- **S3 Bucket**: Private, encrypted bucket for SleepIQ session storage
- **API Gateway**: HTTP API (v2) with POST /sleep endpoint
- **IAM**: Lambda execution role with CloudWatch Logs and S3 permissions

## Prerequisites

- **AWS CLI**: Configured with credentials (`aws sts get-caller-identity` should work)
- **Terraform**: >= 1.5.0
- **Node.js**: 20+ with npm
- **Tools**: `zip`, `bash`, `rsync`

## Setup

### 1. Create your environment configuration

```bash
cd /Users/rgil/projects/personal/sleepiq
cp .env.lambda.example .env.lambda
```

Edit `.env.lambda` and fill in:

```bash
SLEEPIQ_USERNAME=your_email@example.com
SLEEPIQ_PASSWORD=your_password
API_USERNAME=api_user
API_PASSWORD=api_password
AWS_REGION=us-east-1
SESSION_BUCKET_NAME=sleepiq-sessions-YOUR-UNIQUE-NAME
```

**Important**: The `SESSION_BUCKET_NAME` must be globally unique across all AWS accounts.

### 2. (Optional) Customize Terraform variables

```bash
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars` if you want to override default settings.

### 3. Update package.json dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.620.0",
    "puppeteer-core": "^22.12.1",
    "commander": "^12.1.0",
    "dotenv": "^17.2.3",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3",
    "@types/node": "^24.8.1"
  }
}
```

Run `npm install` to update dependencies.

## Deployment

From the project root, run:

```bash
./scripts/deploy.sh
```

This script will:
1. Load credentials from `.env` and `.env.lambda`
2. Build the Lambda deployment package
3. Initialize Terraform
4. Show you the deployment plan
5. Apply the infrastructure changes (after confirmation)
6. Display outputs including the API endpoint URL

### Auto-approve deployment

To skip the interactive confirmation:

```bash
AUTO_APPROVE=1 ./scripts/deploy.sh
```

## Testing

After deployment, test your API:

```bash
# Get the API URL
API_URL=$(terraform -chdir=terraform output -raw api_invoke_url)

# Make a request
curl -X POST "$API_URL" \
  -H "Authorization: Basic $(echo -n "${API_USERNAME}:${API_PASSWORD}" | base64)"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "rafa": { "score": "73", ... },
    "miki": { "score": "73", ... }
  }
}
```

## Environment Variables (Lambda)

The Lambda function uses these environment variables (automatically set by Terraform):

- `SLEEPIQ_USERNAME` - SleepIQ login email
- `SLEEPIQ_PASSWORD` - SleepIQ login password
- `API_USERNAME` - Basic auth username for API requests
- `API_PASSWORD` - Basic auth password for API requests
- `SESSION_BUCKET_NAME` - S3 bucket name for session persistence
- `PUPPETEER_EXECUTABLE_PATH` - Path to Chromium binary from layer

## Session Persistence

Sessions are stored in S3 at `sessions/{username}.json` to avoid repeated logins during development, per your requirement to keep sessions logged in.

## Troubleshooting

### 401 Unauthorized
- Verify `API_USERNAME` and `API_PASSWORD` in `.env.lambda`
- Check that your Basic Auth header is properly encoded

### Lambda errors about Chromium
- Confirm the `chrome_layer_arn` matches your region and architecture
- Check CloudWatch Logs: `/aws/lambda/sleepiq-scraper`

### S3 AccessDenied
- Verify the `SESSION_BUCKET_NAME` matches the created bucket
- Check IAM policy attachments in AWS Console

### Terraform state issues
- State is stored locally in `terraform/terraform.tfstate`
- Don't commit this file (it's in `.gitignore`)
- Consider using remote state (S3 + DynamoDB) for production

## Updating the Lambda

After making code changes:

```bash
./scripts/deploy.sh
```

Terraform will detect the source code hash change and update the Lambda function.

## Destroying Infrastructure

To remove all created resources:

```bash
terraform -chdir=terraform destroy
```

**Warning**: This will delete the S3 bucket and all sessions.

## Cost Estimate

Based on typical usage:
- Lambda: ~$0.20 per million requests
- API Gateway: ~$1.00 per million requests  
- S3: <$0.01/month for session storage
- CloudWatch Logs: ~$0.50/GB ingested

**Estimated monthly cost for occasional use: < $1**

## Notes

- No Docker files or Docker logic are used
- The Chrome Lambda layer provides the Chromium binary
- Using `puppeteer-core` (not `puppeteer`) to avoid bundling Chromium
- Lambda timeout is 120s to account for Puppeteer initialization and scraping
- Memory is set to 2048 MB for optimal Puppeteer performance

## Architecture Diagram

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  API Client │────────▶│ API Gateway  │────────▶│   Lambda     │
│ (with Basic │  HTTPS  │  (HTTP API)  │  Invoke │  (Node.js)   │
│    Auth)    │◀────────│              │◀────────│              │
└─────────────┘  JSON   └──────────────┘  JSON   └──────┬───────┘
                                                          │
                                                          │ Read/Write
                                                          │ Sessions
                                                          ▼
                                                   ┌──────────────┐
                                                   │  S3 Bucket   │
                                                   │  (Sessions)  │
                                                   └──────────────┘
```
