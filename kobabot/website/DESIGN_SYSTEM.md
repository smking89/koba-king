# KOBA Bot Design System

Neon Green / Purple / Black theme for **kobabot.store** and the in-app Web GUI (mobile + desktop). Built from the existing KOBA Bot mockups (mascot "Frank," B3 logo/favicon, tier chests).

Files in this kit:
- [`tokens.css`](./tokens.css) — all design tokens as CSS custom properties (source of truth)
- [`components.css`](./components.css) — plain-CSS component classes built on the tokens (framework-agnostic)
- [`tailwind.config.js`](./tailwind.config.js) — same tokens mapped to Tailwind theme + a matching component plugin
- [`assets/`](./assets) — copies of the brand assets referenced below

Use either `components.css` **or** the Tailwind config — they produce the same class names and visuals, pick whichever matches the stack.

---

## 1. Brand assets

| Asset | File | Usage |
|---|---|---|
| Logo / favicon (B3 mark) | `assets/kobabot-logo.png` | Navbar lockup, browser favicon, loading splash |
| Mascot ("Frank") | `assets/frank-mascot.png` | Hero sections, empty states, support/help panel, 404s |
| Basic tier chest (green) | `assets/chest-green-basic.png` | Basic pricing card |
| Pro tier chest (gold) | `assets/chest-gold-pro.png` | Pro pricing card ("Most Popular") |
| Max tier chest (purple) | `assets/chest-purple-max.png` | Max pricing card |

Keep chest/mascot art on transparent backgrounds and let `.bb-card` / `.bb-gradient-card` provide the surface — don't bake a background into new art.

---

## 2. Color tokens

### Brand
| Token | Hex | Role |
|---|---|---|
| `--bb-brand-green` | `#39FF6A` | Primary actions, online status, success, links |
| `--bb-brand-green-strong` | `#14FF72` | Hover/active glow core |
| `--bb-brand-green-dim` | `#1FAE52` | Muted icons, dividers |
| `--bb-brand-purple` | `#B14CFF` | Max tier, premium accents |
| `--bb-brand-purple-strong` | `#D24CFF` | Purple hover/active |
| `--bb-brand-gold` | `#FFC93C` | Pro tier, "most popular," crowns/coins |

### Surfaces
`--bb-bg-void` `#05070A` → `--bb-bg-base` `#0A0F0D` → `--bb-bg-raised` `#0D1512` → `--bb-bg-raised-2` `#101A16` (darkest to lightest, use in that stacking order: page → card → nested field).

### Text
`--bb-text-primary #F3FFF6` (headings/body), `--bb-text-secondary #9FB8AC` (supporting), `--bb-text-muted #5E7368` (placeholders/timestamps), `--bb-text-on-accent #04140A` (text on solid green/gold fills — never white-on-neon).

### Status
`--bb-status-online` (green), `--bb-status-warning` (gold), `--bb-status-danger #FF4C5E`, `--bb-status-info #4CD3FF`.

**Rule of thumb:** green = default/primary tier & healthy state, gold = Pro tier & "recommended," purple = Max tier & premium. Never mix gold and purple as equals in the same component — one is always the accent, the other the base.

---

## 3. Typography scale

| Token | Size | Use |
|---|---|---|
| `--bb-text-xs` | 12px | Timestamps, meta, badges |
| `--bb-text-sm` | 14px | Body small, nav links |
| `--bb-text-base` | 16px | Default body |
| `--bb-text-md` | 18px | Card titles |
| `--bb-text-lg` | 22px | Section titles |
| `--bb-text-xl` | 28px | Panel headers |
| `--bb-text-2xl` | 36px | Page headers |
| `--bb-text-3xl` | 48px | Hero (mobile) |
| `--bb-text-4xl` | 64px | Hero (desktop, ≥1024px) |

Fonts: `--bb-font-display` (Rajdhani/Orbitron) for hero + headings, `--bb-font-body` (Inter) for UI copy, `--bb-font-mono` (JetBrains Mono) for the server console/RCON log panel exclusively.

---

## 4. Buttons

Class: `.bb-btn` + one variant + optional size.

| Variant | Class | Look |
|---|---|---|
| Primary | `.bb-btn--primary` | Solid green gradient fill, dark text, green glow |
| Premium | `.bb-btn--purple` | Solid purple gradient fill, white text, purple glow |
| Outline | `.bb-btn--outline` | Transparent, green border + text |
| Ghost | `.bb-btn--ghost` | Transparent, muted text, no border |
| Danger | `.bb-btn--danger` | Solid red, for destructive server actions |

Sizes: `.bb-btn--sm`, default, `.bb-btn--lg`. Modifiers: `.bb-btn--block` (full width), `.bb-btn--icon` (icon-only, square padding).

