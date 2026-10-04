# Verification record

## Final code evidence

[Hosted run 37182530119](https://github.com/Masanori-Spec/path-spool/actions/runs/37182530119) passed on source commit `e2059584c53ec28006211fc27ed7666318d9789e`:

- All five jobs passed
- **141 tests** passed on each Node 22 / 24 × UTC / Asia/Tokyo combination, plus syntax/runtime-network checks and static build
- **19 sandboxed Chromium scenarios** passed: the original 18 application scenarios and one five-fixture Plotly consumer scenario
- No uncaught application or consumer errors; no external application/consumer requests in the checked flows

The model checks include 2,193 independently reconstructed Python cases, additional display-policy checks, 64 independently parsed export kits and deliberate corruption rejection. The [independent review](INDEPENDENT_REVIEW.md) records the model findings and repairs before hosted browser execution. Its historical pending-browser statements are superseded by this record; its finite-test limitations still apply.

## Actual downloads and interfaces

The application scenarios exercised policy changes and conservation, stale-export locks, invalid/reverted mappings, display overrides, quoted multiline input, formulas as text, sample replacement cancellation, repeated imports, malformed UTF-8, delayed-read races, keyboard focus, link filtering, provenance pagination, high-cardinality ID staging, maximum bounds and hostile/wide labels.

All nine actual UI downloads were compared with deterministic exports. A separate Python check parsed the downloaded CSV/JSON and reconstructed values and provenance from the original synthetic rows. The sample has four records, seven nodes and seven links, with exact weight 10 at both boundaries. Every complete source path and contribution is retained. The maximum downloaded project has 5,000 rows and its contribution file has 25,000 entries, exactly five per row. The guide contains no active content or external assets; its official documentation links are ordinary hyperlinks.

Desktop English/Japanese, English/Japanese at 768, 390 and 320 pixels, maximum bounds and wide-label screenshots were inspected. No page-wide overflow or overlapping controls was found. Wide flow diagrams scroll inside their own region. The two-page A4 guide PDF was rendered and inspected; text, totals and node lookup are intact. The screen-print partial-view notice was checked in the browser; it is not a claim that a filtered screen print contains the complete export.

## Real Plotly consumer evidence

The pinned official `plotly.js-dist-min@3.1.0` package consumed serialized figure JSON in isolated sandboxed Chromium pages, without a CDN or account. The sample case consumed the actual UI download. The remaining cases used the same serialized exporter boundary. Every fixture passed `Plotly.validate` with no reported issues, preserved raw values/customdata/metadata and produced finite geometry.

| Synthetic fixture | Visible nodes | Visible link bands | Observation |
| --- | ---: | ---: | --- |
| Workshop sample | 7 | 7 | All positive flows rendered |
| One positive and one zero record | 2 | 1 | The zero-only nodes/link were not visible |
| All zero weights | 0 | 0 | Schema accepted; evidence retained without visible bands |
| All rows excluded | 0 | 0 | Schema accepted; empty visible graph |
| Hostile text and display overrides | 3 | 2 | Markup, quotes, apostrophes and entity-looking source text stayed literal |

All five consumer screenshots were inspected. The first hosted run revealed that HTML attribute escaping produced visible `&quot;` strings in Plotly labels. A dedicated Plotly text escaper repaired this without weakening the original assertion; regression checks now cover literal quotes, apostrophes, markup, pre-existing entities and quoted titles.

This is evidence for these fixtures on **Plotly 3.1.0**, not a claim about every Plotly version, embedding system or maximum-sized chart. Zero-weight evidence can be present in a file while producing no visible flow.

## Evidence files

- [Application results](evidence/results.json)
- [Independent download checks](evidence/download-verification.json)
- [Plotly consumer results](evidence/plotly-consumer-results.json)
- [CI and visual summary](evidence/ci-summary.json)
- [Actual downloads, screenshots and PDF](evidence/)

The source commit above identifies the code used to capture committed evidence. Subsequent documentation/evidence commits receive their own exact-head CI checks.

## Remaining limits

Flourish account import, template behavior and display-label customization remain unverified. Its export is a documented-schema handoff. No chart account was accessed and no chart was published.

Physical mobile devices, physical print output, assistive technology, screen-reader behavior, WCAG conformance, customer demand and real workflow outcomes were not tested. Adjacent aggregates do not establish full-path correlation or causal/statistical meaning. Retain the original project, paths and contributions.

The workflow has read-only repository permissions and keeps Chromium's sandbox enabled. Ubuntu 22.04 is a compatibility baseline whose announced retirement is 2027-04-17. Development packages do not enter the runtime build; relevant third-party notices are retained separately from the unselected project license.
