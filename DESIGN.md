---
name: Fadl Clinic Management System
description: Internal clinic management platform for Egyptian multi-specialty medical care
colors:
  clinic-crimson: "#B71C1C"
  deep-garnet: "#7B0000"
  blush-tint: "#FEE2E2"
  sidebar-navy: "#0F172A"
  precision-blue: "#2563EB"
  sky-accent: "#0EA5E9"
  page-bg: "#F9FAFB"
  surface-white: "#FFFFFF"
  surface-subtle: "#F3F4F6"
  border-default: "#E5E7EB"
  border-strong: "#D1D5DB"
  text-primary: "#111827"
  text-secondary: "#374151"
  text-muted: "#6B7280"
  text-disabled: "#9CA3AF"
  surface-dark-bg: "#0A0A0A"
  surface-dark-elevated: "#171717"
  surface-dark-card: "#1F1F1F"
  surface-dark-input: "#262626"
  status-green: "#10B981"
  status-amber: "#F59E0B"
  status-red: "#EF4444"
  status-violet: "#8B5CF6"
  status-blue: "#3B82F6"
typography:
  display:
    fontFamily: "Outfit, IBM Plex Arabic, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Outfit, IBM Plex Arabic, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Manrope, Tajawal, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Manrope, Tajawal, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Tajawal, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  "2xl": "28px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
components:
  button-primary:
    backgroundColor: "{colors.clinic-crimson}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.deep-garnet}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "40px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "40px"
  stat-card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  input-default:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 16px"
  badge-success:
    backgroundColor: "#D1FAE5"
    textColor: "#065F46"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-warning:
    backgroundColor: "#FEF3C7"
    textColor: "#92400E"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-danger:
    backgroundColor: "#FEE2E2"
    textColor: "#991B1B"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-info:
    backgroundColor: "#DBEAFE"
    textColor: "#1E40AF"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Fadl Clinic Management System

## 1. Overview

**Creative North Star: "The Shift Supervisor's Clipboard"**

The Fadl Clinic system is a professional tool built for people who are moving fast under real clinical pressure. Every screen is a clipboard: dense with the right information, clear about the next action, silent about everything else. The supervisor reaches for it every morning knowing exactly where to look. The system earns trust through structure and speed, not through decoration.

This is a product register surface. Design serves workflow. The visual layer exists to reduce cognitive load and surface the right action at the right moment. Density is not a problem to solve; it is a feature. A receptionist managing six concurrent check-ins and a doctor reviewing a queue of twelve patients do not need visual breathing room. They need signal.

The system rejects four design reflexes that are common in this space. It is not a generic SaaS dashboard with blue accents and widget grids. It is not a legacy hospital EMR with grey tables and windows-era form chrome. It is not a consumer health app with pastel wellness iconography and soft copy. And it is not a Dribbble-dark-mode showcase with frosted glass on every surface. Glass may appear where it adds genuine depth; it is not an identity. The system has a dark sidebar and a light content area by default. This is not a dark application.

**Key Characteristics:**
- Bilingual first: Arabic (RTL) and English (LTR) are equally first-class
- Dual-surface: dark sidebar navigation, light content area (dark mode available for the full canvas)
- Status-led color: the status color vocabulary is the primary chromatic language of the UI
- Ambient elevation: surfaces are softly lifted, not flat; shadows define tier, not drama
- Responsive density: compact/comfortable/spacious modes via CSS custom properties

## 2. Colors: The Clinic Palette

A restrained palette anchored by clinic crimson, structured by navy, and animated by a semantic status vocabulary.

> **Implementation note:** The current codebase uses a blue primary scale (`#2563EB`) for all interactive elements. This document establishes the design direction: interactive elements, nav active states, focus rings, and primary buttons shift to clinic crimson (`#B71C1C`). The blue scale is retained as `precision-blue` for informational contexts where red would read as alarming.

### Primary

- **Clinic Crimson** (`#B71C1C`): Primary interactive color. Used for primary buttons, active navigation items, focus rings, and high-emphasis calls to action. This is the clinic's actual brand color, from the deep red heart logo.
- **Deep Garnet** (`#7B0000`): Hover and pressed state for primary actions. Darker than Clinic Crimson by one clear step, making state changes unambiguous.
- **Blush Tint** (`#FEE2E2`): The lightest primary surface. Used for primary-tinted icon backgrounds, selected-row highlights, and confirmation states that need warmth without alarm.

### Secondary

- **Precision Blue** (`#2563EB`): Retained for informational contexts where red would read as alarming: informational badges, chart accents, and system info states. Not used for interactive CTA elements; those belong to Clinic Crimson.
- **Sky Accent** (`#0EA5E9`): Secondary data color for charts and supplementary information. Never for primary calls to action.

