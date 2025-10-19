# SleepIQ Data Scraper

A TypeScript-based scraper for extracting sleep metrics from the SleepIQ dashboard using Puppeteer, designed for deployment on AWS Lambda.

## Quick Start - Local Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Credentials
Copy the example environment file and add your SleepIQ credentials:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
SLEEPIQ_USERNAME=your_email@example.com
SLEEPIQ_PASSWORD=your_password
LOG_LEVEL=debug
HEADLESS=false
```

### 3. Run the Scraper
```bash
npm run dev
```

This will:
- Launch a visible Chrome browser (HEADLESS=false)
- Log in to your SleepIQ account
- Navigate to the dashboard
- Extract available sleep metrics
- Output the results as JSON
- Take debug screenshots if enabled

## Configuration Options

### Environment Variables
- `SLEEPIQ_USERNAME` - Your SleepIQ login email
- `SLEEPIQ_PASSWORD` - Your SleepIQ password
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error`
- `HEADLESS` - Set to `false` to see browser during development
- `TIMEOUT` - Request timeout in milliseconds (default: 30000)

## Debugging

### Visual Debugging
Set `HEADLESS=false` in your `.env` file to watch the browser navigate through the SleepIQ site.

### Debug Logging
Set `LOG_LEVEL=debug` to see detailed logs including:
- Navigation steps
- Element selections
- Network requests
- Screenshot notifications

### Screenshots
When debug mode is enabled, the scraper will automatically capture screenshots:
- `login-failed.png` - If login fails
- `dashboard.png` - After successful login
- `error.png` - If any error occurs

## Project Structure

```
src/
  shared/
    types.ts       - TypeScript interfaces
    constants.ts   - URLs and configuration
    logger.ts      - Logging utility
  scraper/
    browser.ts     - Puppeteer browser management
    sleepiq.ts     - Main scraping logic
scripts/
  run-local.ts     - Local development runner
```

## Troubleshooting

### Login Issues
- Verify your credentials in `.env`
- Check if SleepIQ requires 2FA (not currently supported)
- Set `HEADLESS=false` to visually debug the login process

### Element Not Found
- The SleepIQ dashboard may have changed
- Check debug screenshots to see current page structure
- Update selectors in `src/scraper/sleepiq.ts`

### Timeout Errors
- Increase `TIMEOUT` value in `.env`
- Check your internet connection
- SleepIQ servers may be slow or down

## Next Steps

This is currently set up for local testing. To deploy to AWS Lambda:

1. Set up AWS CDK infrastructure (planned)
2. Configure AWS Secrets Manager for credentials
3. Deploy Lambda function with Chromium layer
4. Set up API Gateway for HTTP access (optional)

## Security Notes

- Never commit real credentials to git
- The `.env` file is gitignored for safety
- Use AWS Secrets Manager in production environments