```html
<button class="bb-btn bb-btn--primary bb-btn--lg">30-Day Free Trial</button>
<button class="bb-btn bb-btn--outline">Open WebRCON</button>
```

---

## 5. Cards & panels

- `.bb-card` — base surface: dark gradient fill, `1.5px` default-green border, soft shadow. Use for pricing cards, perk cards, generic content blocks.
  - `.bb-card--interactive` — lift + green glow on hover (clickable cards)
  - `.bb-card--pro` — gold border + glow (Pro-tier pricing card)
  - `.bb-card--max` — purple border + glow (Max-tier pricing card)
  - `.bb-card--flat` — no shadow/glow, for dense stacked lists
- `.bb-panel` — near-black surface for the server console / WebRCON / log views, with `.bb-panel__header` + `.bb-panel__body`. Add `.bb-panel--console` for monospace green terminal text with a subtle scanline texture.
- `.bb-stat` — compact metric tile (`.bb-stat__value` + `.bb-stat__label`) for player counts, revenue, uptime.

```html
<div class="bb-card bb-card--pro">
  <span class="bb-badge bb-badge--gold">Most Popular</span>
  <h3 class="bb-h3">Pro</h3>
  ...
  <button class="bb-btn bb-btn--primary bb-btn--block">Get Pro</button>
</div>
```

---

## 6. Badges & status

- `.bb-badge` (+ `--gold`, `--purple`, `--solid`) — pill labels ("Most Popular," "Online," tier tags)
- `.bb-status-dot` — pulsing 8px dot for live server status

---

## 7. Navigation

- `.bb-navbar` — desktop only (≥1024px), sticky top, blurred dark background, logo lockup left, links center/right, active link gets a green underline glow.
- `.bb-tabbar` — mobile only (<1024px), fixed bottom, 5 icons max (Home / Shop / Servers / Support / More), active icon glows green.

Both are in the same file; visibility is breakpoint-driven (`display:none` swap at `lg`) rather than separate components, so one nav data source can drive both.

---

## 8. Shadows, borders, radius

**Radius:** `sm` 8px (chips/inputs) · `md` 14px (buttons/rows) · `lg` 20px (cards/panels) · `xl` 28px (hero/modals) · `pill` 999px (badges/avatars).

**Border widths:** hairline 1px (panel dividers) · default 1.5px (cards/inputs) · strong 2px (focus/active states).

**Shadows vs. glows:** use `--bb-shadow-*` for plain elevation/depth (drop shadows, near-black, low opacity). Use `--bb-glow-*` for the neon edge-light that is KOBA Bot's signature — always paired with the matching border color (green border → green glow, purple border → purple glow, gold border → gold glow). Don't mix a purple glow with a green border.

---

## 9. Breakpoints

| Name | Width | Behavior |
|---|---|---|
| `sm` | 480px | Large phones, 2-up grids start |
| `md` | 768px | Tablets |
| `lg` | 1024px | **Nav breakpoint** — tabbar → navbar, sidebar layouts appear, 3–4 col grids |
| `xl` | 1280px | Desktop max content width (`.bb-container`) |
| `2xl` | 1536px | Wide monitors, extra breathing room |

Mobile-first: write base styles for phone, add `min-width` overrides upward. The reference screens show a single-column phone layout (bottom tabbar) collapsing into a 3-column desktop dashboard (top navbar) exactly at the `lg` breakpoint — treat that as the one hard layout switch; everything else scales fluidly.

---

## 10. Naming conventions

- **Namespace:** every class is prefixed `bb-` to avoid collisions with app/framework classes.
- **Block:** `bb-{component}` (`bb-card`, `bb-btn`, `bb-panel`, `bb-navbar`).
- **Modifier:** `bb-{component}--{variant}` using a double dash (`bb-btn--primary`, `bb-card--pro`).
- **Element:** `bb-{component}__{part}` using a double underscore (`bb-panel__header`, `bb-stat__value`).
- **State** is expressed as a modifier, not a separate attribute selector, so it's visible in markup (`bb-tabbar__item--active`), except for native states (`:hover`, `:focus`, `:disabled`) which are handled in CSS directly.
- **Tokens** follow `--bb-{category}-{name}[-{shade}]` (`--bb-brand-green-strong`, `--bb-text-secondary`, `--bb-space-4`).
- Tailwind utility equivalents drop the `--bb-` prefix inside the theme (`bg-bb-green`, `text-bb-text-secondary`, `shadow-bb-glow-green-md`) so token names stay greppable across both systems.

---

## 11. Motion

Two durations cover almost everything: `--bb-duration-fast` (120ms, button press) and `--bb-duration-base` (200ms, hover/glow transitions). Reserve `--bb-duration-slow` (400ms) for modals/sheets. All easing uses `--bb-ease-out`. The only looping animation is the `bb-status-dot` pulse (2.4s) — don't add more ambient motion, it competes with the neon glow for attention.