### Neutral

- **Sidebar Navy** (`#0F172A`): The sidebar background. Always dark, regardless of the page's light/dark mode state. This is the system's anchor, the fixed coordinate.
- **Page Background** (`#F9FAFB`): The light-mode canvas. Slightly off-white, never pure `#fff`.
- **Surface White** (`#FFFFFF`): Cards, modals, inputs. One tier above the page.
- **Surface Subtle** (`#F3F4F6`): Hover backgrounds, zebra rows, chip backgrounds.
- **Border Default** (`#E5E7EB`): All dividers, table borders, input strokes.
- **Border Strong** (`#D1D5DB`): Emphasis borders, focus-adjacent strokes.
- **Text Primary** (`#111827`): All primary body text and headings. Near-black, not pure black.
- **Text Muted** (`#6B7280`): Labels, secondary info, placeholder-adjacent text.
- **Text Disabled** (`#9CA3AF`): Disabled states. Never used for interactive or informational text.
- **Dark Page** (`#0A0A0A`), **Dark Elevated** (`#171717`), **Dark Card** (`#1F1F1F`), **Dark Input** (`#262626`): The four dark-mode surface tiers, stepped by 6-8 lightness points.

### Status (Appointment Workflow)

The seven appointment statuses have fixed colors. These are not decorative; they are the system's primary signaling language. Never repurpose them.

- **Queue Green** (`#10B981`): Active, confirmed, in-session, success states
- **Alert Amber** (`#F59E0B`): TBC, pending, needs attention
- **Cancel Red** (`#EF4444`): Cancelled, error, destructive actions (distinct from Clinic Crimson; more orange-red)
- **Rescheduled Violet** (`#8B5CF6`): Rescheduled appointments
- **Info Blue** (`#3B82F6`): Confirmed appointments (Ok! status), informational system messages

**The Status Color Rule.** Status colors convey meaning, not decoration. Using Queue Green on a non-status element is prohibited. If a badge or dot is green, it means "active or successful." If amber, it means "attention required." The vocabulary earns its authority through consistency.

**The One Crimson Rule.** Clinic Crimson (`#B71C1C`) appears on primary interactive elements only: primary buttons, active nav items, and focus rings. It does not appear on cards, backgrounds, decorative elements, or text that is not interactive. The red is reserved; its rarity is the point.

## 3. Typography

**Display Font:** Outfit (with IBM Plex Arabic for Arabic text)
**Body Font:** Manrope (with Tajawal for Arabic text)
**Mono Font:** Geist Mono

**Character:** Outfit's wide optical width and geometric clarity read well at display sizes in both English and Arabic contexts, where IBM Plex Arabic's structured letterforms match its authority. Manrope at body size is neutral enough to carry dense data without fatigue, with Tajawal providing a warm, legible Arabic counterpart. The pairing avoids both the clinical coldness of a pure mono approach and the softness of a serif body.

### Hierarchy

- **Display** (Outfit/IBM Plex Arabic, 700, 30px, lh 1.2, ls -0.01em): Page-level headings, zero-state large numbers, and prominent metrics. Used sparingly — one per view maximum.
- **Headline** (Outfit/IBM Plex Arabic, 700, 20px, lh 1.3, ls -0.005em): Section headings, modal titles, sidebar section dividers.
- **Title** (Manrope/Tajawal, 600, 16px, lh 1.4): Card titles, table section labels, form section headings.
- **Body** (Manrope/Tajawal, 400, 14px, lh 1.5): All data content, descriptions, input values. Cap line length at 65ch in reading contexts.
- **Label** (Manrope/Tajawal, 600, 12px, lh 1, ls 0.06em, uppercase): Field labels, badge text, column headers, metadata chips.

**The No-Ambiguity Rule.** Never use Body weight (400) for interactive labels or actionable text. Buttons and active links use 500 minimum, section headings use 600 or 700. A user should never look at a word and wonder whether it's a label or a value.

**The Bilingual Symmetry Rule.** Every typographic decision is validated in both English and Arabic. Outfit and IBM Plex Arabic are paired for the same reason: matched optical weight at display sizes. When switching locale, the font shifts, the layout mirrors, the rhythm holds. If a component breaks in RTL, it is broken.

## 4. Elevation

The system uses soft ambient elevation: cards and containers have a constant, gentle shadow that defines their tier relative to the page. Shadows are not decorative and do not animate on non-interactive surfaces. They appear only in response to state on interactive containers.

In dark mode, border opacity takes over where shadows become invisible. A dark-mode card without a border reads as part of the page; the `1px` stroke at `#262626` restores the tier separation.

### Shadow Vocabulary

