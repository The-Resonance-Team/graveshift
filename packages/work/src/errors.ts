import { z } from 'zod';

export const WORK_ERROR_STATUS = {
  WORK_NOT_FOUND: 404,
  HAUNTING_NOT_FOUND: 404,
  ATTEMPT_NOT_FOUND: 404,
  STATE_CHANGED: 409,
  WORKER_CHANGED: 409,
  LEASE_EXPIRED: 409,
  LEASE_ACTIVE: 409,
  TERMINAL_STATUS: 409,
  ACTIVE_ATTEMPT: 409,
  ALREADY_FIXED: 409,
  COMMAND_CONFLICT: 409,
  COMMAND_IN_PROGRESS: 409,
  QUESTION_ALREADY_ASKED: 409,
  QUESTION_NOT_PENDING: 409,
  INVALID_ASSIGNEE: 422,
  UNKNOWN_AGENT: 422,
  INVALID_PROGRESS: 422,
  INVALID_OUTCOME: 422,
  DIAGNOSIS_REQUIRED: 422,
  SENSITIVE_PARAMS: 422,
  PROJECT_FORBIDDEN: 403,
  MANUAL_ASSIGNMENT: 403,
  AUTO_FIX_DISABLED: 403,
  FIX_NOW_DISABLED: 403,
} as const;

export type WorkErrorCode = keyof typeof WORK_ERROR_STATUS;

export const WorkErrorSchema = z
  .object({
    code: z.enum(Object.keys(WORK_ERROR_STATUS) as [WorkErrorCode, ...WorkErrorCode[]]),
    status: z.union([z.literal(404), z.literal(409), z.literal(422), z.literal(403)]),
    message: z.string().min(1),
  })
  .strict()
  .refine((error) => error.status === WORK_ERROR_STATUS[error.code], {
    message: 'The error code and status must agree',
  });

export class WorkError extends Error {
  readonly code: WorkErrorCode;
  readonly status: (typeof WORK_ERROR_STATUS)[WorkErrorCode];

  constructor(code: WorkErrorCode, message: string) {
    super(message);
    this.name = 'WorkError';
    this.code = code;
    this.status = WORK_ERROR_STATUS[code];
  }

  toJSON(): z.infer<typeof WorkErrorSchema> {
    return { code: this.code, status: this.status, message: this.message };
  }
}
