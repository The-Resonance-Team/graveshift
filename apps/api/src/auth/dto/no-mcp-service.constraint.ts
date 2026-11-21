import {
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** Cross-field rule: only plugin keys may carry a Grave or service binding. */
@ValidatorConstraint({ name: 'noMcpService', async: false })
export class NoMcpServiceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as { kind?: string; service?: unknown };
    return body.kind !== 'mcp' || body.service === undefined;
  }

  defaultMessage(): string {
    return 'An MCP token cannot have a service binding';
  }
}
