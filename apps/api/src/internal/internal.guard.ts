import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>();
    const header = request.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const expected = this.config.getOrThrow<string>('GRAVESHIFT_API_INTERNAL_TOKEN');
    if (token.length === 0 || !timingSafeEqual(digest(token), digest(expected))) {
      throw new UnauthorizedException('Internal authentication required');
    }
    return true;
  }
}
