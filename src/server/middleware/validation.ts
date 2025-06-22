import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../types/api';

export const chatValidation = [
  body('message')
    .isString()
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message must be a string between 1 and 10000 characters'),
  
  body('sessionId')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Session ID must be a string between 1 and 100 characters'),
  
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean'),
  
  body('maxTokens')
    .optional()
    .isInt({ min: 1, max: 8000 })
    .withMessage('Max tokens must be an integer between 1 and 8000'),
];

export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {    const validationErrors: ValidationError[] = errors.array().map((error: any) => ({
      field: error.path || error.param || 'unknown',
      message: error.msg,
      value: error.value,
    }));

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validationErrors,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};
