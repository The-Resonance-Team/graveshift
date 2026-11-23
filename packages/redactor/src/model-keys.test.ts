import { describe, expect, test } from 'bun:test';

import { hasSensitiveText, redact } from './index';

describe('Recognized model credentials', () => {
  test.each(['sk-', 'sk-proj-', 'sk-svcacct-', 'sk-ant-api03-'])(
    'redacts %s values even when entropy is low or contains no digit',
    (prefix) => {
      const key = prefix + 'a'.repeat(48);
      const text = `A note contains ${key}.`;
      const cleaned = redact(text);
      expect(cleaned).not.toContain(key);
      expect(cleaned).toContain('[REDACTED:model_key]');
      expect(redact(cleaned)).toBe(cleaned);
      expect(hasSensitiveText(key)).toBe(true);
    },
  );
});
