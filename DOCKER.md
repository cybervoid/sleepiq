# Docker Quick Reference

## Build the Image

```bash
docker build --load -t sleepiq .
```

> **Note**: The `--load` flag is required for Docker Desktop to load the image into the local registry.

## Usage

### Basic Usage (Stateless - No Session Persistence)

```bash
# Direct docker command
docker run --rm sleepiq USERNAME PASSWORD

# Using helper script
./docker-run.sh USERNAME PASSWORD
```

### With Session Persistence (Recommended for Development)

```bash
# Direct docker command
docker run --rm -v "$(pwd)/.sessions:/app/.sessions" sleepiq USERNAME PASSWORD

# Using helper script
./docker-run.sh --persist USERNAME PASSWORD
```

## Examples

### Save JSON to File
```bash
docker run --rm sleepiq USERNAME PASSWORD > sleep_data.json
```

### Hide Logs (Only Show JSON)
```bash
docker run --rm sleepiq USERNAME PASSWORD 2>/dev/null
```

### Pipe to jq
```bash
docker run --rm sleepiq USERNAME PASSWORD | jq '.rafa.score'
./docker-run.sh --persist USERNAME PASSWORD | jq '.miki["30-average"]'
```

### Use in Scripts

**Bash:**
```bash
SLEEP_DATA=$(docker run --rm sleepiq USERNAME PASSWORD)
echo "$SLEEP_DATA" | jq '.rafa.score'
```

**Python:**
```python
import subprocess
import json

result = subprocess.run(
    ['docker', 'run', '--rm', 'sleepiq', 'user@example.com', 'password'],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    data = json.loads(result.stdout)
    print(f"Rafa's score: {data['rafa']['score']}")
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Authentication error  
- `3` - Invalid arguments

## Key Features

- **Stateless by default**: No session data is saved unless you mount a volume
- **Session persistence**: Mount `.sessions` volume to reuse login sessions
- **JSON to stdout**: Clean JSON output for piping and processing
- **Logs to stderr**: Info/debug messages don't pollute JSON output
- **Non-root user**: Runs as `node` user for better security
- **Small image**: Uses system Chromium (~1.06GB total)

## Troubleshooting

### Image Size
The image is ~1.06GB because it includes:
- Node.js runtime
- Chromium browser
- System dependencies for Puppeteer

### Session Permissions on macOS
If you have issues with session persistence, ensure the `.sessions` directory exists:
```bash
mkdir -p .sessions
chmod 755 .sessions
```

### Rebuilding After Code Changes
```bash
docker build --load -t sleepiq .
```
