"use client";
import { useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "../components";
import { useLanguage } from "../language";
import { money } from "../buy/shop-ui";

export type ReviewOrder = { id: string; priceSatang: number; status: string; attempts: number; lastError: string | null;
  slipUrl: string | null; slipSha256: string | null; review: { adminId: string; note: string; approvedAt: number } | null };

export function PurchaseReview({ order, onApproved }: { order: ReviewOrder; onApproved: () => void }) {
  const { language }=useLanguage(), th=language === "th", text=(a:string,b:string)=>th?a:b;
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [draft,setDraft]=useState({bankCode:"",receivingBank:"",transactionRef:"",transferredAt:"",note:"",confirmReceived:false});
  async function approve(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try {
      await api(`admin/shop/orders/${order.id}/approve`,{method:"POST",body:JSON.stringify({...draft,
        transferredAt:new Date(draft.transferredAt).toISOString(),slipSha256:order.slipSha256,attempts:order.attempts})});
      setOpen(false);onApproved();
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(order.review)return <p className="shop-review-result"><Check size={15}/>{text("อนุมัติโดยแอดมิน","Approved by admin")} · {order.review.adminId}<br/>{order.review.note}</p>;
  if(order.status === "paid" || !order.lastError)return null;
  if(!order.slipUrl || !order.slipSha256)return <p className="shop-order-error">{text("ยังไม่มีรูปสลิปที่บันทึกไว้ ให้ผู้ซื้อแนบสลิปเดิมในคำสั่งซื้อนี้อีกครั้ง ห้ามโอนซ้ำ","No saved slip image. Ask the buyer to submit the same slip to this order again. Do not ask for another payment.")}</p>;
  if(order.status !== "pending" && order.status !== "expired")return null;
  return <div className="shop-review"><button className="quiet-button" disabled={busy} onClick={()=>{setError("");setOpen(!open);}}><ShieldCheck size={15}/>{text("ตรวจและอนุมัติคำขอ","Review & approve")}</button>
    {open && <form className="shop-review-form" onSubmit={approve}>
      <h4>{text("ตรวจยอดเข้าก่อนอนุมัติ","Confirm the received payment")} · {money(order.priceSatang)}</h4>
      <a href={order.slipUrl} target="_blank" rel="noreferrer">{text("เปิดสลิปที่ผู้ซื้อส่ง","Open the buyer's slip")}</a>
      <div className="shop-review-fields">
        <label>{text("รหัสธนาคารผู้โอน","Sending bank code")}<input required inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="004" value={draft.bankCode} onChange={e=>setDraft({...draft,bankCode:e.target.value})}/></label>
        <label>{text("รหัสธนาคารผู้รับ","Receiving bank code")}<input required inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="006" value={draft.receivingBank} onChange={e=>setDraft({...draft,receivingBank:e.target.value})}/></label>
        <label>{text("เลขอ้างอิงธุรกรรมจากธนาคาร","Bank transaction reference")}<input required minLength={5} maxLength={100} pattern="[A-Za-z0-9_-]{5,100}" value={draft.transactionRef} onChange={e=>setDraft({...draft,transactionRef:e.target.value})}/></label>
        <label>{text("วันเวลาที่โอนตามสลิป (เวลาบนเครื่องนี้)","Transfer date/time on slip (this device's timezone)")}<input required type="datetime-local" step="1" value={draft.transferredAt} onChange={e=>setDraft({...draft,transferredAt:e.target.value})}/></label>
      </div>
      <label>{text("บันทึกการตรวจสอบ","Review note")}<textarea required minLength={5} maxLength={1000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
      <label className="shop-review-confirm"><input required type="checkbox" checked={draft.confirmReceived} onChange={e=>setDraft({...draft,confirmReceived:e.target.checked})}/>{text("ตรวจสอบในบัญชีธนาคารแล้ว ได้รับเงินครบตามยอดและผู้รับถูกต้อง","I checked the bank account and confirmed the full amount reached the correct recipient.")}</label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="shop-review-actions"><button className="primary-button" disabled={busy || !draft.confirmReceived}>{busy?<Loader2 className="spin" size={15}/>:<Check size={15}/>} {text("อนุมัติและออกคีย์พรีเมียม","Approve & issue premium Key")}</button><button className="quiet-button" type="button" disabled={busy} onClick={()=>setOpen(false)}><X size={15}/>{text("ยกเลิก","Cancel")}</button></div>
    </form>}
  </div>;
}
