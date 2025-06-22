import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import { corsMiddleware } from './middleware/cors';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error';
import { createChatRouter } from './routes/chat';
import { LangChainMCPAgent } from '../agent/langchain-agent';
import { HealthResponse } from '../types/api';
import { logger } from '../utils/logger';

export class ExpressServer {
  private app: Application;
  private agent: LangChainMCPAgent;
  private server?: any;

  constructor(agent: LangChainMCPAgent) {
    this.app = express();
    this.agent = agent;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for SSE
      crossOriginEmbedderPolicy: false, // Allow cross-origin for SSE
    }));

    // CORS middleware
    this.app.use(corsMiddleware);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
      });
      next();
    });
  }

  private setupRoutes(): void {    // Health check endpoint
    this.app.get('/api/health', asyncHandler(async (req: Request, res: Response) => {
      const startTime = process.hrtime();
      
      try {
        const agentHealth = await this.agent.healthCheck();
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const responseTime = (seconds * 1000) + (nanoseconds / 1e6);

        // Determine overall health status
        const isHealthy = agentHealth.agent && agentHealth.llm && agentHealth.mcp.status !== 'disconnected';

        const healthResponse: HealthResponse = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            mcp: {
              status: agentHealth.mcp.status,
              url: process.env.MCP_SERVER_URL || 'http://localhost:8000',
              lastCheck: new Date().toISOString(),
              serverReachable: agentHealth.mcp.serverReachable,
              sseConnected: agentHealth.mcp.sseConnected,
              initialized: agentHealth.mcp.initialized,
              toolsAvailable: agentHealth.mcp.toolsAvailable,
              serverInfo: agentHealth.mcp.serverInfo,
            },
            llm: {
              status: agentHealth.llm ? 'available' : 'unavailable',
              provider: 'OpenAI',
            },
          },
          uptime: process.uptime(),
          responseTime: Math.round(responseTime),
        };

        res.json(healthResponse);
        logger.info(`Health check completed in ${responseTime.toFixed(2)}ms - MCP Status: ${agentHealth.mcp.status}`);
      } catch (error) {
        logger.error('Health check failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: errorMessage,
        });
      }
    }));

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'AI Agent API',
        version: '1.0.0',
        description: 'TypeScript LangChain AI Agent with MCP Integration',
        endpoints: {
          health: '/api/health',
          chat: '/api/chat',
          tools: '/api/tools',
          sessions: '/api/sessions',
        },
        timestamp: new Date().toISOString(),
      });
    });

    // Chat routes
    this.app.use('/api', createChatRouter(this.agent));
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(port: number = 3000): Promise<void> {
    try {
      // Initialize the agent first
      await this.agent.initialize();

      // Start the server
      this.server = this.app.listen(port, () => {
        logger.info(`Server started successfully on port ${port}`);
        logger.info(`Health check: http://localhost:${port}/api/health`);
        logger.info(`Chat endpoint: http://localhost:${port}/api/chat`);
        logger.info(`Tools endpoint: http://localhost:${port}/api/tools`);
      });

      // Handle server errors
      this.server.on('error', (error: Error) => {
        logger.error('Server error:', error);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));

    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  private async shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await this.agent.shutdown();
          logger.info('Agent shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  }

  public getApp(): Application {
    return this.app;
  }
}
