"use client";
import { Clock3 } from "lucide-react";
import { remainingKeyTime } from "../lib/countdown";
import { useLanguage } from "./language";

export function KeyCountdown({ expiresAt, status, now }: { expiresAt: number | null; status: string; now: number }) {
  const { t } = useLanguage();
  const value = remainingKeyTime(expiresAt, status, now);
  const hours = Math.floor(value.seconds / 3600), minutes = Math.floor(value.seconds % 3600 / 60), seconds = value.seconds % 60;
  return <div className={`key-countdown key-countdown-${value.state}`}>
    <span><Clock3 size={14}/> {t("เวลาคีย์คงเหลือ")}</span>
    <strong role="timer" aria-live="off">{value.state === "active"
      ? t("{hours} ชม. {minutes} นาที {seconds} วินาที", { hours, minutes: String(minutes).padStart(2, "0"), seconds: String(seconds).padStart(2, "0") })
      : t(value.state === "permanent" ? "ไม่มีวันหมดอายุ" : value.state === "revoked" ? "ยกเลิกแล้ว" : "คีย์หมดอายุแล้ว")}</strong>
  </div>;
}
