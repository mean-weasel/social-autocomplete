QA campaign child dispatch addendum: qa-worker-campaign-dispatch/v1

Apply this addendum only with `qa-worker-dispatch/v1` for an issued campaign
child. Validate the exact child grant and require its campaign ID, scope hash,
ordinal, grant hash, pin hash, run ID, scenario/oracle/protocol hashes, Chrome
browser, and ordered Instagram → Facebook → LinkedIn to match durable run
state. The child grant never authorizes credentials, publishing, composer
interaction, user-tab access, browser switching, extra channels, action replay,
or private browser output. Do not read or mutate campaign state or issue,
resend, refund, suspend, resume, revoke, or reconcile a grant. Put only
campaign ID, scope hash, ordinal, grant hash, and pin hash in the receipt.
