import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPClient } from '../mcp/mcp-client';
import { MCPTool, MCPToolResult } from '../types/mcp';
import { logger } from '../utils/logger';

export class MCPToolWrapper extends DynamicStructuredTool {
  public mcpTool: MCPTool;
  private mcpClient: MCPClient;
  private currentSessionId: string = 'default';
  
  constructor(mcpClient: MCPClient, mcpTool: MCPTool) {
    const schema = MCPToolWrapper.createZodSchemaFromMCP(mcpTool.inputSchema);
    
    super({
      name: mcpTool.name,
      description: mcpTool.description,
      schema: schema,
      func: async (input: any) => {
        return await this.executeInternal(input);
      }
    });
    
    this.mcpClient = mcpClient;
    this.mcpTool = mcpTool;
  }

  private static createZodSchemaFromMCP(inputSchema: any): z.ZodObject<any> {
    const properties = inputSchema?.properties || {};
    const required = inputSchema?.required || [];
    
    if (Object.keys(properties).length === 0) {
      return z.object({
        input: z.string().optional().describe('Input for the tool')
      });
    }
    
    const zodFields: Record<string, z.ZodTypeAny> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      const prop = value as any;
      let zodType: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          zodType = z.string().describe(prop.description || '');
          break;
        case 'number':
          zodType = z.number().describe(prop.description || '');
          break;
        case 'integer':
          zodType = z.number().int().describe(prop.description || '');
          break;
        case 'boolean':
          zodType = z.boolean().describe(prop.description || '');
          break;
        case 'array':
          zodType = z.array(z.any()).describe(prop.description || '');
          break;
        case 'object':
          zodType = z.object({}).describe(prop.description || '');
          break;
        default:
          zodType = z.any();
      }

      if (!required.includes(key)) {
        zodType = zodType.optional();
      }

