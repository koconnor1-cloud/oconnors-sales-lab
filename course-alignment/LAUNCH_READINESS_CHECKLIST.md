# O'Connor's Sales Lab — Fall 2026 Launch Readiness

## Monday / Week 1 — must work

- [ ] Student can create an account with class code `SALESFALL26`.
- [ ] Student can confirm email and log in.
- [ ] Student dashboard loads without demo student data being mistaken for live data.
- [ ] Student can open free practice and select **Elevator Pitch**.
- [ ] Microphone permission works on Chrome, Safari/iPad, and Edge.
- [ ] Spoken response transcribes successfully.
- [ ] AI buyer responds and coaching appears.
- [ ] Free practice does **not** persist audio or video recordings.
- [ ] Completed practice saves transcript, duration, score, and feedback.
- [ ] Student can reopen the saved report.
- [ ] Instructor can see the student's completed practice and report.
- [ ] Camera in free practice is clearly labeled as preview only; no false `REC` state.

## Before first graded Elevator Pitch

- [ ] Instructor assignment form writes a real assignment to Supabase.
- [ ] Whole-class and individual assignment targeting use the authenticated roster.
- [ ] Publish/unpublish works.
- [ ] Due date, instructions, and attempt limit work.
- [ ] Student sees only active, published assignments for their class.
- [ ] Formal assignment requires explicit recording consent.
- [ ] Formal assignment creates one private assignment video.
- [ ] Instructor can play the assignment video through a time-limited signed URL.
- [ ] Full-conversation evidence scoring runs at session completion.
- [ ] AI recommendation is not treated as the final grade.
- [ ] Instructor can approve, adjust, hold, and release the official grade.

## Semester alignment

- [ ] Retired case references removed: Coastal Growth Solutions / Elevate360 / HarborPoint.
- [ ] Elevator Pitch is a first-class scenario.
- [ ] Cold Call is a first-class scenario.
- [ ] Discovery + SPIN is a first-class scenario.
- [ ] Buyer-Centered Presentation is a first-class scenario.
- [ ] Objection Handling is a first-class scenario.
- [ ] Negotiation + Commitment is a first-class scenario.
- [ ] Final Integrated Sales Call is a first-class scenario.
- [ ] Mock Job Interview remains a distinct Career Readiness scenario.
- [ ] Website Sales Playbook matches the finalized student Playbook.

## Argo Sales Showdown

- [ ] Round 1 — Cold Call / Prospecting.
- [ ] Round 2 — Discovery.
- [ ] Quarterfinal — Value Presentation.
- [ ] Semifinal — Objection Handling + Value.
- [ ] Championship — Complete Sales Call + Close.
- [ ] Official-attempt eligibility and advancement rules work.
- [ ] Results remain hidden until instructor release.
- [ ] Non-finalists retain a meaningful participation path.

## Prototype cleanup

- [ ] No fake assignment-success toast.
- [ ] No fake video-playback controls.
- [ ] No fake transcript-download control.
- [ ] No fake comment-save control.
- [ ] No fake leaderboard switch.
- [ ] No hard-coded Jamie/Alex/Morgan/Sam student data in live instructor views.
- [ ] LMS integrations are either functional or clearly marked unavailable.
- [ ] CSV buttons only say available when they actually download data.

## Production gate

Do not merge the launch-readiness branch into `main` until:

1. Supabase production migrations can be inspected/applied successfully.
2. Security/RLS policies are verified.
3. Teacher test account passes the full workflow.
4. Test-student account passes the full workflow.
5. GitHub Pages build succeeds.
6. Desktop + iPad/mobile smoke test passes.
