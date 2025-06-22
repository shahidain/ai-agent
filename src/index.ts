import dotenv from 'dotenv';
import { MCPClient } from './mcp/mcp-client';
import { LangChainMCPAgent, AgentConfig } from './agent/langchain-agent';
import { ExpressServer } from './server/app';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  try {
    logger.info('Starting AI Agent application...');

    // Validate required environment variables
    const requiredEnvVars = ['OPENAI_API_KEY', 'MCP_SERVER_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Configuration
    const mcpServerURL = process.env.MCP_SERVER_URL!;
    const port = parseInt(process.env.PORT || '3000', 10);
    
    const agentConfig: AgentConfig = {
      openaiApiKey: process.env.OPENAI_API_KEY!,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.MAX_TOKENS || '4000', 10),
      streamTimeout: parseInt(process.env.STREAM_TIMEOUT || '30000', 10),
    };

    logger.info('Configuration loaded:', {
      mcpServerURL,
      port,
      model: agentConfig.model,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
    });

    // Initialize MCP client
    logger.info('Initializing MCP client...');
    const mcpClient = new MCPClient(mcpServerURL);

    // Initialize agent
    logger.info('Initializing LangChain MCP agent...');
    const agent = new LangChainMCPAgent(mcpClient, agentConfig);

    // Initialize Express server
    logger.info('Initializing Express server...');
    const server = new ExpressServer(agent);

    // Start the server
    logger.info('Starting server...');
    await server.start(port);

    logger.info('AI Agent application started successfully!');
    logger.info(`🚀 Server running on http://localhost:${port}`);
    logger.info(`📚 API Documentation: http://localhost:${port}/`);
    logger.info(`💊 Health Check: http://localhost:${port}/api/health`);
    logger.info(`💬 Chat Endpoint: http://localhost:${port}/api/chat`);
    logger.info(`🔧 Tools Endpoint: http://localhost:${port}/api/tools`);

  } catch (error) {
    logger.error('Failed to start AI Agent application:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main();
}

export { main };