- **Level 1 — At Rest** (`0 1px 2px rgba(15,23,42,0.04)`): Static cards, stat cards, sidebar panels. Always present; never animated away.
- **Level 2 — On Hover** (`0 1px 3px rgba(15,23,42,0.08), 0 4px 12px rgba(15,23,42,0.04)`): Card hover state. Replaces Level 1; simultaneously applied with a -1px Y translate.
- **Level 3 — Floating** (`0 4px 6px rgba(15,23,42,0.10), 0 10px 24px rgba(15,23,42,0.06)`): Dropdowns, popovers, tooltips. Establishes clear separation from page content.
- **Level 4 — Overlay** (`0 4px 16px rgba(0,0,0,0.08), 0 8px 24px rgba(15,23,42,0.06)`): Modals and drawers. Paired with `rgba(0,0,0,0.55)` backdrop and 4px blur.
- **Level 5 — Deep** (`0 8px 32px rgba(0,0,0,0.12), 0 16px 48px rgba(15,23,42,0.08)`): Reserved for high-context overlays (onboarding, critical alerts).

**The Static Shadow Rule.** Level 1 is always present on cards; it is not added on hover. Hover adds Level 2 as a replacement. If a card has no shadow at rest, its tier is undefined and its lift on hover has no reference point.

## 5. Components

### Buttons

Tactile and unambiguous. Every button variant communicates its intent through color and weight before the label is read.

- **Shape:** Gently curved (rounded-lg, 14px radius). Not pill-shaped (too casual), not square (too legacy).
- **Primary:** Clinic Crimson background (`#B71C1C`), white text, `h-10 px-4`, Level 2 shadow. Hover shifts to Deep Garnet (`#7B0000`). Active scales to 98% via `transform: scale(0.98)`.
- **Focus:** `ring-2 ring-crimson ring-offset-2`. Focus ring uses Clinic Crimson, not blue. Visible at 3:1 contrast minimum against both light and dark surfaces.
- **Ghost:** Transparent background, muted text (`#6B7280`), hover `bg-gray-100` dark:`bg-neutral-700`. For low-priority secondary actions.
- **Outline:** `border border-gray-200` light / `border-neutral-600` dark, text-gray-700. For cancel actions inside modals. Not used for primary decisions.
- **Danger:** `bg-red-600` (`#DC2626`), white text. Distinct from Clinic Crimson — more orange-red, universally understood as destructive.

### Stat Cards

The primary display surface for summary metrics across all dashboard pages.

