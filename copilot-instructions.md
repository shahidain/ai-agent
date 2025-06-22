# Copilot Instructions for AI Agent Project

This file provides context and guidelines for GitHub Copilot when working with this AI Agent project that integrates LangChain with MCP (Model Context Protocol) tools.

## Project Overview

This is a TypeScript-based AI Agent that uses:
- **LangChain** for AI orchestration
- **OpenAI GPT models** for language processing
- **MCP (Model Context Protocol)** for tool integration
- **Express.js** for REST API server
- **Server-Sent Events (SSE)** for streaming responses

## Architecture

```
src/
├── agent/           # LangChain agent and MCP tools integration
├── mcp/            # MCP client for communication with MCP server
├── server/         # Express server with API endpoints
├── types/          # TypeScript type definitions
└── utils/          # Utilities (logging, streaming)
```

## Key Components

### 1. LangChain Agent (`src/agent/langchain-agent.ts`)
- Uses manual tool execution flow (not AgentExecutor.invoke)
- Binds tools to LLM using `llm.bindTools()`
- Processes tool calls manually for better control
- Supports both streaming and non-streaming responses

### 2. MCP Tools (`src/agent/mcp-tools.ts`)
- Wraps MCP tools as LangChain DynamicStructuredTool
- Ensures tool calls use "arguments" format (not "args")
- Includes sessionId in all MCP tool calls
- Maps Zod schemas from MCP tool definitions

### 3. MCP Client (`src/mcp/mcp-client.ts`)
- Communicates with MCP server via JSON-RPC 2.0
- Uses HTTP POST for tool calls and SSE for notifications
- Implements proper timeout and error handling
- Maintains connection health monitoring

## Coding Guidelines

### Tool Call Format
Always ensure MCP tool calls use this format:
```typescript
{
  name: string,
  arguments: Record<string, any>, // NOT "args"
  sessionId: string               // ALWAYS include
}
```

### Error Handling
- Use try-catch blocks around MCP operations
- Log errors with structured logging (Winston)
- Gracefully handle MCP server disconnections
- Provide fallback responses when tools fail

### Type Safety
- Use proper TypeScript types from `src/types/`
- Validate MCP tool schemas with Zod
- Handle both streaming and non-streaming responses
- Type all API endpoints and middleware

### Logging
Use structured logging with context:
```typescript
logger.info('Operation completed', {
  service: 'ai-agent',
  sessionId: sessionId,
  toolName: toolName,
  timestamp: new Date().toISOString()
});
```

### Streaming Responses
For streaming endpoints:
- Use SSEStream utility for consistent formatting
- Send different message types (token, tool_call, tool_result, error)
- Handle client disconnections gracefully
- Maintain session state during streaming

## MCP Integration Patterns

### Tool Registration
```typescript
// Convert MCP tools to LangChain tools
const mcpTools = await toolsManager.initializeTools();
const llmWithTools = llm.bindTools(mcpTools);
```

### Manual Tool Execution
```typescript
// Parse tool calls from LLM response
const toolCalls = llmResponse.tool_calls || [];

// Execute each tool call manually
for (const toolCall of toolCalls) {
  const tool = tools.find(t => t.name === toolCall.name);
  const result = await tool.executeInternal(toolCall.args);
}
```

### Session Management
- Include sessionId in all MCP tool calls
- Maintain conversation history per session
- Clean up sessions to prevent memory leaks

## Testing Patterns

### Test Files (excluded from git)
Create test files with these patterns:
- `test-*.js` - General test files
- `debug-*.js` - Debugging scripts
- `*-test.js` - Component-specific tests

### Common Test Scenarios
- Tool registration and schema validation
- Tool call format verification
- MCP server connectivity
- Streaming response handling
- Error scenarios and fallbacks

## Environment Configuration

Required environment variables:
```bash
OPENAI_API_KEY=        # OpenAI API key
MCP_SERVER_URL=        # MCP server endpoint
PORT=                  # Server port
LOG_LEVEL=            # Logging level
```

## API Endpoints

### POST /api/chat
Main chat endpoint supporting:
- Non-streaming: Returns complete response
- Streaming: Returns SSE stream with real-time updates
- Session management with sessionId
- Tool execution with result integration

### GET /api/health
Health check with detailed status:
- Agent initialization status
- MCP server connectivity
- Available tools count
- LLM availability

### GET /api/tools
Lists available MCP tools with schemas.

## Common Issues and Solutions

### Tool Calls Not Generated
- Ensure tools are properly bound to LLM
- Check tool descriptions are clear and specific
- Verify Zod schemas are correctly formatted

### MCP Connection Issues
- Check MCP server is running and accessible
- Verify SSE endpoint connectivity
- Implement connection retry logic

### Streaming Problems
- Handle client disconnections
- Implement proper SSE formatting
- Manage backpressure in streaming responses

## Best Practices

1. **Always validate MCP tool responses** before processing
2. **Use sessionId consistently** across all operations
3. **Implement graceful degradation** when MCP is unavailable
4. **Log all tool executions** for debugging and monitoring
5. **Handle both sync and async operations** properly
6. **Maintain backward compatibility** when updating tool schemas

## Dependencies

Key packages and their purposes:
- `@langchain/openai` - OpenAI integration
- `@langchain/core` - Core LangChain functionality
- `langchain/agents` - Agent framework
- `express` - Web server
- `zod` - Schema validation
- `winston` - Structured logging
- `eventsource` - SSE client functionality

When suggesting code changes or new features, always consider these guidelines and maintain consistency with the existing architecture.
