export interface Detector {
  type: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

const MIN_ENTROPY_LENGTH = 32;
const MIN_ENTROPY_BITS = 3.5;

function shannon(token: string): number {
  const counts = new Map<string, number>();
  for (const char of token) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / token.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// ponytail: tokens without both a digit and a letter are left alone to spare long identifiers, upgrade if digit-free secrets show up
function entropyReplacement(token: string): string {
  const looksRandom =
    /\d/.test(token) && /[A-Za-z]/.test(token) && shannon(token) >= MIN_ENTROPY_BITS;
  return looksRandom ? '[REDACTED:entropy]' : token;
}

// ordered by specificity: multi-line and structured secrets first, entropy last
export const DETECTORS: readonly Detector[] = [
  {
    type: 'pem',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    replacement: '[REDACTED:pem]',
  },
  {
    type: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
    replacement: '[REDACTED:jwt]',
  },
  {
    type: 'url_password',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):(?!\[REDACTED)[^\s@/]+@/gi,
    replacement: '$1:[REDACTED:url_password]@',
  },
  { type: 'aws_key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: '[REDACTED:aws_key]' },
  {
    type: 'github_token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    replacement: '[REDACTED:github_token]',
  },
  {
    type: 'discord_token',
    pattern: /\b[MNO][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}/g,
    replacement: '[REDACTED:discord_token]',
  },
  {
    type: 'bearer',
    pattern: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: '$1 [REDACTED:bearer]',
  },
  {
    type: 'basic',
    pattern: /\bBasic\s+(?=[A-Za-z0-9+/]*[0-9+/]|[A-Za-z0-9+/]+=)[A-Za-z0-9+/]{8,}={0,2}/g,
    replacement: 'Basic [REDACTED:basic]',
  },
  {
    type: 'env',
    pattern:
      /\b(\w*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL|ACCESS_?KEY)\w*)=(?!\[REDACTED)("[^"]*"|'[^']*'|[^\s"']+)/gi,
    replacement: '$1=[REDACTED:env]',
  },
  {
    type: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: '[REDACTED:email]',
  },
  {
    type: 'vn_phone',
    pattern: /(?<![\d])(?:\+?84|0)[ .-]?[35789](?:[ .-]?\d){8}(?!\d)/g,
    replacement: '[REDACTED:vn_phone]',
  },
  {
    type: 'entropy',
    pattern: new RegExp(`[A-Za-z0-9+/=_-]{${MIN_ENTROPY_LENGTH},}`, 'g'),
    replacement: entropyReplacement,
  },
];
