// WCAG 2.1 relative luminance and contrast ratio formula.
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;
const RED_LUMINANCE_WEIGHT = 0.2126;
const GREEN_LUMINANCE_WEIGHT = 0.7152;
const BLUE_LUMINANCE_WEIGHT = 0.0722;
const CONTRAST_OFFSET = 0.05;

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const CHANNEL_MASK = 255;

const channel = (value: number) => {
  const c = value / MAX_CHANNEL;
  return c <= LINEAR_THRESHOLD
    ? c / LINEAR_DIVISOR
    : ((c + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT;
};

const luminance = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', ''), HEX_RADIX);
  return (
    RED_LUMINANCE_WEIGHT * channel((n >> RED_SHIFT) & CHANNEL_MASK) +
    GREEN_LUMINANCE_WEIGHT * channel((n >> GREEN_SHIFT) & CHANNEL_MASK) +
    BLUE_LUMINANCE_WEIGHT * channel(n & CHANNEL_MASK)
  );
};

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + CONTRAST_OFFSET) / (lo + CONTRAST_OFFSET);
}
