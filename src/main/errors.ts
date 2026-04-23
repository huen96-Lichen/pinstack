import type { AppErrorCode, AppErrorPayload, Result } from '../shared/types';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly details?: string;

  public constructor(code: AppErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function toErrorPayload(error: unknown): AppErrorPayload {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown internal error'
  };
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: AppErrorPayload): Result<T> {
  return { ok: false, error };
}
