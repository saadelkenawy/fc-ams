# 🎨 Fadl Clinic — Design System

> **Document Version:** 1.1 (Enhanced)  
> **Last Updated:** 2026-05-02  
> **Original Plan:** v1.0 — Reviewed and Enhanced by Claude  
> **Reference Aesthetic:** CuraNet-inspired (floating glassmorphic panels, soft gradients, bento layouts)  
> **Logo:** Fadl Clinic Heart (Black-Crimson-Red gradient)  
> **System:** Fadl Clinic Management System (فضل كلينك)

---

## 📋 Review Summary

The submitted design system is **professional and well-structured**. The 10-step primary scale, semantic colors mapped to appointment statuses, RTL handling with logical properties, and shadcn/ui theme overrides are all solid foundations.

However, the reference dashboard (CuraNet) has a very distinctive aesthetic — floating glassmorphic panels with 3D perspective, pill-shaped tab navigation, soft pastel accent gradients, real avatar photos, and a sense of lightness — that the submitted system **doesn't fully capture yet**. The submitted system reads as "competent corporate healthcare UI" rather than "modern, warm, lively healthcare experience."

I'm proposing **20 enhancements** in 5 categories:

1. **Distinctive identity** — replace generic fonts (Inter is in the "do not use" list per Anthropic's frontend skill); capture the CuraNet liveliness through glassmorphism and 3D perspective
2. **Production completeness** — motion system, density modes, full dark mode, print stylesheets
3. **Healthcare specifics** — high-contrast mode for elderly, real avatar policy, Arabic numeral toggling
4. **Component depth** — toast patterns, notification dots, appointment timeline, bento layouts
5. **Brand fidelity** — gradient adjustments to match the actual heart logo (black-crimson-bright red, not muted)

All recommendations are folded into the sections below, marked **⭐ ENHANCEMENT** for clarity.

---

## Table of Contents

1. [Brand Identity](#1-brand-identity)
2. [Color Palette](#2-color-palette)
3. [Typography ⭐ MAJOR REVISION](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Motion System ⭐ NEW](#5-motion-system)
6. [Component Library](#6-component-library)
7. [Dashboard Patterns ⭐ ENHANCED](#7-dashboard-patterns)
8. [Glassmorphism & Depth ⭐ NEW](#8-glassmorphism--depth)
9. [RTL & Arabic Support](#9-rtl--arabic-support)
10. [Accessibility ⭐ ENHANCED](#10-accessibility)
11. [Density Modes ⭐ NEW](#11-density-modes)
12. [Theme Configuration](#12-theme-configuration)
13. [Asset Guidelines](#13-asset-guidelines)
14. [Print Stylesheet ⭐ NEW](#14-print-stylesheet)

---

## 1. Brand Identity

### 1.1 Logo Usage (Already Well Defined)

The Fadl Clinic logo is a stylized heart representing care, trust, and medical excellence.

| Variant | Usage | Background |
|---------|-------|------------|
| Primary Logo (Gradient Heart + Wordmark) | Login screens, headers, printed reports | Light backgrounds |
| Heart Icon Only | Favicon, app icons, avatar placeholders, loading spinners | Any |
| Monochrome White | Dark mode headers, dark sidebar, footer | Dark backgrounds |
| Monochrome Crimson | Watermarks, subtle backgrounds | Light backgrounds |

**Logo Safe Zone:** 25% of heart height padding on all sides.  
**Minimum Size:** 32px height (icon), 120px width (full wordmark).

### ⭐ ENHANCEMENT 1 — Logo Gradient Match

The original gradient (`#8B1A1A → #C41E3A → #DC2626 → #FF1A3C`) is too uniform compared to the actual logo, which has dramatic black-to-bright-red shifts. The actual logo gradient should be:

```css
/* ⭐ Corrected logo gradient — matches the actual heart asset */
--gradient-logo-actual: linear-gradient(
    135deg,
    #1A0000 0%,        /* Near-black inner shadow */
    #5C0F0F 18%,       /* Dark crimson */
    #B91C1C 42%,       /* Mid crimson */
    #DC2626 65%,       /* Brand crimson */
    #EF4444 85%,       /* Bright red highlight */
    #FF2A4A 100%       /* Pure red tip */
);

/* Subtle logo gradient — for backgrounds and watermarks */
--gradient-logo-subtle: linear-gradient(135deg, #FEF2F2 0%, #FFE4E4 50%, #FECACA 100%);
```

### 1.2 Brand Voice

| Language | Tone | Tagline |
|---|---|---|
| English | Professional, reassuring, precise | "Your health, our priority." |
| Arabic | Warm, respectful, authoritative | "صحتك، أولويتنا." |

**Never alarming.** Use calming language even for urgent notifications.

### ⭐ ENHANCEMENT 2 — Microcopy Voice Guidelines

Add specific tone rules per UI context:

| Context | English Voice | Arabic Voice | Example |
|---|---|---|---|
| Empty state | Encouraging | Welcoming | "No appointments yet — let's book your first" / "لم يتم حجز مواعيد بعد — لنبدأ" |
| Error (user) | Helpful, not blaming | Soft, no shame | "We need a valid mobile number" / "نحتاج رقم موبايل صحيح" |
| Error (system) | Apologetic, action-oriented | Reassuring | "Something went wrong on our side. Try again?" / "حدث خطأ من جهتنا. هل تريد المحاولة مجدداً؟" |
| Success | Warm acknowledgment | Affirming | "Appointment confirmed with Dr. Hoda" / "تم تأكيد موعدك مع د. هدى" |
| Confirmation (destructive) | Clear, calm warning | Direct, respectful | "Cancel this appointment? The slot will return to availability." / "هل تريد إلغاء الموعد؟ سيعود الموعد للحجز مجدداً" |

---

## 2. Color Palette

### 2.1 Primary Colors (Crimson) — Already Excellent

| Token | Hex | Usage |
|---|---|---|
| `--color-primary-50` | `#FEF2F2` | Background tint, hover |
| `--color-primary-100` | `#FEE2E2` | Light backgrounds, alerts |
| `--color-primary-200` | `#FECACA` | Borders, dividers |
| `--color-primary-300` | `#FCA5A5` | Secondary accents |
| `--color-primary-400` | `#F87171` | Highlights, badges |
| `--color-primary-500` | `#EF4444` | Primary action — buttons |
| `--color-primary-600` | `#DC2626` | Brand primary — CTAs |
| `--color-primary-700` | `#B91C1C` | Deep crimson — headers |
| `--color-primary-800` | `#991B1B` | Dark mode primary |
| `--color-primary-900` | `#7F1D1D` | Text on light backgrounds |

### ⭐ ENHANCEMENT 3 — Add Soft Accent Palette (CuraNet-Inspired)

The reference uses a soft mint/teal as accent against its primary purple. Fadl Clinic should adopt **soft rose-gold + warm sand** as accent palettes — they pair beautifully with crimson and feel medical-warm rather than clinical-cold.

```css
/* ⭐ Rose Gold Accent — for highlights, badges, soft fills */
--color-accent-rose-50:  #FFF5F1;
--color-accent-rose-100: #FFE4D6;
--color-accent-rose-200: #FFC9AC;
--color-accent-rose-300: #FFA37F;
--color-accent-rose-400: #FF7E54;
--color-accent-rose-500: #F0623E;   /* Rose gold primary */
--color-accent-rose-600: #D14E2C;

/* ⭐ Warm Sand — for neutral surfaces with warmth */
--color-sand-50:  #FAF7F2;
--color-sand-100: #F5EFE5;
--color-sand-200: #EBE0CD;
--color-sand-300: #DCC9A8;
--color-sand-400: #C8AC81;

/* ⭐ Soft Mint (sparingly — for "healthy" status indicators) */
--color-mint-50:  #F0FBF4;
--color-mint-100: #DCF4E2;
--color-mint-500: #34D399;
```

### 2.2 Logo & Decorative Gradients

```css
/* Sidebar — kept from original */
--gradient-sidebar: linear-gradient(180deg, #DC2626 0%, #991B1B 50%, #7F1D1D 100%);

/* ⭐ ENHANCEMENT: Soft hero gradient (CuraNet-inspired) */
--gradient-hero: linear-gradient(
    135deg,
    #FEF2F2 0%,
    #FFE4D6 35%,
    #FFFFFF 60%,
    #F5EFE5 100%
);

/* ⭐ ENHANCEMENT: Glass card gradient */
--gradient-glass: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.75) 0%,
    rgba(255, 255, 255, 0.5) 100%
);

/* ⭐ ENHANCEMENT: Premium card accent (subtle warmth) */
--gradient-card-warm: linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 100%);
```

### 2.3 Neutral Colors — Keep As-Is

(All gray tokens from original retained.)

### 2.4 Semantic Colors — Already Healthcare-Aware

| State | Color | Hex |
|---|---|---|
| Success | Green | `#10B981` |
| Warning | Amber | `#F59E0B` |
| Danger | Red | `#EF4444` |
| Info | Blue | `#3B82F6` |
| Neutral | Gray | `#6B7280` |
| Urgent | Crimson | `#DC2626` |

### 2.5 Appointment Status Colors — Already Mapped

(All status colors from original retained — TBC, Ok!, Conf., Comp., Canc., Resch., Inf.)

### ⭐ ENHANCEMENT 4 — Status Dot Indicators

Add a small pulsing dot pattern for live statuses, beyond just badges:

```css
.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.status-dot--live {
    background: var(--color-success);
    animation: pulse-dot 2s ease-in-out infinite;
}

.status-dot--tbc {
    background: var(--color-warning);
    animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
    0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
    50% { box-shadow: 0 0 0 6px transparent; opacity: 0.7; }
}
```

---

## 3. Typography ⭐ MAJOR REVISION

### ⭐ ENHANCEMENT 5 — Replace Inter with Distinctive Fonts

**Critical issue:** The Anthropic frontend-design skill explicitly lists **Inter** as a "generic AI" font to avoid. The submitted plan uses Inter as the English primary. We need something more distinctive that still maintains medical professionalism.

**Recommended Font Pairing:**

| Language | Display Font | Body Font | Why |
|---|---|---|---|
| **English** | **Outfit** (Google Fonts) | **Manrope** (Google Fonts) | Outfit is geometric and modern with character; Manrope is warm, highly readable, and used by companies like GitHub, Linear, and Notion. Together they avoid the "Inter look" while staying professional. |
| **Arabic** | **IBM Plex Sans Arabic** | **Tajawal** | Tajawal stays as body font (excellent for Arabic UI). IBM Plex Sans Arabic adds a more distinctive, multi-weight display option for headings. |
| **Monospace** | **Geist Mono** | — | More modern than JetBrains Mono; excellent for medical record numbers, codes, financial figures. |

**Font Loading:**
```typescript
// Next.js — using next/font with display: swap
import { Outfit, Manrope, IBM_Plex_Sans_Arabic, Tajawal, Geist_Mono } from 'next/font/google';

export const outfit = Outfit({ 
    subsets: ['latin'], 
    weight: ['400', '500', '600', '700', '800'],
    variable: '--font-display'
});

export const manrope = Manrope({ 
    subsets: ['latin'], 
    weight: ['400', '500', '600', '700'],
    variable: '--font-body'
});

export const ibmPlexArabic = IBM_Plex_Sans_Arabic({ 
    subsets: ['arabic'], 
    weight: ['400', '500', '600', '700'],
    variable: '--font-display-ar'
});

export const tajawal = Tajawal({ 
    subsets: ['arabic'], 
    weight: ['400', '500', '700'],
    variable: '--font-body-ar'
});

export const geistMono = Geist_Mono({ 
    subsets: ['latin'],
    variable: '--font-mono'
});
```

### 3.1 Type Scale — Refined

| Token | Size | Line Height | Weight | Letter Spacing | Font | Usage |
|---|---|---|---|---|---|---|
| `display-xl` | 48px | 1.05 | 700 | -0.025em | Outfit / IBM Plex Arabic | Hero, login welcome |
| `display-lg` | 36px | 1.1 | 700 | -0.02em | Outfit / IBM Plex Arabic | Page headers |
| `display-md` | 30px | 1.15 | 600 | -0.015em | Outfit / IBM Plex Arabic | Section titles |
| `heading-lg` | 24px | 1.3 | 600 | -0.01em | Outfit / IBM Plex Arabic | Card titles |
| `heading-md` | 20px | 1.35 | 600 | 0 | Outfit / IBM Plex Arabic | Subsections |
| `heading-sm` | 18px | 1.4 | 500 | 0 | Manrope / Tajawal | Widget titles |
| `body-lg` | 16px | 1.6 | 400 | 0 | Manrope / Tajawal | Primary body |
| `body-md` | 14px | 1.5 | 400 | 0 | Manrope / Tajawal | Secondary text |
| `body-sm` | 13px | 1.5 | 400 | 0 | Manrope / Tajawal | Captions |
| `label` | 12px | 1.4 | 500 | 0.02em | Manrope / Tajawal | Form labels, badges |
| `overline` | 11px | 1.2 | 600 | 0.08em | Manrope / Tajawal | Uppercase section labels |
| `numeric-lg` | 32px | 1.1 | 600 | -0.02em | Geist Mono | KPI values, amounts |
| `numeric-md` | 18px | 1.3 | 500 | 0 | Geist Mono | Inline numbers, IDs |

### 3.2 Arabic Typography Rules — Already Excellent

- Line height +10% for Arabic
- Right-align by default for Arabic
- Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) for patient portal
- Western numerals for admin/finance
- Font size +1-2px for Arabic perceived equivalence

### ⭐ ENHANCEMENT 6 — Arabic Numeral Toggle Per User

Add a per-user setting: "Numeral System" with options Western (123) / Eastern (١٢٣). Default to Eastern for Arabic UI patient portal, Western for finance/admin regardless of UI language.

---

## 4. Spacing & Layout

### 4.1 Spacing Scale — Keep As-Is (4px base unit, well structured)

### 4.2 Border Radius — Keep As-Is

### 4.3 Shadows — Already Crimson-Tinted (Excellent Touch)

### ⭐ ENHANCEMENT 7 — Extended Elevation Hierarchy

The original 4 shadows are good but production systems usually need 6-8 elevation tiers. Expanded:

```css
/* Level 0 — flat (no shadow, baseline) */
--shadow-0: none;

/* Level 1 — barely elevated (input focus, hovers) */
--shadow-1: 0 1px 2px rgba(127, 29, 29, 0.04);

/* Level 2 — cards (default) */
--shadow-2: 0 1px 3px rgba(127, 29, 29, 0.08), 0 4px 12px rgba(127, 29, 29, 0.04);

/* Level 3 — cards hover */
--shadow-3: 0 4px 6px rgba(127, 29, 29, 0.1), 0 10px 24px rgba(127, 29, 29, 0.06);

/* Level 4 — dropdowns, popovers */
--shadow-4: 0 4px 16px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(127, 29, 29, 0.06);

/* Level 5 — modals, drawers */
--shadow-5: 0 8px 32px rgba(0, 0, 0, 0.12), 0 16px 48px rgba(127, 29, 29, 0.08);

/* Level 6 — full-screen overlays */
--shadow-6: 0 16px 64px rgba(0, 0, 0, 0.2);

/* Soft glow — for active/selected states */
--shadow-glow-primary: 0 0 0 4px rgba(220, 38, 38, 0.12);
--shadow-glow-success: 0 0 0 4px rgba(16, 185, 129, 0.12);
--shadow-glow-warning: 0 0 0 4px rgba(245, 158, 11, 0.12);
```

### 4.4 Layout Grid — Keep As-Is

### 4.5 Sidebar Layout — Keep As-Is

---

## 5. Motion System ⭐ NEW

The submitted plan only mentions a few hover durations. A production system needs a complete motion system with named easing curves and standardized durations.

### 5.1 Motion Tokens

```css
/* Durations */
--duration-instant: 50ms;    /* Toggle, switch */
--duration-fast: 150ms;      /* Hover, focus, button press */
--duration-base: 200ms;      /* Modal fade, dropdown */
--duration-medium: 300ms;    /* Toast slide, drawer open */
--duration-slow: 500ms;      /* Page transition, hero reveals */
--duration-deliberate: 800ms;/* Onboarding step, success celebration */

/* Easing curves */
--ease-linear: linear;
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);          /* Most UI */
--ease-in: cubic-bezier(0.4, 0.0, 1, 1);             /* Exits */
--ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);       /* Symmetrical */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);    /* Bouncy entrances */
--ease-snap: cubic-bezier(0.16, 1, 0.3, 1);          /* Snappy exits */
```

### 5.2 Standard Motion Patterns

| Pattern | Duration | Easing | Notes |
|---|---|---|---|
| Button hover | 150ms | ease-out | Subtle scale 1.02 + shadow lift |
| Button press | 50ms | ease-in | Scale 0.98 |
| Card hover | 200ms | ease-out | Elevation 2 → 3, subtle Y -2px |
| Modal open | 300ms | ease-out | Scale 0.96 → 1, opacity 0 → 1 |
| Modal close | 200ms | ease-in | Scale 1 → 0.96, opacity 1 → 0 |
| Toast slide-in | 300ms | ease-spring | Slide from right with bounce |
| Toast slide-out | 200ms | ease-snap | Slide right with fade |
| Drawer open | 350ms | ease-out | Slide from edge |
| Page transition | 500ms | ease-in-out | Fade + 8px Y movement |
| KPI count-up | 800ms | ease-out | Number animates 0 → target |
| Skeleton pulse | 1500ms | ease-in-out | Infinite loop |
| Status dot pulse | 2000ms | ease-in-out | Infinite loop |

### 5.3 Reduced Motion

Always respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

---

## 6. Component Library

### 6.1 Buttons — Already Well Specified

(Primary, Secondary, Ghost, Danger, Success, Icon variants all retained.)

### ⭐ ENHANCEMENT 8 — Add Pill Tab Navigation Component (CuraNet Reference)

The CuraNet reference uses pill-shaped tabs at the top. Add this as a primary navigation pattern:

```jsx
// Pill Tab Navigation
<nav className="inline-flex p-1 rounded-full bg-white shadow-card gap-1">
    <button className="px-5 py-2 rounded-full bg-primary-600 text-white font-medium text-sm shadow-glow-primary">
        Dashboard
    </button>
    <button className="px-5 py-2 rounded-full text-gray-600 hover:bg-gray-50 font-medium text-sm">
        Patients
    </button>
    <button className="px-5 py-2 rounded-full text-gray-600 hover:bg-gray-50 font-medium text-sm">
        Appointments
    </button>
    <button className="px-5 py-2 rounded-full text-gray-600 hover:bg-gray-50 font-medium text-sm">
        Prescriptions
    </button>
</nav>
```

### 6.2 Cards — Enhanced

### ⭐ ENHANCEMENT 9 — Add Bento Card Variants

The CuraNet reference uses asymmetric card sizes (1×1, 1×2, 2×1, 2×2) — known as bento grid. Add these variants:

```css
.card-bento {
    grid-column: span var(--span-x, 1);
    grid-row: span var(--span-y, 1);
    border-radius: var(--radius-lg);
    background: white;
    box-shadow: var(--shadow-2);
    padding: var(--space-5);
    transition: box-shadow var(--duration-base) var(--ease-out);
}

.card-bento:hover {
    box-shadow: var(--shadow-3);
}

.card-bento--featured {
    background: var(--gradient-card-warm);
    border: 1px solid var(--color-primary-100);
}

.card-bento--floating {
    transform: rotate(-1deg);
    transition: transform var(--duration-medium) var(--ease-out);
}

.card-bento--floating:hover {
    transform: rotate(0deg) translateY(-4px);
}
```

### 6.3 Form Inputs — Already Well Specified

### 6.4 Tables — Already Well Specified

### 6.5 Badges & Tags — Already Well Specified

### 6.6 Modals & Drawers — Already Well Specified

### 6.7 Avatars

### ⭐ ENHANCEMENT 10 — Real Patient Photos Are Acceptable (with Privacy Rules)

**The submitted plan says "never use real patient photos in demo data"** — but production EHR systems **do** show patient photos for identity verification at check-in, which prevents wrong-patient errors (a known patient safety issue).

**Corrected policy:**

| Context | Policy |
|---|---|
| Production patient profile | Real photo allowed (uploaded by patient or captured at registration with consent) |
| Identity verification at check-in | Photo strongly recommended (prevents wrong-patient errors) |
| Demo / staging environments | Use generated avatars (not real patients) |
| Public-facing screens (waiting room) | Initials only, never photo |
| Marketing / screenshots | Use generic avatars or stock with model release |
| Patient consent required | Yes, with clear "use in clinical record only" agreement |

**Fallback when no photo:**
- Initials (first letter of first + last name) on `--color-primary-100` background, `--color-primary-700` text
- Heart logo as system avatar (unidentified user)

### 6.8 Charts & Data Visualization

### ⭐ ENHANCEMENT 11 — Healthcare-Distinctive Chart Palette

The original chart sequence is generic. Replace with a palette that's more memorable for Fadl Clinic:

```css
/* ⭐ Healthcare chart sequence — crimson family + warm accents */
--chart-1: #DC2626;   /* Crimson — primary metric */
--chart-2: #F0623E;   /* Rose gold — secondary */
--chart-3: #34D399;   /* Mint — positive/healthy */
--chart-4: #3B82F6;   /* Sky blue — informational */
--chart-5: #F59E0B;   /* Amber — attention */
--chart-6: #8B5CF6;   /* Violet — analytical */
--chart-7: #C8AC81;   /* Sand — neutral comparison */
--chart-8: #6B7280;   /* Gray — baseline */
```

---

## 7. Dashboard Patterns ⭐ ENHANCED

### 7.1 Doctor Dashboard (CuraNet-Inspired Layout)

Inspired by the reference, the doctor dashboard uses a **floating panel + bento grid** layout:

```
┌────────────────────────────────────────────────────────────────────┐
│  [Heart Logo]   [Pill Tabs: Dashboard|Patients|Appts|Rx|Records]   │
│                                                       [Search][🔔]│
├────────────────────────────────────────────────────────────────────┤
│  Hey, Dr. Hoda!                                                     │
│  Let's get to work                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│  │Consultations│  │ Satisfaction│  │  Revenue   │                   │
│  │  148        │  │   4.8/5     │  │  $8.1k     │                   │
│  │  +23.5% ↑   │  │   -4.5% ↓   │  │  +16.2% ↑  │                   │
│  └────────────┘  └────────────┘  └────────────┘                   │
│  ┌──────────────────────────────────────┐  ┌────────────────────┐ │
│  │  Current Patients                    │  │  Today's Schedule   │ │
│  │  ─────────────────────────────────  │  │  ────────────────   │ │
│  │  Liam Carter   1st visit  Phone     │  │  09:30 Mia Smith    │ │
│  │  Emily Parker  3d visit   Online    │  │  10:00 Emily Parker │ │
│  │  Mia Smith     3d visit   Offline   │  │  10:30 Liam Carter  │ │
│  └──────────────────────────────────────┘  │  11:00 Anna Reed    │ │
│  ┌────────┐  ┌────────────┐  ┌────────┐    │  ─── floating ───   │ │
│  │ Visits │  │  Workload  │  │Reviews │    │  Glassmorphic panel │ │
│  │  29%   │  │  ▓▓▓▓▓     │  │ 4.8/5  │    │  rotated -2deg     │ │
│  │  58%   │  │  ▓▓▓       │  │ 856 ★  │    │                     │ │
│  └────────┘  └────────────┘  └────────┘    └────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### ⭐ ENHANCEMENT 12 — Floating Schedule Panel Pattern

The reference's most distinctive feature is the right-side appointment panel that appears to **float in 3D space** (rotated, with deeper shadow). Implement:

```jsx
<aside className="
    fixed right-6 top-24 w-96
    bg-gradient-to-br from-primary-500 to-primary-700
    text-white rounded-2xl
    shadow-5
    transform rotate-[-2deg] hover:rotate-0
    transition-transform duration-medium ease-out
    p-6
    backdrop-blur-md
">
    <header className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Appointments</h3>
        <button className="px-3 py-1 rounded-full bg-white/20 text-sm">+ Add</button>
    </header>
    {/* Calendar week selector */}
    {/* Appointment list with avatars */}
</aside>
```

### 7.2 Receptionist Dashboard — Already Specified

### 7.3 Finance Dashboard — Already Specified

### 7.4 Patient Portal Dashboard — Already Specified

### ⭐ ENHANCEMENT 13 — Add Doctor Mobile App Layout

For the new doctor mobile app (Module 10 in claude-plan.md), add a mobile-specific layout:

```
┌─────────────────────┐
│ ← Dr. Hoda  [🔔][⚙️]│
├─────────────────────┤
│ Today                │
│ ┌─────────────────┐ │
│ │ 09:30 Mia Smith │ │
│ │ Conf. · Online  │ │
│ │ [Start Call]    │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ 10:00 Emily P.  │ │
│ │ TBC · In Person │ │
│ │ [Confirm][Resch]│ │
│ └─────────────────┘ │
│                      │
│ Today's Earnings     │
│ EGP 4,250            │
│ +12% vs yesterday    │
│                      │
│ [📅][👥][💰][⚙️]   │
└─────────────────────┘
```

---

## 8. Glassmorphism & Depth ⭐ NEW

The CuraNet reference relies heavily on glassmorphism and 3D perspective. The submitted plan doesn't address these patterns at all. Production specs:

### 8.1 Glassmorphism Patterns

```css
/* Glass card — used for floating panels */
.glass {
    background: rgba(255, 255, 255, 0.65);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.5);
    box-shadow: var(--shadow-3);
}

/* Glass card — colored variant for accent panels */
.glass--primary {
    background: linear-gradient(
        135deg,
        rgba(220, 38, 38, 0.85) 0%,
        rgba(153, 27, 27, 0.75) 100%
    );
    backdrop-filter: blur(16px);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Glass card — dark mode */
.glass--dark {
    background: rgba(23, 23, 23, 0.7);
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### 8.2 3D Perspective Patterns

```css
/* Floating panel with perspective */
.panel-floating {
    transform: perspective(1000px) rotateY(-2deg) rotateX(1deg);
    transform-style: preserve-3d;
    transition: transform var(--duration-medium) var(--ease-out);
}

.panel-floating:hover {
    transform: perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(-4px);
}

/* Stacked card effect */
.card-stack {
    position: relative;
}

.card-stack::before,
.card-stack::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: white;
    box-shadow: var(--shadow-1);
    z-index: -1;
}

.card-stack::before {
    transform: rotate(-2deg) translateY(4px);
    opacity: 0.6;
}

.card-stack::after {
    transform: rotate(2deg) translateY(8px);
    opacity: 0.3;
}
```

### 8.3 Background Atmosphere

```css
/* Subtle wave background — inspired by CuraNet */
.bg-atmospheric {
    background:
        radial-gradient(ellipse at top left, rgba(220, 38, 38, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at bottom right, rgba(240, 98, 62, 0.04) 0%, transparent 50%),
        var(--color-gray-50);
    position: relative;
}

.bg-atmospheric::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 50 Q 250 0 500 50 T 1000 50' stroke='%23DC2626' stroke-opacity='0.04' fill='none'/%3E%3C/svg%3E");
    background-size: 1000px 100px;
    opacity: 0.5;
    pointer-events: none;
}
```

---

## 9. RTL & Arabic Support — Already Excellent

(Layout direction, component mirroring, Arabic-specific components, bilingual content all retained.)

---

## 10. Accessibility ⭐ ENHANCED

### 10.1 Standards — Keep As-Is (WCAG 2.1 AA minimum)

### 10.2 Focus States — Keep As-Is

### 10.3 Motion — Already Specified

### 10.4 Touch Targets — Keep As-Is

### ⭐ ENHANCEMENT 14 — High-Contrast Mode for Elders

Fadl Clinic has an "Elders Care" specialty — these patients often have visual impairment. Add an explicit high-contrast theme:

```css
[data-theme="high-contrast"] {
    --color-text-primary: #000000;
    --color-text-secondary: #1F2937;
    --color-bg: #FFFFFF;
    --color-primary-600: #B91C1C;     /* Even darker for contrast */
    --color-primary-100: #FFFFFF;     /* Higher contrast against text */
    --color-border: #000000;
    
    /* All borders 2px instead of 1px */
    --border-width: 2px;
    
    /* All text +2px size */
    /* All buttons +8px height */
    /* All focus rings 3px instead of 2px */
}
```

User toggle: Settings → Accessibility → "High Contrast Mode" / "وضع التباين العالي"

### ⭐ ENHANCEMENT 15 — Font Size Scaling Per User

Add user-selectable text size: Small / Medium / Large / Extra-Large. Affects entire app via root font-size scaling (use `rem` units throughout, never `px` for text).

```css
:root[data-text-size="sm"] { font-size: 14px; }
:root[data-text-size="md"] { font-size: 16px; }  /* default */
:root[data-text-size="lg"] { font-size: 18px; }
:root[data-text-size="xl"] { font-size: 20px; }
```

### ⭐ ENHANCEMENT 16 — Color-Blind Safe Status Indicators

Don't rely on color alone for appointment status. Always pair with an icon or shape:

| Status | Color | Shape/Icon |
|---|---|---|
| TBC | Amber | ⌛ hourglass |
| Ok! | Blue | ✓ check |
| Conf. | Green | ✓✓ double check |
| Comp. | Gray | ✔ filled check |
| Canc. | Red | ✕ cross |
| Resch. | Gray | ↻ rotate arrow |
| Inf. | Light pink | ⓘ info |

---

## 11. Density Modes ⭐ NEW

Different roles need different information density. Add three density modes:

### 11.1 Density Tokens

```css
/* Compact — receptionist quick-entry */
[data-density="compact"] {
    --table-row-height: 36px;
    --button-height-md: 32px;
    --input-height: 36px;
    --card-padding: 12px;
    --form-field-gap: 8px;
}

/* Comfortable — default for admin/doctor */
[data-density="comfortable"] {
    --table-row-height: 52px;
    --button-height-md: 40px;
    --input-height: 44px;
    --card-padding: 20px;
    --form-field-gap: 16px;
}

/* Spacious — patient portal, elders */
[data-density="spacious"] {
    --table-row-height: 64px;
    --button-height-md: 48px;
    --input-height: 52px;
    --card-padding: 24px;
    --form-field-gap: 24px;
}
```

### 11.2 Density Defaults Per Role

| Role | Default Density |
|---|---|
| Receptionist | Compact (high-volume, fast entry) |
| Doctor | Comfortable |
| Admin/Finance | Comfortable |
| Patient | Spacious |
| Elders Care patient | Spacious + High Contrast + Large Text |

---

## 12. Theme Configuration

### ⭐ ENHANCEMENT 17 — Updated Tailwind Config

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{js,ts,jsx,tsx}'],
    darkMode: ['class', '[data-theme="dark"]'],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA',
                    300: '#FCA5A5', 400: '#F87171', 500: '#EF4444',
                    600: '#DC2626', 700: '#B91C1C', 800: '#991B1B',
                    900: '#7F1D1D',
                },
                accent: {
                    50: '#FFF5F1', 100: '#FFE4D6', 200: '#FFC9AC',
                    300: '#FFA37F', 400: '#FF7E54', 500: '#F0623E',
                    600: '#D14E2C',
                },
                sand: {
                    50: '#FAF7F2', 100: '#F5EFE5', 200: '#EBE0CD',
                    300: '#DCC9A8', 400: '#C8AC81',
                },
                mint: {
                    50: '#F0FBF4', 100: '#DCF4E2', 500: '#34D399',
                },
                success: '#10B981',
                warning: '#F59E0B',
                danger: '#EF4444',
                info: '#3B82F6',
            },
            fontFamily: {
                display: ['var(--font-display)', 'var(--font-display-ar)', 'system-ui', 'sans-serif'],
                sans: ['var(--font-body)', 'var(--font-body-ar)', 'system-ui', 'sans-serif'],
                arabic: ['var(--font-body-ar)', 'Tajawal', 'sans-serif'],
                mono: ['var(--font-mono)', 'monospace'],
            },
            borderRadius: {
                'sm': '6px',
                'md': '10px',
                'lg': '14px',
                'xl': '20px',
                '2xl': '28px',
            },
            boxShadow: {
                '1': '0 1px 2px rgba(127, 29, 29, 0.04)',
                '2': '0 1px 3px rgba(127, 29, 29, 0.08), 0 4px 12px rgba(127, 29, 29, 0.04)',
                '3': '0 4px 6px rgba(127, 29, 29, 0.1), 0 10px 24px rgba(127, 29, 29, 0.06)',
                '4': '0 4px 16px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(127, 29, 29, 0.06)',
                '5': '0 8px 32px rgba(0, 0, 0, 0.12), 0 16px 48px rgba(127, 29, 29, 0.08)',
                '6': '0 16px 64px rgba(0, 0, 0, 0.2)',
                'glow-primary': '0 0 0 4px rgba(220, 38, 38, 0.12)',
                'glow-success': '0 0 0 4px rgba(16, 185, 129, 0.12)',
                'glow-warning': '0 0 0 4px rgba(245, 158, 11, 0.12)',
            },
            backdropBlur: {
                'xs': '2px',
                'glass': '20px',
            },
            transitionTimingFunction: {
                'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                'snap': 'cubic-bezier(0.16, 1, 0.3, 1)',
            },
            animation: {
                'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
                'count-up': 'count-up 0.8s ease-out',
            },
        },
    },
    plugins: [
        require('tailwindcss-rtl'),
        require('@tailwindcss/typography'),
        require('@tailwindcss/forms'),
    ],
};

export default config;
```

### ⭐ ENHANCEMENT 18 — Full Dark Mode Palette

The submitted plan only sketches dark mode. Full spec:

```css
[data-theme="dark"] {
    /* Backgrounds */
    --color-bg: #0A0A0A;
    --color-bg-elevated: #171717;
    --color-bg-card: #1F1F1F;
    --color-bg-input: #262626;
    --color-bg-hover: #2A2A2A;
    
    /* Text */
    --color-text-primary: #F9FAFB;
    --color-text-secondary: #D1D5DB;
    --color-text-tertiary: #9CA3AF;
    --color-text-disabled: #6B7280;
    
    /* Brand — slightly brighter in dark mode for contrast */
    --color-primary-50:  #2A0606;
    --color-primary-100: #3D0808;
    --color-primary-500: #F87171;   /* Brighter for AA contrast */
    --color-primary-600: #EF4444;
    --color-primary-700: #DC2626;
    
    /* Borders */
    --color-border: #262626;
    --color-border-strong: #404040;
    
    /* Shadows — softer in dark mode */
    --shadow-2: 0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
    --shadow-3: 0 4px 6px rgba(0, 0, 0, 0.4), 0 10px 24px rgba(0, 0, 0, 0.3);
    
    /* Glass adapts */
    --gradient-glass: linear-gradient(
        135deg,
        rgba(31, 31, 31, 0.7) 0%,
        rgba(23, 23, 23, 0.5) 100%
    );
}
```

---

## 13. Asset Guidelines

### 13.1 Logo Assets — Already Specified

### 13.2 Iconography

### ⭐ ENHANCEMENT 19 — Add 14px Icon Size

Production systems need a 14px icon size for inline use within body text and tight UI:

| Size | Usage |
|---|---|
| 14px | Inline within body text, dense table actions |
| 16px | Inline buttons, form field icons |
| 20px | Standard buttons |
| 24px | Navigation, primary actions |
| 32px | Empty states |
| 40px | KPI cards |
| 56px | Hero illustrations |

### 13.3 Imagery Style — Already Specified (with patient photo correction in Section 6.7)

### 13.4 Loading States — Already Specified

---

## 14. Print Stylesheet ⭐ NEW

Healthcare requires high-quality printed outputs (medical records, receipts, prescriptions, lab orders). The submitted plan doesn't address print at all.

```css
@media print {
    @page {
        size: A4;
        margin: 20mm 15mm;
    }
    
    /* Hide UI chrome */
    nav, aside, .no-print, button, [role="button"] {
        display: none !important;
    }
    
    /* Reset colors for ink economy */
    body {
        background: white !important;
        color: black !important;
        font-size: 11pt;
        line-height: 1.4;
    }
    
    /* Logo always visible on print */
    .print-header {
        display: block !important;
        position: running(header);
    }
    
    /* Logo in print */
    .logo-print {
        height: 40px;
        margin-bottom: 10mm;
    }
    
    /* Tables — full borders for printed records */
    table {
        border-collapse: collapse;
        width: 100%;
    }
    
    table th, table td {
        border: 1px solid #000;
        padding: 4mm;
    }
    
    /* Page break helpers */
    .page-break-before { page-break-before: always; }
    .page-break-after { page-break-after: always; }
    .page-break-avoid { page-break-inside: avoid; }
    
    /* Footer with page numbers */
    .print-footer {
        position: running(footer);
    }
    
    /* Watermark for confidentiality */
    body::before {
        content: "FADL CLINIC — CONFIDENTIAL";
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 80pt;
        color: rgba(220, 38, 38, 0.05);
        z-index: -1;
        pointer-events: none;
    }
}
```

**Print Document Templates Required:**
- Patient registration form
- Appointment confirmation receipt
- Prescription (with doctor signature line)
- Medical report
- Invoice / receipt with VAT breakdown
- Lab test order form
- Discharge summary

---

## 15. Responsive Behavior — Already Specified

(Desktop, Laptop, Tablet, Mobile breakpoints retained.)

---

## 📊 Summary of 20 Enhancements

| # | Enhancement | Category |
|---|---|---|
| 1 | Corrected logo gradient (matches actual heart asset) | Brand fidelity |
| 2 | Microcopy voice guidelines (per-context tone) | Distinctive identity |
| 3 | Soft accent palette (rose gold, sand, mint) | Distinctive identity |
| 4 | Status dot indicators with pulse animations | Component depth |
| 5 | **Replace Inter** — use Outfit + Manrope (English), IBM Plex Arabic + Tajawal (Arabic) | Distinctive identity |
| 6 | Arabic numeral toggle per user setting | Distinctive identity |
| 7 | Extended elevation hierarchy (6 levels + glow shadows) | Production completeness |
| 8 | Pill tab navigation pattern (CuraNet-inspired) | Component depth |
| 9 | Bento card variants with floating/rotation effects | Component depth |
| 10 | Real patient photo policy correction (production EHR best practice) | Healthcare specifics |
| 11 | Healthcare-distinctive chart palette | Distinctive identity |
| 12 | Floating schedule panel pattern (CuraNet signature) | Distinctive identity |
| 13 | Doctor mobile app layout spec | Component depth |
| 14 | High-contrast mode for elders | Healthcare specifics |
| 15 | Font size scaling per user (sm/md/lg/xl) | Healthcare specifics |
| 16 | Color-blind safe status indicators (icon + color) | Healthcare specifics |
| 17 | Updated Tailwind config (full token system) | Production completeness |
| 18 | Full dark mode palette (not just sketch) | Production completeness |
| 19 | 14px icon size for inline use | Production completeness |
| 20 | Print stylesheet + 7 print templates | Production completeness |

---

## 🎯 Design Principle (Refined)

> **Every pixel should communicate trust, care, and precision. The deep red heart is not just a logo — it is the emotional anchor of the entire experience.**
>
> **Use it with intention, never decoration. Pair its boldness with breathing room, soft warmth from the accent palette, and the floating lightness of glass and depth.**
>
> **The interface should feel like a calm, capable doctor — confident in their craft, warm in their presence, and never alarming even when delivering urgent information.**

---

## 📅 Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-05-02 | 1.0 | Original design system submitted | Saad |
| 2026-05-02 | 1.1 | **Reviewed and enhanced by Claude** — 20 enhancements: distinctive typography (replaced Inter), corrected logo gradient, soft accent palette (rose gold/sand/mint), motion system, glassmorphism patterns, bento layouts, floating panels, pill tabs, density modes, full dark mode, high-contrast mode, font scaling, color-blind safe indicators, real patient photo policy, print stylesheet, 14px icon size, healthcare chart palette, microcopy voice, status dot pulses, doctor mobile layout | Saad + Claude |

---

> Inspired by CuraNet's lightness; grounded in Fadl Clinic's heart.