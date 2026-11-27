import { redact } from '@graveshift/redactor';

export function outboundText(text: string): string {
  return redact(
    text
      .replace(/\r\n?/g, '\n')
      .replace(/\p{Cc}/gu, (char) => (char === '\n' || char === '\t' ? char : '')),
  );
}

export function outboundLine(text: string): string {
  return outboundText(text).replace(/\s+/g, ' ').trim();
}
