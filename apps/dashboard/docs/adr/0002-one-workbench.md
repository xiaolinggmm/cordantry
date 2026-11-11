# One Workbench Replaces Three Company Pages

Status: accepted

After creation, the founder works in one Workbench. It has a left rail and three-column pages. It replaces Department Workspace, Company Operating Dashboard and Company Operations. The layout of CEO Office was chosen from three prototypes on the `prototype/ceo-office-layout` branch: conversation, three-column and inbox. The three-column layout won, because the things that need the founder stay in view while the conversation with the CEO stays central.

## Context

The three legacy pages overlapped. Counts of blocked work, Human Actions and Wait States appeared on all three. Task lists appeared on all three, but only one page had actions. Replan was split across pages: the founder requested a replan on the department view and confirmed it only on Operations. The Dashboard was mostly read-only. Its proof loaded only after a button press and covered only the first task, and its "Approvals" panel was a placeholder. A shared retro menu bar held commands that the new company lifecycle (ADR 0044) removes or moves.

## Decision

**Structure**

- **Left rail**, from top to bottom:
  - company name and status;
  - CEO Office;
  - each department, with its name and Founder action count;
  - Company Status, Deliverables and Settings.
- **Header**: current location, Pause Company or Resume Company, and a quick language switch.
- **Removed**: the menu bar, the command palette, fullscreen, skins and CRT. Commands move to the rail, the header or Settings. The Agents menu and the manual Load Proof and Load Review commands go away, because Deliverables loads by itself.
- **Settings**:
  - the current company, with its status and Stop Company, confirmed by typing the name;
  - all companies, with switching and Create New Company. The Onboarding Wizard opens with a Cancel button when a company already exists;
  - the interface language.
- **Startup**: the app opens the last company, then the most recently updated `active` company, then the Onboarding Wizard when no company exists. There is no company picker page.

**CEO Office (three columns)**

- **Center column**, with tabs:
  - **Timeline**: today's CEO Office Items. Each item links to its department page.
  - **Plan**: a React Flow canvas. It shows objectives, Departments and Assignments. Assignments follow Company Plan `order` and show business dependencies, status and Direction grouping. It can be panned and zoomed. It does not show MAH Tasks, Work Queue objects or execution traces.
  - **Outcomes**: every outcome card, the same cards that are posted into the timeline as each outcome completes. A stopped company opens on this tab, with the Final Founder Report pinned first.
- **Composer**: docked at the bottom of the center column. It is text only.
- **Right column, "Needs you"**: overview counts, then the cards for reviews, decisions, Human Actions and new plans. On narrow screens it becomes a collapsible section above the timeline.

**Department page (three columns)**

- **Header**: the Department responsibility in Founder-facing Plain Language.
- **Center column**: each Department Assignment as an Assignment Card. The card shows the title, expected outcome, Assignment Business Status, Assignment Stage, upstream dependencies, accepted result and available Founder action. A completed card shows the result summary, key findings, completed outcome, limitations, recommended next action and a plain-language explanation of what supports the result. It does not show an Agent, MAH Task, Attempt, Session, tool call, raw log, internal code or internal evidence reference.
- **Assignment order**: actionable Assignments first. Within one status, cards use the Company Plan `order`. Completed and stopped cards follow active work. Dependencies use business titles, not IDs. Display order does not change business priority.
- **Department composer**: sends a Department Intake (root ADR 0046).
- **Right column**: this department's "Needs you" items.

**Assignment Card interaction**

- A running Assignment Card updates its business status and stage.
- A completed card keeps the accepted business result visible.
- A stopped card shows one plain-language reason and available business actions.
- A card does not show runs, steps, retries, MAH Tasks or raw logs.

**Visual language**

- **Task and company status colors** follow the Ice Mist color system, section 6 ([`docs/design/color-system.md`](../../../../docs/design/color-system.md)), which replaced the earlier palette on 2026-10-14. Color says state only: review and needs-you share charcoal "your turn" and differ by icon and text, paused and stopped are neutral, and amber is not used.
- **Internal codes and execution details** never appear in the Founder Workbench. Internal diagnostic interfaces retain them outside the Founder UI.
- **Copy** follows root ADR 0045.

**User terms**: internal terms are never shown. These are the founder words:

