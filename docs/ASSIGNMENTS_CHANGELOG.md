# People and assignment reports — action log

## 2026-10-26 — implementation

- Scope: structured task assignees, separate contacts, reports across jobs, CSV/print output and capacity per person. Workflow-template design remains a future step.
- Added planning-book format 4 with stable person IDs, a My work person, default weekly capacity, task assignee references and individual weekly overrides.
- Older versions upgrade without guessing names from owner/contact text. Existing tasks stay in My work, previous text stays in Contacts, and existing notes and capacity are preserved.
- File opening and recovery upgrades request saving a new copy, preserving the original file for older versions of the app.
- Added a People & capacity editor, task assignee selector, assignment labels and a sixth Assignments view.
- Added person/status/work-week/job/search filters, grouping by job/person/status/week, workload totals, unassigned work, CSV export and print report.
- Today and Week select a person (default My work). Day-specific creation inherits that selection. Each person's capacity covers that person's active scheduled tasks across jobs; unassigned work is displayed separately.
- Added core regression tests for identity, validation, migration, undo, workload separation, report filters and CSV quoting/formula safety.
- Added an explicit Assignee selector to global quick add and its preview, preserving the selected destination for both Enter and Add task.
- Reviewed desktop and phone screenshots; corrected crowded phone navigation, collapsed report filters on phones and added work-day details to report entries.
- Corrected a capacity edge case: shared week notes no longer override someone's default availability. Legacy weekly capacities become explicit overrides during migration.
- Added a browser print-layout check and independent Python CSV parsing for the selected report.
- Final validation: **38/38 unit tests and 38/38 real-browser checks passed**, including explicit quick-add assignees and print-layout assertions. No page errors; all six views passed phone overflow checks.
- Independently parsed the exported CSV with Python's CSV reader: exactly two David assignments across two jobs, with Contacts preserved and other people's tasks excluded.
- Reviewed final desktop, phone and print screenshots (`.e2e/06-assignments.png`, `.e2e/m6-assignments-phone.png`, `.e2e/p6-assignments-print.png`).
- Updated README and the offline tutorial; rebuilt `dist/Tas-Time.html`. `git diff --check` passed (existing line-ending warnings only).
- No workflow templates, shared editing, messaging or notifications added in this slice. No commit, push or release performed for this feature.

## Commit and push

- User subsequently requested committing and pushing this feature to main.
- Rechecked the working tree, patch whitespace and remote branch before staging the implementation, built HTML, documentation and regression tests.
- Validation remains 38/38 unit tests and 38/38 browser checks. No application changes since those checks. No release requested in this step.

## Release preparation — v3.2.0

- User requested a release. Bumped the application version to 3.2.0, rebuilt the HTML and added release notes with format 4 upgrade instructions.
- Re-ran validation: 38/38 unit tests and 38/38 real-browser checks passed.
- Packaged Windows, macOS and standalone HTML downloads. Independently checked ZIP CRCs, matching bundled HTML, version strings and macOS launcher executable permissions.

## Release — v3.2.1

- Resume the last session: the recovery copy now stores view state (view, job, week, notes page, filters, open panel). Damaged or old view data falls back to the defaults.
- Write access is requested when a file is opened. The recovery copy is flushed on pagehide and when the window is hidden.
- Launchers switch to Chrome when an Edge `ClearBrowsingDataOnExit` policy would wipe the recovery copy on every exit.
- Validation: 40/40 unit tests and 41/41 real-browser checks passed, including the relaunch-restore check.

## Release — v3.2.2

- Closing warns while a linked file lacks the latest edits (e.g. waiting on Reconnect), even when the recovery copy holds them. An up-to-date file closes quietly.
- The e2e harness accepts leave prompts. The guide scroll check waits for the pane to move before treating the scroll as settled.
- Validation: 41/41 unit tests. Browser checks pass apart from an existing intermittent guide-scroll failure in headless Edge, which also occurs without this change.

## Release — v3.3.0

- Repeating tasks (spawn on completion), task checklists, Finish the day review, and rolling browser backups (10 per book, 15-minute gap, tied to the recovery setting).
- Real-browser checks found and fixed two bugs before release: a backup deadlock (a chain step awaited its own chain) and a missing Finish the day confirmation.
- Validation: 48/48 unit tests and 45/45 real-browser checks passed. Reviewed screenshots of the task editor, Finish the day and Backups.

## Release — v3.4.0

- Last Planner: constraint log with ball in court (linked to tasks; open entries block them), Lookahead view with Lookahead, Ball in court and PPC tabs, and weekly commitment from Week.
- Found and fixed before release: 27px phone overflow in Lookahead (grid items not shrinking), PPC chart stray scrollbar and misaligned stat cards, and Ready labels hidden in print.
- Validation: 56/56 unit tests and 47/47 real-browser checks passed. Reviewed screenshots of all three Lookahead tabs.

## Release — v3.4.1 (hardening)

- Reproduced before fixing: autosave overwrote a linked file saved elsewhere. Writes now check the file's state first; conflicts stop autosave and offer three resolutions, with the unchosen version backed up.
- Second-window warning (checked in a real browser with two windows), guarded view rendering, undo history capped by size (measured 1.35 GB → ~200 MB at 10,000 tasks), date-validation memo (validate ~97 → ~29 ms at 10,000 tasks), backups capped to 20 books, and a redraw when the date changes.
- A table of 26 damaged or hostile files: all refused with readable messages and no crashes. Hostile titles and log subjects render as text.
- Found while validating the release: the recovery copy's 400 ms debounce was postponed indefinitely by continuous renders. It now runs at least every 2 s; the browser check that exposed it (by reading too soon) now waits for the write.
- Validation: 64/64 unit tests, and 51/51 real-browser checks passed in three consecutive runs.