      zodFields[key] = zodType;
    }
    
    return z.object(zodFields);
  }

  public async executeInternal(input: any): Promise<string> {
    try {
      logger.info(`🔧 Executing MCP tool: ${this.name}`, { input, sessionId: this.currentSessionId });
      
      // Transform the input from LangChain format to MCP format
      let mcpArguments: Record<string, any> = {};
      
      if (input && typeof input === 'object') {
        // Input comes from DynamicStructuredTool as an object with the tool parameters
        mcpArguments = input;
      } else if (input) {
        mcpArguments = this.mapInputToSchema(input);
      }
      
      // Validate and clean arguments according to MCP schema
      mcpArguments = this.validateAndCleanArgs(mcpArguments);
      
      // Create the MCP tool call request in the correct format
      const mcpToolCall = {
        name: this.name,
        arguments: mcpArguments, // Use 'arguments' not 'args'
        sessionId: this.currentSessionId
      };
      
      logger.info(`📞 Calling MCP tool with proper format:`, mcpToolCall);
      
      // Call MCP tool with the correct format
      const result: MCPToolResult = await this.mcpClient.callTool(
        this.name, 
        mcpArguments, // arguments 
        this.currentSessionId // sessionId
      );
      
      if (result.isError) {
        throw new Error(`Tool execution failed: ${JSON.stringify(result.content)}`);
      }

      const formattedResult = this.formatToolResult(result);
      
      logger.info(`✅ Tool ${this.name} executed successfully:`, formattedResult);
      return formattedResult;
    } catch (error) {
      logger.error(`❌ Error executing tool ${this.name}:`, error);
      throw error;
    }
  }

  public setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  private formatToolResult(result: MCPToolResult): string {
    if (!result.content || result.content.length === 0) {
      return 'Tool executed successfully with no output';
    }

    const textContent = result.content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join('\n');

    if (textContent) {
      return textContent;
    }

    const otherContent = result.content
      .filter(item => item.type !== 'text')
      .map(item => {
        switch (item.type) {
          case 'image':
            return `[Image: ${item.url || 'data'}]`;
          case 'resource':
            return `[Resource: ${item.url || 'unknown'}]`;
          default:
            return `[${item.type}: ${JSON.stringify(item)}]`;
        }
      })
      .join('\n');

    return otherContent || JSON.stringify(result.content);
  }

  private mapInputToSchema(input: any): Record<string, any> {
    const properties = this.mcpTool.inputSchema?.properties || {};
    const propertyNames = Object.keys(properties);
    
    if (propertyNames.length === 0) {
      return typeof input === 'object' ? input : { input };
    }
    
    // Special handling for specific tools
    if (this.name === 'add_two_numbers') {
      if (typeof input === 'string' && input.includes(',')) {
        const numbers = input.split(',').map(s => s.trim());
        if (numbers.length >= 2) {
          return {
            firstNumber: parseFloat(numbers[0]) || 0,
            secondNumber: parseFloat(numbers[1]) || 0
          };
        }
      } else if (typeof input === 'string') {
        const numberMatches = input.match(/(\d+(?:\.\d+)?)/g);
        if (numberMatches && numberMatches.length >= 2) {
          return {
            firstNumber: parseFloat(numberMatches[0]),
            secondNumber: parseFloat(numberMatches[1])
          };
        }
      }
    }
    
    if (this.name === 'fetch_product') {
      if (typeof input === 'string' || typeof input === 'number') {
        return { productId: input.toString() };
      }
    }
    
    if (this.name === 'fetch_products_by_category') {
      if (typeof input === 'string') {
        return { category: input };
      }
    }
    
    if (propertyNames.length === 1) {
      return { [propertyNames[0]]: input };
    }
    
    if (typeof input !== 'object') {
      const commonMappings: Record<string, string[]> = {
        id: ['id', 'productId', 'userId', 'itemId'],
        query: ['query', 'search', 'term'],
        text: ['text', 'content', 'message'],
        url: ['url', 'link', 'endpoint'],
        name: ['name', 'title', 'label']
      };
      
      for (const [inputType, possibleProps] of Object.entries(commonMappings)) {
        const matchingProp = propertyNames.find(prop => 
          possibleProps.some(possible => 
            prop.toLowerCase().includes(possible.toLowerCase())
          )
        );
        if (matchingProp) {
          return { [matchingProp]: input };
        }
      }
      
      return { [propertyNames[0]]: input };
    }
    
    return input;
  }

  private validateAndCleanArgs(args: Record<string, any>): Record<string, any> {
    const properties = this.mcpTool.inputSchema?.properties || {};
    const required = this.mcpTool.inputSchema?.required || [];
    const cleanedArgs: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(args)) {
      if (properties[key]) {
        const propSchema = properties[key] as any;
        
        switch (propSchema.type) {
          case 'number':
          case 'integer':
            if (value !== null && value !== undefined) {
              const numValue = parseFloat(value.toString());
              if (!isNaN(numValue)) {
                cleanedArgs[key] = propSchema.type === 'integer' ? Math.floor(numValue) : numValue;
              }
            }
            break;
          case 'string':
            if (value !== null && value !== undefined) {
              cleanedArgs[key] = value.toString();
            }
            break;
          case 'boolean':
            if (value !== null && value !== undefined) {
              cleanedArgs[key] = Boolean(value);
            }
            break;
          default:
            cleanedArgs[key] = value;
        }
      }
    }
    
    for (const requiredProp of required) {
      if (!(requiredProp in cleanedArgs)) {
        logger.warn(`Missing required parameter '${requiredProp}' for tool '${this.name}'`);
        
        const propSchema = properties[requiredProp] as any;
        if (propSchema?.type === 'number' || propSchema?.type === 'integer') {
          cleanedArgs[requiredProp] = 0;
        } else if (propSchema?.type === 'string') {
          cleanedArgs[requiredProp] = '';
        } else if (propSchema?.type === 'boolean') {
          cleanedArgs[requiredProp] = false;
        }
      }
    }
    
    return cleanedArgs;
  }
}

export class MCPToolsManager {
  private mcpClient: MCPClient;
  private tools: MCPToolWrapper[] = [];

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  public async initializeTools(): Promise<MCPToolWrapper[]> {
    try {
      logger.info('Initializing MCP tools...');
      
      if (!this.mcpClient.isClientConnected()) {
        logger.info('MCP client not connected, skipping tool initialization');
        return [];
      }
      
      const mcpTools = await this.mcpClient.fetchTools();
      
      this.tools = mcpTools.map(mcpTool => new MCPToolWrapper(this.mcpClient, mcpTool));
      
      logger.info(`Initialized ${this.tools.length} MCP tools:`, 
        this.tools.map(tool => tool.name));
      
      return this.tools;
    } catch (error) {
      logger.error('Failed to initialize MCP tools:', error);
      return [];
    }
  }

  public getTools(): MCPToolWrapper[] {
    return [...this.tools];
  }

  public getTool(name: string): MCPToolWrapper | undefined {
    return this.tools.find(tool => tool.name === name);
  }

  public getToolNames(): string[] {
    return this.tools.map(tool => tool.name);
  }

  public getToolDescriptions(): Array<{ name: string; description: string }> {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  public async refreshTools(): Promise<MCPToolWrapper[]> {
    logger.info('Refreshing MCP tools...');
    return this.initializeTools();
  }

  public isToolAvailable(name: string): boolean {
    return this.tools.some(tool => tool.name === name);
  }

  public setSessionIdForAllTools(sessionId: string): void {
    this.tools.forEach(tool => tool.setSessionId(sessionId));
    logger.debug(`Set session ID ${sessionId} for ${this.tools.length} tools`);
  }
}
