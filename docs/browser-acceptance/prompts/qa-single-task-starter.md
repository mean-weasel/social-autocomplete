Single-task Instagram QA starter contract: qa-single-task-starter/v1
Run the recommended local live-smoke path from this product repository. Read
`docs/browser-acceptance/runbooks/qa-single-task.md`, the browser-acceptance
README, the shared browser research contract, and the Instagram playbook
completely before acting.
Use exactly one fresh Codex task for the live run. Do not create a manager,
worker, child task, campaign, timer, or per-action acknowledgement. Load an
approved `single_task` scenario from `.social-metadata/qa/scenarios/`; if none
exists, copy the committed Chrome/Instagram example and ask the user to approve
its browser access before changing its authorization fields.
Validate the scenario against the committed Chrome oracle with
`--require-approved`. Install the exact source revision, invoke the Social
Metadata Research plugin, create the CLI plan, connect once to the user's
existing visible Chrome session, and retain that binding. Create exactly one
new plugin-owned Instagram tab from it. Never enumerate or claim existing user
tabs.
Honor `completedResearchTabs`: `close` omits the agent-created tab from final
browser cleanup, while `keep_open` finalizes that exact tab as a deliverable so
it remains visible after browser-session control is released. Never rediscover
or reuse a retained tab.
Run the scenario's exact configured prefixes through Instagram's
native Search surface. Capture only bounded, input-owned autocomplete evidence.
If authentication, a challenge, a browser failure, or a UI mismatch blocks the
run, stop with that explicit status. Never broaden inspection, handle
credentials, publish, enter a composer, scrape, or substitute headless
Chromium. Release browser-session control unless it is waiting for the user to sign in.
Record observations through the CLI, run `social-metadata validate`, and write
one ignored, sanitized receipt. A pass requires current native suggestions for
every configured module and successful CLI validation.
