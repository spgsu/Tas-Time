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
