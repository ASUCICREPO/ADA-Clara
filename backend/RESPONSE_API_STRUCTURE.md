# Frontend API Structure

## Overview

The chat API has been optimized for frontend integration by providing a clean, simplified response structure that contains only the essential data needed by the UI.

## API Endpoint

```
POST https://u21fbiw32m.execute-api.us-east-1.amazonaws.com/prod/chat
```

## Request Format

```json
{
  "message": "What is diabetes?",
  "sessionId": "optional-session-id"
}
```

### Request Fields

- `message` (required): The user's question or message
- `sessionId` (optional): Session identifier for conversation continuity

## Response Format

### Simplified Frontend Response

```json
{
  "message": "Diabetes is a group of metabolic disorders characterized by high blood sugar levels...",
  "sources": [
    {
      "url": "https://diabetes.org/about-diabetes",
      "title": "About Diabetes | American Diabetes Association",
      "excerpt": "Learn about diabetes, including types, symptoms, and management..."
    }
  ],
  "sessionId": "session-1234567890",
  "escalated": false
}
```

### Response Fields

- `message` (string): The chatbot's response text - ready to display to the user
- `sources` (array): Array of source citations with URL, title, and excerpt
- `sessionId` (string): Session identifier for maintaining conversation state
- `escalated` (boolean, optional): Indicates if the conversation was escalated to human support

## Key Benefits for Frontend Integration

### 1. Clean Response Structure
- Only essential fields are included
- No internal metadata or debugging information
- Consistent field naming and types

### 2. Ready-to-Display Content
- `message` field contains the final response text
- No need to parse or process the response further
- Escalation messages are already user-friendly

### 3. Source Citations
- Structured source information for easy rendering
- Each source includes URL, title, and excerpt
- Sources are pre-filtered and relevant to the response

### 4. Session Management
- Consistent session ID handling
- Automatic session creation if not provided
- Session continuity across multiple messages

## Example Usage

### Basic Chat Message
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What are the symptoms of type 1 diabetes?",
    sessionId: currentSessionId
  })
});

const data = await response.json();

// Display the response
displayMessage(data.message);

// Show sources if available
if (data.sources && data.sources.length > 0) {
  displaySources(data.sources);
}

// Handle escalation
if (data.escalated) {
  showEscalationNotice();
}
```

### Error Handling
```javascript
if (!response.ok) {
  const error = await response.json();
  console.error('Chat API error:', error.message);
}
```

## Removed Fields

The following fields from the internal response are **not** included in the frontend response:

- `confidence`: Internal confidence score
- `escalationSuggested`: Internal escalation flag
- `escalationReason`: Internal escalation reasoning
- `language`: Language detection (handled internally)
- `timestamp`: Internal processing timestamp
- `processingTime`: Performance metrics
- `ragasMetrics`: Internal quality metrics

These fields are still available in the internal `ChatResponse` interface for logging, analytics, and debugging purposes.

## Migration Notes

### From Previous API Version

If you were using the previous API response format, update your frontend code:

**Before:**
```javascript
const botMessage = response.response; // Old field name
const confidence = response.confidence; // No longer available
```

**After:**
```javascript
const botMessage = response.message; // New field name
// Confidence is handled internally, no frontend action needed
```

### Backward Compatibility

The internal chat service still returns the full `ChatResponse` interface. Only the API Gateway response has been simplified for frontend consumption.

## Testing

Use the provided test script to verify the response structure:

```bash
cd backend/scripts
./test-frontend-response.sh "What is diabetes?"
```

This will show you the exact JSON structure that your frontend will receive.