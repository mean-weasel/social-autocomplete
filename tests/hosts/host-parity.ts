import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

interface HostContract {
  contractVersion: string;
  shared: {
    discovery: string[];
    modes: {
      guided: { initialConfirmation: boolean; queryApprovalStagesPerChannel: number };
      automatic: { initialConfirmation: boolean; queryApprovalStagesPerChannel: number };
    };
    interruptions: string[];
    incrementalResult: string;
    browserOwner: string;
    cliOwner: string;
    browserSession: {
      selectionRequiredBeforePlan: boolean;
      codexChoices: string[];
      recordedInPlan: boolean;
      adjustment: string;
      silentSwitch: string;
      authenticated: string;
      public: string;
      standalonePlaywrightChromium: string;
      profilePersistence: string;
      signIn: string;
      credentialHandling: string;
    };
    channelSelection: {
      selectionRequiredBeforePlan: boolean;
      explicitPrompt: string;
      supported: string[];
      ordered: boolean;
      recordedInPlan: boolean;
      newRunInheritance: string;
      resume: string;
    };
    authenticatedInspection: {
      targetFiltering: string;
      completeOpenTabLists: string;
      fullDomSnapshots: string;
      bodyText: string;
      feedContent: string;
      accountIdentifiers: string;
      broadenReadAfterFailure: string;
      projection: {
        structuralBooleans: string[];
        sanitizedStatus: boolean;
        expectedLandmark: boolean;
        observedLandmark: boolean;
      };
    };
    codexCatalog: {
      model: string;
      topLevelSkills: string[];
      channelResources: string[];
      directChannelInvocation: string;
    };
    prohibited: string[];
  };
  hosts: {
    codex: { authenticatedBrowser: string; publicBrowser: string; directInvocation: string };
    claude: { authenticatedBrowser: string; publicBrowser: null; directInvocation: string };
  };
}

export async function checkHostParity(): Promise<{ ok: true; hosts: number; skills: number }> {
  const contract = JSON.parse(await readFile("assets/host-contract.json", "utf8")) as HostContract;
  assert.equal(contract.contractVersion, "1.0");
  assert.equal(contract.shared.modes.guided.queryApprovalStagesPerChannel, 2);
  assert.equal(contract.shared.modes.automatic.queryApprovalStagesPerChannel, 0);
  assert.equal(contract.shared.modes.guided.initialConfirmation, true);
  assert.equal(contract.shared.modes.automatic.initialConfirmation, true);
  assert.equal(contract.shared.incrementalResult, "after_each_channel");
  assert.equal(contract.shared.browserOwner, "plugin");
  assert.equal(contract.shared.cliOwner, "contracts_state_validation");
  assert.equal(contract.shared.browserSession.selectionRequiredBeforePlan, true);
  assert.deepEqual(contract.shared.browserSession.codexChoices, ["chrome", "in_app"]);
  assert.equal(contract.shared.browserSession.recordedInPlan, true);
  assert.equal(contract.shared.browserSession.adjustment, "append_only_user_confirmed_amendment");
  assert.equal(contract.shared.browserSession.silentSwitch, "prohibited");
  assert.equal(contract.shared.browserSession.authenticated, "existing_user_controlled_chrome_profile");
  assert.equal(contract.shared.browserSession.public, "host_managed_visible_browser_only");
  assert.equal(contract.shared.browserSession.standalonePlaywrightChromium, "unsupported");
  assert.equal(contract.shared.browserSession.profilePersistence, "prohibited");
  assert.equal(contract.shared.browserSession.signIn, "user_manual_same_session_pause_and_resume");
  assert.equal(contract.shared.browserSession.credentialHandling, "never_request_read_type_transmit_or_store");
  assert.equal(contract.shared.channelSelection.selectionRequiredBeforePlan, true);
  assert.equal(contract.shared.channelSelection.explicitPrompt, "Which channels should I research, and in what order?");
  assert.deepEqual(contract.shared.channelSelection.supported, [
    "facebook",
    "instagram",
    "linkedin",
    "x",
    "tiktok",
    "youtube",
    "pinterest",
  ]);
  assert.equal(contract.shared.channelSelection.ordered, true);
  assert.equal(contract.shared.channelSelection.recordedInPlan, true);
  assert.equal(contract.shared.channelSelection.newRunInheritance, "prohibited");
  assert.equal(contract.shared.channelSelection.resume, "reuse_same_run_without_reprompt");
  assert.equal(contract.shared.authenticatedInspection.targetFiltering, "in_process_expected_origin_before_projection");
  for (const prohibited of [
    "completeOpenTabLists",
    "fullDomSnapshots",
    "bodyText",
    "feedContent",
    "accountIdentifiers",
    "broadenReadAfterFailure",
  ] as const) {
    assert.equal(contract.shared.authenticatedInspection[prohibited], "prohibited");
  }
  assert.deepEqual(contract.shared.authenticatedInspection.projection.structuralBooleans, [
    "targetMatched",
    "authenticationRequired",
    "challengePresent",
    "localeMatches",
    "searchLandmarkPresent",
    "resultsLandmarkPresent",
  ]);
  assert.equal(contract.shared.authenticatedInspection.projection.sanitizedStatus, true);
  assert.equal(contract.shared.authenticatedInspection.projection.expectedLandmark, true);
  assert.equal(contract.shared.authenticatedInspection.projection.observedLandmark, true);
  assert.equal(contract.shared.codexCatalog.model, "single_orchestrator_with_linked_channel_resources");
  assert.deepEqual(contract.shared.codexCatalog.topLevelSkills, ["social-metadata-research"]);
  assert.deepEqual(contract.shared.codexCatalog.channelResources, [
    "facebook",
    "instagram",
    "linkedin",
    "x",
    "tiktok",
    "youtube",
    "pinterest",
  ]);
  assert.equal(contract.shared.codexCatalog.directChannelInvocation, "not_required");
  assert.deepEqual(contract.hosts.codex.authenticatedBrowser, contract.hosts.claude.authenticatedBrowser);
  assert.equal(contract.hosts.codex.publicBrowser, "in_app");
  assert.equal(contract.hosts.claude.publicBrowser, null);
  assert.match(contract.hosts.codex.directInvocation, /social-metadata-research/);
  assert.match(contract.hosts.claude.directInvocation, /social-metadata-research/);
  for (const required of ["authentication_required", "ui_change", "locale_mismatch"]) {
    assert.ok(contract.shared.interruptions.includes(required));
  }
  for (const prohibited of ["publishing", "composer_interaction", "scraping", "authentication_bypass"]) {
    assert.ok(contract.shared.prohibited.includes(prohibited));
  }
  return { ok: true, hosts: Object.keys(contract.hosts).length, skills: 8 };
}

if (process.argv[1]?.endsWith("host-parity.js")) {
  process.stdout.write(`${JSON.stringify(await checkHostParity())}\n`);
}
