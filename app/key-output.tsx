"use client";
import { useState } from "react";
import { CopyButton } from "./components";
import { useLanguage } from "./language";
import { launchCode } from "../lib/launch-code";

export function KeyOutput({ value }: { value: string }) {
  const { t } = useLanguage();
  const [format, setFormat] = useState<"key" | "script">("key");
  const output = format === "script" ? launchCode(value) : value;
  return <div className="key-output">
    <div className="duration-options" role="group" aria-label={t("รูปแบบการคัดลอก")}>
      <button type="button" aria-pressed={format === "key"} className={format === "key" ? "selected" : ""} onClick={() => setFormat("key")}>{t("คีย์ธรรมดา")}</button>
      <button type="button" aria-pressed={format === "script"} className={format === "script" ? "selected" : ""} onClick={() => setFormat("script")}>{t("โค้ดรันพร้อมคีย์")}</button>
    </div>
    <label className="field-label">{format === "key" ? "DEVIL HUB ACCESS KEY" : "DEVIL HUB SCRIPT"}</label>
    <pre className="key-value key-code"><code>{output}</code></pre>
    <CopyButton value={output} label={t(format === "key" ? "คัดลอกคีย์" : "คัดลอกโค้ดรัน")}/>
    <p className="private-note">{t("คีย์ผูกกับเครื่องที่ใช้ครั้งแรก ใช้ซ้ำบนเครื่องเดิมได้จนหมดอายุ")}</p>
  </div>;
}
