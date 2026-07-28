"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/#pot", label: "Weekly pot" },
  { href: "/#match", label: "Matches" },
  { href: "/#board", label: "Leaderboard" },
  { href: "/regras", label: "How it works" },
  { href: "/entrar", label: "Sign in" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="rd-burger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="rd-mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        )}
      </button>
      <div id="rd-mobile-menu" className={open ? "rd-mobile-panel open" : "rd-mobile-panel"}>
        <nav aria-label="Mobile" style={{ display: "flex", flexDirection: "column" }}>
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rd-mlink"
              onClick={() => setOpen(false)}
            >
              {link.label}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </nav>
        <Link
          href="/entrar"
          className="btn primary"
          style={{ width: "100%", marginTop: 16 }}
          onClick={() => setOpen(false)}
        >
          Join this week
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </Link>
      </div>
    </>
  );
}
