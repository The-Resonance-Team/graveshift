import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { describe, expect, test } from 'bun:test';

import { CreateDeployDto } from './create-deploy.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: 422,
});
const body = {
  deploymentId: 'a'.repeat(40),
  title: 'Deploy request validation',
  environment: 'production',
  dateStarted: '2026-11-28T10:00:00.000Z',
};
const metadata = { type: 'body', metatype: CreateDeployDto } as const;

describe('Deployment timestamp request validation', () => {
  test.each([
    true,
    false,
    0,
    1795860000000,
    '2026-11-28',
    '2026-11-28T10:00:00',
    '2026-02-30T10:00:00Z',
    '2026-11-28T10Z',
    '2026-11-28T10:00:00+99:00',
  ])('rejects a value without a valid full timestamp and timezone (%#)', async (value) => {
    await Promise.all(
      ['dateStarted', 'dateFinished'].map((field) =>
        expect(pipe.transform({ ...body, [field]: value }, metadata)).rejects.toBeInstanceOf(
          UnprocessableEntityException,
        ),
      ),
    );
  });

  test('converts offset timestamps into UTC Dates before the service receives them', async () => {
    const dto = await pipe.transform(
      {
        ...body,
        dateStarted: '2026-11-28T17:00:00+07:00',
        dateFinished: '2026-11-28T05:05:00-05:00',
      },
      metadata,
    );
    expect(dto.dateStarted.toISOString()).toBe('2026-11-28T10:00:00.000Z');
    expect(dto.dateFinished.toISOString()).toBe('2026-11-28T10:05:00.000Z');
  });

  test('keeps an unfinished Deployment optional and permits its existing null value', async () => {
    expect((await pipe.transform(body, metadata)).dateFinished).toBeUndefined();
    expect(
      (await pipe.transform({ ...body, dateFinished: null }, metadata)).dateFinished,
    ).toBeNull();
  });

  test('truncates submillisecond precision without advancing a Deployment timestamp', async () => {
    const dto = await pipe.transform(
      {
        ...body,
        dateStarted: '2026-11-28T17:00:00.999999999+07:00',
        dateFinished: '2026-11-28T05:05:00.999999999-05:00',
      },
      metadata,
    );
    expect(dto.dateStarted.toISOString()).toBe('2026-11-28T10:00:00.999Z');
    expect(dto.dateFinished.toISOString()).toBe('2026-11-28T10:05:00.999Z');
  });
});
