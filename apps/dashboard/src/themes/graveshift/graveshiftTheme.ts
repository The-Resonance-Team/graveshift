import { defineTheme } from '@astryxdesign/core/theme';
import { gothicTheme } from '@astryxdesign/theme-gothic/built';

// The Graveshift palette lives in the theme, not in component overrides.
export const graveshiftTheme = defineTheme({
  name: 'graveshift',
  extends: gothicTheme,
  tokens: {
    '--color-background-body': '#0b0f14',
    '--color-background-surface': '#0b0f14',
    '--color-background-card': '#10151c',
    '--color-background-muted': '#10151c',
    '--color-background-popover': '#10151c',
    '--color-border': '#232d3a',
    '--color-border-emphasized': '#232d3a',
    '--color-text-primary': '#e6edf3',
    '--color-text-secondary': '#a3adbb',
    '--color-accent': '#7cffb2',
    '--color-on-accent': '#0b0f14',
    '--color-text-accent': '#7cffb2',
    '--color-icon-accent': '#7cffb2',
    '--color-success': '#7cffb2',
    '--color-on-success': '#0b0f14',
    '--color-text-success': '#7cffb2',
    '--color-icon-success': '#7cffb2',
    '--color-border-success': '#7cffb2',
    '--color-warning': '#ff7a1a',
    '--color-on-warning': '#0b0f14',
    '--color-text-warning': '#ff7a1a',
    '--color-icon-warning': '#ff7a1a',
    '--color-border-warning': '#ff7a1a',
    '--color-error': '#e5484d',
    '--color-on-error': '#0b0f14',
    '--color-text-error': '#e5484d',
    '--color-icon-error': '#e5484d',
    '--color-border-error': '#e5484d',
  },
  adaptations: {
    rules: [
      {
        when: { motion: 'reduce' },
        value: { tokens: { '--duration-fast': '0ms', '--duration-medium': '0ms' } },
      },
    ],
  },
});
