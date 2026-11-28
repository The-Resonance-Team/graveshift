import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { ListWorkItemsQueryDto } from './list-work-items-query.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: 422,
});
const metadata = { type: 'query', metatype: ListWorkItemsQueryDto } as const;

describe('Work item pagination request validation', () => {
  test.each(
    ['', ' ', '0x10', '1e1', '1.0', '+1', '-0', '-1', ['1', '2'], 1, null].map((value) => ({
      value,
    })),
  )('rejects pagination values other than decimal digit strings (%#)', async ({ value }) => {
    await Promise.all(
      ['offset', 'limit'].map((field) =>
        expect(pipe.transform({ [field]: value }, metadata)).rejects.toBeInstanceOf(
          UnprocessableEntityException,
        ),
      ),
    );
  });

  test('uses defaults only when pagination parameters are absent', async () => {
    const dto = await pipe.transform({}, metadata);
    expect({ offset: dto.offset, limit: dto.limit }).toEqual({ offset: 0, limit: 20 });
  });

  test('converts decimal digit strings and retains the existing limits', async () => {
    const dto = await pipe.transform({ offset: '0020', limit: '100' }, metadata);
    expect({ offset: dto.offset, limit: dto.limit }).toEqual({ offset: 20, limit: 100 });
    await Promise.all(
      ['0', '101'].map((limit) =>
        expect(pipe.transform({ limit }, metadata)).rejects.toBeInstanceOf(
          UnprocessableEntityException,
        ),
      ),
    );
  });
});
