# Tas-Time 3.2.0

Assign tasks to people, see their work across jobs, and plan against each person's available time.

## What changed

- Add and manage people in **Assignments → People & capacity**. Rename Me to your name while keeping that person's work as My work.
- Choose one assignee for each task, or leave it unassigned. Contacts / consulted and task notes remain separate. Quick add also has an Assignee selector.
- Use the new **Assignments** view to filter work by person, status, scheduled week, job or search text, and group it by job, person, status or week.
- Export the selected assignments as CSV or print a report, including contacts and notes.
- Select whose work appears in Today and Week. Each person's capacity includes their active scheduled work across all jobs, with normal availability and weekly overrides. Unassigned work appears separately.
- Updated README and the offline beginner's guide.

## Existing planning books

This release uses **book format 4**. Older books upgrade when opened: existing tasks stay in My work, owner/contact text stays in Contacts, and notes and weekly capacity are preserved.

**Save the upgraded book as a new file.** The original is preserved; older apps that only support format 3 cannot open the upgraded file. These assignments belong to one local planning book; no emails or notifications are sent.

## Downloads

- **Windows:** extract Tas-Time-Windows.zip and run Open Tas-Time.cmd.
- **macOS:** extract Tas-Time-macOS.zip; first launch, right-click Open Tas-Time.command and choose Open.
- **Single HTML:** open Tas-Time.html in Edge or Chrome.

Replace the application files, then open your planning-book JSON file.

## Validation

38 unit tests and 38 real-browser checks passed, including assignment filters and exports, per-person capacity, migration, saving, recovery, and phone and print layouts. Desktop, phone and print screenshots were reviewed during feature validation; the CSV was also parsed independently with Python.
