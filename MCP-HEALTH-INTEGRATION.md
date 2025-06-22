# MCP Server Health Integration

## Overview

The AI Agent's `/api/health` endpoint provides comprehensive health status information, including detailed integration with the MCP server's `/health` endpoint. This integration allows for real-time monitoring of the MCP server status and provides accurate system health reporting.

## Health Endpoint Structure

The `/api/health` endpoint returns detailed health information structured as follows:

```json
{
  "status": "healthy|unhealthy",
  "timestamp": "2025-06-21T14:25:12.755Z",
  "services": {
    "mcp": {
      "status": "connected|disconnected|partial",
      "url": "http://localhost:8000",
      "lastCheck": "2025-06-21T14:25:12.755Z",
      "serverReachable": true,
      "sseConnected": true,
      "initialized": true,
      "toolsAvailable": 4,
      "serverInfo": {
        "status": "healthy",
        "timestamp": "2025-06-21T14:25:12.755Z",
        "server": "Infobyte MCP Server",
        "version": "1.0.0",
        "uptime": 823.7001051,
        "activeConnections": 1
      }
    },
    "llm": {
      "status": "available|unavailable",
      "provider": "OpenAI"
    }
  },
  "uptime": 671.1234567,
  "responseTime": 3
}
```

## MCP Health Status Levels

### Connected (`"status": "connected"`)
- ✅ MCP server is reachable via HTTP
- ✅ SSE connection is established and active
- ✅ MCP client is properly initialized
- ✅ Tools are available
- ✅ Server health information is accessible

### Partial (`"status": "partial"`)
- ⚠️ Some MCP functionality is working, but not all
- Examples:
  - Server reachable but SSE disconnected
  - Tools cached but server unreachable
  - Initialization failed but connection exists

### Disconnected (`"status": "disconnected"`)
- ❌ MCP server is not reachable
- ❌ No SSE connection
- ❌ Client not initialized
- ❌ No tools available

## MCP Server Health Integration

### Health Check Process

1. **Direct Server Query**: The MCP client queries the MCP server's `/health` endpoint directly via HTTP GET
2. **Connection Status**: Verifies SSE connection status and initialization state
3. **Tool Availability**: Reports the number of available tools
4. **Server Information**: Propagates server metadata from the MCP server's health response

### Implementation Details

The health check process involves three layers:

1. **MCP Client (`MCPClient.healthCheck()`)**: 
   - Queries MCP server `/health` endpoint
   - Checks SSE connection state
   - Reports tool availability
   - Returns detailed status object

2. **Agent (`LangChainMCPAgent.healthCheck()`)**:
   - Calls MCP client health check
   - Adds agent-specific status information
   - Provides LLM availability status

3. **Express Server (`/api/health` endpoint)**:
   - Calls agent health check
   - Determines overall system health
   - Formats response for API consumers
   - Measures response time

### Error Handling

The system gracefully handles various failure scenarios:

- **MCP Server Down**: Reports `disconnected` status with detailed error information
- **Network Issues**: Distinguishes between connection failures and server errors  
- **Partial Failures**: Reports `partial` status when some functionality remains available
- **Timeout Handling**: Prevents health checks from hanging indefinitely

## Usage Examples

### Healthy System
```bash
curl http://localhost:3000/api/health
```

Response indicates full functionality with MCP server information.

### Degraded System
When MCP server is unavailable, the response shows:
- `status: "unhealthy"` (overall)
- `mcp.status: "disconnected"`
- `mcp.serverReachable: false`
- `mcp.serverInfo: null`

### Monitoring Integration

The health endpoint is designed for integration with monitoring systems:

- **Status Codes**: 200 for healthy, 503 for unhealthy
- **Response Time**: Included in response for performance monitoring
- **Detailed Metrics**: Granular status information for each component
- **Timestamp**: For tracking status changes over time

## Benefits

1. **Real-time Status**: Immediate visibility into MCP server connectivity
2. **Detailed Diagnostics**: Granular information for troubleshooting
3. **Graceful Degradation**: System continues operating when MCP server is unavailable
4. **Monitoring Ready**: Structured for automated monitoring and alerting
5. **Performance Metrics**: Response time and uptime information included

## Testing

Run the comprehensive health test:

```bash
node final-health-test.js
```

This test validates:
- MCP server connectivity
- Health endpoint functionality  
- Status reporting accuracy
- Error handling capabilities
- Performance characteristics
