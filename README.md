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
# Basic usage - outputs JSON to stdout
./sleepiq user@example.com mypassword

# Hide info messages (only show JSON)
./sleepiq user@example.com mypassword 2>/dev/null

# Save output to file
./sleepiq user@example.com mypassword > sleep_data.json

# Use in a pipeline with jq
./sleepiq user@example.com mypassword | jq '.rafa.score'

# Capture JSON in a variable (bash)
json_output=$(./sleepiq user@example.com mypassword)

# Get help
./sleepiq --help
```

### Output Control

The script outputs **JSON to stdout** and **info/debug messages to stderr**. This means:

- JSON output can be piped to other commands without interference
- Info messages (`[INFO]`, `[DEBUG]`, etc.) don't pollute your JSON output
- To hide info messages completely: redirect stderr to `/dev/null` using `2>/dev/null`
- To save only JSON: `./sleepiq user pass > data.json`
- To save everything including logs: `./sleepiq user pass > data.json 2>&1`

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

## Deployment to Server

To deploy this script to a server (production environment):

### Files to Copy

You need to copy these files/directories:

```bash
# Required files
bin/
src/
node_modules/
package.json
package-lock.json
sleepiq (wrapper script)

# Optional but recommended
.sessions/  # If you want to preserve existing sessions
```

### Quick Deployment Steps

**Option 1: Copy entire directory**
```bash
# On your local machine
tar -czf sleepiq.tar.gz \
  bin/ src/ node_modules/ package.json package-lock.json sleepiq

# Copy to server
scp sleepiq.tar.gz user@server:/path/to/destination/

# On server
cd /path/to/destination/
tar -xzf sleepiq.tar.gz
chmod +x sleepiq
```

**Option 2: Fresh install on server**
```bash
# On server
git clone <your-repo> sleepiq
cd sleepiq
npm install --production
chmod +x sleepiq
```

**Option 3: Minimal deployment (without node_modules)**
```bash
# Copy only source files
rsync -av --exclude='node_modules' \
  bin/ src/ package.json package-lock.json sleepiq \
  user@server:/path/to/destination/

# On server, install dependencies
cd /path/to/destination
npm install --production
chmod +x sleepiq
```

### Server Requirements

- **Node.js**: v16 or higher
- **npm**: v7 or higher  
- **System dependencies**: Puppeteer requires Chrome/Chromium
  - Ubuntu/Debian: `sudo apt-get install -y chromium-browser`
  - CentOS/RHEL: `sudo yum install -y chromium`
  - Alpine: `apk add chromium`

### Automated Deployment Script

```bash
#!/bin/bash
# deploy.sh - Deploy sleepiq to remote server

SERVER="user@your-server.com"
DEST_PATH="/opt/sleepiq"

echo "Building deployment package..."
tar -czf sleepiq-deploy.tar.gz \
  bin/ src/ package.json package-lock.json sleepiq

echo "Copying to server..."
scp sleepiq-deploy.tar.gz $SERVER:/tmp/

echo "Installing on server..."
ssh $SERVER << 'EOF'
  sudo mkdir -p /opt/sleepiq
  cd /opt/sleepiq
  sudo tar -xzf /tmp/sleepiq-deploy.tar.gz
  sudo npm install --production
  sudo chmod +x sleepiq
  rm /tmp/sleepiq-deploy.tar.gz
  echo "Deployment complete!"
EOF

rm sleepiq-deploy.tar.gz
echo "Done!"
```

### Running on Server

```bash
# Test the deployment
./sleepiq --help

# Run once
./sleepiq user@example.com password > /var/log/sleep_data.json

# Schedule with cron (daily at 11 AM)
echo "0 11 * * * cd /opt/sleepiq && ./sleepiq user@example.com password > /var/log/sleep_$(date +\%Y\%m\%d).json 2>&1" | crontab -
```

## Docker Usage

You can run the SleepIQ CLI in a Docker container for better portability and isolation.

### Build the Docker Image

```bash
docker build -t sleepiq .
```

### Run Without Persistence (Stateless)

Runs the container without preserving login sessions. You'll need to login each time:

```bash
docker run --rm sleepiq USERNAME PASSWORD
```

### Run With Session Persistence (Recommended for Development)

Mounts the `.sessions/` directory to persist login sessions between runs:

```bash
docker run --rm -v "$(pwd)/.sessions:/app/.sessions" sleepiq USERNAME PASSWORD
```

### Using the Helper Script

A helper script is provided for easier usage:

```bash
# Without persistence
./docker-run.sh user@example.com mypassword

# With persistence (recommended for development)
./docker-run.sh --persist user@example.com mypassword

# Pipe JSON output to jq
./docker-run.sh --persist user@example.com mypassword | jq '.rafa.score'
```

### Docker Examples

```bash
# Save JSON to a file
docker run --rm sleepiq USERNAME PASSWORD > data.json

# Hide info messages (only show JSON)
docker run --rm sleepiq USERNAME PASSWORD 2>/dev/null

# Pipe to jq for filtering
docker run --rm sleepiq USERNAME PASSWORD | jq '.rafa.score'

# Use in a script
SLEEP_DATA=$(docker run --rm sleepiq USERNAME PASSWORD)
echo "$SLEEP_DATA" | jq '.'
```

### Docker Notes

- **Exit codes** (0, 1, 2, 3) are preserved by the container
- **JSON output** goes to stdout, **logs** go to stderr (same as native CLI)
- By default, the container is **stateless** (no session persistence)
- Mount `$(pwd)/.sessions:/app/.sessions` to persist login sessions between runs
- The container runs as a non-root user for better security
- System Chromium is used to keep the image size smaller

## Security Notes

- Never commit credentials to git
- Session data is stored in `.sessions/` with restrictive permissions
- Be careful when passing credentials as command-line arguments (visible in process list)
- Consider using environment variables or a secrets manager for credentials
- On servers, restrict file permissions: `chmod 600 sleepiq .sessions/*`
