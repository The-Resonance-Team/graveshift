import {
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

// Duplicate ids inside one rule layer are invalid. The same id in both layers is a
// Rule override and stays valid, so the constraint checks one decorated array at a time.
@ValidatorConstraint({ name: 'uniqueRuleIds', async: false })
export class UniqueRuleIdsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (!Array.isArray(value)) return true; // @IsArray owns the shape check.
    const seen = new Set<string>();
    for (const entry of value) {
      const item: unknown = entry;
      if (typeof item !== 'object' || item === null) continue;
      if (!('id' in item) || typeof item.id !== 'string') continue;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} contains duplicate rule ids.`;
  }
}
