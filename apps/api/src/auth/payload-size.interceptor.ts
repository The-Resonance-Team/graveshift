import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import { CREDENTIAL_CONFIG, type AuthConfig } from './auth.types';

/** Bounds the raw body before the validation pipe parses it. */
@Injectable()
export class PayloadSizeInterceptor implements NestInterceptor {
  constructor(@Inject(CREDENTIAL_CONFIG) private readonly config: AuthConfig) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    const size = Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
    if (size > this.config.maxEventBytes) throw new PayloadTooLargeException();
    return next.handle();
  }
}
