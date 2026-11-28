# Design system

This file holds aesthetic tokens, accessibility rules and the user-facing copy contract. `GLOSSARY.md` holds domain concepts only.

## Direction and references

- Build an AI-first operational console for solo developers, SREs, DevOps and infrastructure engineers. Lead with work that needs attention.
- Keep the dark Graveshift palette. Use the theme as subtle personality; keep the interface calm, legible and information-dense where it helps.
- Decide the workflow, content and states before selecting a template. Start pages with an Astryx template; use Astryx components and custom work where needed. Keep AI SDK UI and AI conversation components visually consistent with Astryx.
- Treat [shadcn.io AI blocks](https://www.shadcn.io/ai-block) and [AI UX Playground](https://aiuxplayground.com/) as priority references for agent UI and UX. Check accessibility and licensing before adapting source; a reference does not establish product capability.
- Use [AI Agent Workspace Dashboard](https://dribbble.com/shots/27865197-AI-Agent-Workspace-Dashboard) and [GoPilot](https://dribbble.com/shots/27841086-GoPilot-AI-Agent-Workspace-SaaS-Dashboard-Design) as visual references for **General → Agent**.
- Video and advertising motion guidance lives in [MOTION.md](MOTION.md).

## Agent workspace

- **General → Agent** opens the full-screen Agent Workspace with direct access to its composer. The global right-side sheet shows only the conversation component; it does not show a second content panel.
- In full-screen mode, use a contextual right panel for task progress, evidence or selected outputs when useful. It must be possible to return to the conversation without losing context.
- Use the [chat-artifact pattern](https://aiuxplayground.com/pattern/chat-artifact) for substantial outputs such as charts, spreadsheets and PDF reports. Link each output to its conversation; allow inspection and an appropriate export action. These are design targets, not claims of implemented generators.
- Show safe progress, tool calls and results, and requests for human input. Require a specific human approval for each mutation initiated through the Agent Workspace. Fix now and auto-fix are separate backend mechanisms governed by their own policy and trigger rules.
- Suggest current-page context in the composer; add it only when the Account selects **Inject context**. Scope conversations and context to the Account and Project.
- Present sample data as sample data. Label unavailable features and never imply that fixture actions affect a real system.

## Workflow designer

- Use the [agent workflow block](https://www.shadcn.io/blocks/ai-agent-workflow) as a priority visual reference for a future incident-workflow designer.
- Place **Workflows** under **General**, next to **Agent**, with a workflow list and a detail/editor page.
- Design from a default incident workflow and a small catalog of typed, approved steps. Owners can draft and publish valid, Project-scoped workflow versions; members can inspect workflows and run permitted actions. Existing runs keep the version they started with; new runs use the published version. These are intended capabilities, not existing API features.
- Make each step, status, input, output and failure understandable. Show validation and publish confirmation before a configuration takes effect.
- Present policy, authorization, audit and human-approval requirements as safeguards outside the editable workflow. A workflow cannot grant its own permissions.

## Palette

| Token | Hex | Meaning |
| --- | --- | --- |
| Night | `#0b0f14` | Background |
| Ectoplasm | `#7CFFB2` | Healthy |
| Pumpkin | `#FF7A1A` | Warning |
| Blood | `#E5484D` | Critical |

Neutral surface and text tokens:

| Token | Hex | Meaning |
| --- | --- | --- |
| Crypt | `#10151c` | Card and panel surface |
| Mist | `#232d3a` | Borders and hover surface |
| Bone | `#e6edf3` | Primary text |
| Fog | `#a3adbb` | Secondary text |

Check actual foreground and background pairs against the accessibility targets below. Status colours never carry meaning alone. In particular, Blood on Mist does not meet 4.5:1 for normal text.

## Voice

Clear, direct and calm. Use familiar operational terms in navigation, labels and actions. Themed language may add personality in supporting copy, but must not obscure meaning.

## Accessibility

- Text contrast at least 4.5:1.
- Respect `prefers-reduced-motion`.
- No flashing animation.
- Support keyboard use, visible focus and accessible names. Use text as well as colour for status.

## Term table

Internal term | Displayed (EN) | Displayed (VI) | Plain meaning (EN)
--- | --- | --- | ---
service | Service | Dịch vụ | A watched service
healthy | Healthy | Khỏe mạnh | Service is healthy
incident | Incident | Sự cố | An incident
crash loop | Crash loop | Vòng lặp lỗi | Repeated restarts
OOM | Out of memory | Hết bộ nhớ | Out-of-memory termination
fix PR | Draft pull request | Yêu cầu kéo bản nháp | Draft pull request with a fix
approve | Approve | Phê duyệt | Approve a runtime action
reject | Reject | Từ chối | Reject a runtime action
silence | Silence | Tạm ngừng cảnh báo | Silence signals for a service
postmortem | Postmortem | Báo cáo sau sự cố | Postmortem report
dashboard | Overview | Tổng quan | Project overview
organization identity model | Organization | Tổ chức | The group that owns Projects and Memberships
project | Project | Dự án | A Project within an Organization
work item | Work item | Mục công việc | The record for triage and fix work
deployment | Deployment | Lần triển khai | A commit deployed into an Environment
agent workspace | Agent Workspace | Không gian làm việc với tác tử | The chat surface for work with Agents
diagnosis | Diagnosis | Chẩn đoán | Stated root cause with evidence and confidence
audit log | Audit chain | Chuỗi kiểm toán | Ordered, tamper-evident record of decisions
agent | Agent | Tác tử | An AI agent in the crew

## Responsive rules

- Supported widths: 375 px (mobile), 768 px (tablet), 1024 to 1440 px (desktop). Layout uses CSS breakpoints only (`sm:` 640, `lg:` 1024, `xl:` 1280); no `window.innerWidth` state.
- Use one column when space is narrow. In full-screen Agent Workspace, place contextual content beside the conversation only when both remain usable; otherwise use a full-height overlay.
- Content width caps at `max-w-7xl`. Long values (commands, branch names) scroll inside their block with `overflow-x-auto` instead of widening the page.
- Every control stays reachable below 1024 px, including navigation, the composer and approval actions.

## Icon vocabulary

- Show status with a text label. Colour and icons can support the label but do not replace it.
- No Unicode glyphs or emoji as icons (`✓`, `→`, `☠`). Separators in UI text are commas.
- When icons are needed, add one concept-keyed registry (`ICON.<concept>`, for example `ICON.incident`, `ICON.healthy`, `ICON.fixPr`) in a shared UI package, keyed by the internal terms of the Term table. Icons are `aria-hidden`, and icon-only buttons carry an `aria-label`. Do not add per-component icon sets.
