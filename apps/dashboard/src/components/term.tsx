'use client';

import { useId } from 'react';

import { type TermKey, TERMS } from '../lib/terms';

// A themed label that keeps its plain meaning one hover or one Tab away (shown on hover and on keyboard focus, no animation).
export function Term({ name, className = '' }: { name: TermKey; className?: string }) {
  const id = useId();
  const { label, plain } = TERMS[name];
  return (
    <span className={`group relative inline-block ${className}`}>
      <span
        tabIndex={0}
        aria-describedby={id}
        className="cursor-help underline decoration-fog decoration-dotted underline-offset-4 outline-none focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-ectoplasm"
      >
        {label}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-max max-w-[min(16rem,80vw)] rounded-sm border border-mist bg-crypt px-2 py-1 text-xs font-normal text-bone shadow-md group-focus-within:block group-hover:block"
      >
        {plain}
      </span>
    </span>
  );
}
