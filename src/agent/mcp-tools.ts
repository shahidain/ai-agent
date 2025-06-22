import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { MCPClient } from '../mcp/mcp-client';
import { MCPTool, MCPToolResult } from '../types/mcp';
import { logger } from '../utils/logger';

export class MCPToolWrapper extends DynamicStructuredTool {
  public mcpTool: MCPTool;
  private mcpClient: MCPClient;
  private currentSessionId: string;
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
    
    // Initialize with sessionId from MCP client
    // Note: This will be properly set during tool initialization in MCPToolsManager
    this.currentSessionId = mcpClient.getSessionId() || 'pending-session-id';
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
      // Always use the current sessionId from MCP client to ensure consistency
      const currentSessionId = this.mcpClient.getSessionId() || this.currentSessionId;
      
      logger.info(`🔧 Executing MCP tool: ${this.name}`, { input, sessionId: currentSessionId });
      
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
        sessionId: currentSessionId
      };
      
      logger.info(`📞 Calling MCP tool with proper format:`, mcpToolCall);
      
      // Call MCP tool with the correct format - always use MCP client's sessionId
      const result: MCPToolResult = await this.mcpClient.callTool(
        this.name, 
        mcpArguments, // arguments 
        currentSessionId // sessionId - use the current one from MCP client
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
  }  public setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  public getSessionId(): string {
    // Always return the most current sessionId from MCP client if available
    return this.mcpClient.getSessionId() || this.currentSessionId;
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
  }  private mapInputToSchema(input: any): Record<string, any> {
    const properties = this.mcpTool.inputSchema?.properties || {};
    const required = this.mcpTool.inputSchema?.required || [];
    const propertyNames = Object.keys(properties);
    
    if (propertyNames.length === 0) {
      return typeof input === 'object' ? input : { input };
    }
    
    // If input is already an object, validate it against schema
    if (typeof input === 'object' && input !== null) {
      return input;
    }
    
    // For single property schemas, map directly
    if (propertyNames.length === 1) {
      const propName = propertyNames[0];
      const propSchema = properties[propName] as any;
      
      // Type conversion based on schema
      let convertedValue = this.convertValueToSchemaType(input, propSchema);
      return { [propName]: convertedValue };
    }      // For multiple properties, try to intelligently map based on property names and types
    if (typeof input === 'string') {
      // Try to parse a mixed string input (e.g., "5 3 add", "laptops electronics", etc.)
      const words = input.trim().split(/\s+/);
      const numberMatches = input.match(/(\d+(?:\.\d+)?)/g);
      
      const numericProps = propertyNames.filter(prop => {
        const propSchema = properties[prop] as any;
        return propSchema.type === 'number' || propSchema.type === 'integer';
      });
      
      const stringProps = propertyNames.filter(prop => {
        const propSchema = properties[prop] as any;
        return propSchema.type === 'string';
      });
      
      const result: Record<string, any> = {};
      
      // First, try to map numbers to numeric properties
      if (numberMatches && numericProps.length > 0) {
        numericProps.forEach((prop, index) => {
          if (index < numberMatches.length) {
            const propSchema = properties[prop] as any;
            result[prop] = this.convertValueToSchemaType(numberMatches[index], propSchema);
          }
        });
      }
      
      // Then, try to map remaining words to string properties
      if (stringProps.length > 0) {
        const nonNumericWords = words.filter(word => !/^\d+(\.\d+)?$/.test(word));
        
        if (nonNumericWords.length > 0) {
          // For enum properties, try to find matching values
          for (const prop of stringProps) {
            const propSchema = properties[prop] as any;
            if (propSchema.enum && Array.isArray(propSchema.enum)) {
              const matchingEnum = nonNumericWords.find(word => 
                propSchema.enum.includes(word.toLowerCase()) || 
                propSchema.enum.includes(word)
              );
              if (matchingEnum && !(prop in result)) {
                result[prop] = matchingEnum;
                nonNumericWords.splice(nonNumericWords.indexOf(matchingEnum), 1);
                break;
              }
            }
          }
          
          // Map remaining words to string properties by priority
          for (const prop of stringProps) {
            if (nonNumericWords.length === 0) break;
            if (prop in result) continue;
            
            const propSchema = properties[prop] as any;
            
            // Prioritize properties based on common naming patterns
            const priority = this.getPropertyPriority(prop, propSchema);
            
            if (nonNumericWords.length === 1 || priority > 0) {
              result[prop] = nonNumericWords.shift() || '';
            }
          }
          
          // If we still have unmapped words and properties, join remaining words
          if (nonNumericWords.length > 0) {
            const remainingStringProps = stringProps.filter(prop => !(prop in result));
            if (remainingStringProps.length > 0) {
              const bestProp = remainingStringProps[0];
              result[bestProp] = nonNumericWords.join(' ');
            }
          }
        }
      }      // If we successfully mapped some properties, return the result
      if (Object.keys(result).length > 0) {
        // Fill in any required properties that are still missing
        for (const reqProp of required) {
          if (!(reqProp in result)) {
            const propSchema = properties[reqProp] as any;
            result[reqProp] = this.getDefaultValueForSchema(propSchema);
          }
        }
        return result;
      }
      
      // Fallback for simple string inputs - map to the most relevant string property
      if (stringProps.length > 0) {
        const bestMatch = stringProps.find(prop => 
          prop.toLowerCase().includes('query') ||
          prop.toLowerCase().includes('name') || 
          prop.toLowerCase().includes('id') ||
          prop.toLowerCase().includes('search') ||
          prop.toLowerCase().includes('text')
        ) || stringProps[0];
        
        return { [bestMatch]: input };
      }
    }    
    // Fallback: try to match input type to schema types
    const result: Record<string, any> = {};
    
    // Handle required properties first
    for (const propName of required) {
      if (!(propName in result)) {
        const propSchema = properties[propName] as any;
        result[propName] = this.convertValueToSchemaType(input, propSchema);
        break; // Only map to first required property to avoid duplicates
      }
    }
    
    // If no required properties were mapped, use first property
    if (Object.keys(result).length === 0 && propertyNames.length > 0) {
      const propName = propertyNames[0];
      const propSchema = properties[propName] as any;
      result[propName] = this.convertValueToSchemaType(input, propSchema);
    }
    
    return result;
  }
  
  private convertValueToSchemaType(value: any, propSchema: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    switch (propSchema.type) {
      case 'number':
        const numValue = parseFloat(value.toString());
        return isNaN(numValue) ? 0 : numValue;
      
      case 'integer':
        const intValue = parseInt(value.toString());
        return isNaN(intValue) ? 0 : intValue;
      
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
      
      case 'string':
        return value.toString();
      
      case 'array':
        return Array.isArray(value) ? value : [value];
      
      case 'object':
        return typeof value === 'object' ? value : { value };
      
      default:
        return value;
    }
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

  private getPropertyPriority(propName: string, propSchema: any): number {
    const name = propName.toLowerCase();
    
    // Higher priority for common important properties
    if (name.includes('query') || name.includes('search')) return 10;
    if (name.includes('name') || name.includes('title')) return 9;
    if (name.includes('id')) return 8;
    if (name.includes('category') || name.includes('type')) return 7;
    if (name.includes('text') || name.includes('content')) return 6;
    if (name.includes('description') || name.includes('summary')) return 5;
    
    // Medium priority for enum properties
    if (propSchema.enum && Array.isArray(propSchema.enum)) return 4;
    
    // Lower priority for optional properties
    return 1;
  }

  private getDefaultValueForSchema(propSchema: any): any {
    switch (propSchema.type) {
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      case 'string':
        if (propSchema.enum && Array.isArray(propSchema.enum)) {
          return propSchema.enum[0];
        }
        return '';
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return null;
    }
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
      
      // Synchronize sessionId from MCP client to all tools
      const clientSessionId = this.mcpClient.getSessionId();
      if (clientSessionId) {
        this.setSessionIdForAllTools(clientSessionId);
        logger.info(`Synchronized sessionId ${clientSessionId} to all tools`);
      } else {
        logger.warn('MCP client has no sessionId - tools will use default sessionId');
      }
      
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
    const tools = await this.initializeTools();
    
    // Ensure sessionId is synchronized after refresh
    const clientSessionId = this.mcpClient.getSessionId();
    if (clientSessionId) {
      this.setSessionIdForAllTools(clientSessionId);
      logger.info(`Re-synchronized sessionId ${clientSessionId} after tools refresh`);
    }
    
    return tools;
  }

  public isToolAvailable(name: string): boolean {
    return this.tools.some(tool => tool.name === name);
  }
  public setSessionIdForAllTools(sessionId: string): void {
    this.tools.forEach(tool => tool.setSessionId(sessionId));
    logger.debug(`Set session ID ${sessionId} for ${this.tools.length} tools`);
  }

  public syncSessionIdFromClient(): void {
    const clientSessionId = this.mcpClient.getSessionId();
    if (clientSessionId) {
      this.setSessionIdForAllTools(clientSessionId);
      logger.info(`Synchronized sessionId ${clientSessionId} from MCP client to all tools`);
    } else {
      logger.warn('MCP client has no sessionId to synchronize');
    }
  }

  public getCurrentSessionId(): string | undefined {
    return this.mcpClient.getSessionId();
  }
}
