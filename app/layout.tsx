import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "./language";
export const metadata: Metadata = { title: "DEVIL KEY — Unlock your next level", description: "Official DEVIL HUB access portal. Complete four steps and get your access key.", icons: { icon: "/favicon.svg" } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="th"><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
