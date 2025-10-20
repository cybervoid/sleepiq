# Deployment Guide

This guide covers deploying the SleepIQ scraper as an API endpoint on various cloud platforms.

## API Response Format

The API returns a standardized JSON response:

### Success Response
```json
{
  "success": true,
  "data": {
    "rafa": {
      "30-average": "69",
      "score": "73",
      "all-time-best": "88",
      "message": "You were more restless than normal. Is there a change you can make to your sleep routine to get back on track?",
      "heartRateMsg": "A lower heart rate generally means your heart is working more efficiently. That's great news!",
      "heartRateVariabilityMsg": "HRV can be impacted by the quality of your sleep. Your HRV is in the mid-range, so way to go.",
      "breathRateMsg": "Your SleepIQ® score was positively affected because your breath rate was within your average range. Sometimes, average is good!"
    },
    "miki": {
      "30-average": "69",
      "score": "73",
      "all-time-best": "88",
      "message": "You were more restless last night. If you're tossing and turning more, it might be a sign you're getting less efficient sleep.",
      "heartRateMsg": "A lower heart rate generally means your heart is working more efficiently. That's great news!",
      "heartRateVariabilityMsg": "HRV can be impacted by the quality of your sleep. Your HRV is in the mid-range, so way to go.",
      "breathRateMsg": "Your SleepIQ® score was positively affected because your breath rate was within your average range. Sometimes, average is good!"
    }
  },
  "timestamp": "2025-10-20T19:25:10.215Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "timestamp": "2025-10-20T19:25:10.215Z"
}
```

## Local Testing

Test the API response format locally:

```bash
# Test with clean output
LOG_LEVEL=info yarn test-api

# Test with debug output
LOG_LEVEL=debug yarn test-api
```

## AWS Lambda Deployment

### Prerequisites
- AWS CLI configured
- Node.js 18+ runtime
- Chromium layer for Puppeteer

### Steps

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Set up environment variables** in AWS Lambda console:
   ```
   SLEEPIQ_USERNAME=your_email@example.com
   SLEEPIQ_PASSWORD=your_password
   TIMEOUT=60000
   ```

3. **Deploy using the entry point**:
   - Use `deploy/lambda/index.js` as your Lambda handler
   - Set handler to `index.handler`
   - Add Chromium layer for Puppeteer support
   - Set timeout to at least 60 seconds
   - Allocate 1GB+ memory

4. **Test the deployment**:
   ```bash
   curl -X GET https://your-api-gateway-url/your-function
   ```

### Required Lambda Layers
- `chrome-aws-lambda` or similar Chromium layer
- Node.js 18 runtime

## Cloudflare Workers Deployment

### Prerequisites
- Cloudflare Workers account
- Wrangler CLI installed

### Steps

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Set up environment variables** in Cloudflare dashboard:
   ```
   SLEEPIQ_USERNAME=your_email@example.com
   SLEEPIQ_PASSWORD=your_password
   TIMEOUT=30000
   ```

3. **Deploy using the entry point**:
   - Use `deploy/cloudflare/worker.js` as your worker script
   - Configure with browser isolation for Puppeteer

4. **Test the deployment**:
   ```bash
   curl -X GET https://your-worker.your-subdomain.workers.dev/
   ```

### Cloudflare Workers Configuration
```toml
# wrangler.toml
name = "sleepiq-scraper"
main = "deploy/cloudflare/worker.js"
compatibility_date = "2023-10-01"

[env.production.vars]
SLEEPIQ_USERNAME = "your_email@example.com"
SLEEPIQ_PASSWORD = "your_password"
TIMEOUT = "30000"
```

## Other Platforms

### Vercel
- Use AWS Lambda deployment approach
- Configure `vercel.json` with Node.js 18 runtime
- Add Puppeteer configuration for Vercel

### Railway
- Deploy as Node.js application
- Set environment variables in Railway dashboard
- Use Dockerfile with Chromium dependencies

### Heroku
- Use Puppeteer Heroku buildpack
- Set environment variables in Heroku config
- Configure dyno timeout settings

## Environment Variables

All platforms require these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `SLEEPIQ_USERNAME` | Your SleepIQ login email | `user@example.com` |
| `SLEEPIQ_PASSWORD` | Your SleepIQ password | `yourpassword` |
| `TIMEOUT` | Request timeout in ms | `60000` |

## Security Considerations

1. **Credentials**: Never hardcode credentials. Use platform-specific secret management.
2. **CORS**: Configure CORS headers as needed for your use case.
3. **Rate Limiting**: Consider implementing rate limiting to avoid overwhelming SleepIQ servers.
4. **Authentication**: Add API key authentication if needed.

## Monitoring and Logging

- All platforms include built-in logging
- Set `LOG_LEVEL=info` for production
- Monitor function execution time and memory usage
- Set up alerts for failures

## Cost Considerations

- **AWS Lambda**: Pay per request, usually very cost-effective
- **Cloudflare Workers**: 100,000 requests/day free tier
- **Vercel**: Generous free tier for personal projects
- **Railway**: Usage-based pricing

Each execution takes ~20-30 seconds and uses ~200MB memory.