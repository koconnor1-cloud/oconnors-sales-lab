# Discovery scoring calibration set

`discovery-calibration.mjs` contains 30 faculty benchmark cases: 10 weak, 10 average, and 10 excellent. Each case includes a specific transcript, faculty benchmark score, and acceptable scoring range.

Run the fixture checks with:

```bash
node calibration/discovery-calibration.mjs
```

Acceptance criteria for the live evidence scorer:

- At least 80% of recommendations fall inside the case's acceptable range.
- No weak case receives 80 or higher.
- No excellent case receives below 80.
- Mean absolute error is 6 points or less.
- Every criterion score includes transcript evidence or an `insufficient_evidence` flag.
- Any confidence below 0.75 creates an instructor-review flag.
- The instructor remains the only authority who can release an official grade.

These fixtures intentionally test common failure modes: keyword-only questioning, premature pitching, invented claims, ignored buyer answers, shallow discovery, missing implication questions, weak closes, stakeholder discovery, ethical handling of incomplete data, and authority-appropriate next steps.
