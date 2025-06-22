import { Response } from 'express';
import { StreamMessage } from '../types/api';
import { logger } from './logger';

export class SSEStream {
  private response: Response;
  private isActive: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(response: Response) {
    this.response = response;
    this.setupSSE();
  }

  private setupSSE(): void {
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
    });

    this.isActive = true;

    // Send initial connection message
    this.sendMessage({
      type: 'start',
      timestamp: new Date().toISOString(),
    });

    // Setup heartbeat to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.isActive) {
        this.response.write(': heartbeat\n\n');
      }
    }, 30000);

    // Handle client disconnect
    this.response.on('close', () => {
      this.cleanup();
    });

    this.response.on('error', (error) => {
      logger.error('SSE stream error:', error);
      this.cleanup();
    });
  }

  public sendMessage(message: StreamMessage): void {
    if (!this.isActive) {
      return;
    }

    try {
      const data = JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      });

      this.response.write(`data: ${data}\n\n`);
    } catch (error) {
      logger.error('Error sending SSE message:', error);
      this.sendError('Failed to send message');
    }
  }

  public sendToken(content: string, sessionId?: string): void {
    this.sendMessage({
      type: 'token',
      content,
      sessionId,
    });
  }
  public sendToolCall(tool: string, toolCall: { name: string; arguments: Record<string, any>; sessionId: string }, sessionId?: string): void {
    this.sendMessage({
      type: 'tool_call',
      tool,
      toolCall, // Send the properly formatted MCP tool call
      sessionId,
    });
  }

  public sendToolResult(result: any, sessionId?: string): void {
    this.sendMessage({
      type: 'tool_result',
      result,
      sessionId,
    });
  }

  public sendError(error: string, sessionId?: string): void {
    this.sendMessage({
      type: 'error',
      error,
      sessionId,
    });
  }

  public sendEnd(sessionId?: string): void {
    this.sendMessage({
      type: 'end',
      sessionId,
    });
    this.cleanup();
  }

  private cleanup(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    try {
      this.response.end();
    } catch (error) {
      logger.error('Error ending SSE response:', error);
    }
  }

  public isStreamActive(): boolean {
    return this.isActive;
  }
}

export const createSSEStream = (response: Response): SSEStream => {
  return new SSEStream(response);
};
