// Kiro PostFileSave secret scan. Reads a file path from the session JSON on stdin,
// reads that file and exits 1 if a common secret pattern is found, else exits 0.
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\bgh[pusro]_[A-Za-z0-9_]{20,}/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: 'Authorization header', re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{8,}/i },
  {
    name: 'PEM private key',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )*PRIVATE KEY-----/,
  },
];

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractPath(raw) {
  const text = raw.trim();
  if (!text) return '';

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return text; // path passed as a plain string
  }
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';

  const candidates = [
    data.file_path,
    data.filePath,
    data.path,
    data.filename,
    data.file,
    data.input?.file_path,
    data.input?.filePath,
    data.tool_input?.file_path,
    data.tool_input?.filePath,
    data.toolInput?.filePath,
    data.arguments?.file_path,
    data.args?.file_path,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return '';
}

const filePath = extractPath(readStdin());
if (!filePath) process.exit(0);

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch {
  process.exit(0); // missing/unreadable file is not a secret finding
}

const lines = content.split(/\r?\n/);
for (const [index, line] of lines.entries()) {
  for (const pattern of PATTERNS) {
    if (pattern.re.test(line)) {
      process.stderr.write(`SECRET FOUND: ${pattern.name} at ${filePath}:${index + 1}\n`);
      process.exit(1);
    }
  }
}

process.exit(0);
