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
    <div
      style={{ display: "flex", alignItems: "center", gap: 5 }}
      aria-label={`${value.toLocaleString("en-US")} CHZ`}
    >
      {chars.map((c, i) =>
        c === "," ? (
          <span
            key={`c-${i}`}
            style={{
              fontSize: 46,
              fontWeight: 800,
              color: "rgba(255,255,255,.5)",
              lineHeight: 1,
            }}
          >
            ,
          </span>
        ) : (
          <span
            key={`d-${i}-${c}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 60,
              borderRadius: 10,
              background: "rgba(255,255,255,.07)",
              border: "1px solid rgba(255,255,255,.1)",
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            {c}
          </span>
        )
      )}
    </div>
  );
}
