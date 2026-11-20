import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { postHaunt } from './api';

export const DEMO_COOLDOWN_SECONDS = 30;

// Mirrors the daemon's demo-only limit so the button is disabled instead of failing.
export function useHaunt() {
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, now]);

  const mutation = useMutation({
    mutationFn: postHaunt,
    onSuccess: (result) => {
      const seconds = result.ok ? DEMO_COOLDOWN_SECONDS : result.retryAfterSeconds;
      if (seconds) {
        setNow(Date.now());
        setCooldownUntil(Date.now() + seconds * 1000);
      }
    },
  });
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  return { ...mutation, remaining };
}
