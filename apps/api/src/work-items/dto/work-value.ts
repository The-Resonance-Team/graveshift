import { registerDecorator } from 'class-validator';
import type { z } from 'zod';

/** Keeps nested wire values on the canonical package schema at the DTO boundary. */
export function WorkValue(schema: z.ZodType): PropertyDecorator {
  return (target, property) =>
    registerDecorator({
      name: 'workValue',
      target: target.constructor,
      propertyName: String(property),
      validator: {
        validate(value: unknown) {
          return schema.safeParse(value).success;
        },
        defaultMessage() {
          return `${String(property)} is not valid`;
        },
      },
    });
}
