"use client";

import { useEffect, useRef } from "react";

/**
 * Animates the season pot at its honest pace: count-up on load, then the real
 * per-second accrual (dailyChz / 86400). Server passes the exact pot value and
 * its timestamp; the client extrapolates the same linear function.
 */
export function PotCounter({
  potChz,
  dailyChz,
  asOf,
}: {
  potChz: number;
  dailyChz: number;
  asOf: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const perMs = dailyChz / 86_400_000;
    const t0 = new Date(asOf).getTime();
    const potNow = () => potChz + (Date.now() - t0) * perMs;

    const fmt = (value: number) => {
      el.textContent = Math.floor(value).toLocaleString("en-US");
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    const startAccrual = () => {
      fmt(potNow());
      interval = setInterval(() => fmt(potNow()), 1000);
    };

    if (reduced) {
      startAccrual();
    } else {
      const target = potNow();
      const start = target - 1800;
      const began = performance.now();
      const ease = (ts: number) => {
        const p = Math.min((ts - began) / 1600, 1);
        fmt(start + (target - start) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(ease);
        else startAccrual();
      };
      raf = requestAnimationFrame(ease);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
    };
  }, [potChz, dailyChz, asOf]);

  return (
    <span className="potnum" ref={ref}>
      {Math.floor(potChz).toLocaleString("en-US")}
    </span>
  );
}
