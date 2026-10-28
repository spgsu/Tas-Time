# Tas-Time 3.4.0

Last Planner for design and construction work: make work ready before it is due, see who holds the ball, and measure how reliably weekly plans are kept.

## What changed

- **Constraint log.** Log what stands in the way of work: constraints, RFIs, submittals, approvals and information requests. Each entry gets an automatic number per job (RFI-001, SUB-001…) and has a ball in court (who acts next; earlier names are suggested), sent and response-due dates, notes, and the tasks it holds up. One entry can hold up several tasks. Those tasks stay blocked, and can't be marked done, until the entry is **Cleared**. Add entries from a task's editor or from Lookahead.
- **Lookahead view (key 7).** The next 3, 4 or 6 weeks of open work, each task marked **Ready** or listed with its open constraints. Overdue responses, and responses due after the work is meant to start, are flagged.
- **Ball in court.** Open entries grouped by who has to act, most overdue first, with **Export CSV** for an RFI and submittal log and **Print**.
- **Weekly commitment and PPC.** **Commit this week** in Week records the planned tasks. Percent Plan Complete counts those finished by Sunday. The **PPC** tab shows this week, a 12-week trend, the average of finished weeks, and a reason for each missed task, so the most common causes of a missed plan are visible.
- The example book now includes an overdue approval, an open question and a cleared RFI.

## Upgrading

No change to the book format (still format 4). Existing books open with an empty log. Older 3.x apps can open books saved by 3.4, but they don't show the log and won't block tasks with open entries.

## Downloads

- **Windows:** extract Tas-Time-Windows.zip and run Open Tas-Time.cmd.
- **macOS:** extract Tas-Time-macOS.zip; first launch, right-click Open Tas-Time.command and choose Open.
- **Single HTML:** open Tas-Time.html in Edge or Chrome.
