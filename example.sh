#!/bin/bash
# Example: Using the SleepIQ CLI in your own scripts

# Replace with your actual credentials
USERNAME="your@email.com"
PASSWORD="yourpassword"

echo "Fetching sleep data..."

# Run the CLI and capture the output
SLEEP_DATA=$(./sleepiq "$USERNAME" "$PASSWORD")
EXIT_CODE=$?

# Check if it succeeded
if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ Successfully retrieved sleep data!"
    echo ""
    
    # Save to file with timestamp
    FILENAME="sleep_data_$(date +%Y%m%d_%H%M%S).json"
    echo "$SLEEP_DATA" > "$FILENAME"
    echo "✓ Saved to: $FILENAME"
    echo ""
    
    # Extract some values using jq (if installed)
    if command -v jq &> /dev/null; then
        echo "Sleep Scores:"
        echo "  Rafa: $(echo "$SLEEP_DATA" | jq -r '.rafa.score')"
        echo "  Miki: $(echo "$SLEEP_DATA" | jq -r '.miki.score')"
        echo ""
        echo "30-day averages:"
        echo "  Rafa: $(echo "$SLEEP_DATA" | jq -r '.rafa["30-average"]')"
        echo "  Miki: $(echo "$SLEEP_DATA" | jq -r '.miki["30-average"]')"
    else
        echo "Install 'jq' to parse JSON easily: brew install jq"
    fi
else
    echo "✗ Failed to retrieve sleep data (exit code: $EXIT_CODE)"
    exit $EXIT_CODE
fi
