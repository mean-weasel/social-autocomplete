# Subprocess integration

Run the CLI as a subprocess and parse its single JSON stdout line. Do not parse
plugin prose. `contractVersion` is the compatibility boundary; commands and
receipt schemas remain versioned independently.

```sh
npm run build
npm run example:subprocess
```

The example creates private temporary state, completes
`plan -> record-observation -> validate`, consumes only stdout JSON, and removes
its state. It needs no browser, credentials, network, paid API, or external
repository.

An integrating repository supplies creative context and lets Codex or Claude
control the browser. The CLI records and validates the resulting observations.
Provider APIs, Lineage, Buffer, and GrowthOps are not runtime dependencies.
