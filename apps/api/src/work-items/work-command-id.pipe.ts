import { randomUUID } from 'node:crypto';
import {
  createParamDecorator,
  Injectable,
  UnprocessableEntityException,
  type ExecutionContext,
  type PipeTransform,
} from '@nestjs/common';

export const WorkCommandId = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
  const commandId = new WorkCommandIdPipe().transform(request.headers['idempotency-key']);
  context
    .switchToHttp()
    .getResponse<{ setHeader(name: string, value: string): void }>()
    .setHeader('Idempotency-Key', commandId);
  return commandId;
});

@Injectable()
export class WorkCommandIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (value === undefined) return randomUUID();
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(value)) {
      throw new UnprocessableEntityException(
        'Idempotency-Key must be one ID of at most 100 characters',
      );
    }
    return value;
  }
}
