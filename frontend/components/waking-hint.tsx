"use client";

import { useEffect, useState } from "react";

const SLOW_AFTER_MS = 10_000;

/**
 * Render it only while something is loading. After about 10 seconds it explains the wait: the
 * free-tier API sleeps when idle and takes up to a minute to wake. Unmounting resets the timer.
 */
export function WakingHint({ className }: { className?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p role="status" className={className ?? "text-sm text-muted-foreground"} data-testid="waking-hint">
      {slow ? "Still working. The server may be waking up, which can take up to a minute." : null}
    </p>
  );
}
