"use client";
import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
export function GameImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? <div className="game-image-fallback" aria-label={name}><Gamepad2 size={44}/><span>DEVIL HUB</span></div> : <img src={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
