export type Role = 'ADMIN' | 'PM' | 'DEVELOPER';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
