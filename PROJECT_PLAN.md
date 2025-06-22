# TypeScript LangChain AI Agent with MCP Integration

## Project Overview
A TypeScript-based Express server that implements a LangChain AI Agent capable of dynamically fetching and using tools from a Model Context Protocol (MCP) server. The agent provides streaming responses via Server-Sent Events (SSE).

## Project Structure
```
ai-agent/
├── src/
│   ├── server/
│   │   ├── app.ts                 # Express server setup
│   │   ├── routes/
│   │   │   └── chat.ts            # Chat endpoint with streaming
│   │   └── middleware/
│   │       ├── cors.ts            # CORS configuration
│   │       ├── error.ts           # Error handling middleware
│   │       └── validation.ts      # Request validation
│   ├── agent/
│   │   ├── langchain-agent.ts     # Main LangChain agent implementation
│   │   └── mcp-tools.ts           # MCP tool fetching and integration
│   ├── mcp/
│   │   └── mcp-client.ts          # MCP server communication client
│   ├── types/
│   │   ├── mcp.ts                 # MCP protocol types
│   │   └── api.ts                 # API request/response types
│   ├── utils/
│   │   ├── logger.ts              # Logging utilities
│   │   └── stream.ts              # Streaming utilities
│   └── index.ts                   # Main entry point
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Key Components

### A. Express Server (`app.ts`)
- Express application setup with middleware
- CORS configuration for web clients
- Error handling middleware
- Health check endpoint
- Graceful shutdown handling

### B. Chat Route (`routes/chat.ts`)
- `POST /api/chat` endpoint for user messages
- Server-Sent Events (SSE) streaming support
- Request validation and sanitization
- Agent integration and response streaming

### C. MCP Client (`mcp-client.ts`)
- Handle SSE connection to `http://localhost:8000/sse`
- Implement `/messages` endpoint communication
- Parse and validate MCP protocol messages
- Connection pooling and retry logic

### D. LangChain Agent (`langchain-agent.ts`)
- Streaming-capable LangChain agent
- Dynamic MCP tool integration
- Token streaming for real-time responses
- Conversation context management

### E. Streaming Utilities (`stream.ts`)
- SSE response formatting
- Stream management and cleanup
- Error handling in streams

## API Endpoints

### POST /api/chat
**Request:**
```json
{
  "message": "Hello, what tools are available?",
  "sessionId": "optional-session-id",
  "stream": true
}
```

**Response (Streaming):**
```
data: {"type": "start", "sessionId": "session-123"}

data: {"type": "token", "content": "I can help you with..."}

data: {"type": "tool_call", "tool": "search", "args": {...}}

data: {"type": "tool_result", "result": {...}}

data: {"type": "token", "content": " based on the search results..."}

data: {"type": "end", "sessionId": "session-123"}
```

### GET /api/health
- Health check endpoint
- MCP server connection status

### GET /api/tools
- List available tools from MCP server

## Technologies & Dependencies

### Core Dependencies
- **Server**: Express.js, cors, helmet
- **Streaming**: Server-Sent Events (native)
- **Core**: TypeScript, Node.js
- **LangChain**: @langchain/core, @langchain/openai, @langchain/community
- **HTTP**: axios, eventsource
- **Validation**: zod, express-validator
- **Utilities**: dotenv, winston, uuid

### Development Dependencies
- tsx, nodemon, @types/express, @types/node

## Features

- ✅ Express REST API server
- ✅ POST endpoint for chat messages
- ✅ Server-Sent Events streaming responses
- ✅ Session management
- ✅ Generic MCP server integration
- ✅ Dynamic tool discovery and registration
- ✅ Real-time tool execution feedback
- ✅ CORS support for web clients
- ✅ Request validation and error handling
- ✅ Health monitoring endpoints
- ✅ Graceful shutdown

## Streaming Flow

1. Client sends POST request to `/api/chat`
2. Server validates request and creates SSE stream
3. Agent processes message and streams tokens
4. Tool calls are streamed with progress updates
5. Final response and session cleanup

## Environment Configuration

```env
PORT=3000
MCP_SERVER_URL=http://localhost:8000
OPENAI_API_KEY=your_openai_key
LOG_LEVEL=info
CORS_ORIGIN=*
MAX_TOKENS=4000
STREAM_TIMEOUT=30000
```

## Usage Examples

### Start the server
```bash
npm start
```

### Send a chat message with streaming
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "What tools do you have?", "stream": true}'
```

### Check health
```bash
curl http://localhost:3000/api/health
```

## Development Approach

1. ✅ Set up Express server with TypeScript
2. ✅ Implement streaming chat endpoint
3. ✅ Create MCP client and protocol types
4. ✅ Build MCP tools integration layer
5. ✅ Integrate LangChain agent with streaming
6. ✅ Add middleware and error handling
7. ✅ Implement session management
8. ✅ Add monitoring and health checks
9. ✅ Create documentation and examples

## MCP Protocol Implementation

The agent implements the Model Context Protocol (MCP) to:
- Discover available tools from the MCP server
- Execute tools through the MCP server
- Handle tool results and errors
- Maintain connection state with the MCP server

## LangChain Integration

The agent uses LangChain to:
- Manage conversation context
- Handle tool calling and execution
- Stream responses in real-time
- Integrate with various LLM providers (OpenAI, Anthropic, etc.)

## Error Handling

- Comprehensive error handling for MCP communication
- Graceful degradation when MCP server is unavailable
- Stream error handling and cleanup
- Request validation and sanitization
- Proper HTTP status codes and error messages

## Logging and Monitoring

- Structured logging with Winston
- Request/response logging
- MCP connection status monitoring
- Performance metrics
- Error tracking and alerting

---

*This project creates a production-ready AI agent that can dynamically integrate with any MCP-compliant tool server while providing a modern REST API with streaming capabilities.*
