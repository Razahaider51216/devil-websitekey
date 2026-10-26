"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translate, type Language } from "../lib/translations";

const LanguageContext = createContext({ language: "th" as Language, setLanguage: (_value: Language) => {} });
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, update] = useState<Language>("th");
  useEffect(() => { try { if (localStorage.getItem("devil-language") === "en") update("en"); } catch {} }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((value: Language) => {
    update(value);
    try { localStorage.setItem("devil-language", value); } catch {}
  }, []);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  const t = useCallback((text: string, values?: Record<string, string | number>) => translate(context.language, text, values), [context.language]);
  return { ...context, t };
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return <div className="language-switch" role="group" aria-label="Language / ภาษา">
    <button type="button" lang="th" aria-label="ภาษาไทย" aria-pressed={language === "th"} onClick={() => setLanguage("th")}>TH</button>
    <button type="button" lang="en" aria-label="English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
  </div>;
}
