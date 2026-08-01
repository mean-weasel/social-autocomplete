# Releasing the plugin

`package.json` owns the release version. The package lock plus the Codex and
Claude manifests must contain that exact version, and the marketplace's
Git-backed source must reference the matching `v<version>` tag. Codex
cachebuster suffixes are for local installation only and must not be committed.

## Prepare the release

1. Create a release branch from the current default branch.
2. Set the intended version:

   ```sh
   npm run version:set -- 0.1.0-alpha.1
   ```

3. Run the repository and release checks:

   ```sh
   npm run version:check
   npm run verify:ci
   npm run verify:release -- --allow-missing-live-receipts
   ```

4. Complete the current headed-browser smoke described in the browser QA
   runbook. Record private receipts under `.social-metadata/`; do not commit
   credentials, authenticated page content, or private execution state.
5. Commit the synchronized version files, merge the green pull request, and
   confirm the merge commit is on the default branch.

Never release a marketplace entry that points at the mutable checkout root.
Local installs copy their source into the Codex cache and could otherwise copy
ignored `.social-metadata` state. The release source is Git-backed so only
tracked files from the matching tag are installed.

## Publish

Create and push an annotated tag whose value exactly matches the synchronized
version:

```sh
git tag -a v0.1.0-alpha.1 -m "Release v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
```

The Release workflow repeats CI, packs the plugin, writes `SHA256SUMS`, and
creates a GitHub Release with generated notes. SemVer prerelease tags such as
`-alpha.1` are marked as GitHub prereleases automatically.

The workflow deliberately does not publish to npm or a plugin marketplace and
does not automate authenticated browser sessions. A failed workflow does not
create a replacement tag; fix the issue through a pull request and publish a
new version.
