# Tas-Time 3.4.1

A hardening release: no new features, safer saving.

## What changed

- **Edits saved elsewhere are never overwritten.** If your book file is saved from somewhere else (another computer through OneDrive or Dropbox, or a second Tas-Time window), autosave now stops instead of overwriting it, and the status shows *changed elsewhere*. Choose **Show the file's version**, **Keep this window's version** or **Save as a new file**. The version you don't choose is kept in **⋯ → Backups**. When you return to the window with no unsaved edits, a newer file loads automatically. Previously, the next autosave could silently replace the other edits.
- **Recovery copy kept current during continuous work.** It was only written after a pause in activity, so a crash during steady typing could lose the most recent edits. It is now written at least every 2 seconds.
- **Second-window warning.** Opening the same book in two Tas-Time windows shows a warning in both.
- **No blank screen on a drawing error.** If a view fails to draw, it shows what happened and offers Go to Today or Undo. Your book is untouched.
- **Large books use much less memory.** Undo keeps fewer steps for very large books (never fewer than 20). A 10,000-task book used about 1.35 GB of undo history and now uses about 200 MB. Edits on large books are also faster.
- **Backups are capped** at the 20 most recently used books.
- **Left open overnight**, Today and Week move on to the new day and week.

## Upgrading

No change to the book format. Replace the application files.

## Downloads

- **Windows:** extract Tas-Time-Windows.zip and run Open Tas-Time.cmd.
- **macOS:** extract Tas-Time-macOS.zip; first launch, right-click Open Tas-Time.command and choose Open.
- **Single HTML:** open Tas-Time.html in Edge or Chrome.
