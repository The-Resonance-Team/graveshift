import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { AddMemberDto, CreateOAuthClientDto, LoginDto, RegisterDto } from './identity.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: 422,
});

describe('identity request validation', () => {
  test.each([null, 42, { email: 'audit@example.test' }])(
    'rejects non-string email input with 422 (%#)',
    async (email) => {
      await expect(
        pipe.transform(
          { email, password: 'Mixed-Case-Password-123' },
          { type: 'body', metatype: RegisterDto },
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    },
  );

  test.each([
    ['registration', RegisterDto],
    ['login', LoginDto],
    ['member invitation', AddMemberDto],
  ] as const)('normalizes the email before %s', async (_, metatype) => {
    const input = { email: 'Audit@Example.TEST', password: 'Mixed-Case-Password-123' };
    const value = metatype === AddMemberDto ? { email: input.email } : input;
    const dto = await pipe.transform(value, { type: 'body', metatype });
    expect(dto.email).toBe('audit@example.test');
    if (metatype !== AddMemberDto) expect(dto.password).toBe('Mixed-Case-Password-123');
  });

  test('rejects an empty OAuth-client scope list with 422', async () => {
    await expect(
      pipe.transform(
        { projectId: '1001', scopes: [] },
        { type: 'body', metatype: CreateOAuthClientDto },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
