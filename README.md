# SleepIQ CLI

A simple portable script for extracting sleep metrics from the SleepIQ dashboard. Outputs JSON data that can be used as input for other scripts and automation workflows.

## Installation

No installation needed! Just clone the repo and install dependencies:

```bash
git clone <your-repo>
cd sleepiq
npm install
```

## Usage

```bash
./sleepiq <username> <password>
```

**Arguments:**
- `username` - Your SleepIQ email/username
- `password` - Your SleepIQ password

**Output:** JSON to stdout

### Examples

```bash
# Basic usage
./sleepiq user@example.com mypassword

# Save output to file
./sleepiq user@example.com mypassword > sleep_data.json

# Use in a pipeline
./sleepiq user@example.com mypassword | jq '.rafa.score'

# Get help
./sleepiq --help
```

### Alternative: Direct Node Execution

```bash
# If you prefer to run without the wrapper script
node bin/sleepiq user@example.com mypassword
```

## Output Format

The CLI outputs JSON to stdout with the following structure:

```json
{
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
}
```

### Field Descriptions

- `30-average`: 30-day average SleepIQ score
- `score`: Current night's SleepIQ score
- `all-time-best`: All-time best SleepIQ score
- `message`: General sleep feedback message
- `heartRateMsg`: Heart rate analysis message
- `heartRateVariabilityMsg`: Heart rate variability (HRV) analysis message
- `breathRateMsg`: Breath rate analysis message

## How It Works

1. Launches a headless Chrome browser using Puppeteer
2. Logs into your SleepIQ account
3. Navigates to the dashboard
4. Extracts sleep metrics for both sleepers ("rafa" and "miki")
5. Outputs clean JSON to stdout
6. Logs any errors to stderr

### Session Persistence

The script automatically saves your browser session to `~/.config/sleepiq/session.json` to avoid repeated logins. This session is reused on subsequent runs until it expires.

## Troubleshooting

### Login Fails
- Verify your credentials are correct
- Check if SleepIQ requires 2FA (not currently supported)
- Session file may be corrupted - delete `~/.config/sleepiq/session.json`

### Timeout Errors  
- Your internet connection may be slow
- SleepIQ servers may be experiencing issues
- The script has a 60-second timeout by default

### Element Not Found
- The SleepIQ dashboard layout may have changed
- File an issue if the script stops working

## Integration with Other Scripts

The CLI outputs clean JSON to stdout, making it easy to integrate with other scripts:

### Bash
```bash
#!/bin/bash
USERNAME="user@example.com"
PASSWORD="mypassword"

# Get sleep data and process it
SLEEP_DATA=$(./sleepiq "$USERNAME" "$PASSWORD")
echo "Sleep data retrieved!"

# Save to file with timestamp
echo "$SLEEP_DATA" > "sleep_data_$(date +%Y%m%d).json"

# Extract specific values using jq
RAFA_SCORE=$(echo "$SLEEP_DATA" | jq -r '.rafa.score')
echo "Rafa's score: $RAFA_SCORE"
```

### Python
```python
import subprocess
import json
import sys

username = "user@example.com"
password = "mypassword"

# Run sleepiq CLI and get JSON output
result = subprocess.run(
    ['./sleepiq', username, password],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    sleep_data = json.loads(result.stdout)
    print(f"Rafa's score: {sleep_data['rafa']['score']}")
    print(f"Miki's score: {sleep_data['miki']['score']}")
else:
    print(f"Error: {result.stderr}", file=sys.stderr)
    sys.exit(result.returncode)
```

### Node.js
```javascript
const { execSync } = require('child_process');

const username = 'user@example.com';
const password = 'mypassword';

try {
  const output = execSync(
    `./sleepiq "${username}" "${password}"`,
    { encoding: 'utf8' }
  );
  const sleepData = JSON.parse(output);
  console.log('Sleep scores:', {
    rafa: sleepData.rafa.score,
    miki: sleepData.miki.score
  });
} catch (error) {
  console.error('Failed to get sleep data:', error.message);
  process.exit(1);
}
```

## Exit Codes

- `0` - Success
- `1` - General error (network, parsing, etc.)
- `2` - Authentication error (invalid credentials)
- `3` - Invalid arguments

## Security Notes

- Never commit credentials to git
- Session data is stored in `~/.config/sleepiq/` with restrictive permissions
- Be careful when passing credentials as command-line arguments (visible in process list)
