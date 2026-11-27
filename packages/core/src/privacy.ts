import { hasSensitiveText } from '@graveshift/redactor';
import { z } from 'zod';

import { EnvelopeError } from './errors';

const uuidSchema = z.uuid();

export function assertSafeMetadata(values: readonly string[]): void {
  for (const value of values) {
    // A valid UUID can contain digits that resemble a phone number by chance.
    if (hasSensitiveText(value) && !uuidSchema.safeParse(value).success) {
      throw new EnvelopeError('SENSITIVE_METADATA', 'Event metadata contains sensitive text');
    }
  }
}
