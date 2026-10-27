import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...rest }: P) {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest,
  };
}

export const IconHotel = (p: P) => (
  <svg {...base(p)}><path d="M3 19V6" /><path d="M3 15h18v4" /><path d="M21 15v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11" r="2" /></svg>
);
export const IconTrain = (p: P) => (
  <svg {...base(p)}><rect x="5" y="3" width="14" height="13" rx="3" /><path d="M5 10h14" /><circle cx="9" cy="13" r=".8" fill="currentColor" /><circle cx="15" cy="13" r=".8" fill="currentColor" /><path d="m8 20-1.5 1.5M16 20l1.5 1.5M8 16l-1 4M16 16l1 4" /></svg>
);
export const IconFlight = (p: P) => (
  <svg {...base(p)}><path d="M10.5 13.5 3 11l1.2-1.6 8 .8 4.6-5.2a2 2 0 0 1 2.9 2.8L14.5 12.4l.8 8L13.7 21.6 11.2 14z" /></svg>
);
export const IconSport = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5c-2.3 3-2.3 14 0 17M3.6 10c5 1.6 11.8 1.6 16.8 0M5.3 17c4-2.5 9.4-2.5 13.4 0" /></svg>
);
export const IconConcert = (p: P) => (
  <svg {...base(p)}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
);
export const IconCheck = (p: P) => <svg {...base(p)}><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
export const IconQuestion = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></svg>
);
export const IconCross = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
export const IconArrowLeft = (p: P) => <svg {...base(p)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconChevron = (p: P) => <svg {...base(p)}><path d="m8 10 4 4 4-4" /></svg>;
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IconDoc = (p: P) => (
  <svg {...base(p)}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconExternal = (p: P) => (
  <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.2" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></svg>
);
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>;
export const IconRoute = (p: P) => (
  <svg {...base(p)}><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6" /></svg>
);

export const CATEGORY_ICON = {
  hotel: IconHotel,
  train: IconTrain,
  flight: IconFlight,
  sport: IconSport,
  concert: IconConcert,
} as const;
