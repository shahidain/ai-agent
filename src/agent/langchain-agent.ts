import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { MCPClient } from '../mcp/mcp-client';
import { MCPToolsManager, MCPToolWrapper } from './mcp-tools';
import { SSEStream } from '../utils/stream';
import { logger } from '../utils/logger';

export interface AgentConfig {
  openaiApiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streamTimeout?: number;
}

export class LangChainMCPAgent {
  private llm: ChatOpenAI;
  private mcpClient: MCPClient;
  private toolsManager: MCPToolsManager;
  private agent?: AgentExecutor;
  private tools: MCPToolWrapper[] = [];
  private conversationHistory: Map<string, BaseMessage[]> = new Map();
  private config: AgentConfig;

  constructor(mcpClient: MCPClient, config: AgentConfig) {
    this.mcpClient = mcpClient;
    this.config = config;
    this.toolsManager = new MCPToolsManager(mcpClient);
      this.llm = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      modelName: config.model || 'gpt-4-turbo',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 4000,
      streaming: true,
    });
  }
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing LangChain MCP Agent...');
      
      // Try to connect to MCP server (gracefully handle failures)
      const mcpConnected = await this.mcpClient.connectSafely();
      
      if (mcpConnected) {
        // Initialize tools if MCP connected
        this.tools = await this.toolsManager.initializeTools();
        logger.info(`Initialized with ${this.tools.length} MCP tools`);
      } else {
        // Initialize without MCP tools
        this.tools = [];
        logger.info('Initialized without MCP tools (server unavailable)');
      }
      
      // Create agent (works with or without tools)
      await this.createAgent();
      
      logger.info('LangChain MCP Agent initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LangChain MCP Agent:', error);
      throw error;
    }
  }  private async createAgent(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are a helpful AI assistant with access to various tools through an MCP (Model Context Protocol) server.

Available tools: ${this.tools.map(tool => `${tool.name}: ${tool.description}`).join(', ')}

You have access to the following tools. Use them when they can help answer the user's question:
${this.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

IMPORTANT: You MUST use tools when they can help answer the question. When you see a tool call is needed, you should use the tool and wait for the result before providing your final answer.

Be helpful and accurate in your responses.`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = await createOpenAIFunctionsAgent({
      llm: this.llm,
      tools: this.tools,
      prompt,
    });

    this.agent = new AgentExecutor({
      agent,
      tools: this.tools,
      verbose: true,
      maxIterations: 15, // Increase iterations to ensure tools get called
      returnIntermediateSteps: true,
      handleParsingErrors: "Check your output and make sure to call the appropriate tools when needed. If you generated a function call, make sure it gets executed.",
      earlyStoppingMethod: 'force', // Force tool execution before stopping
    });
    
    logger.info(`Agent created with ${this.tools.length} tools:`, this.tools.map(t => t.name));
  }  public async processMessage(
    message: string,
    sessionId: string,
    stream?: SSEStream
  ): Promise<string> {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    try {
      logger.info(`Processing message for session ${sessionId}:`, message);

      // Set session ID for all MCP tools before processing
      this.toolsManager.setSessionIdForAllTools(sessionId);

      // Get conversation history
      const chatHistory = this.conversationHistory.get(sessionId) || [];

      // Prepare input
      const input = {
        input: message,
        chat_history: chatHistory,
      };

      let fullResponse = '';

      if (stream) {
        // Handle streaming response with manual tool execution
        logger.info('Starting streaming agent execution...');
        
        const response = await this.processWithManualToolExecution(input, sessionId, stream);
        fullResponse = response;
      } else {
        // Handle non-streaming response with manual tool execution
        logger.info('Starting non-streaming agent execution...');
        
        const response = await this.processWithManualToolExecution(input, sessionId);
        fullResponse = response;
      }

      // Update conversation history
      const updatedHistory = [
        ...chatHistory,
        new HumanMessage(message),
        new AIMessage(fullResponse),
      ];
      
      // Keep only last 20 messages to manage memory
      if (updatedHistory.length > 20) {
        updatedHistory.splice(0, updatedHistory.length - 20);
      }
      
      this.conversationHistory.set(sessionId, updatedHistory);

      logger.info(`Message processed successfully for session ${sessionId}`);
      return fullResponse;

    } catch (error) {
      logger.error(`Error processing message for session ${sessionId}:`, error);
      if (stream) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        stream.sendError(`Error processing message: ${errorMessage}`, sessionId);
      }
      
      throw error;
    }
  }
  private async processWithManualToolExecution(
    input: any, 
    sessionId: string, 
    stream?: SSEStream
  ): Promise<string> {    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", `You are a helpful AI assistant with access to various tools through an MCP (Model Context Protocol) server.

Available tools: ${this.tools.map(tool => `${tool.name}: ${tool.description}`).join(', ')}

You have access to the following tools. Use them when they can help answer the user's question:
${this.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

IMPORTANT: You MUST use tools when they can help answer the question. When you see a tool call is needed, you should use the tool and wait for the result before providing your final answer.

Be helpful and accurate in your responses.`],
      ["human", "{input}"],
    ]);

    const prompt = await promptTemplate.formatPromptValue(input);
    
    // Bind tools to LLM and call it to get initial response (which might include tool calls)
    const llmWithTools = this.llm.bindTools(this.tools);
    const llmResponse = await llmWithTools.invoke(prompt.toChatMessages());
    
    logger.info('🤖 LLM Response:', {
      content: llmResponse.content,
      toolCalls: llmResponse.tool_calls?.length || 0,
      additionalKwargs: llmResponse.additional_kwargs
    });

    // Check if there are tool calls in the response
    const toolCalls = llmResponse.tool_calls || [];
    
    if (toolCalls.length > 0) {
      // Execute tool calls manually
      let toolResults = '';
      
      for (const toolCall of toolCalls) {
        try {
          logger.info(`🔧 Executing tool call: ${toolCall.name}`, toolCall.args);
          
          if (stream) {
            const mcpToolCall = {
              name: toolCall.name,
              arguments: toolCall.args, // Already in correct format
              sessionId: sessionId
            };
            stream.sendToolCall(toolCall.name, mcpToolCall, sessionId);
          }
          
          // Find and execute the tool
          const tool = this.tools.find(t => t.name === toolCall.name);
          if (tool) {
            const result = await tool.executeInternal(toolCall.args);
            logger.info(`✅ Tool execution result:`, result);
            
            if (stream) {
              stream.sendToolResult(result, sessionId);
            }
            
            toolResults += `\n\nTool ${toolCall.name} result: ${result}`;
          } else {
            const errorMsg = `Tool ${toolCall.name} not found`;
            logger.error(errorMsg);
            
            if (stream) {
              stream.sendError(errorMsg, sessionId);
            }
            
            toolResults += `\n\nError: ${errorMsg}`;
          }
        } catch (error) {
          const errorMsg = `Error executing tool ${toolCall.name}: ${error}`;
          logger.error(errorMsg);
          
          if (stream) {
            stream.sendError(errorMsg, sessionId);
          }
          
          toolResults += `\n\nError: ${errorMsg}`;
        }
      }        // Call LLM again with tool results to get final answer
      const followUpTemplate = ChatPromptTemplate.fromMessages([
        ["system", `You are a helpful AI assistant. You have just executed some tools and received results. Provide a helpful response to the user based on the tool results.`],
        ["human", "{user_input}"],
        ["assistant", "I executed the following tools and got these results: {tool_results}"],
        ["human", "Based on the tool results above, please provide a clear and helpful answer to my original question."]
      ]);

      const followUpPrompt = await followUpTemplate.formatPromptValue({
        user_input: input.input,
        tool_results: toolResults
      });

      const finalResponse = await this.llm.invoke(followUpPrompt.toChatMessages());      const finalResponseText = typeof finalResponse.content === 'string' ? finalResponse.content : '';
      
      if (stream) {
        // Send the final response tokens
        for (const char of finalResponseText) {
          stream.sendToken(char, sessionId);
        }
      }
      
      return finalResponseText;
    } else {
      // No tool calls, return the LLM response directly
      const content = typeof llmResponse.content === 'string' ? llmResponse.content : '';
      
      if (stream) {
        for (const char of content) {
          stream.sendToken(char, sessionId);
        }
      }
      
      return content;
    }
  }

  public getMCPConnectionStatus(): boolean {
    return this.mcpClient.isClientConnected();
  }  public getAvailableTools(): Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }> {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.mcpTool?.inputSchema || {},
    }));
  }

  public getAvailableToolNames(): string[] {
    return this.tools.map(tool => tool.name);
  }
  public getAgentInfo(): { 
    mcpConnected: boolean; 
    toolsCount: number; 
    availableTools: string[];
    mcpServerUrl: string;
  } {
    return {
      mcpConnected: this.getMCPConnectionStatus(),
      toolsCount: this.tools.length,
      availableTools: this.getAvailableToolNames(),
      mcpServerUrl: this.mcpClient.getBaseURL(),
    };
  }

  public async refreshTools(): Promise<void> {
    try {
      logger.info('Refreshing agent tools...');
      
      this.tools = await this.toolsManager.refreshTools();
      await this.createAgent();
      
      logger.info('Agent tools refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh agent tools:', error);
      throw error;
    }
  }

  public getSessionCount(): number {
    return this.conversationHistory.size;
  }

  public clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
    logger.info(`Cleared session: ${sessionId}`);
  }

  public clearAllSessions(): void {
    this.conversationHistory.clear();
    logger.info('Cleared all sessions');
  }  public async healthCheck(): Promise<{
    agent: boolean;
    mcp: {
      status: 'connected' | 'disconnected' | 'partial';
      serverReachable: boolean;
      sseConnected: boolean;
      initialized: boolean;
      toolsAvailable: number;
      serverInfo?: any;
    };
    llm: boolean;
    tools: number;
  }> {
    try {
      const mcpHealth = await this.mcpClient.healthCheck();
      
      return {
        agent: !!this.agent,
        mcp: {
          status: mcpHealth.status,
          serverReachable: mcpHealth.details.serverReachable,
          sseConnected: mcpHealth.details.sseConnected,
          initialized: mcpHealth.details.initialized,
          toolsAvailable: mcpHealth.details.toolsAvailable,
          serverInfo: mcpHealth.details.serverInfo,
        },
        llm: true, // Assume LLM is available if we can create the instance
        tools: this.tools.length,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        agent: false,
        mcp: {
          status: 'disconnected',
          serverReachable: false,
          sseConnected: false,
          initialized: false,
          toolsAvailable: 0,
        },
        llm: false,
        tools: 0,
      };
    }
  }
  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down LangChain MCP Agent...');
      
      this.clearAllSessions();
      await this.mcpClient.disconnect();
      
      logger.info('Agent shutdown complete');
    } catch (error) {
      logger.error('Error during agent shutdown:', error);
    }
  }
}
