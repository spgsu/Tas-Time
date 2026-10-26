# UX remediation action log — 2026-10-26

Scope: implement all ten findings from the critical UX review. No release publication requested.

## Decisions

- Retain the existing saved date model. Label expected task dates consistently as Forecast start / Forecast finish. A fixed deadline field is not introduced or inferred from existing dates.
- Keep paused and completed jobs accessible in Plan, Board and Notes; exclude their tasks from Today and Week until reactivated. Preserve all dates and work.
- Give global quick add the same scheduling behavior in every view: only an explicit `@day` sets a work day. Day-specific buttons schedule directly.

## Actions

1. Inspected the model, parser, creation commands, drawers, views, mobile styles, file handling, documentation and existing tests.
2. Made Plan's task-entry controls permanently visible and explicitly named them Add task. Added task creation to job/phase editors and Today/Week day columns.
3. Added explicit Job and Phase selectors beside quick add, plus a structured Add task path. Preserved a phase when `#job` names the same job; cleared it only when incompatible with the destination.
4. Added phase labels, task counts, indentation, collapse controls and a Job → Phase → Task explanation with a concrete example.
5. Rejected ambiguous job abbreviations instead of silently choosing the first matching job.
6. Required effort units, removing the discontinuity where 9 meant hours but 10 meant minutes. Existing saved estimates remain unchanged.
7. Renamed date labels, task chips, calendar event summaries and help text to Forecast finish. Kept calendar event identifiers stable.
8. Rejected blocked-card moves consistently and added Resolve blocker. Blocked remains derived from constraints and prerequisites.
9. Added a visible job filter banner with All jobs and Edit job, plus accessible navigation in the mobile menu.
10. Implemented paused/completed-job behavior and confirmation when completing a job with unfinished tasks.
11. Added a mobile Plan task list with readable titles/dates and an optional timeline. Restored readable save status and exposed help, appearance and job controls through the menu.
12. Made the baseline action explain and confirm its book-wide scope.
13. Updated README and the offline tutorial to match the new workflows.
14. Added regression tests for parser ambiguity, explicit effort units, phase preservation and job pausing/reactivation.
15. Reviewed refreshed desktop, phone and dark-mode screenshots. Corrected inherited white text in the destination selectors; reduced mobile toolbar height so tasks appear sooner.
16. Added a clickable Add phase button alongside Enter. Extended browser coverage through job → phase → task creation, phase collapse, selector/button creation, future-week and Today scheduling, paused-job restoration, completion cancellation, blocker resolution and phone controls.

## Validation

- Initial build succeeded (27 modules).
- Initial unit suite: 30/30 passed.
- PowerShell's npm script shim is disabled by local execution policy; used the standard `npm.cmd` launcher without changing policy.
- Browser suite could not initialize inside the sandbox. Retried with approved escalation to run the existing headless Edge/Chrome suite.
- Updated the existing autosave fixture to explicitly use `@today`, matching the new consistent quick-add behavior. Updated calendar assertions for Forecast finish labels.
- Final build succeeded; rebuilt `dist/Tas-Time.html` with the updated offline guide.
- Final unit suite: **30/30 passed**.
- Final real-browser suite: **36/36 passed**, including all five new UX scenarios and phone overflow checks across all five views. No page errors.
- Reviewed final desktop, dark-mode and phone screenshots under `.e2e/`; no horizontal page overflow at phone width.
- `git diff --check` passed (Git emitted existing line-ending normalization warnings).
- No saved-book schema change, no deletion of user work, and no publishing or release upload performed.

## Release preparation — user authorized commit, push and release

- Checked origin and GitHub releases: main was current; latest published version was 3.0.1.
- Bumped version to 3.1.0 for the new UX workflows and behavior changes.
- Added release notes covering explicit effort units, consistent quick-add scheduling, forecast dates and job pausing.
- Packaged the Windows ZIP, macOS ZIP and standalone HTML for 3.1.0. Verified ZIP CRCs, matching embedded HTML, version text and macOS launcher permissions.
- Re-ran 30/30 unit tests and 36/36 browser checks against 3.1.0.
- An intermittent blocker-resolution test failure prompted full assertion diagnostics and explicit waits for asynchronous focus/render completion. The final run passed with three consecutive blocker-resolution cycles in that scenario; packaged application bytes remained unchanged.
- Commit and publication target: `v3.1.0` on main, with all three downloads and the checked-in release notes. Publication URL and commit result are recorded in the local activity log after verification.
