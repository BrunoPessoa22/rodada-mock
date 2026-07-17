"use client";

import { useEffect, useState } from "react";

export type Lang = "pt" | "en";

export function applyLang(lang: Lang) {
  const root = document.documentElement;
  if (lang === "en") root.setAttribute("data-lang", "en");
  else root.removeAttribute("data-lang");
  root.lang = lang === "en" ? "en" : "pt-BR";
  try {
    localStorage.setItem("rodada-lang", lang);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("rodada-lang", { detail: lang }));
}

export function currentLang(): Lang {
  return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "pt";
}

export function LangTabs() {
  const [lang, setLang] = useState<Lang>("pt");

  useEffect(() => {
    setLang(currentLang());
  }, []);

  const pick = (l: Lang) => {
    applyLang(l);
    setLang(l);
  };

  return (
    <div className="langtabs" role="group" aria-label="idioma / language">
      <button type="button" data-lang="pt" aria-pressed={lang === "pt"} onClick={() => pick("pt")}>
        PT
      </button>
      <button type="button" data-lang="en" aria-pressed={lang === "en"} onClick={() => pick("en")}>
        EN
      </button>
    </div>
  );
}
