# Verification record

Local build stage, 2026-10-04. This record distinguishes executed checks from authored future checks.

## Executed locally

`npm run check` passes syntax validation, a runtime no-network-call guard, **141 tests**, and the static build.

- **11 final reviewer tests**: 64 inverse export-kit checks, five corruption rejections, four finding regressions, maximum Unicode and low-heap budgets, and actual handlers; see [independent review](INDEPENDENT_REVIEW.md)
- **77 independent model/input tests**: Python structured tuples reconstruct nodes, links, weights, paths, exclusions and row provenance without importing production code
- **2,193 valid compiled cases**: includes 1,692 exhaustive small patterns and 480 seeded cases, both missing policies, maximum bounds and boundary conservation
- **17 mutation self-checks**: deliberately corrupt output identity, weight, row provenance, paths or exclusions; the independent oracle rejects all
- **162 delimiter quoting combinations** plus malformed CSV/TSV, duplicate JSON keys, Unicode, controls, field and size caps
- **12 display-label tests**: bound source identities, duplicate display names, escaped overrides, strict schema and two additional independent-oracle policy cases
- **13 export tests**: Python CSV/HTML parsing, Flourish step/value/identity bindings, Plotly indices and layout metadata, escaping, spreadsheet-mode changes and project round trips
- **17 state tests**: atomic apply/revert, exact source regeneration, six newer-action file-read races, stale failures, repeated reads, actual Blob malformed UTF-8 and valid U+FFFD
- **11 actual UI handler tests** using a deliberately limited DOM double: draft locks, language preservation, mapping failure, sample cancellation, filters, keyboard selection/focus and file import

The DOM double verifies event/state behavior only. It does not establish layout, accessibility-tree behavior, browser parsing, downloads or print appearance.

The oracle worker also audited exports read-only across both policies and CSV modes with independent parsers. Findings corrected before this record: Plotly metadata location, negative-zero mapping rejection, direct-JS serialization hooks, and guide filenames.

## Authored, not run locally

The GitHub workflow has Node 22/24 × UTC/Tokyo model jobs and an Ubuntu 22.04 Chromium job using `chromiumSandbox: true`. Nineteen browser scenarios cover:

1. Initial sample totals, unique IDs and seven links
2. Keyboard link selection and Japanese interface
3. Missing-policy draft lock and 10/6 conservation
4. Invalid role mapping and revert
5. Display overrides, unchanged link identities and original path evidence
6. Malformed CSV, language preservation, quoted multiline TSV and formulas as text
7. Sample replacement cancellation and confirmation
8. All nine deterministic downloads and JSON reimport
9. Machine versus spreadsheet CSV and exact JSON evidence
10. Repeated files, malformed UTF-8 and valid U+FFFD
11. Delayed file-read replacement race
12. Link filtering and provenance pagination
13. High-cardinality ID staging before bounded stage assignment
14. Maximum 5,000 rows, six stages, 300 nodes and 25,000 contributions
15. Hostile markup and wide ASCII/CJK preview labels
16. 768/390/320 responsive layouts and both language controls
17. Standalone guide HTML/PDF and screen-print partial-view notice
18. External-request and uncaught-error checks
19. Actual Plotly 3.1.0 consumer execution for sample, mixed-zero, all-zero, all-excluded and hostile/display-override exported figures

The original 18 scenarios and assertions are retained. The additional consumer scenario uses the pinned official npm package only in the test process and saves each exported figure, screenshot and `plotly-consumer-results.json`. It asserts positive node/link geometry for positive cases, no fabricated positive bands for zero/empty cases, raw metadata retention, escaped text and no external requests. `Plotly.validate` results are recorded separately from visible geometry, including zero/empty observations. This scenario is authored and has not been executed locally.

The suite saves actual downloads, screenshots, a print PDF and machine-readable results when run. Those artifacts do not exist at this stage. Local browser execution is not claimed. No sandbox bypass has been added.

## Not verified

- Flourish account import, template settings or display-label customization
- Plotly consumer rendering, including zero-flow/empty cases
- Screenshot/pixel layout, physical mobile devices or printed output
- Assistive technology / screen-reader behavior or WCAG conformance
- User demand, real customer workflows or causal/statistical interpretation

The public export language is “documented-schema handoff,” not verified consumer compatibility.

## Reproduce and extend

Run `npm run check` from the project root with Node 22+ and Python 3. For a supported sandboxed browser environment, build and serve on loopback, then run `npm run test:browser` after installing the pinned development dependency and Chromium. Report a failure with the exact commit, results.json and artifact; do not relabel authored checks as passes.

## First hosted consumer finding

Hosted run [37182143378](https://github.com/Masanori-Spec/path-spool/actions/runs/37182143378) passed all four model jobs and all 18 application scenarios on commit `753fe4dd5edeefce01d9f302c6ebe11243d2ef59`. The consumer scenario exposed a presentation mismatch: the shared HTML escaper turned literal quotes into entities that Plotly displayed literally.

The exporter now uses a dedicated Plotly text escaper for ampersands and angle brackets while preserving literal quotes. Original metadata remains unchanged, markup stays escaped, and the original consumer assertion remains intact. An exporter regression also covers apostrophes and pre-existing entity text; the consumer fixture adds checks for both and for quoted titles. This repaired source still requires a new hosted run.
