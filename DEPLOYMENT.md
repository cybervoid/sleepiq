# SleepIQ Lambda Deployment Guide

This guide will help you deploy the SleepIQ scraper to AWS Lambda with API Gateway using Terraform.

## Overview

The deployment creates:
- **AWS Lambda**: Runs your SleepIQ scraper with Node.js 20 and Puppeteer
- **API Gateway**: HTTP API endpoint with Basic Authentication
- **S3 Bucket**: Stores browser sessions to avoid repeated logins
- **IAM Roles**: Secure permissions for Lambda execution

## Quick Start

### 1. Prerequisites

Ensure you have:
- AWS CLI configured (`aws sts get-caller-identity` should work)
- Terraform >= 1.5.0 installed
- Node.js 20+ and npm
- Basic command-line tools: `bash`, `zip`, `rsync`

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `@aws-sdk/client-s3` - For S3 session storage
- `puppeteer-core` - Headless browser (binary comes from Lambda layer)
- Existing dependencies

### 3. Configure Environment

Create your Lambda environment configuration:

```bash
cp .env.lambda.example .env.lambda
```

Edit `.env.lambda` with your credentials:

```bash
# SleepIQ credentials
SLEEPIQ_USERNAME=your_email@example.com
SLEEPIQ_PASSWORD=your_sleepiq_password

# API Basic Auth credentials (you choose these)
API_USERNAME=api_user
API_PASSWORD=strong_random_password

# AWS Configuration
AWS_REGION=us-east-1

# S3 bucket name (must be globally unique!)
SESSION_BUCKET_NAME=sleepiq-sessions-yourname-$(date +%s)
```

