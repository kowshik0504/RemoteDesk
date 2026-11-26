import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string[]>;

  constructor(
    statusCode: number,
    message: string,
    code = 'APPLICATION_ERROR',
    details?: Record<string, string[]>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function formatZodError(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'general';
    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  if (err instanceof ZodError) {
    const details = formatZodError(err);
    const firstMessage =
      err.issues[0]?.message || 'Validation failed. Please check your input.';
    return res.status(400).json({
      error: firstMessage,
      code: 'VALIDATION_ERROR',
      details,
    });
  }

  const pgCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  if (pgCode === '23505') {
    return res.status(409).json({
      error: 'A record with this unique value already exists.',
      code: 'CONFLICT',
    });
  }
  if (pgCode === '23503') {
    return res.status(400).json({
      error: 'Referenced record does not exist.',
      code: 'INVALID_REFERENCE',
    });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({
    error: 'An unexpected server error occurred. Please try again.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
