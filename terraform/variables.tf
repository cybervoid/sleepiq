variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "sleepiq_username" {
  description = "SleepIQ username/email"
  type        = string
  sensitive   = true
}

variable "sleepiq_password" {
  description = "SleepIQ password"
  type        = string
  sensitive   = true
}

variable "api_username" {
  description = "Basic auth username for API Gateway"
  type        = string
  sensitive   = true
}

variable "api_password" {
  description = "Basic auth password for API Gateway"
  type        = string
  sensitive   = true
}

variable "lambda_function_name" {
  description = "Name of the Lambda function"
  type        = string
  default     = "sleepiq-scraper"
}

variable "s3_bucket_name" {
  description = "S3 bucket name for session storage (must be globally unique)"
  type        = string
}

# Layer providing headless Chrome for Lambda
# Using Sparticuz chromium layer (publicly available)
# Note: You can find the latest version at https://github.com/Sparticuz/chromium/releases
# For x86_64 architecture in us-east-1
variable "chrome_layer_arn" {
  description = "ARN of the Chrome Lambda layer"
  type        = string
  default     = "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:45"
}

variable "architecture" {
  description = "Lambda function architecture"
  type        = string
  default     = "x86_64"
}
