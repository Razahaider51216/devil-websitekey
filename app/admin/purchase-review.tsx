"use client";
import { useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { api } from "../components";
import { useLanguage } from "../language";

export type ReviewOrder = { id: string; priceSatang: number; status: string; attempts: number; lastError: string | null;
  slipUrl: string | null; slipSha256: string | null; review: { adminId: string; note: string; approvedAt: number } | null };

export function PurchaseReview({ order, onApproved }: { order: ReviewOrder; onApproved: () => void }) {
  const { language }=useLanguage(),th=language === "th";
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function approve(){
    if(busy)return;setBusy(true);setError("");
    try{
      await api(`admin/shop/orders/${order.id}/approve`,{method:"POST",body:JSON.stringify({slipSha256:order.slipSha256,attempts:order.attempts})});
      onApproved();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(order.review)return <p className="shop-review-result"><Check size={15}/>{th?"อนุมัติโดยแอดมิน":"Approved by admin"} · {order.review.adminId}</p>;
  if(order.status === "paid")return null;
  return <div className="shop-review">
    <button className="primary-button" disabled={busy} onClick={approve}>{busy?<Loader2 className="spin" size={15}/>:<ShieldCheck size={15}/>} {busy?(th?"กำลังอนุมัติ…":"Approving…"):(th?"อนุมัติและออกคีย์":"Approve & issue premium Key")}</button>
    {error && <p className="notice error" role="alert">{error}</p>}
  </div>;
}
