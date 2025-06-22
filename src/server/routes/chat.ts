import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatRequest } from '../../types/api';
import { LangChainMCPAgent } from '../../agent/langchain-agent';
import { createSSEStream } from '../../utils/stream';
import { asyncHandler } from '../middleware/error';
import { chatValidation, validateRequest } from '../middleware/validation';
import { logger } from '../../utils/logger';

export const createChatRouter = (agent: LangChainMCPAgent): Router => {
  const router = Router();

  // POST /api/chat - Send message to agent
  router.post('/chat', 
    chatValidation,
    validateRequest,
    asyncHandler(async (req: Request, res: Response) => {
      const { message, sessionId, stream = true, maxTokens }: ChatRequest = req.body;
      const finalSessionId = sessionId || uuidv4();

      logger.info(`Chat request received for session ${finalSessionId}:`, {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        stream,
        maxTokens,
      });

      try {
        if (stream) {
          // Handle streaming response
          const sseStream = createSSEStream(res);
          
          try {
            const response = await agent.processMessage(message, finalSessionId, sseStream);
            sseStream.sendEnd(finalSessionId);
          } catch (error) {
            logger.error('Error processing streaming message:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            sseStream.sendError(errorMessage, finalSessionId);
            sseStream.sendEnd(finalSessionId);
          }
        } else {
          // Handle non-streaming response
          const response = await agent.processMessage(message, finalSessionId);
            res.json({
            sessionId: finalSessionId,
            response: response,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error('Error in chat endpoint:', error);
        
        if (!res.headersSent) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          res.status(500).json({
            error: {
              code: 'CHAT_ERROR',
              message: errorMessage,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }
    })
  );

  // GET /api/tools - Get available tools
  router.get('/tools', asyncHandler(async (req: Request, res: Response) => {
    try {
      const tools = await agent.getAvailableTools();
      
      res.json({
        tools,
        count: tools.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error fetching tools:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      res.status(500).json({
        error: {
          code: 'TOOLS_ERROR',
          message: errorMessage,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }));

  // POST /api/tools/refresh - Refresh available tools
  router.post('/tools/refresh', asyncHandler(async (req: Request, res: Response) => {
    try {
      await agent.refreshTools();
      const tools = await agent.getAvailableTools();
      
      res.json({
        message: 'Tools refreshed successfully',
        tools,
        count: tools.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error refreshing tools:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      res.status(500).json({
        error: {
          code: 'TOOLS_REFRESH_ERROR',
          message: errorMessage,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }));

  // DELETE /api/sessions/:sessionId - Clear specific session
  router.delete('/sessions/:sessionId', asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    
    try {
      agent.clearSession(sessionId);
      
      res.json({
        message: `Session ${sessionId} cleared successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error clearing session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      res.status(500).json({
        error: {
          code: 'SESSION_CLEAR_ERROR',
          message: errorMessage,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }));

  // DELETE /api/sessions - Clear all sessions
  router.delete('/sessions', asyncHandler(async (req: Request, res: Response) => {
    try {
      agent.clearAllSessions();
      
      res.json({
        message: 'All sessions cleared successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error clearing all sessions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      res.status(500).json({
        error: {
          code: 'SESSIONS_CLEAR_ERROR',
          message: errorMessage,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }));

  return router;
};
