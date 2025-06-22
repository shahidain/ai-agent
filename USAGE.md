# Usage Examples

## Starting the Server

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start
```

## API Usage Examples

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

### 2. Chat with Streaming (Recommended)
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "Hello! What tools do you have available?",
    "stream": true
  }'
```

### 3. Chat without Streaming
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What can you help me with?",
    "stream": false
  }'
```

### 4. Get Available Tools
```bash
curl http://localhost:3000/api/tools
```

### 5. Refresh Tools from MCP Server
```bash
curl -X POST http://localhost:3000/api/tools/refresh
```

### 6. Clear Specific Session
```bash
curl -X DELETE http://localhost:3000/api/sessions/your-session-id
```

### 7. Clear All Sessions
```bash
curl -X DELETE http://localhost:3000/api/sessions
```

## JavaScript/Node.js Example

```javascript
const axios = require('axios');

async function chatWithAgent() {
  try {
    const response = await axios.post('http://localhost:3000/api/chat', {
      message: 'Help me search for information about AI agents',
      sessionId: 'my-session-123',
      stream: false
    });
    
    console.log('Agent response:', response.data.message);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

chatWithAgent();
```

## Python Example

```python
import requests
import json

def chat_with_agent():
    url = "http://localhost:3000/api/chat"
    data = {
        "message": "What tools are available?",
        "sessionId": "python-session",
        "stream": False
    }
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        print("Agent response:", result["message"])
    except requests.exceptions.RequestException as e:
        print("Error:", e)

chat_with_agent()
```

## Streaming with JavaScript

```javascript
async function streamingChat() {
  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        message: 'Tell me a story about AI agents',
        stream: true
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            switch (data.type) {
              case 'start':
                console.log('🚀 Chat started:', data.sessionId);
                break;
              case 'token':
                process.stdout.write(data.content);
                break;
              case 'tool_call':
                console.log('\n🔧 Tool called:', data.tool, data.args);
                break;
              case 'tool_result':
                console.log('✅ Tool result:', data.result);
                break;
              case 'error':
                console.log('\n❌ Error:', data.error);
                break;
              case 'end':
                console.log('\n🏁 Chat ended');
                break;
            }
          } catch (e) {
            // Ignore heartbeat messages
          }
        }
      }
    }
  } catch (error) {
    console.error('Streaming error:', error);
  }
}

streamingChat();
```

## Environment Variables

Make sure to configure these in your `.env` file:

```env
# Required
OPENAI_API_KEY=your_actual_openai_api_key_here
MCP_SERVER_URL=http://localhost:8000

# Optional
PORT=3000
OPENAI_MODEL=gpt-4-turbo
TEMPERATURE=0.7
MAX_TOKENS=4000
LOG_LEVEL=info
CORS_ORIGIN=*
STREAM_TIMEOUT=30000
NODE_ENV=development
```

## MCP Server Requirements

Your MCP server should implement the following endpoints and respond via Server-Sent Events:

1. **GET /sse** - Server-Sent Events endpoint for receiving responses
2. **POST /messages** - Accept JSON-RPC 2.0 requests (responses via SSE)
3. **GET /health** - Health check endpoint (optional)

### Working Implementation:

The client sends JSON-RPC 2.0 requests via HTTP POST to `/messages` and receives responses via the SSE connection at `/sse`. This allows for real-time bidirectional communication.

### Example MCP Server Response for Tool List:

```json
{
  "jsonrpc": "2.0",
  "id": "123",
  "result": {
    "tools": [
      {
        "name": "add_two_numbers",
        "description": "Add two numeric values together",
        "inputSchema": {
          "type": "object",
          "properties": {
            "a": { "type": "number", "description": "First number" },
            "b": { "type": "number", "description": "Second number" }
          },
          "required": ["a", "b"]
        }
      },
      {
        "name": "fetch_product",
        "description": "Fetch details of a specific product by ID",
        "inputSchema": {
          "type": "object",
          "properties": {
            "id": {
              "type": "number",
              "description": "Product ID"
            }
          },
          "required": ["id"]
        }
      }
    ]
  }
}
```

### Example MCP Tool Execution:

```json
{   
  "jsonrpc": "2.0",
  "id": "456",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Search results: Found 10 articles about AI agents..."
      }
    ],
    "isError": false
  }
}
```
