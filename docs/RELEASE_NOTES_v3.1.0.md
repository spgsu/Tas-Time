# Tas-Time 3.1.0

This release makes it clearer how jobs, optional phases and tasks fit together, and makes creating and scheduling work easier on desktop and phones.

## What changed

- Visible Add task buttons in Plan, job/phase editors, Today and each Week day column; a clickable Add phase button.
- Explicit Job and Phase selectors for quick add, with correct phase preservation when a job code names the same job.
- Phase labels, task counts, indentation and collapse controls, plus a visible job filter with All jobs and Edit job.
- A readable mobile Plan list with full task names and dates, optional timeline, readable save status, and menu access to jobs, help and appearance.
- Resolve blocker actions and clear feedback when blocked cards cannot move.
- Consistent Forecast start / Forecast finish wording, including calendar exports, with explicit confirmation of a baseline's book-wide scope.
- Updated offline guide and README.

## Behavior changes

- **Effort requires units:** use `10h`, `45m` or `1h30`. Bare numbers in effort fields are rejected rather than guessed. Existing saved estimates are unchanged.
- **Quick add schedules only with `@day`:** this is consistent across all views. Use Add task for today or a Week day's Add task button to schedule directly.
- **On hold and Complete pause a job in Today and Week.** Its tasks remain in Plan and Board, and notes remain accessible. Set the job to Active to resume. Completing with unfinished tasks asks for confirmation.
- Ambiguous job shortcuts are rejected; choose the destination selector or use a unique full code.
- Forecast finish is an expected date, not a separate fixed deadline. Existing dates and the planning-book format are unchanged.

## Downloads

- **Windows:** extract Tas-Time-Windows.zip and run Open Tas-Time.cmd.
- **macOS:** extract Tas-Time-macOS.zip; first launch, right-click Open Tas-Time.command and choose Open.
- **Single HTML:** open Tas-Time.html in Edge or Chrome.

Your existing planning-book JSON files continue to work. Replace the application files, then open your existing book.

## Validation

30 unit tests and 36 real-browser checks passed, including creation through job → phase → task, future-week scheduling, pause/reactivate behavior, blocker resolution, mobile controls, file saving and recovery. Desktop, phone and dark-mode screenshots reviewed.
