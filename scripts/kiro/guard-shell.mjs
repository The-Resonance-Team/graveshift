// Kiro PreToolUse guard. Block destructive shell commands with exit code 2.
// Exit 1 would only warn; exit 2 is the documented way to block a tool.
import { readFileSync } from 'node:fs';

const DANGEROUS =
  /(docker\s+(rm|rmi|system\s+prune)|kubectl\s+delete|helm\s+uninstall|git\s+push\s+(-f|--force)|git\s+push\s+\S+\s+(main|master)\b|rm\s+-rf\s+\/(\s|$))/;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function extractCommand(raw) {
  const text = raw.trim();
  if (!text) return '';

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return text; // command passed as a plain string
  }
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';

  const candidates = [
    data.command,
    data.shell,
    data.input?.command,
    data.tool_input?.command,
    data.toolInput?.command,
    data.arguments?.command,
    data.args?.command,
    data.parameters?.command,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return '';
}

const command = extractCommand(readStdin());
const match = command.match(DANGEROUS);

if (match) {
  process.stderr.write(
    `BLOCKED by Kiro guard-shell: destructive command "${match[0]}".\nCommand: ${command}\n`,
  );
  process.exit(2);
}

process.exit(0);
