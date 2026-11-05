"use client";
import { useLanguage } from "../language";
import "./key-source-select.css";

export type KeySource = "admin" | "steps" | "purchase" | "all";
export function KeySourceSelect({ value, onChange, disabled }: { value: KeySource; onChange: (value: KeySource) => void; disabled: boolean }) {
  const { t } = useLanguage();
  return <div className="key-source-select"><label htmlFor="key-source">{t("ประเภทคีย์")}</label>
    <select id="key-source" value={value} disabled={disabled} onChange={event => onChange(event.target.value as KeySource)}>
      <option value="admin">{t("คีย์ที่แอดมินสร้าง")}</option>
      <option value="steps">{t("คีย์ฟรีจาก Step")}</option>
      <option value="purchase">{t("คีย์พรีเมียมจากการซื้อ")}</option>
      <option value="all">{t("คีย์ทั้งหมด")}</option>
    </select>
  </div>;
}
