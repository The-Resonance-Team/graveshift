# Design system

This file holds aesthetic tokens, accessibility rules and the user-facing copy contract. `GLOSSARY.md` holds domain concepts only.

## Palette

| Token | Hex | Meaning |
| --- | --- | --- |
| Night | `#0b0f14` | Background |
| Ectoplasm | `#7CFFB2` | Healthy |
| Pumpkin | `#FF7A1A` | Warning |
| Blood | `#E5484D` | Critical |

## Voice

Playful and spooky, never cryptic. Use the pattern “themed phrase — plain meaning”. Every themed label has a plain tooltip.

## Accessibility

- Text contrast at least 4.5:1.
- Respect `prefers-reduced-motion`.
- No flashing animation.

## Term table

Internal term | Displayed (EN) | Displayed (VI) | Plain meaning (EN)
--- | --- | --- | ---
service | Grave | Ngôi mộ | A watched service
healthy | Resting in peace | Đang yên nghỉ | Service is healthy
incident | Haunting | Ám ảnh | An incident
crash loop | Restless spirit | Hồn không yên | Repeated restarts
OOM | Drained by a leech | Bị ma sóc hút sạch | Out-of-memory termination
fix PR | Exorcism | Lễ trừ tà | Draft pull request with a fix
approve | Bless | Ban phước | Approve a runtime action
reject | Banish | Trục xuất | Reject a runtime action
silence | Salt line | Vòng muối | Silence signals for a service
postmortem | Autopsy | Khám nghiệm | Postmortem report

## Responsive rules

To be specified when the dashboard is built. Breakpoints must be recorded here before component work starts.

## Icon vocabulary

To be specified when the dashboard is built. Use one concept-keyed registry; do not add per-component icon sets.
