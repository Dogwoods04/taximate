import type { ReactNode } from 'react';

export const BEZEL = 12;
export type PhoneSize = { id: 'standard' | 'large'; w: number; h: number; label: string };
export const PHONE_SIZES: PhoneSize[] = [
  { id: 'standard', w: 390, h: 844, label: '기본 (390×844)' },
  { id: 'large', w: 430, h: 932, label: '큰 화면 (430×932)' },
];
export const frameSize = (screen: { w: number; h: number }) => ({ w: screen.w + BEZEL * 2, h: screen.h + BEZEL * 2 });

/**
 * A generic phone drawn in CSS: rounded body, even bezel, a small round camera hole and plain side keys.
 * The screen keeps a real mobile CSS size (`w`×`h`) and the whole device is scaled with a transform,
 * so whatever is inside (screenshot or the live app iframe) lays out exactly as on a phone.
 */
export default function PhoneFrame({ w = 390, h = 844, scale = 1, children, className = '', label }: {
  w?: number; h?: number; scale?: number; children: ReactNode; className?: string; label?: string;
}) {
  const frame = frameSize({ w, h });
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: frame.w * scale, height: frame.h * scale }} role={label ? 'img' : undefined} aria-label={label}>
      <div className="pc-phone" style={{ width: frame.w, height: frame.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <span className="pc-phone-key left" aria-hidden />
        <span className="pc-phone-key right" aria-hidden />
        <div className="pc-phone-screen" style={{ width: w, height: h }}>
          {children}
          <span className="pc-phone-camera" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/** A captured screen of our own app inside the frame. */
export function PhoneShot({ src, alt, scale = 0.7, className }: { src: string; alt: string; scale?: number; className?: string }) {
  return (
    <PhoneFrame scale={scale} className={className}>
      <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />
    </PhoneFrame>
  );
}
