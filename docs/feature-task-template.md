# Feature Task Template

Use this template when asking an agent to implement a feature. Delete prompts
that do not apply, and replace every placeholder before implementation begins.

```text
Implement only: <one observable capability>

User-visible outcome:
- <what the user can do after this change>

Acceptance evidence:
- <exact command, browser action, screenshot, receipt, or output contract>
- <relevant negative or failure case>

Non-goals:
- <behavior that must not be added>
- <generalization or refactor that is out of scope>

Allowed scope:
- Expected files/modules: <paths or components>
- Avoid changing: <sensitive or unrelated areas>

Complexity budget:
- Maximum commits: 2
- Re-approval threshold: 400 changed lines
- Agents: 1 implementer and, if useful, 1 independent reviewer
- Do not add protocols, state machines, schema families, process supervisors,
  orchestration frameworks, or generalized recovery systems without approval.

Implementation order:
1. Demonstrate the narrowest working vertical slice.
2. Add focused automated coverage.
3. Generalize only if the demonstrated behavior requires it.

Strongest likely failure:
- <the failure that would make the feature misleading or unusable>

Stop conditions:
- Stop before exceeding the complexity budget.
- Stop before expanding architecture or touching a non-goal.
- Stop if direct acceptance evidence cannot be collected.

Completion report:
- User-facing claim
- Direct acceptance evidence
- Verification commands and results
- Strongest remaining risk
- Complexity budget: respected or exceeded with prior approval
```

For browser-facing social research, prefer a first slice that installs the
plugin in a clean environment, opens one supported channel in the selected
visible browser, performs one bounded query, records the observed suggestions,
and validates one JSON receipt. Prove that path before automating multi-channel
campaigns, recovery, or supervision.
