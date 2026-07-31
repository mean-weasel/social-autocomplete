# Agent Instructions

## Feature Development Discipline

Optimize for the smallest observable user outcome. Before implementation,
state:

- the user-visible capability;
- the direct acceptance evidence;
- explicit non-goals;
- the expected files or modules;
- the complexity budget.

Unless the user sets a different budget, use these defaults:

- at most two implementation commits;
- at most 400 changed lines before requesting re-approval;
- at most one implementing agent and one independent reviewing agent;
- no new orchestration framework, protocol, state machine, schema family,
  process supervisor, or generalized recovery system without explicit approval.

The budget is a stopping threshold, not a target. If the change needs to exceed
it, stop before expanding scope and explain why the additional complexity is
necessary.

Implement in this order:

1. Prove the narrowest vertical slice manually.
2. Add focused automated coverage for the demonstrated behavior.
3. Generalize only after the vertical slice works and observed repetition
   justifies the abstraction.

Do not use workflow machinery, agent reports, generated receipts, passing
happy-path tests, or `pass_with_findings` as substitutes for exercising the
user-facing behavior directly. Browser behavior requires browser evidence;
CLI behavior requires the exact command and output contract; failure handling
requires at least one relevant negative case.

For substantial feature work, use a feature branch or fresh worktree. Do not
commit feature work directly to `main`. Keep private execution state and agent
coordination journals out of Git; commit only durable specifications,
decisions, concise runbooks, implementation, and tests.

Use `docs/feature-task-template.md` to frame feature requests. Do not create a
GoalBuddy board or custom skill for work that fits within the default budget
unless the user explicitly asks for one.

Before claiming completion, run the narrowest relevant checks. For broad
changes, use `npm run verify:offline`. Report the user-facing claim, evidence,
strongest remaining risk, and whether the complexity budget was respected.
