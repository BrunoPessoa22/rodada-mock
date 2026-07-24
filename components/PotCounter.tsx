"use client";

import { useEffect, useState } from "react";

/**
 * Flip-clock season pot: count-up on load, then real per-second accrual
 * (dailyChz / 86400). Server passes pot value + timestamp; client extrapolates.
 */
export function PotCounter({
  potChz,
  dailyChz,
  asOf,
  digits = 7,
}: {
  potChz: number;
  dailyChz: number;
  asOf: string;
  digits?: number;
}) {
  const [value, setValue] = useState(Math.floor(potChz));

  useEffect(() => {
    const perMs = dailyChz / 86_400_000;
    const t0 = new Date(asOf).getTime();
    const potNow = () => potChz + (Date.now() - t0) * perMs;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    const startAccrual = () => {
      setValue(Math.floor(potNow()));
      interval = setInterval(() => setValue(Math.floor(potNow())), 1000);
    };

    if (reduced) {
      startAccrual();
    } else {
      const target = potNow();
      const start = Math.max(0, target - 1800);
      const began = performance.now();
      const ease = (ts: number) => {
        const p = Math.min((ts - began) / 1600, 1);
        const eased = start + (target - start) * (1 - Math.pow(1 - p, 3));
        setValue(Math.floor(eased));
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

  const padded = Math.max(0, Math.floor(value))
    .toString()
    .padStart(digits, "0")
    .slice(-digits);
  const chars = padded.split("");

  return (
    <div className="flip-clock" aria-label={`${value.toLocaleString("en-US")} CHZ`}>
      {chars.map((ch, i) => (
        <span className="flip-digit" key={`${i}-${ch}`}>
          {ch}
        </span>
      ))}
      <span className="flip-unit">CHZ</span>
    </div>
  );
}