| Internal term | Founder words (zh / en) |
| --- | --- |
| Business Artifact, Task Deliverable | 交付文件 / deliverable file, or the specific thing, such as "产品简介" |
| Human Action | 需要你操作 / needs your action |
| Founder Decision | 需要你决定 / needs your decision |
| CEO review | 需要你审核 / needs your review |
| Replan Proposal | 新计划 / new plan |
| Wait State | 在等待 + what it waits for / waiting for … |
| Evidence surface | 交付物 / Deliverables |
| Company Status | 公司状态 / Company Status |
| Hold, Affordance, Envelope | never shown |

**Delivery**

- The order is:
  1. P1, a refactor with no visual change, together with root ADR 0044;
  2. P2: the shell, Settings, Company Status and Deliverables;
  3. P4 CEO Office, together with root ADR 0046 for CEO Intake;
  4. P4 department pages, together with Department Intake;
  5. P5, which removes CRT, skins, Retro UI and legacy CSS, together with root ADR 0047.
- Root ADR 0045 can land at any point.
- P2 delivered, as the founder decided on 2026-10-12:
  - The modern shell frames CEO Office and the department pages, whose content stays Retro UI until P4. Each page is either all legacy or all modern; the shell is a frame around them, and it has no CRT.
  - CRT, skins and fullscreen were removed in P2, ahead of P5. One fixed palette remains for the Retro components that P4 replaces.
  - Two keyboard shortcuts remain, Cmd+Enter in the Onboarding Wizard and Shift+Cmd+K for Pause and Resume, and both read the shared command model. The menu shortcuts went with the menu.
  - The Operating Dashboard was removed in P2. Its proof and reviews moved to Deliverables, and its business state moved to Company Status.
  - New plans are requested and confirmed on Company Status until P4 moves them to the department page.
  - At startup, with no remembered company, companies are ranked by status (`active`, `paused`, `creating`, `stopped`, then `creation_failed`) and then by most recent update. The Onboarding Wizard opens only when there is no company.
  - A failed creation is never a dead end. Its page offers Stop and abandon, confirmed by the company name, and a way back to another company, or Create New Company when there is none.
- P4 CEO Office delivered, as the founder decided on 2026-10-13:
  - The timeline shows the latest day with any item, which is today while the company works. Earlier days fold into one line each and open on demand, so the page is never empty.
  - "Needs you" has cards for reviews, decisions, Human Actions, new plans, and tasks only the founder can move ("Waits on you", opening the department page). Waits, and stuck tasks the runtime can still handle, are counted in the overview but have no card. The rail counts the same list.
  - The plan card names the goals and key results. The Plan tab shows them above the canvas, and a card is posted when a key result is met (root ADR 0048). The Outcomes tab lists what is still missing from the vision.
  - The Chinese name of CEO Office is "CEO 办公室".
  - A card opens the item in a dialog, which is the one place to act on it. Timeline cards and "Needs you" cards open the same dialog.
  - A new plan card links to Company Status until the department page takes new plans.
  - Business content is shown in the company locale. The interface language changes only the chrome (root ADR 0013).
  - The founder's own message and the CEO's answer are their own timeline cards (root ADR 0046).
  - The Founder Vision is shown once, above the tabs.
- P4 department pages delivered, as the founder decided on 2026-10-13. The Company Plan cutover replaces their old Task traces with Assignment Cards. New plan items open the related Assignment. The department's "Needs you" list is the CEO Office list filtered to that Department.
- P5 legacy CSS removed on 2026-10-14:
  - `styles.css` no longer uppercases buttons and headings, sizes headings or squares off controls, and the legacy tokens are gone. Every heading sets its own size and line height, so the `modern-dashboard-shell` opt-out and the `normal-case` classes went with them.
  - Every focusable element shows the Ice Mist focus ring unless it styles its own focus. The legacy focus rule read tokens that no longer existed, so it removed focus outlines altogether.
  - Root ADR 0047, the agent execution trace, is still to come.
- The P4 steps run on a short-lived branch that is rebased often and merged once, so no page is delivered half legacy and half modern (ADR 0001).

**Company Plan cutover verification**

- Verify Chinese desktop, English desktop and Chinese narrow-screen layouts in a real browser.
- Verify basic keyboard navigation and screen-reader names.
- Cover Creation Loading, Department navigation, Assignment Cards, Company Status, MAH installation guidance and restart recovery.
- Confirm that no Founder surface shows an internal code, raw enum, MAH object, internal identifier, stack trace or raw log.

## Considered Options

- **Migrate the three pages one to one.** Rejected: it rebuilds the Dashboard only to delete it.
- **Conversation layout** for CEO Office. Rejected: items that need the founder scroll away.
- **Inbox layout** for CEO Office. Rejected: it hides the CEO conversation behind a tab.
