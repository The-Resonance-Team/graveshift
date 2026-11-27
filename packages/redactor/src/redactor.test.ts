import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';

import { hasSensitiveText, redact } from './index';

const pattern = (re: RegExp) => fc.stringMatching(re);
const bits = (s: string) =>
  [...new Set(s)].reduce((sum, c) => {
    const p = s.split(c).length - 1;
    return sum - (p / s.length) * Math.log2(p / s.length);
  }, 0);
const hex40 = pattern(/^[a-f0-9]{40}$/).filter(
  (s) => /\d/.test(s) && /[a-f]/.test(s) && bits(s) >= 3.6,
);

interface Case {
  type: string;
  secret: fc.Arbitrary<string>;
  wrap: (secret: string) => string;
}

const CASES: Case[] = [
  { type: 'aws_key', secret: pattern(/^AKIA[0-9A-Z]{16}$/), wrap: (s) => s },
  { type: 'github_token', secret: pattern(/^gh[pousr]_[A-Za-z0-9]{36}$/), wrap: (s) => s },
  {
    type: 'jwt',
    secret: pattern(/^eyJ[A-Za-z0-9_-]{10,30}\.[A-Za-z0-9_-]{10,30}\.[A-Za-z0-9_-]{10,30}$/),
    wrap: (s) => s,
  },
  {
    type: 'discord_token',
    secret: pattern(/^[MNO][A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}$/),
    wrap: (s) => s,
  },
  { type: 'bearer', secret: pattern(/^[A-Za-z0-9._~+/=-]{12,40}$/), wrap: (s) => `Bearer ${s}` },
  {
    type: 'basic',
    secret: pattern(/^[A-Za-z0-9+/]{12,30}$/).filter((s) => /[0-9+/]/.test(s)),
    wrap: (s) => `Basic ${s}`,
  },
  {
    type: 'url_password',
    secret: pattern(/^[A-Za-z0-9]{8,20}$/),
    wrap: (s) => `postgres://admin:${s}@db.internal:5432/app`,
  },
  { type: 'email', secret: pattern(/^[a-z0-9]{3,10}@[a-z]{3,8}\.com$/), wrap: (s) => s },
  { type: 'vn_phone', secret: pattern(/^0[35789][0-9]{8}$/), wrap: (s) => s },
  { type: 'env', secret: pattern(/^[A-Za-z0-9]{8,20}$/), wrap: (s) => `DB_PASSWORD=${s}` },
  { type: 'entropy', secret: hex40, wrap: (s) => s },
  {
    type: 'pem',
    secret: pattern(/^[A-Za-z0-9+/]{40,64}$/),
    wrap: (s) => `-----BEGIN RSA PRIVATE KEY-----\n${s}\n-----END RSA PRIVATE KEY-----`,
  },
];

const sep = fc.constantFrom(' ', '\n', '\t', '"', ',', '(');
// head/tail must not contain the injected secret: these characters are in no secret alphabet
const noise = () => fc.stringMatching(/^[~!]{0,20}$/);

describe('redactor', () => {
  for (const { type, secret, wrap } of CASES.filter((entry) => entry.type !== 'entropy')) {
    test(`property: recognizes ${type} without exposing detector details`, () => {
      fc.assert(
        fc.property(secret, (value) => {
          expect(hasSensitiveText(wrap(value))).toBe(true);
          expect(hasSensitiveText(wrap(value))).toBe(true);
        }),
        { numRuns: 300 },
      );
    });
  }

  test('recognizes ordinary metadata without applying entropy redaction', () => {
    const id = '9b67e2a4-8c15-4f09-a2d6-3e851b740c9f';
    expect(redact(id)).toBe('[REDACTED:entropy]');
    expect(hasSensitiveText(id)).toBe(false);
    expect(hasSensitiveText('checkout.http.request')).toBe(false);
    expect(hasSensitiveText('Bearer [REDACTED:bearer]')).toBe(false);
  });

  for (const { type, secret, wrap } of CASES) {
    test(`property: injected ${type} never appears in output and is typed`, () => {
      fc.assert(
        fc.property(noise(), sep, secret, sep, noise(), (head, a, value, b, tail) => {
          const out = redact(`${head}${a}${wrap(value)}${b}${tail}`);
          expect(out).not.toContain(value);
          expect(out).toContain('[REDACTED:');
        }),
        { numRuns: 300 },
      );
    });
  }

  test('property: redact is idempotent on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        expect(redact(redact(text))).toBe(redact(text));
      }),
      { numRuns: 1000 },
    );
  });

  test('property: redact is idempotent on secrets glued together with no separators', () => {
    const fragment = fc.oneof(
      ...CASES.map(({ secret, wrap }) => secret.map(wrap)),
      fc.constantFrom(
        '[REDACTED:',
        ']',
        '@',
        ':',
        '=',
        '/',
        ' ',
        'Bearer ',
        'Basic ',
        'KEY=',
        'a1',
      ),
      fc.string({ maxLength: 8 }),
    );
    fc.assert(
      fc.property(fc.array(fragment, { maxLength: 8 }), (parts) => {
        const text = parts.join('');
        const once = redact(text);
        expect(redact(once)).toBe(once);
      }),
      { numRuns: 2000 },
    );
  });

  test('property: redact is pure and never throws on any input', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const text = value as string;
        expect(redact(text)).toBe(redact(text));
      }),
    );
    expect(redact(undefined as unknown as string)).toBe('');
  });

  test('property: text without secrets is unchanged', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z ]{0,200}$/), (text) => {
        expect(redact(text)).toBe(text);
      }),
    );
  });

  test('keeps non-secret context readable', () => {
    expect(redact('db_password=hunter22 failed for ops@example.com')).toBe(
      'db_password=[REDACTED:env] failed for [REDACTED:email]',
    );
    expect(redact('Authorization: Bearer abcdef123456')).toBe(
      'Authorization: Bearer [REDACTED:bearer]',
    );
    expect(redact('call +84 912 345 678 now')).toBe('call [REDACTED:vn_phone] now');
    expect(redact('Basic authentication failed')).toBe('Basic authentication failed');
  });

  test('1 KB of mixed log text redacts in under 1 ms on average', () => {
    const line =
      '2026-11-20T10:00:00Z api ERROR retry=3 DB_PASSWORD=hunter22 Bearer abcdef123456 ops@example.com ' +
      'AKIAABCDEFGHIJKLMNOP ghp_abcdefghijklmnopqrstuvwxyz0123456789 call 0912345678 ok\n';
    const text = line.repeat(Math.ceil(1024 / line.length)).slice(0, 1024);
    for (let i = 0; i < 200; i++) redact(text);
    const runs = 2000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) redact(text);
    expect((performance.now() - start) / runs).toBeLessThan(1);
  });
});
