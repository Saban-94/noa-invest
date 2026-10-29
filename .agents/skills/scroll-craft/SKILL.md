---
name: scroll-craft
description: Apply Scroll Craft UI/UX principles to the Noa Invest logistics PWA: clear hierarchy, meaningful motion, responsive composition, accessible smooth scrolling, and verified interaction states.
---

# Scroll Craft for Noa Invest

Use this skill when changing UI, UX, navigation, dashboard cards, order details, delivery-note review, or motion in this repository.

## Product context

This is a Hebrew, RTL logistics PWA used on phones and desktop. It supports two different work modes: executive review and dispatch operations. Preserve operational clarity and fast access to records; animation must never delay approvals, obscure totals, or make tables harder to scan.

## Design workflow

1. Identify the user, task, and decision that the screen supports before styling.
2. Establish one clear visual hierarchy: status and decision first, supporting evidence second, secondary actions last.
3. Prefer compact executive cards for approvals and readable, dense-but-spacious operational lists for dispatch.
4. Give each screen one clear visual focal point. Avoid decorative animation, excessive glass effects, and generic gradients that compete with logistics data.
5. Design mobile layouts intentionally for iPhone Safari and Android Chrome, including safe areas, touch targets, sticky controls, and long Hebrew labels.
6. Use motion to explain cause and effect: reveal expanded order details, show state changes, and orient users after navigation. Never animate critical status values in a way that hides or delays them.
7. Keep semantic HTML, keyboard focus, contrast, and RTL reading order intact.
8. Respect prefers-reduced-motion; all content must remain visible and usable without animation.
9. Verify desktop and mobile widths, keyboard navigation, reduced motion, and the app's existing data workflows before calling a change complete.

## Smooth scrolling and reveal utilities

- Global document scrolling is smooth unless the user requests reduced motion.
- Use data-scroll-reveal only on non-critical, below-the-fold content where a subtle entrance improves orientation.
- Do not add reveal attributes to approval controls, status labels, totals, form fields, loading/error messages, or delivery-document canvases.
- Use data-scroll-stagger only for short groups of decorative or informational cards, not long data tables.
- Prefer native scrolling and CSS transitions. Avoid scroll hijacking, forced scroll snapping, and continuous parallax in operational screens.
- If a user has reduced motion enabled, do not hide content or run reveal transitions.

## Implementation conventions

- Shared CSS lives in src/styles/scroll-craft.css.
- The reveal observer lives in src/lib/scroll-craft-motion.ts.
- Existing routes opt into reveal behavior by adding data-scroll-reveal to suitable non-critical elements.
- Keep this skill and its project-specific guidance in sync with the upstream Scroll Craft project: https://github.com/nateherkai/scroll-craft
- The upstream project is MIT licensed. If copying or redistributing its source files, preserve its copyright and license notices. This local skill is project guidance, not a copy of the upstream engine.
