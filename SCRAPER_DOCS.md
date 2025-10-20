# SleepIQ Enhanced Scraper Documentation

## Overview

The enhanced SleepIQ scraper extracts comprehensive sleep data for two sleepers (rafa and miki) from the SleepIQ dashboard. It returns a structured JSON with specific metrics and messages.

## JSON Structure

```json
{
  "rafa": {
    "30-average": "",      // 30-day average score (0-100)
    "score": "",           // Current SleepIQ score (0-100)  
    "all-time-best": "",   // All-time best score (0-100)
    "message": "",         // General sleep message
    "heartRateMsg": "",    // Heart rate insight message
    "heartRateVariabilityMsg": "", // HRV insight message
    "breathRateMsg": ""    // Breathing rate insight message
  },
  "miki": {
    // Same structure as rafa
  }
}
```

## Selector Strategies

### Main Dashboard Metrics

#### 30-Day Average
- **Primary Strategy**: Text-based search using `TreeWalker`
- **Search Terms**: "30-day avg", "30-day average", "30 day avg"
- **Extraction**: Looks for numeric content (1-3 digits) near the text
- **Fallback**: Searches in parent and sibling elements

#### SleepIQ Score  
- **Primary Strategy**: Text-based search for "SleepIQ® score" or "SleepIQ score"
- **Fallback Strategy**: Find the largest number between 0-100 on the page (assumes main score)
- **Extraction**: Uses regex `/\b(\d{1,3})\b/` to extract 1-3 digit numbers

#### All-Time Best
- **Primary Strategy**: Text-based search for "All-time best", "All time best", "Personal best"
- **Extraction**: Same numeric extraction as other metrics
- **Alternative Text**: Handles variations in spacing and wording

### Message Extraction

#### Sleep Session Message (General Message)
- **Primary Strategy**: Extract directly from dashboard using pattern matching
- **Patterns**: 
  - `/keep it up.*restless.*sleep.*down.*average/i`
  - `/great.*sleep.*quality/i`
  - `/your.*restless.*sleep.*was.*down.*from.*your.*average/i`
- **Fallback**: Look for "View Details" button near sleep session timeline
- **Modal Extraction**: If modal opens, extract substantial text with sleep keywords

#### Biosignals Messages
- **Location Strategy**: Scroll to find biosignals section
- **Button Detection**: Find "View Details" button near biosignals content
- **Modal Processing**: 
  - Wait for modal to load (2s)
  - Use keyword-based extraction for each metric
  - Extract text that contains relevant keywords + qualitative words
- **Keywords**:
  - **Heart Rate**: "heart rate", "heartrate", "resting heart", "bpm"
  - **HRV**: "heart rate variability", "hrv", "variability", "recovery"  
  - **Breathing Rate**: "breathing rate", "breath rate", "respiratory"

### Sleeper Selection

#### Detection Strategies
1. **Dropdown Selection**: Look for `<select>` elements with options containing sleeper names
2. **Button Selection**: Find clickable elements containing sleeper names
3. **Verification**: Check for cursor: pointer, role=button, or button tag

#### Switching Process
1. Find and click sleeper selector
2. Wait 2 seconds for dashboard update
3. Proceed with data extraction

## Error Handling

### Graceful Degradation
- All fields default to empty strings
- Partial failures don't stop extraction
- Continue with empty values for failed extractions

### Retry Logic
- Modal opening: 2 attempts with 1s delay
- Sleeper selection: 2 attempts with 1s delay  
- Element interactions: 3 attempts with 0.5s delay

### Debugging Support
- Debug screenshots on failures
- Comprehensive logging at debug level
- Raw page content capture for troubleshooting

## Known Edge Cases

### Text Variations
- **30-day**: May appear as "30-day", "30 day", or with en-dash
- **Score Labels**: "SleepIQ® score" vs "SleepIQ score" 
- **Time References**: "All-time best" vs "All time best"

### Missing Data Scenarios
- **No Data Days**: When UI shows "No data for this day"
- **New Accounts**: May not have historical averages
- **Device Issues**: Biosignals may be unavailable

### UI State Variations
- **Sleeper Already Selected**: Skip selection step
- **Modal Issues**: Fallback to dashboard extraction
- **Loading States**: Wait for content to be ready

## Performance Characteristics

### Timing
- **Total Runtime**: ~30-60 seconds per full extraction
- **Per Sleeper**: ~15-30 seconds
- **Modal Operations**: ~3-5 seconds each

### Resource Usage
- **Browser**: Headless Chrome via Puppeteer
- **Memory**: ~100-200MB during extraction
- **Network**: Multiple page loads and interactions

## Security Notes

- Credentials handled securely via environment variables
- No credential logging or storage
- Browser cleanup on completion
- Error messages don't expose sensitive data

## Usage

### Local Testing
```bash
npm run scrape:sleepiq
```

### Environment Variables
```bash
SLEEPIQ_USERNAME=your_email@example.com
SLEEPIQ_PASSWORD=your_password
LOG_LEVEL=debug           # Enable detailed logging
HEADLESS=false           # Show browser for debugging
```

### Integration Notes
- **HTTP Route Protection**: When exposing via HTTP, protect with reporting role permissions
- **Deployment**: Do not deploy from CLI, leave changes uncommitted for review
- **Rate Limiting**: Consider adding delays between requests to avoid overwhelming SleepIQ servers