import type { Metadata } from "next";
import { DiscordVerification } from "./verify-client";
import "./verify.css";
export const metadata:Metadata={title:"Discord Verification — DEVIL HUB",description:"Private Discord role verification.",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function VerifyPage(){return <DiscordVerification/>;}
