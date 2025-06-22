// MCP Protocol Types
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    url?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPListToolsRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/list';
  params?: {};
}

export interface MCPListToolsResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: {
    tools: MCPTool[];
  };
}

export interface MCPCallToolRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, any>;
    sessionId: string;
  };
}

export interface MCPCallToolResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: MCPToolResult;
}

export interface MCPInitializeRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities: {
      tools?: {};
    };
    clientInfo: {
      name: string;
      version: string;
    };
  };
}

export interface MCPInitializeResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: {
    protocolVersion: string;
    capabilities: {
      tools?: {};
      logging?: {};
    };
    serverInfo: {
      name: string;
      version: string;
    };
  };
}

export interface MCPServerCapabilities {
  tools?: {};
  logging?: {};
  prompts?: {};
  resources?: {};
}
