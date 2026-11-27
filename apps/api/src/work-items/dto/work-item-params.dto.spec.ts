import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { WorkItemParamsDto } from './work-item-params.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };

describe('WorkItemParamsDto', () => {
  test('accepts a non-empty id', async () => {
    const errors = await validate(plainToInstance(WorkItemParamsDto, { id: 'wi-1' }), options);
    expect(errors).toHaveLength(0);
  });

  test('rejects an empty id', async () => {
    const errors = await validate(plainToInstance(WorkItemParamsDto, { id: '' }), options);
    expect(errors.map((error) => error.property)).toContain('id');
  });

  test('rejects an undeclared field', async () => {
    const errors = await validate(
      plainToInstance(WorkItemParamsDto, { id: 'wi-1', extra: 'x' }),
      options,
    );
    expect(errors.map((error) => error.property)).toContain('extra');
  });
});