- **Corner style:** Rounded-xl (20px) — softer than form elements to read as display, not input.
- **Background:** Surface White (`#FFFFFF`) light / Dark Card (`#1F1F1F`) dark.
- **Shadow:** Level 1 at rest, Level 2 on hover with `-translate-y-0.5` (2px lift).
- **Border:** `border-gray-100` light / `border-neutral-800` dark. 1px, always present.
- **Internal padding:** 20px on all sides.
- **Icon container:** 40px square, rounded-xl, tinted background per color role (not Clinic Crimson — uses the semantic color for the metric's category).
- **Trend badge:** Pill-shaped, same tint color as icon, `text-xs font-semibold`, TrendingUp/Down icon at 12px.

**The No-Hero-Metric Rule.** Stat cards are informational surfaces, not hero moments. They do not use gradients, glow effects, or outsized numbers. The value and label share equal visual weight. If a number needs to shout, the information architecture is wrong.

### Badges / Status Pills

- **Shape:** Fully rounded (`rounded-full`), `px-2.5 py-0.5`, `text-xs font-medium`.
- **Color:** Semantic only. Seven fixed combinations tied to the appointment workflow status vocabulary. No badge uses Clinic Crimson.
- **Dot variant:** Filled 6px circle using `bg-current` before the label. Used when space is at a premium (table cells, compact list items).

### Inputs / Fields

- **Style:** Stroke-style. `border border-gray-200` at rest, `bg-white` light / `bg-neutral-800` dark. Height 44px (comfortable density) or 36px (compact).
- **Radius:** Rounded-lg (14px), matching button radius for visual grouping consistency.
- **Focus:** `ring-2 ring-clinic-crimson` replaces border. No border-color change; the ring is the signal.
- **Field label:** `text-xs font-semibold text-gray-500 uppercase tracking-wide`, 6px below label, 6px above input. This is `.field-label` in the global stylesheet.
- **Error:** `border-red-400 ring-red-500`. Error message in `text-xs text-red-500` below the field.
- **Icon prefix:** Leading icon in `text-gray-400`, `inset-start-3`. Padding shifts to `ps-10` when icon present (RTL-aware via logical property).

### Navigation (Sidebar)

The sidebar is the system's permanent fixture. It is always dark navy (`#0F172A`), regardless of the user's light/dark mode preference. It is the anchor from which all content is navigated.

- **Active item:** Clinic Crimson background (`#B71C1C`), white text, `glow-crimson` focus shadow. Fully rounded within the sidebar's horizontal padding.
- **Inactive item:** `text-slate-400`, hover `bg-white/10` with `text-white` transition. Duration 150ms.
- **Collapsed state:** Icons only, 68px wide. Item label surfaces as a `title` tooltip.
- **Resize behavior:** Draggable between 60px (icon-only) and 320px (full labels). Snaps to 256px (full) and 68px (collapsed). Width persisted in localStorage.

### Modals / Dialogs

- **Background:** Surface White (`#FFFFFF`) light / `neutral-900` dark. Never a glass panel.
- **Corner style:** Rounded-2xl (28px) — the largest radius in the system, marking modals as distinct elevated surfaces.
- **Shadow:** Level 4 overlay.
- **Backdrop:** `rgba(0,0,0,0.55)`, `backdrop-filter: blur(4px)`. The blur is functional (establishes modal as separate layer) not decorative.
- **Header:** `border-b border-gray-100` dark:`border-neutral-800`. Headline font, 18px bold. Dismiss button top-right.
- **Entry animation:** `slide-up` 300ms `ease-snap`. Exit: fade 150ms.

### Data Tables

- **Header:** Label style (`text-xs font-semibold uppercase tracking-wide`), `text-gray-500`.
- **Row hover:** `bg-gray-50` light / `bg-neutral-800/50` dark. Transition 150ms.
- **Row height:** Controlled by density mode variable (`--row-height`). 36px compact, 52px comfortable, 64px spacious.
- **Borders:** Horizontal only (`border-b border-gray-100` light / `border-neutral-800` dark). No vertical column borders.

## 6. Do's and Don'ts

### Do:

- **Do** use Clinic Crimson (`#B71C1C`) for all primary buttons, active nav items, and focus rings. It is the single interactive primary.
- **Do** use the seven-status color vocabulary exclusively for status signals. Queue Green means success; Alert Amber means attention needed; Cancel Red means destructive.
- **Do** show Level 1 shadow on all stat cards and content cards at rest. Never flat cards without a shadow or border.
- **Do** validate every layout and label in both LTR and RTL before shipping. Use logical CSS properties (`ps-`, `pe-`, `ms-`, `me-`) throughout, never `pl-`, `pr-`.
- **Do** use `uppercase tracking-wide text-xs font-semibold` for all field labels and column headers. Labels are metadata; they should read as such.
- **Do** keep the sidebar permanently dark navy (`#0F172A`), even in light mode. It is the system's fixed coordinate.
- **Do** respect `prefers-reduced-motion`. Transitions are 150-300ms; none are structural. At `prefers-reduced-motion: reduce`, set `transition-duration: 0ms` and `animation-duration: 0ms`.
- **Do** use density-mode custom properties (`--btn-height`, `--card-padding`, `--field-gap`) for all height and spacing in form and table contexts. Never hardcode these values.

### Don't:

- **Don't** use a generic blue primary scale for interactive elements. The brand primary is Clinic Crimson. Blue (`#2563EB`) is retained only for informational/data contexts where red would falsely signal alarm.
- **Don't** build generic SaaS dashboards: light-mode widget grids, blue accent everywhere, KPI cards that look like presentation slides. The Fadl Clinic system is not a Salesforce or HubSpot clone.
- **Don't** use heavy glassmorphism as a surface material. A frosted-glass card is not an identity. Glass appears at the modal backdrop and selected overlay contexts only — never as the default card background.
- **Don't** replicate legacy hospital EMR patterns: grey data tables without visual hierarchy, cluttered form chrome, information density that requires training to parse.
- **Don't** use consumer health app aesthetics: pastel backgrounds, wellness iconography, soft rounded headings. This is a professional back-office tool used under clinical time pressure.
- **Don't** use `#000000` or `#FFFFFF` as raw values anywhere. Tint every neutral: Page Background is `#F9FAFB`, Text Primary is `#111827`. The system lives in the near-extremes, not the absolutes.
- **Don't** use border-left greater than 1px as a colored stripe on cards, list items, or callouts. If emphasis is needed, use a tinted background, a leading icon, or a full border.
- **Don't** use gradient text (`background-clip: text`). Emphasis is weight and size, not chromatic gradient.
- **Don't** repurpose status colors for decoration. If something is green, it means active or successful. That consistency is the feature.
- **Don't** add motion to layout properties (height, width, padding). Animate `transform` and `opacity` only.
- **Don't** use the `spring` easing curve (`cubic-bezier(0.34,1.56,0.64,1)`) for any UI transition longer than 300ms or for any state change that needs to feel certain. Spring implies elasticity; use `snap` or `ease-out` for professional contexts.
