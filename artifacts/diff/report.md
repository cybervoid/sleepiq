# SleepIQ Scraper Ground Truth vs Output Comparison

## Summary
- ✅ **Numeric metrics**: All correct (30-average, score, all-time-best) 
- ❌ **Messages**: Multiple issues found
- ❌ **Breath Rate Messages**: Both sleepers have empty breathRateMsg
- ❌ **HRV Messages**: Text contamination from adjacent elements
- ❌ **Sleep Messages**: Completely different messages extracted

## Detailed Discrepancies

### Rafa
| Field | Ground Truth | Scraper Output | Status |
|-------|-------------|---------------|--------|
| 30-average | "70" | "70" | ✅ Match |
| score | "80" | "80" | ✅ Match |
| all-time-best | "88" | "88" | ✅ Match |
| message | "Your restless sleep was around your average. A wind down routine may help to lower your restless sleep overall. Try it tonight!" | "Staying in bed sounds easy, but we all have nights where we have to get up. Nice job reducing your bed exits." | ❌ **WRONG MESSAGE** |
| heartRateMsg | "A lower heart rate generally means your heart is working more efficiently. That's great news!" | "A lower heart rate generally means your heart is working more efficiently. That's great news!" | ✅ Match |
| heartRateVariabilityMsg | "Your heart rate variability was in the high range. This is generally good, and helps you feel energized, good work!" | "Heart Rate Variability Breath Rate Your heart rate variability was in the high range." | ❌ **TEXT CONTAMINATION** |
| breathRateMsg | "Don't take it for granted! A breath rate around your average is good for your SleepIQ® score." | "" | ❌ **EMPTY** |

### Miki  
| Field | Ground Truth | Scraper Output | Status |
|-------|-------------|---------------|--------|
| 30-average | "66" | "66" | ✅ Match |
| score | "77" | "77" | ✅ Match |
| all-time-best | "92" | "92" | ✅ Match |
| message | "Nice job! You had fewer bed exits than your average, which may help you achieve your sleep goal more often." | "You were not as restless, which helped your SleepIQ® score. Nice!" | ❌ **WRONG MESSAGE** |
| heartRateMsg | "A lower heart rate generally means your heart is working more efficiently. That's great news!" | "A lower heart rate generally means your heart is working more efficiently. That's great news!" | ✅ Match |
| heartRateVariabilityMsg | "Way to go, your HRV is in the high range! High HRV may indicate better overall performance of your heart and nervous system." | "your HRV is in the high range!" | ❌ **TRUNCATED** |
| breathRateMsg | "Don't take it for granted! A breath rate around your average is good for your SleepIQ® score." | "" | ❌ **EMPTY** |

## Root Cause Analysis

### 1. Breath Rate Messages (Both Empty)
**Issue**: `breathRateMsg` is empty for both sleepers
**Likely Cause**: 
- The scraper is not clicking on the "Breath Rate" tab in the biosignals section
- Or the selector is not finding the message text within the breath rate tab

### 2. HRV Message Text Contamination (Rafa)
**Issue**: "Heart Rate Variability Breath Rate Your heart rate variability was in the high range."
**Root Cause**: Selector is capturing text from tab headers along with the message
- The selector is too broad and picking up "Heart Rate Variability" and "Breath Rate" tab labels
- Need container-scoped selection within the active tab content area

### 3. HRV Message Truncation (Miki)  
**Issue**: Only partial message captured: "your HRV is in the high range!"
**Root Cause**: Different message format or selector not capturing full text

### 4. Wrong Sleep Session Messages (Both)
**Issue**: Completely different messages extracted
**Root Cause**: 
- Scraper may be extracting from wrong location (perhaps main dashboard instead of Sleep Session details page)
- Or extracting cached/different message content

## Recommendations for Fixes

1. **Fix breath rate extraction**: Ensure scraper clicks "Breath Rate" tab and extracts from correct container
2. **Improve HRV selector scoping**: Use container-specific selectors to avoid tab header contamination  
3. **Fix sleep session navigation**: Ensure scraper is extracting from Sleep Session details page, not dashboard
4. **Add robust tab handling**: Implement proper tab clicking and content waiting in biosignals section