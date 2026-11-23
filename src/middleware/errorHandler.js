import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logging/logger.js';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
    requestId: req.requestId,
  });
}

export function errorHandler(err, req, res, _next) {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON body';
  }

  const logPayload = {
    err,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
  };

  if (statusCode >= 500) {
    logger.error(logPayload, message);
  } else {
    logger.warn(logPayload, message);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(env.isDevelopment && statusCode >= 500 && err?.stack
        ? { stack: err.stack }
        : {}),
    },
    requestId: req.requestId,
  });
}

export default errorHandler;
