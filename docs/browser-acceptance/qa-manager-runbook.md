# QA manager runbook

Runbook version: `1.1`

Use this from a Codex manager task rooted in the Social Metadata Research
development repository. The manager interviews the user, writes or edits a
private scenario, validates it against an independently maintained oracle,
starts a fresh worker task rooted in the dedicated QA repository, and answers
only the worker's stable protocol requests.

The manager does not operate the browser. The worker follows the
[QA agent runbook](qa-agent-runbook.md). Read that runbook, the
[manager/worker protocol](manager-worker-protocol.md), and the
[channel matrix](channel-matrix.md) completely before beginning.

## Modes

- `configure`: interview, normalize, validate, show, and approve a scenario.
- `run`: validate an already approved scenario and dispatch a fresh worker.
- `configure_and_run`: complete both flows in order.

Private scenarios belong under `.social-metadata/qa/scenarios/` in this
development repository and must be ignored by Git. Committed files under
`docs/browser-acceptance/scenarios/examples/` are synthetic, unapproved
templates and never authorize browser access. Manager run records belong under
`.social-metadata/qa/manager-runs/`.

## Phase -1 — interview and scenario authoring

Ask these questions in order. Propose inferred values where the user's context
supports them, but require confirmation before writing an approved scenario:

1. QA scope: `setup`, `preflight`, or `research`.
2. Browser: `chrome` or `in_app`.
3. Channels and exact order.
4. Synthetic creative brief. Never place private production content in QA.
5. UI locale, region, and timezone.
6. Modules: `hashtag`, `search-term`, or both.
7. Evidence tier: `autocomplete_only` or `results_sample`.
8. Mode: `guided` or `automatic`.
9. Expected authentication readiness for each selected channel:
   `already_signed_in` or an allowed public surface.
10. Interruption behavior. Authentication and challenge must remain `stop`.
11. Whether the scenario is reusable and, if so, its expiration.
12. Whether browser access may begin unattended or requires a human release
    each time.

Never ask for login credentials, account names, handles, cookies, tokens,
one-time codes, profile paths, or saved browser state. Authentication
configuration expresses readiness expectations only.

Copy the closest committed example into `.social-metadata/qa/scenarios/`,
change its ID, and normalize the answers. Keep the canonical oracle under
`docs/browser-acceptance/oracles/` separate; user scenario answers must not
rewrite expected product behavior.

Run validation without approval first:

```sh
npm run qa:scenario:validate -- \
  --scenario .social-metadata/qa/scenarios/<scenario>.yaml \
  --oracle docs/browser-acceptance/oracles/<oracle>.yaml
```

Show the normalized scenario to the user with sensitive creative detail
excluded. Ask for explicit approval. Only after approval:

- set `authorization.status: approved`;
- set `authorization.approvedAt`;
- set `authorization.browserAccessAuthorized: true`;
- preserve `authorization.credentialsAuthorized: false`;
- record whether the run is reusable and whether a human release is required.

Then validate with `--require-approved`. Do not dispatch on validation failure.

## Phase 0 — manager preflight

- [ ] Verify the product source revision and QA runbook checksums.
- [ ] Verify the product worktree is clean or explicitly approved as the build.
- [ ] Verify the dedicated QA repository path and its pinned worker runbook.
- [ ] Verify the scenario and oracle IDs match.
- [ ] Compute and record the scenario checksum.
- [ ] Verify approval has not expired.
- [ ] Verify private scenario, receipts, notes, screenshots, and run state are
  ignored by Git.
- [ ] Record that the answer source will be `qa_scenario`.

## Phase 1 — start the worker

Create a genuinely fresh Codex task rooted in the dedicated QA repository.
Pass the absolute approved-scenario path, canonical oracle path, their
checksums, and the exact product commit. Prompt it to:

1. read `AGENTS.md`;
2. read the pinned QA worker runbook and channel matrix completely;
3. read the manager/worker protocol from the exact product commit;
4. validate the named scenario and oracle with `--require-approved`;
5. run the selected scope without editing product source;
6. emit only stable protocol envelopes for manager interaction;
7. write ignored, sanitized QA artifacts only in the QA repository; and
8. stop on the protocol's safety conditions.

Record the worker task ID under `.social-metadata/qa/manager-runs/`. Do not
reuse a task that loaded an older plugin version.

## Phase 2 — answer worker requests

Maintain expected `runId`, `sequence`, request ID, and next channel. For each
valid request:

1. parse the single protocol envelope;
2. verify it is the expected request;
3. read the exact answer from the approved scenario;
4. send one matching `QA_RESPONSE`;
5. record the request ID and response hash in the private receipt.

Do not answer from memory, nearby prose, browser state, or prior scenarios.
Do not add optional advice to a protocol response.

If the worker emits commentary without an envelope, wait. If it asks a
question without a valid envelope, stop as `unexpected_request`.

## Phase 3 — process channel outcomes

Check every result against the independent oracle and ordered channel list.
`ui_change` may be recorded and continued only when the scenario permits it.
`not_applicable` is valid for Pinterest hashtag without browser interaction.

Stop unattended execution on authentication, challenge, locale mismatch when
configured to stop, unsafe request, changed channel order, or oracle
contradiction. The manager may notify the user that manual action is needed,
but must not solicit or handle the secret.

## Phase 4 — close the run

Require one `run_complete` or `run_stopped` result. Verify:

- every reached channel has one outcome;
- skipped channels follow a recorded terminal interruption;
- prompt order, run isolation, and browser choice are represented;
- the receipt declares scenario and oracle IDs, scenario checksum,
  `answerSource: qa_scenario`, human presence, and preexisting-auth status;
- private artifacts remain ignored and uncommitted;
- product source remains unchanged.

Return `pass`, `pass_with_findings`, `blocked`, or `fail` using the worker
runbook disposition rules. A truthful authentication stop is `blocked`, not a
product failure. A worker asking the manager for credentials is `fail`.
