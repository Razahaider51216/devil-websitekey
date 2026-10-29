import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "./language";
export const metadata: Metadata = { title: "DEVIL KEY v1.0.0 — Choose your access", description: "Official DEVIL HUB access portal. Choose 6H, 12H or 24H, complete your missions and verify to claim your key.", icons: { icon: "/favicon.svg" }, other: { monetag: "e1cd9622c0fba8a9a7ae587fa6720f0e" } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="th"><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
