import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifySurface, routeChannel } from "../../src/channels/index.js";
import type {
  AccessMode,
  BrowserHost,
  BrowserSurface,
  SurfaceSnapshot,
} from "../../src/channels/types.js";
import type { Channel, ModuleName } from "../../src/contracts/index.js";

interface FixtureSnapshot extends SurfaceSnapshot {
  expected: "ready" | "native_empty" | "interrupted" | "failed";
}

interface ChannelFixture {
  channel: Channel;
  module: ModuleName;
  host: BrowserHost;
  browser: BrowserSurface;
  accessMode: AccessMode;
  success: FixtureSnapshot;
  zero: FixtureSnapshot;
  interruption: FixtureSnapshot;
  failure: FixtureSnapshot;
  notApplicableModule?: ModuleName;
}

export async function runChannelFixtureReplay(): Promise<{ channels: number; cases: number }> {
  const fixtures = JSON.parse(
    await readFile(resolve("fixtures/channels/scenarios.json"), "utf8"),
  ) as ChannelFixture[];
  let cases = 0;
  for (const fixture of fixtures) {
    const route = routeChannel({
      channel: fixture.channel,
      module: fixture.module,
      evidenceTier: "results_sample",
      host: fixture.host,
      browser: fixture.browser,
      accessMode: fixture.accessMode,
    });
    assert.equal(route.status, "ready", fixture.channel);
    for (const key of ["success", "zero", "interruption", "failure"] as const) {
      const { expected, ...snapshot } = fixture[key];
      assert.equal(classifySurface(snapshot).state, expected, `${fixture.channel}:${key}`);
      cases += 1;
    }
    if (fixture.notApplicableModule) {
      assert.equal(
        routeChannel({
          channel: fixture.channel,
          module: fixture.notApplicableModule,
          evidenceTier: "autocomplete_only",
          host: fixture.host,
          browser: fixture.browser,
          accessMode: fixture.accessMode,
        }).status,
        "not_applicable",
      );
      cases += 1;
    }
  }
  return { channels: fixtures.length, cases };
}