**Important Notes:**
- The `SESSION_BUCKET_NAME` must be globally unique across all AWS accounts
- Choose a strong `API_PASSWORD` - this protects your API endpoint
- Never commit `.env.lambda` to git (it's already in `.gitignore`)

### 4. Deploy

From the project root:

```bash
./scripts/deploy.sh
```

The deployment script will:
1. ✅ Validate your environment variables
2. 📦 Build the Lambda deployment package
3. 🚀 Initialize and apply Terraform
4. 📋 Display the API endpoint URL

**First deployment** takes ~2-3 minutes. Subsequent updates are faster.

### 5. Test

After deployment completes, test your API:

```bash
# Get your API URL from Terraform outputs
API_URL=$(terraform -chdir=terraform output -raw api_invoke_url)

# Make a test request
curl -X POST "$API_URL" \
  -H "Authorization: Basic $(echo -n "${API_USERNAME}:${API_PASSWORD}" | base64)"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "rafa": {
      "30-average": "69",
      "score": "73",
      "all-time-best": "88",
      "message": "You were more restless than normal...",
      ...
    },
    "miki": {
      ...
    }
  }
}
```

## Architecture

```
Client Request (with Basic Auth)
        │
        ▼
    API Gateway (HTTP API)
        │
        ▼
    AWS Lambda
    ├── Validates Basic Auth
    ├── Launches Puppeteer (Chrome Layer)
    ├── Scrapes SleepIQ dashboard
    ├── Stores session in S3
    └── Returns JSON data
```

## Configuration Files

### Environment Variables (`.env.lambda`)
Contains sensitive credentials - **NEVER commit this file**

### Terraform Variables (`terraform/terraform.tfvars`)
Optional file for customizing infrastructure settings:

```hcl
aws_region           = "us-east-1"
lambda_function_name = "sleepiq-scraper"
s3_bucket_name       = "your-unique-bucket-name"
```

Sensitive values are automatically pulled from `.env.lambda` by the deploy script.

## Common Tasks

### Update Lambda Code

After making code changes:

```bash
./scripts/deploy.sh
```

Terraform detects the code change and updates the Lambda function automatically.

### View Lambda Logs

```bash
# Using AWS CLI
aws logs tail /aws/lambda/sleepiq-scraper --follow

# Or in AWS Console
# Go to Lambda > sleepiq-scraper > Monitor > View logs in CloudWatch
```

### Check Infrastructure Status

```bash
terraform -chdir=terraform show
```

### Get API URL

```bash
terraform -chdir=terraform output api_invoke_url
```

### Destroy Everything

To remove all AWS resources:

```bash
terraform -chdir=terraform destroy
```

**⚠️ Warning**: This deletes the S3 bucket and all stored sessions.

## Troubleshooting

### Deployment Fails: "Bucket name already exists"

The S3 bucket name must be globally unique. Update `SESSION_BUCKET_NAME` in `.env.lambda`:

```bash
SESSION_BUCKET_NAME=sleepiq-sessions-yourname-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d'-' -f1)
```

### Lambda Returns 401 Unauthorized

Check your Basic Auth credentials:

```bash
# Verify they match your .env.lambda
echo -n "${API_USERNAME}:${API_PASSWORD}" | base64

# Use this in your curl command:
curl -X POST "$API_URL" \
  -H "Authorization: Basic $(echo -n 'api_user:strong_password' | base64)"
```

### Lambda Returns 500 Internal Server Error

Check CloudWatch Logs:

```bash
aws logs tail /aws/lambda/sleepiq-scraper --since 5m
```

Common causes:
- Missing SleepIQ credentials
- SleepIQ login failed (check credentials)
- Puppeteer/Chrome initialization error
- Session storage S3 permission issue

### Lambda Timeout

If scraping takes longer than 120s:

1. Check CloudWatch Logs to see where it's timing out
2. Increase timeout in `terraform/main.tf`:

```hcl
resource "aws_lambda_function" "sleepiq" {
  ...
  timeout = 180  # Increase to 3 minutes
}
```

3. Redeploy: `./scripts/deploy.sh`

### High AWS Costs

Review your usage:

```bash
# Check Lambda invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=sleepiq-scraper \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum
```

Expected costs for occasional use: **< $1/month**

## Security Best Practices

### 1. Rotate API Credentials

Update `.env.lambda` with new `API_USERNAME` and `API_PASSWORD`, then:

```bash
./scripts/deploy.sh
```

### 2. Use AWS Secrets Manager (Optional)

For production, consider storing credentials in AWS Secrets Manager:

1. Create secrets in AWS Secrets Manager
2. Update `terraform/main.tf` to read from Secrets Manager
3. Grant Lambda IAM role permission to read secrets

### 3. Enable CloudTrail

Monitor API Gateway access:

```bash
# In AWS Console:
# CloudTrail > Trails > Create trail
# Enable API Gateway Data Events
```

### 4. Set Up Alerts

Create CloudWatch Alarms for:
- Lambda errors > threshold
- API Gateway 4xx/5xx responses
- Lambda duration approaching timeout

## Advanced Configuration

### Use Different Chrome Layer

If you prefer a different Chromium layer, update `terraform/variables.tf`:

```hcl
variable "chrome_layer_arn" {
  default = "arn:aws:lambda:us-east-1:YOUR-LAYER-ARN"
}
```

### Change Memory/Timeout

In `terraform/main.tf`:

```hcl
resource "aws_lambda_function" "sleepiq" {
  memory_size = 3008  # Increase for better performance
  timeout     = 180   # Increase if scraping is slow
}
```

### Enable X-Ray Tracing

For debugging performance issues:

```hcl
resource "aws_lambda_function" "sleepiq" {
  ...
  tracing_config {
    mode = "Active"
  }
}
```

## Files Created

```
.
├── .env.lambda              # Your credentials (not committed)
├── lambda/
│   ├── handler.js           # Lambda entry point with Basic Auth
│   ├── s3-session-manager.js # Session persistence
│   └── browser-config.js    # Puppeteer configuration for Lambda
├── terraform/
│   ├── main.tf              # Main infrastructure
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Output values
│   ├── iam.tf               # IAM roles and policies
│   └── README.md            # Detailed Terraform docs
├── scripts/
│   ├── build-lambda.sh      # Builds deployment package
│   └── deploy.sh            # Deploys to AWS
└── function.zip             # Built Lambda package (not committed)
```

## Next Steps

1. **Schedule Regular Runs**: Set up CloudWatch Events to invoke Lambda daily
2. **Store Data**: Add DynamoDB table to store historical sleep data
3. **Notifications**: Use SNS to send alerts when scores change
4. **Dashboard**: Build a web interface to visualize sleep trends

## Support

- Terraform docs: `terraform/README.md`
- Check CloudWatch Logs for detailed Lambda execution logs
- AWS Lambda limits: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html

## License

This deployment configuration follows the same license as the main project.
