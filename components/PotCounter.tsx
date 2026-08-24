"use client";

import { useEffect, useState } from "react";

/**
 * Flip-clock pot from the Matchday Markets design:
 * digit tiles + commas, live accrual at dailyChz / 86400.
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
  const [value, setValue] = useState(Math.floor(potChz));

  useEffect(() => {
    const perMs = dailyChz / 86_400_000;
    const t0 = new Date(asOf).getTime();
    const potNow = () => potChz + (Date.now() - t0) * perMs;

    // No accrual (an unfunded target) means no motion. The count-up reads as
    // "money arriving right now", which is exactly the impression a target
    // with nothing behind it must not give.
    if (dailyChz <= 0) {
      setValue(Math.floor(potChz));
      return;
    }

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

  const formatted = Math.max(0, Math.floor(value)).toLocaleString("en-US");
  const chars = formatted.split("");

  return (
    <div className="rd-digits" aria-label={`${value.toLocaleString("en-US")} CHZ`}>
      {chars.map((c, i) =>
        c === "," ? (
          <span key={`c-${i}`} className="rd-comma">
            ,
          </span>
        ) : (
          <span key={`d-${i}-${c}`} className="rd-digit">
            {c}
          </span>
        )
      )}
    </div>
  );
}
