// API Request/Response Types
export interface ChatRequest {
  message: string;
  sessionId?: string;
  stream?: boolean;
  maxTokens?: number;
}

export interface ChatResponse {
  sessionId: string;
  message: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

export interface StreamMessage {
  type: 'start' | 'token' | 'tool_call' | 'tool_result' | 'error' | 'end';
  sessionId?: string;
  content?: string;
  tool?: string;
  args?: Record<string, any>; // Legacy format for backwards compatibility
  toolCall?: { // New MCP format
    name: string;
    arguments: Record<string, any>;
    sessionId: string;
  };
  result?: any;
  error?: string;
  timestamp?: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
  error?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    mcp: {
      status: 'connected' | 'disconnected' | 'partial';
      url: string;
      lastCheck: string;
      serverReachable: boolean;
      sseConnected: boolean;
      initialized: boolean;
      toolsAvailable: number;
      serverInfo?: any;
    };
    llm: {
      status: 'available' | 'unavailable';
      provider: string;
    };
  };
  uptime: number;
  responseTime?: number;
}

export interface ToolsResponse {
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  count: number;
  timestamp: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}
