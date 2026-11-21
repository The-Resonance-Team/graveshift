import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Validate, validate } from 'class-validator';

import { UniqueRuleIdsConstraint } from './unique-rule-ids.validator';

class Layer {
  @Validate(UniqueRuleIdsConstraint)
  rules: Array<{ id: string }> = [];
}

describe('UniqueRuleIdsConstraint', () => {
  test('accepts an empty layer and unique ids', async () => {
    expect(await validate(new Layer())).toHaveLength(0);
    const layer = new Layer();
    layer.rules = [{ id: 'a' }, { id: 'b' }];
    expect(await validate(layer)).toHaveLength(0);
  });

  test('rejects a repeated id and names the layer in the message', async () => {
    const layer = new Layer();
    layer.rules = [{ id: 'a' }, { id: 'a' }];
    const errors = await validate(layer);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints?.uniqueRuleIds).toContain('rules');
  });
});
