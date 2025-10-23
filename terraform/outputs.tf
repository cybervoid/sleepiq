output "api_invoke_url" {
  description = "Invoke URL for the API Gateway endpoint"
  value       = "${aws_apigatewayv2_api.sleep_api.api_endpoint}/${aws_apigatewayv2_stage.prod.name}/sleep"
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.sleepiq.arn
}

output "session_bucket_name" {
  description = "S3 bucket name used for session storage"
  value       = aws_s3_bucket.sessions.bucket
}

output "function_url" {
  description = "Direct Lambda Function URL (no timeout - recommended)"
  value       = aws_lambda_function_url.sleepiq.function_url
}
