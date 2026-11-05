/** Small interface glyphs in the same stroke as the rest of PMC: square ends, no curves where a line will do. */
const UI: Record<string, string> = {
  search: 'M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM15.5 15.5l5.5 5.5',
  apps: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  user: 'M12 3.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zM4 21c.4-4.4 4-6.2 8-6.2s7.6 1.8 8 6.2',
  left: 'M14.5 5l-7 7 7 7M19 5v14',
  right: 'M9.5 5l7 7-7 7M5 5v14',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M5 5l14 14M19 5L5 19',
  plus: 'M12 4v16M4 12h16',
  out: 'M10 4H4v16h6M14 8l5 4-5 4M19 12H9',
  check: 'M4 12l5 5 11-11',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  gear: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  soon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  down: 'M5 9l7 7 7-7',
  attach: 'M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.4 17.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6',
  send: 'M12 20V5M5.5 11.5L12 5l6.5 6.5',
  stop: 'M7 7h10v10H7z',
  more: 'M5 12h.1M12 12h.1M19 12h.1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  refresh: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.1',
  panel: 'M3.5 4.5h17v15h-17zM9.5 4.5v15M5.9 8.5h.1M5.9 12h.1M5.9 15.5h.1',
  chat: 'M4 5h16v11H11l-5 4v-4H4zM8 10h8',
  study: 'M12 4l9 4-9 4-9-4 9-4zM6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5M21 8v6',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6l1-8z',
  alert: 'M12 4l9 16H3zM12 10v5M12 17.5h.1',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.1',
  card: 'M3 6h18v12H3zM3 10.5h18M6.5 15h4',
  wand: 'M12 2.5c.7 4.6 2.9 7.5 9.5 9.5-6.6 2-8.8 4.9-9.5 9.5-.7-4.6-2.9-7.5-9.5-9.5 6.6-2 8.8-4.9 9.5-9.5z',
};
export type UiName = keyof typeof UI;

export function UiIcon({ name, size = 20, className, strokeWidth = 2.4 }: { name: UiName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="square" strokeLinejoin="miter" aria-hidden focusable="false">
      <path d={UI[name]} />
    </svg>
  );
}
