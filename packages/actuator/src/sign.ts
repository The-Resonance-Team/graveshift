import { timingSafeEqual } from 'node:crypto';

import { type ActionRequest, ActuatorError, type UnsignedRequest } from './types';

export const MIN_SECRET_LENGTH = 32;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function signRequest(unsigned: UnsignedRequest, secret: string): ActionRequest {
  if (secret.length < MIN_SECRET_LENGTH)
    throw new ActuatorError('ACTUATOR_CONFIG', 'HMAC secret is too short');
  const signature = new Bun.CryptoHasher('sha256', secret)
    .update(
      canonical({
        action: unsigned.action,
        approval: unsigned.approval,
        context: unsigned.context,
      }),
    )
    .digest('hex');
  return { ...unsigned, signature };
}

export function verifyHmac(request: ActionRequest, secret: string): boolean {
  const { signature, ...unsigned } = request;
  const expected = Buffer.from(signRequest(unsigned, secret).signature, 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
