import axios, { AxiosInstance } from 'axios';
import EventSource from 'eventsource';
import { v4 as uuidv4 } from 'uuid';
import {
  MCPMessage,
  MCPTool,
  MCPListToolsRequest,
  MCPListToolsResponse,
  MCPCallToolRequest,
  MCPCallToolResponse,
  MCPInitializeRequest,
  MCPInitializeResponse,
  MCPToolResult,
} from '../types/mcp';
import { logger } from '../utils/logger';

export class MCPClient {
  private baseURL: string;
  private httpClient: AxiosInstance;
  private eventSource?: EventSource;
  private sessionId?: string;
  private tools: MCPTool[] = [];
  private isConnected: boolean = false;
  private initialized: boolean = false;
  private pendingRequests: Map<string | number, (response: MCPMessage) => void> = new Map();

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.httpClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupAxiosInterceptors();
  }

  private setupAxiosInterceptors(): void {
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug('MCP request:', { url: config.url, method: config.method, data: config.data });
        return config;
      },
      (error) => {
        logger.error('MCP request error:', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('MCP response:', { status: response.status, data: response.data });
        return response;
      },
      (error) => {
        logger.error('MCP response error:', error);
        return Promise.reject(error);
      }
    );
  }    public async connect(): Promise<void> {
    try {
      // Setup SSE connection and wait for sessionId
      await this.setupSSEConnection();
      
      // Ensure we have a sessionId before proceeding
      if (!this.sessionId) {
        throw new Error('Failed to receive sessionId from MCP server');
      }
      
      // Now initialize the MCP connection using the sessionId
      await this.initialize();
      
      // Finally fetch available tools
      await this.fetchTools();
      
      this.isConnected = true;
      logger.info('MCP client connected successfully with sessionId:', this.sessionId);
    } catch (error) {
      logger.error('Failed to connect to MCP server:', error);
      this.isConnected = false;
      this.initialized = false;
      throw error;
    }
  }

  public async connectSafely(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch (error) {
      logger.warn('MCP server unavailable, continuing without MCP tools:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        baseURL: this.baseURL
      });
      return false;
    }
  }  private async initialize(): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Cannot initialize without sessionId');
    }

    const request: MCPInitializeRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        clientInfo: {
          name: 'ai-agent',
          version: '1.0.0',
        },
        sessionId: this.sessionId,
      },
    };

    try {
      const response = await this.sendRequest<MCPInitializeResponse>(request);
      
      if (!response || !response.result) {
        throw new Error('Invalid response from MCP server: missing result');
      }
      
      if (!response.result.serverInfo) {
        throw new Error('Invalid response from MCP server: missing serverInfo');
      }
      
      logger.info('MCP server initialized:', response.result.serverInfo);
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize MCP server:', error);
      throw error;
    }
  }private async setupSSEConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const sseURL = `${this.baseURL}/sse`;
        logger.info(`Connecting to SSE endpoint: ${sseURL}`);
        
        this.eventSource = new EventSource(sseURL);

        // Track if we've received the initial sessionId
        let sessionIdReceived = false;

        this.eventSource.onopen = () => {
          logger.info('SSE connection established, waiting for sessionId...');
        };        

        this.eventSource.onmessage = (event) => {
          try {
            logger.debug('Raw SSE data received:', event.data);
            const message: MCPMessage = JSON.parse(event.data);
            
            // Check if this is the initial sessionId message
            if (!sessionIdReceived && message.params?.sessionId) {
              this.sessionId = message.params.sessionId;
              sessionIdReceived = true;
              logger.info('SessionId received from MCP server:', this.sessionId);
              resolve();
              return;
            }
            
            this.handleSSEMessage(message);
          } catch (error) {
            logger.error('Error parsing SSE message:', { data: event.data, error: error instanceof Error ? error.message : error });
          }
        };

        this.eventSource.onerror = (error) => {
          if (!sessionIdReceived) {
            logger.error('SSE connection error before sessionId received:', error);
            reject(new Error(`Failed to establish SSE connection to ${sseURL}`));
          } else {
            logger.error('SSE connection error:', error);
          }
        };

        // Add timeout for sessionId reception
        setTimeout(() => {
          if (!sessionIdReceived) {
            this.eventSource?.close();
            reject(new Error(`Failed to receive sessionId within 10 seconds`));
          }
        }, 10000);
        
      } catch (error) {
        logger.error('Error setting up SSE connection:', error);
        reject(error);
      }
    });
  }
  private handleSSEMessage(message: MCPMessage): void {
    logger.debug('Received SSE message:', { id: message.id, method: message.method, hasResult: !!message.result, hasError: !!message.error });

    if (message.id && this.pendingRequests.has(message.id)) {
      const callback = this.pendingRequests.get(message.id);
      if (callback) {
        callback(message);
        this.pendingRequests.delete(message.id);
      }
    } else {
      // Handle notifications or other messages without IDs
      logger.debug('Received message without matching pending request:', message);
    }
  }
  private async sendRequest<T extends MCPMessage>(request: MCPMessage): Promise<T> {
    return new Promise(async (resolve, reject) => {
      if (!request.id) {
        request.id = uuidv4();
      }

      // Set up response handler before sending request
      this.pendingRequests.set(request.id, (response: MCPMessage) => {
        if (response.error) {
          reject(new Error(`MCP Error: ${response.error.message}`));
        } else {
          resolve(response as T);
        }
      });

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id!);
        reject(new Error(`Request timeout for ID: ${request.id}`));
      }, 30000); // 30 second timeout

      try {
        // Send request via HTTP POST to /messages
        await this.httpClient.post('/messages', request);
        
        // Response will come via SSE and be handled by handleSSEMessage
        logger.debug('MCP request sent:', { id: request.id, method: request.method });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id!);
        logger.error('Error sending MCP request:', error);
        reject(error);
      }
    });
  }
  public async fetchTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    if (!this.sessionId) {
      throw new Error('Cannot fetch tools without sessionId');
    }

    const request: MCPListToolsRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tools/list',
      params: { sessionId: this.sessionId },
    };

    try {
      const response = await this.sendRequest<MCPListToolsResponse>(request);
      this.tools = response.result.tools;
      logger.info(`Fetched ${this.tools.length} tools from MCP server`);
      return this.tools;
    } catch (error) {
      logger.error('Failed to fetch tools:', error);
      throw error;
    }
  }  public async callTool(name: string, arguments_: Record<string, any>, sessionId?: string): Promise<MCPToolResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    // Use provided sessionId or fall back to client's sessionId
    const effectiveSessionId = sessionId || this.sessionId;
    if (!effectiveSessionId) {
      throw new Error('No sessionId available for tool call');
    }

    const request: MCPCallToolRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tools/call',
      params: {
        name,
        arguments: arguments_,
        sessionId: effectiveSessionId,
      },
    };

    try {
      logger.info(`Calling tool: ${name} for session: ${effectiveSessionId}`, arguments_);
      const response = await this.sendRequest<MCPCallToolResponse>(request);
      return response.result;
    } catch (error) {
      logger.error(`Failed to call tool ${name}:`, error);
      throw error;
    }
  }

  public getAvailableTools(): MCPTool[] {
    return [...this.tools];
  }

  public isToolAvailable(name: string): boolean {
    return this.tools.some(tool => tool.name === name);
  }

  public getToolSchema(name: string): MCPTool | undefined {
    return this.tools.find(tool => tool.name === name);
  }

  public isClientConnected(): boolean {
    return this.isConnected && this.initialized;
  }
  public async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    this.isConnected = false;
    this.initialized = false;
    this.sessionId = undefined;
    this.pendingRequests.clear();
    
    logger.info('MCP client disconnected');
  }public async healthCheck(): Promise<{
    status: 'connected' | 'disconnected' | 'partial';
    details: {
      serverReachable: boolean;
      sseConnected: boolean;
      initialized: boolean;
      toolsAvailable: number;
      serverInfo?: any;
    };
  }> {
    const details = {
      serverReachable: false,
      sseConnected: this.eventSource?.readyState === EventSource.OPEN,
      initialized: this.initialized,
      toolsAvailable: this.tools.length,
      serverInfo: undefined,
    };

    // Try to reach the MCP server health endpoint
    try {
      const healthResponse = await this.httpClient.get('/health');
      details.serverReachable = true;
      details.serverInfo = healthResponse.data;
    } catch (error) {
      logger.debug('MCP server health endpoint not reachable:', error instanceof Error ? error.message : error);
    }

    // Determine overall status
    let status: 'connected' | 'disconnected' | 'partial' = 'disconnected';
    
    if (this.isClientConnected() && details.serverReachable && details.sseConnected) {
      status = 'connected';
    } else if (details.toolsAvailable > 0 || details.sseConnected || details.serverReachable) {
      status = 'partial';
    }

    return { status, details };
  }

  public getBaseURL(): string {
    return this.baseURL;
  }
  public getConnectionStatus(): {
    connected: boolean;
    initialized: boolean;
    toolsAvailable: number;
    hasActiveSSE: boolean;
    sessionId?: string;
  } {
    return {
      connected: this.isConnected,
      initialized: this.initialized,
      toolsAvailable: this.tools.length,
      hasActiveSSE: this.eventSource?.readyState === EventSource.OPEN,
      sessionId: this.sessionId,
    };
  }

  public getSessionId(): string | undefined {
    return this.sessionId;
  }
}
