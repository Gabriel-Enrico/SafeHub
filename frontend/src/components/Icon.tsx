import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'users'
  | 'chart'
  | 'checklist'
  | 'kanban'
  | 'file'
  | 'calendar'
  | 'cloud'
  | 'integration'
  | 'user'
  | 'settings'
  | 'target'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'search'
  | 'plus'
  | 'phone'
  | 'mail'
  | 'message'
  | 'clipboard'
  | 'check'
  | 'alert'
  | 'clock'
  | 'globe'
  | 'paperclip'
  | 'menu'
  | 'send'
  | 'external-link'
  | 'spreadsheet'
  | 'folder'
  | 'trash'
  | 'more'
  | 'moon'
  | 'sun';

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

export default function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: IconProps) {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth,
  };

  let shape;
  switch (name) {
    case 'home':
      shape = <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>;
      break;
    case 'users':
      shape = <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>;
      break;
    case 'chart':
      shape = <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /><path d="M17 6h3v3" /></>;
      break;
    case 'checklist':
      shape = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /><path d="m6.5 8 .5.5 1-1" /></>;
      break;
    case 'kanban':
      shape = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v9" /></>;
      break;
    case 'file':
      shape = <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z" /><path d="M13 3v7h7M8 14h8M8 17h8" /></>;
      break;
    case 'calendar':
      shape = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>;
      break;
    case 'cloud':
      shape = <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 8.5 4.8 4.8 0 0 0 7 18Z" />;
      break;
    case 'integration':
      shape = <><path d="M8 7V4M16 7V4M8 20v-3M16 20v-3" /><rect x="5" y="7" width="14" height="10" rx="3" /><path d="M9 12h6" /></>;
      break;
    case 'user':
      shape = <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
      break;
    case 'settings':
      shape = <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a8 8 0 0 1 0-2l-.1-.1-1.4-1.1L7 9.4l1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" /></>;
      break;
    case 'target':
      shape = <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>;
      break;
    case 'arrow-right':
      shape = <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>;
      break;
    case 'arrow-up-right':
    case 'external-link':
      shape = <><path d="M13 5h6v6" /><path d="m19 5-9 9" /><path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" /></>;
      break;
    case 'chevron-left':
      shape = <path d="m15 18-6-6 6-6" />;
      break;
    case 'chevron-right':
      shape = <path d="m9 18 6-6-6-6" />;
      break;
    case 'chevron-down':
      shape = <path d="m6 9 6 6 6-6" />;
      break;
    case 'close':
      shape = <><path d="m18 6-12 12M6 6l12 12" /></>;
      break;
    case 'search':
      shape = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>;
      break;
    case 'plus':
      shape = <><path d="M12 5v14M5 12h14" /></>;
      break;
    case 'phone':
      shape = <path d="M7.2 3.5H4.8a1.8 1.8 0 0 0-1.8 2A16.2 16.2 0 0 0 18.5 21a1.8 1.8 0 0 0 2-1.8v-2.4l-4.2-1.2-1.4 2a13 13 0 0 1-6.5-6.5l2-1.4-1.2-4.2Z" />;
      break;
    case 'mail':
      shape = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>;
      break;
    case 'message':
      shape = <><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-6a7.5 7.5 0 1 1 18-3.5Z" /><path d="M8 11h8M8 14h5" /></>;
      break;
    case 'clipboard':
      shape = <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5M9 11h6M9 15h6" /></>;
      break;
    case 'check':
      shape = <path d="m5 12 4 4L19 6" />;
      break;
    case 'alert':
      shape = <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>;
      break;
    case 'clock':
      shape = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
      break;
    case 'globe':
      shape = <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>;
      break;
    case 'paperclip':
      shape = <path d="m8 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.1-8.1" />;
      break;
    case 'menu':
      shape = <><path d="M4 6h16M4 12h16M4 18h16" /></>;
      break;
    case 'send':
      shape = <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>;
      break;
    case 'spreadsheet':
      shape = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11M3 14h18" /></>;
      break;
    case 'folder':
      shape = <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />;
      break;
    case 'trash':
      shape = <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" /></>;
      break;
    case 'more':
      shape = <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>;
      break;
    case 'moon':
      shape = <path d="M20.5 15.2A8.7 8.7 0 0 1 8.8 3.5 9 9 0 1 0 20.5 15.2Z" />;
      break;
    case 'sun':
      shape = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>;
      break;
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...shared}
      {...props}
    >
      {shape}
    </svg>
  );
}
