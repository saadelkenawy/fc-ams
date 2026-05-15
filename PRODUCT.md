# Product

## Status (as of 2026-05-15)

**Phase 1 complete.** All 13 backend services and 17 frontend pages are live. Current work is bug fixes and production hardening.

### Live Features
- Appointment scheduling with double-booking exclusion, walk-in queue, room assignment
- Patient management: CRUD, soft delete, file uploads (MinIO), visit history
- Doctor management: profiles, schedules, overrides, revenue splits (consultation/operative/online)
- Billing: immutable financial ledger, doctor settlements with password gate, source fee rules, VAT
- Analytics: revenue overview, doctor earnings, specialty breakdown, patient source stats, no-show trends
- AI chatbot: registers patients, books appointments, bilingual (AR/EN) via OpenRouter
- EHR encounters, procedure catalogue, integration webhooks (Vizita/Ekshf/CliniDo/InstaPay)
- RBAC: role-based route protection (admin/finance/receptionist/doctor)

### Recent Fixes (May 2026)
- Settlement Dr%/Cl% columns now reflect current doctor revenue splits (V009 migration + backfill)
- Appointment specialty_id correctly populated from selected doctor on create and edit
- Notes field in appointment fees section made optional
- Mandatory fields smart error banner in appointment modal
- Password gate on reverse settlement; settled doctors removed from pending list

## Users

Clinic staff: receptionists, doctors, admin, and finance officers at Fadl Clinic (فضل كلينك), an Egyptian multi-specialty medical clinic operating 30+ specialties under one brand.

Primary daily users are receptionists and admin staff who manage appointment flow, patient check-in, room assignment, and billing throughout the clinic day. Doctors use the system to see their queue and complete sessions. Finance staff access billing and settlement reports.

All users are comfortable with computers at a professional level. Receptionists are the least technical daily user — the interface should never require training to navigate.

Both Arabic and English are daily working languages. Arabic-speaking staff switch the UI to RTL; bilingual staff switch freely. Every layout, label, and empty state must be as fluent in RTL as in LTR.

## Product Purpose

Replace a clinic-wide Excel (.xlsm) workflow with a fully digital, real-time management system. The platform handles appointment scheduling, room management, patient queue tracking, doctor revenue splits, billing records, and AI-assisted operations.

Success means staff spend zero time fighting the software. Every task that used to require a spreadsheet lookup or phone call should resolve in two clicks. The system earns trust by being faster and more accurate than the Excel it replaces.

## Brand Personality

Efficient · Clear · Confident

The system should feel like a specialist tool used by professionals who know what they're doing. It is not playful. It is not generic. It is not intimidating. It earns trust through precision and speed, not through decoration.

Voice and tone: direct, bilingual, no fluff. Labels are short and accurate. Error messages say what happened and what to do. Nothing is called "Dashboard" when it means "Today's Appointments."

## Anti-references

- **Generic SaaS dashboards** (Salesforce, HubSpot style): avoid the corporate American B2B aesthetic — light-mode widget grids, blue accent everywhere, KPI cards that look like slides.
- **Legacy hospital EMR systems**: avoid cluttered form-heavy UI, grey data tables with no hierarchy, Windows-era patterns, information density that requires training.
- **Consumer health apps** (Headspace, MyFitnessPal style): avoid friendly pastels, wellness iconography, and casual tone. This is a professional back-office tool, not a patient-facing app.
- **Heavy glassmorphism / Dribbble-dark-mode** aesthetic: frosted glass as the primary surface, glowing halos, blurs on every card, decorative gradients. Glass may appear where it adds genuine depth — not as a brand statement.

## Design Principles

1. **Clarity before decoration.** Every visual choice reduces cognitive load or it doesn't belong. Staff act on time pressure. The UI must never slow them down with ambiguity or visual noise.

2. **Confidence through structure.** Predictable layouts, consistent component behavior, and clear hierarchy give staff certainty. They should never wonder where to look or what will happen when they click.

3. **Efficiency is the experience.** Reduce clicks, surface the right action at the right moment, batch repetitive tasks. If a workflow takes five steps, ask whether it can take three.

4. **Professional restraint.** The clinic environment is serious. Motion is purposeful and brief. Color is used to signal meaning (status, urgency, category), not to decorate. Glassmorphism is a depth cue, not a style identity.

5. **Bilingual fluency as a first-class constraint.** Arabic and English coexist. Every design decision is validated in both directions: does this label work in Arabic? Does this layout hold in RTL? Typography, spacing, and icon placement must answer yes for both.

## Accessibility & Inclusion

WCAG 2.1 AA minimum. All interactive elements are keyboard accessible. Color is never the sole conveyor of meaning (status badges always include a label). Contrast ratios meet AA at minimum.

RTL support is not optional — it is a core feature. All spacing, alignment, and directional icons must flip correctly when the language context is Arabic.

Reduced motion: respect `prefers-reduced-motion`. Transitions are functional, not cinematic.
