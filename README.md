# AI Agent - TypeScript LangChain MCP Integration

A TypeScript-based Express server that implements a LangChain AI Agent capable of dynamically fetching and using tools from a Model Context Protocol (MCP) server with streaming responses.

## Features

- 🤖 **LangChain Integration**: Powered by LangChain with OpenAI GPT models
- 🔧 **Dynamic Tool Discovery**: Automatically fetches and integrates tools from MCP servers
- ⚡ **Streaming Responses**: Real-time Server-Sent Events (SSE) streaming
- 🌐 **RESTful API**: Clean Express.js REST API with comprehensive endpoints
- 📝 **Session Management**: Conversation context and session handling
- 🛡️ **Production Ready**: Comprehensive error handling, logging, and monitoring
- 🔒 **Secure**: CORS, Helmet, and request validation middleware
- 📊 **Health Monitoring**: Built-in health checks and status endpoints

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key
- Running MCP server (default: http://localhost:8000)

### Installation

1. **Clone and setup the project:**
```bash
cd AI-AGENT
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Required environment variables:**
```env
OPENAI_API_KEY=your_openai_api_key_here
MCP_SERVER_URL=http://localhost:8000
PORT=3000
```

4. **Start the development server:**
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Chat with Agent
```bash
# Streaming chat (recommended)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "message": "What tools do you have available?",
    "stream": true
  }'

# Non-streaming chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how can you help me?",
    "stream": false
  }'
```

### Get Available Tools
```bash
curl http://localhost:3000/api/tools
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Session Management
```bash
# Clear specific session
curl -X DELETE http://localhost:3000/api/sessions/session-id

# Clear all sessions
curl -X DELETE http://localhost:3000/api/sessions
```

## Project Structure

```
src/
├── agent/
│   ├── langchain-agent.ts     # Main LangChain agent implementation
│   └── mcp-tools.ts          # MCP tool fetching and integration
├── mcp/
│   └── mcp-client.ts         # MCP server communication client
├── server/
│   ├── app.ts                # Express server setup
│   ├── routes/
│   │   └── chat.ts           # Chat API routes
│   └── middleware/
│       ├── cors.ts           # CORS configuration
│       ├── error.ts          # Error handling
│       └── validation.ts     # Request validation
├── types/
│   ├── mcp.ts               # MCP protocol types
│   └── api.ts               # API request/response types
├── utils/
│   ├── logger.ts            # Winston logging
│   └── stream.ts            # SSE streaming utilities
└── index.ts                 # Application entry point
```

## Streaming Response Format

The agent uses Server-Sent Events (SSE) for real-time streaming:

```javascript
// Connection established
data: {"type": "start", "sessionId": "uuid", "timestamp": "2024-01-01T00:00:00Z"}

// Streaming tokens
data: {"type": "token", "content": "I can help you with...", "sessionId": "uuid"}

// Tool execution
data: {"type": "tool_call", "tool": "search", "args": {...}, "sessionId": "uuid"}
data: {"type": "tool_result", "result": {...}, "sessionId": "uuid"}

// Completion
data: {"type": "end", "sessionId": "uuid", "timestamp": "2024-01-01T00:00:01Z"}
```

## MCP Integration

The agent automatically:

1. **Connects** to the MCP server via SSE (`/sse` endpoint)
2. **Discovers** available tools (`tools/list` method)
3. **Converts** MCP tool schemas to LangChain tool format
4. **Executes** tools through MCP server (`tools/call` method)
5. **Handles** tool results and errors gracefully

### MCP Server Requirements

Your MCP server should implement:
- `POST /messages` - JSON-RPC 2.0 message handling
- `GET /sse` - Server-Sent Events endpoint
- MCP protocol methods: `initialize`, `tools/list`, `tools/call`

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `MCP_SERVER_URL` | `http://localhost:8000` | MCP server URL |
| `OPENAI_API_KEY` | - | OpenAI API key (required) |
| `OPENAI_MODEL` | `gpt-4-turbo` | OpenAI model to use |
| `TEMPERATURE` | `0.7` | LLM temperature |
| `MAX_TOKENS` | `4000` | Maximum tokens per response |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `STREAM_TIMEOUT` | `30000` | Stream timeout (ms) |

## Development

### Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm start           # Start production server
npm run lint        # Run ESLint
npm run clean       # Clean build directory
```

### Adding New Tools

Tools are automatically discovered from the MCP server. To add new tools:

1. Implement the tool in your MCP server
2. Restart the AI agent or call `/api/tools/refresh`
3. The tool will be available in the agent automatically

## Error Handling

The agent includes comprehensive error handling:

- **MCP Connection Errors**: Automatic reconnection and graceful degradation
- **Tool Execution Errors**: Proper error propagation and user feedback
- **Streaming Errors**: Stream cleanup and error notification
- **Validation Errors**: Request validation with detailed error messages

## Logging

Winston-based logging with:
- **File Logging**: `logs/combined.log` and `logs/error.log`
- **Console Logging**: Development mode
- **Structured Logging**: JSON format with metadata
- **Log Levels**: Configurable via `LOG_LEVEL`

## Production Deployment

1. **Build the application:**
```bash
npm run build
```

2. **Set production environment variables**

3. **Start the production server:**
```bash
NODE_ENV=production npm start
```

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

**MCP Connection Failed**
- Verify MCP server is running on the configured URL
- Check MCP server implements required endpoints
- Review logs for connection errors

**Tool Not Found**
- Ensure tool is registered in MCP server
- Call `/api/tools/refresh` to refresh tool list
- Verify tool schema matches MCP specification

**Streaming Not Working**
- Check client supports Server-Sent Events
- Verify `Accept: text/event-stream` header
- Review CORS configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
- Check the [troubleshooting](#troubleshooting) section
- Review server logs for error details  
- Open an issue with reproduction steps

---

**Built with ❤️ using TypeScript, LangChain, and the Model Context Protocol**
