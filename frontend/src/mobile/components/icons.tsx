import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 24, ...rest }: P) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, ...rest });

/** Navigation arrow (the mockup's "Where to?" / address pictogram). */
export const ArrowIcon = (p: P) => <svg {...base(p)}><path d="M20.5 3.5 3.8 10.4c-.8.3-.7 1.5.1 1.7l6.6 1.5 1.5 6.6c.2.8 1.4.9 1.7.1L20.5 3.5Z" fill="currentColor" /></svg>;
export const ClockIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 7v5.2l3.2 2" style={{ stroke: 'var(--clock-hand, #fff)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const ChevronDownIcon = (p: P) => <svg {...base(p)}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const ChevronLeftIcon = (p: P) => <svg {...base(p)}><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const ChevronRightIcon = (p: P) => <svg {...base(p)}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
/** Menu: three lines, the middle one shorter (as in the mockup). */
export const MenuIcon = (p: P) => <svg {...base(p)}><path d="M3 6.5h18M8 12h13M3 17.5h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
/** Recenter: crosshair with a filled centre. */
export const LocateIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2.6" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
export const PersonIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="7.5" r="4" fill="currentColor" /><path d="M4 20.5c0-4.2 3.6-7 8-7s8 2.8 8 7c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1Z" fill="currentColor" /></svg>;
export const ChatIcon = (p: P) => <svg {...base(p)}><path d="M12 3.5c-4.97 0-9 3.36-9 7.5 0 2.3 1.25 4.36 3.2 5.74L5.5 20.5l4.2-2.2c.74.13 1.5.2 2.3.2 4.97 0 9-3.36 9-7.5s-4.03-7.5-9-7.5Z" fill="currentColor" /></svg>;
export const RefreshIcon = (p: P) => <svg {...base(p)}><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const SwapIcon = (p: P) => <svg {...base(p)}><path d="M8 4v15m0 0-3.5-3.5M8 19l3.5-3.5M16 20V5m0 0-3.5 3.5M16 5l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const CloseIcon = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
export const CheckIcon = (p: P) => <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
export const InfoIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M12 11v6" stroke="#151515" strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="7.6" r="1.4" fill="#151515" /></svg>;
export const PinIcon = (p: P) => <svg {...base(p)}><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="currentColor" /><circle cx="12" cy="10" r="2.6" fill="#fff" /></svg>;
export const SendIcon = (p: P) => <svg {...base(p)}><path d="M4 12 20 4l-4 16-4.5-6.5L4 12Z" fill="currentColor" /></svg>;
export const SearchIcon = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
export const BulbIcon = (p: P) => <svg {...base(p)}><path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6V16c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5Z" fill="currentColor" /><path d="M9.5 19h5M10.5 21.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
export const PlusIcon = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
