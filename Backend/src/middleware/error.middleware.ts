import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError';
import { logger } from '../utils/logger';

const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: any[] = [];

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors || [];
  }

  // Handle PrismaClientInitializationError
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    errors = [{ message: err.message }];
  }

  // Handle PrismaClientKnownRequestError
  if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database request error';
    errors = [{ message: err.message, code: (err as any).code }];
  }

  // Handle PrismaClientValidationError
  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid database query';
    errors = [{ message: err.message }];
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database request error';
    errors = [{ message: err.message, code: (err as any).code }];
  }

  // Handle PrismaClientInitializationError
  if (err.name === 'PrismaClientInitializationError') {
    statusCode = 503;
    message = 'Database connection failed';
    errors = [{ message: err.message }];
  }

  // Log the error stack in development
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export { errorHandler };
