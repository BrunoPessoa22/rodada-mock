"use client";

import { useEffect, useState } from "react";

function remaining(target: string): { pt: string; en: string; past: boolean } {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return { pt: "agora", en: "now", past: true };
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const label =
    days > 0
      ? `${days}d ${String(hours).padStart(2, "0")}h`
      : hours > 0
        ? `${hours}h ${String(minutes).padStart(2, "0")}m`
        : `${minutes}m`;
  return { pt: `em ${label}`, en: `in ${label}`, past: false };
}

/** Live "em 2d 04h" countdown; renders both PT and EN spans (CSS picks one). */
export function Countdown({ target }: { target: string }) {
  const [state, setState] = useState(() => remaining(target));

  useEffect(() => {
    setState(remaining(target));
    const interval = setInterval(() => setState(remaining(target)), 30_000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <>
      <span className="pt">{state.pt}</span>
      <span className="en">{state.en}</span>
    </>
  );
}
