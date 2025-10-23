terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# S3 bucket for session storage
resource "aws_s3_bucket" "sessions" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_public_access_block" "sessions" {
  bucket                  = aws_s3_bucket.sessions.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "sessions" {
  bucket = aws_s3_bucket.sessions.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Optional: require TLS for S3 access
data "aws_iam_policy_document" "sessions_bucket_policy_doc" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.sessions.arn,
      "${aws_s3_bucket.sessions.arn}/*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "sessions_policy" {
  bucket = aws_s3_bucket.sessions.id
  policy = data.aws_iam_policy_document.sessions_bucket_policy_doc.json
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.lambda_function_name}"
  retention_in_days = 14
}

# S3 object for Lambda deployment package (for packages > 50MB)
resource "aws_s3_object" "lambda_package" {
  bucket = aws_s3_bucket.sessions.id
  key    = "lambda/function.zip"
  source = "../function.zip"
  etag   = filemd5("../function.zip")
}

# Lambda function
resource "aws_lambda_function" "sleepiq" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_exec_role.arn
  handler       = "lambda/handler.handler"
  runtime       = "nodejs20.x"
  architectures = [var.architecture]
  memory_size   = 2048
  timeout       = 180

  s3_bucket         = aws_s3_bucket.sessions.id
  s3_key            = aws_s3_object.lambda_package.key
  source_code_hash  = filebase64sha256("../function.zip")

  environment {
    variables = {
      SLEEPIQ_USERNAME    = var.sleepiq_username
      SLEEPIQ_PASSWORD    = var.sleepiq_password
      API_USERNAME        = var.api_username
      API_PASSWORD        = var.api_password
      SESSION_BUCKET_NAME = aws_s3_bucket.sessions.bucket
      NODE_OPTIONS        = "--enable-source-maps"
      LOG_LEVEL           = "debug"
      VERBOSE_LOGIN       = "true"
      VERBOSE_REQUESTS    = "true"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda
  ]
}

# API Gateway HTTP API (v2)
resource "aws_apigatewayv2_api" "sleep_api" {
  name          = "${var.lambda_function_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.sleep_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.sleepiq.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "sleep_route" {
  api_id    = aws_apigatewayv2_api.sleep_api.id
  route_key = "POST /sleep"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.sleep_api.id
  name        = "prod"
  auto_deploy = true
}

# Allow API Gateway to invoke Lambda
resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sleepiq.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.sleep_api.id}/*/POST/sleep"
}

# Lambda Function URL (no timeout limit - up to 15 minutes)
resource "aws_lambda_function_url" "sleepiq" {
  function_name      = aws_lambda_function.sleepiq.function_name
  authorization_type = "NONE" # We handle auth in the function
  
  cors {
    allow_origins = ["*"]
    allow_methods = ["POST"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 86400
  }
}
