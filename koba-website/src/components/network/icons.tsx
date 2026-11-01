export type GlyphName = "home" | "groups" | "chat" | "shop" | "profile" | "search" | "bell" | "settings" | "trophy";

const OUTLINE: Record<GlyphName, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z",
  groups: "M12 3.5 18.5 6v5.2c0 4.3-2.7 7.5-6.5 9.3-3.8-1.8-6.5-5-6.5-9.3V6L12 3.5Z",
  chat: "M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  shop: "M6.5 8.5h11l-.8 11.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8L6.5 8.5Zm2.2 0V7a3.3 3.3 0 0 1 6.6 0v1.5",
  profile: "M12 12.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM5.2 19.2v-.6a4.2 4.2 0 0 1 4.2-4.2h5.2a4.2 4.2 0 0 1 4.2 4.2v.6",
  search: "M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.6-1.9 3.6 3.6",
  bell: "M6.2 16.5h11.6l-.8-1.6a6 6 0 0 1-.6-2.6V10a4.4 4.4 0 0 0-8.8 0v2.3a6 6 0 0 1-.6 2.6l-.8 1.6ZM10 16.5a2 2 0 0 0 4 0",
  settings: "M10.1 3.6h3.8l.4 2a6.4 6.4 0 0 1 1.5.9l1.9-.9 1.9 1.9-.9 1.9c.4.5.7 1 1 1.5l2 .4v3.8l-2 .4a6.4 6.4 0 0 1-1 1.5l.9 1.9-1.9 1.9-1.9-.9a6.4 6.4 0 0 1-1.5 1l-.4 2h-3.8l-.4-2a6.4 6.4 0 0 1-1.5-1l-1.9.9-1.9-1.9.9-1.9a6.4 6.4 0 0 1-1-1.5l-2-.4V9.8l2-.4c.3-.5.6-1 1-1.5l-.9-1.9L6.3 4.6l1.9.9c.5-.4 1-.7 1.5-.9l.4-2ZM12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z",
  trophy: "M8 4h8v2.2a4 4 0 0 1-2.2 3.6L12 10.6l-1.8-.8A4 4 0 0 1 8 6.2V4Zm-2.2.6H4.2A2.2 2.2 0 0 0 6.4 7c.3 1.2 1 2.2 1.9 2.8M18.2 4.6h1.6a2.2 2.2 0 0 1-2.2 2.4c-.3 1.2-1 2.2-1.9 2.8M9.2 14.2h5.6V16H9.2v-1.8ZM8 18.2h8V20H8v-1.8Z",
};

const FILL: Record<GlyphName, string> = {
  home: "M12 3.2 3 10.2V20a1.2 1.2 0 0 0 1.2 1.2h4.6v-6.2h6.4V21.2h4.6A1.2 1.2 0 0 0 21 20V10.2L12 3.2Z",
  groups: "M12 2.8 19 5.6v5.4c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V5.6L12 2.8Z",
  chat: "M4.2 6.2h15.6v9.2H9.4L5 19.2v-3.8H4.2V6.2Z",
  shop: "M7.2 8.2h9.6l-.7 11.4H7.9L7.2 8.2ZM9 8.2V7.1a3 3 0 0 1 6 0v1.1H9Z",
  profile: "M12 12.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM5 19.4v-.4a4.4 4.4 0 0 1 4.4-4.4h5.2A4.4 4.4 0 0 1 19 19v.4H5Z",
  search: "M11 17.8a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6Zm5.2-2.2 3.2 3.2-1.4 1.4-3.2-3.2a8.2 8.2 0 0 1-1.4-1.4Z",
  bell: "M12 3.6a4.6 4.6 0 0 0-4.6 4.6v2.2c0 .9-.2 1.8-.6 2.6l-.9 1.7h12.2l-.9-1.7a6 6 0 0 1-.6-2.6V8.2A4.6 4.6 0 0 0 12 3.6ZM10 17.2a2 2 0 0 0 4 0h-4Z",
  settings: "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm-1.2-4.8h2.4l.5 2.2 1.7.7 1.6-1.6 1.7 1.7-1.6 1.6.7 1.7 2.2.5v2.4l-2.2.5-.7 1.7 1.6 1.6-1.7 1.7-1.6-1.6-1.7.7-.5 2.2H10.8l-.5-2.2-1.7-.7-1.6 1.6-1.7-1.7 1.6-1.6-.7-1.7-2.2-.5v-2.4l2.2-.5.7-1.7L5.3 6.6l1.7-1.7 1.6 1.6 1.7-.7.5-2.2Z",
  trophy: "M8 3.5h8V6a4 4 0 0 1-2.4 3.6L12 10.4 10.4 9.6A4 4 0 0 1 8 6V3.5ZM9 13.2h6v2.2H9V13.2ZM7.6 17.6h8.8V20H7.6v-2.4Z",
};

export function Glyph({ name, on = false, size = 22 }: { name: GlyphName; on?: boolean; size?: number }) {
  return (
    <span className="nav-morph" aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" className={on ? "nav-glyph is-on" : "nav-glyph"} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={OUTLINE[name]} />
      </svg>
      <svg width={size} height={size} viewBox="0 0 24 24" className={on ? "nav-glyph nav-glyph-fill is-on" : "nav-glyph nav-glyph-fill"} fill="currentColor">
        <path d={FILL[name]} />
      </svg>
    </span>
  );
}
