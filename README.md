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

#### Single Sleeper Data (Original)
```bash
npm run dev
```

#### Multiple Sleepers Data (New)
```bash
npm run example-sleepers
```

This will:
- Launch a visible Chrome browser (HEADLESS=false)
- Log in to your SleepIQ account
- Navigate to the dashboard
- Extract sleep data for both "rafa" and "miki" sleepers
- Output the results as JSON with separate keys for each sleeper
- Take debug screenshots if enabled

#### Test Scripts
```bash
# Test basic login functionality
npm run test-login

# Test sleeper data extraction
npm run test-sleepers
```

## Data Structure

### Single Sleeper (Original)
```typescript
interface SleepMetrics {
  date: string;
  sleepScore?: number;
  durationMinutes?: number;
  timeInBedMinutes?: number;
  restfulMinutes?: number;
  restlessMinutes?: number;
  awakeMinutes?: number;
  heartRateAvg?: number;
  respirationRateAvg?: number;
  outOfBedCount?: number;
  raw?: any;
}
```

### Multiple Sleepers (New)
```typescript
interface SleepDataBySleeper {
  rafa: SleepMetrics;
  miki: SleepMetrics;
}
```

The new `scrapeSleepDataBySleeper` function returns a JSON object with two keys:
- `rafa`: Sleep metrics for the first sleeper
- `miki`: Sleep metrics for the second sleeper

Each sleeper's data follows the same `SleepMetrics` structure as the original single-sleeper function.

## Configuration Options

### Environment Variables
- `SLEEPIQ_USERNAME` - Your SleepIQ login email
- `SLEEPIQ_PASSWORD` - Your SleepIQ password
- `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error`
- `HEADLESS` - Set to `false` to see browser during development
- `TIMEOUT` - Request timeout in milliseconds (default: 30000)

### Logging Controls (Optional)
For cleaner output, you can control specific logging areas:
- `VERBOSE_REQUESTS=true` - Show all network requests (can be very verbose)
- `VERBOSE_LOGIN=true` - Show detailed login form interactions
- `VERBOSE_EXTRACTION=true` - Show detailed data extraction debug info
- `VERBOSE_NAVIGATION=true` - Show detailed page navigation steps

### Output Format Controls
- **Default**: Raw JSON output (same as API response)
- `SHOW_SUMMARY=true` - Show pretty summary instead of raw JSON  
- `SHOW_DEBUG_DATA=true` - Include full debug data with raw extraction info

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

## API Deployment

This scraper is ready for deployment as an API endpoint that returns JSON responses.

### Test API Response Format
```bash
# Test the JSON API response locally
yarn test-api
```

### Deploy to Cloud Platforms

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to:
- **AWS Lambda** (recommended for cost and performance)
- **Cloudflare Workers** (great free tier)
- **Vercel** (easy deployment)
- **Railway** (simple hosting)
- **Heroku** (traditional PaaS)

### API Response Format

The API returns standardized JSON with this structure:
```json
{
  "success": true,
  "data": {
    "rafa": {
      "30-average": "69",
      "score": "73",
      "all-time-best": "88",
      "message": "Sleep message text...",
      "heartRateMsg": "Heart rate message...",
      "heartRateVariabilityMsg": "HRV message...",
      "breathRateMsg": "Breath rate message..."
    },
    "miki": { /* same structure */ }
  },
  "timestamp": "2025-10-20T19:25:10.215Z"
}
```

## Security Notes

- Never commit real credentials to git
- The `.env` file is gitignored for safety
- Use AWS Secrets Manager in production environments