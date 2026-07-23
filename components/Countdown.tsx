"use client";

import { useEffect, useState } from "react";

function remaining(target: string): { label: string; past: boolean } {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return { label: "now", past: true };
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const span =
    days > 0
      ? `${days}d ${String(hours).padStart(2, "0")}h`
      : hours > 0
        ? `${hours}h ${String(minutes).padStart(2, "0")}m`
        : `${minutes}m`;
  return { label: `in ${span}`, past: false };
}

/** Live countdown, e.g. "in 2d 04h". */
export function Countdown({ target }: { target: string }) {
  const [state, setState] = useState(() => remaining(target));

  useEffect(() => {
    setState(remaining(target));
    const interval = setInterval(() => setState(remaining(target)), 30_000);
    return () => clearInterval(interval);
  }, [target]);

  return <span>{state.label}</span>;
}
