# Noa Invest — Scroll Craft integration notes

## Goals
- Improve scanability for Harel's executive review and Rami's dispatch workflow.
- Add smooth document navigation and optional reveal motion without changing data/API behavior.
- Keep all important content visible when motion is disabled or JavaScript is unavailable.
- Preserve Hebrew RTL, safe-area handling, and touch-friendly interaction.

## Adoption checklist
- [ ] One primary task per screen, with status and next action visible early.
- [ ] Status uses text/icon in addition to color.
- [ ] Expand/collapse interactions communicate their state and remain keyboard operable.
- [ ] Delivery note canvas and signature controls are not animated in ways that impair precision.
- [ ] Mobile controls respect safe-area insets and have comfortable touch targets.
- [ ] prefers-reduced-motion leaves all content visible and removes smooth scrolling.
- [ ] Test the production build and existing tests after each integration change.

## Upstream
https://github.com/nateherkai/scroll-craft
