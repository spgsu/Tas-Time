# Tas-Time 3.2.1

Tas-Time now reopens where you left off.

## What changed

- **Resume where you left off.** With the recovery copy on (the default), reopening Tas-Time in the same browser restores your last book and its file link, plus the view, selected job, week, notes page, filters and the open task or job panel. The browser may ask you to **Reconnect** once before saving to the linked file again.
- Opening a file now asks for write access straight away, so autosave starts without a separate Reconnect.
- The recovery copy is also saved when the window is hidden or closed, not only after edits.
- **Edge that clears browsing data on exit.** If an Edge policy (`ClearBrowsingDataOnExit`) erases site data whenever Edge closes, the Windows launcher and desktop shortcut use Chrome instead, when it is installed. Otherwise they warn that Tas-Time cannot resume in that browser.

## Upgrading

No change to the book format (still format 4). Replace the application files. **On Windows, run Create Desktop Shortcut.ps1 again** so your existing shortcut picks up the browser change. The first launch in a different browser starts empty: open your book once and it will resume from then on.

## Downloads

- **Windows:** extract Tas-Time-Windows.zip and run Open Tas-Time.cmd.
- **macOS:** extract Tas-Time-macOS.zip; first launch, right-click Open Tas-Time.command and choose Open.
- **Single HTML:** open Tas-Time.html in Edge or Chrome.
