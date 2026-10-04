# PathSpool independent review

Reviewed 2026-10-04. The corrected source is ready for an authorized hosted CI run and the remaining browser checks. No blocker remains in the exercised model, import, state, or export scope. This is a bounded data-handoff review; it does not certify live Flourish or Plotly behavior, visual layout, accessibility, or statistical interpretation.

## Executed evidence

The final `npm run check` passed syntax and runtime network-call checks, **140 Node tests with no failures or skips**, and the static build. The review added **11 tests** in `tests/reviewer.test.mjs`. Built source modules were also compared byte-for-byte with the source directory, and importing the built compiler reproduced the sample's retained weight of 10.

The added independent Python checker reads CSV with the standard `csv` module and parses exported JSON. It reconstructs expected adjacent edges directly from source records, then resolves delivered IDs and Plotly indices back to stage and exact source label. It imports neither production JavaScript nor the existing Python oracle. Across **64 export kits**, covering both missing policies, it checked:

- Exact stage identities, whitespace, normalization variants, typed missing values, repeated/empty/absent item IDs, zero weights, and duplicate display overrides
- Input, retained, excluded, boundary, and interior-node conservation; one contribution per retained row per adjacent boundary
- Complete row paths and exclusions, without inventing transitions across missing stages
- Flourish Source/Target IDs, explicit numeric Value and step bindings, and separate original/display label fields
- Plotly indices, values, row metadata, escaped presentation strings, and unmodified raw customdata
- Exact project reimport and the intended differences between machine and spreadsheet CSV; all non-CSV files remain identical between modes

Five deliberate corruptions were rejected: a link value, missing contribution, wrong raw CSV label, wrong Plotly source index, and reversed exported path. These supplement the existing independent Python suite's 2,193 compiled cases, two display-policy cases, and 17 mutation checks.

Other added checks exercise actual UI handlers with a limited DOM double, public API descriptors, failed JSON staging, source regeneration, maximum-safe-integer arithmetic, maximum Unicode project round trips, and a low-heap invalid-input subprocess. The DOM double is state evidence, not browser rendering evidence.

## Corrected findings

### Role assignment was blocked before mapping

A CSV with 301 unique IDs, two constant stage columns, and weight 1 was valid for stages `[1,2]`, ID column 0, and weight column 3. Initial staging instead treated the first columns as provisional stages, exceeded 300 nodes, and left mapping controls locked. The user could not reach the valid mapping.

`createProject` now validates and clones the bounded table into a staged candidate. Compile-level node and weight constraints run when the mapping is applied. Both Session and actual-handler regressions show 301 retained rows, two nodes, and unchanged old results until apply. Applying the still-invalid provisional mapping continues to reject atomically. A hosted browser scenario was added for this workflow.

### Direct API validation evaluated untrusted properties

The default parameter `policy=input.missing` invoked a getter before project validation. `createProject` also cloned a table before validation, invoking a rows getter and accepting its normalized result.

Default-policy selection now follows project validation; table validation precedes cloning. Tests verify zero getter invocations and rejection of accessor cells and non-plain table prototypes.

### A source header could lose its first character

A valid first column named `\uFEFFidentifier` was emitted unquoted by CSV/TSV regeneration and then mistaken for a transport BOM on reparse. This silently changed an exact source header during revert/read workflows.

Writers now quote fields beginning with U+FEFF. One- and two-character BOM-like prefixes round-trip through both formats and Session staging while the parser still consumes one actual transport BOM.

### Invalid JSON could allocate far beyond its useful profile

`'[' + '{},'.repeat(900000) + '{}]'` is 2,700,004 bytes, below the transport cap. It previously exhausted an isolated 128 MiB Node heap and aborted before profile rejection.

The parser now limits parsed values to 60,000, each array to 5,000 entries, each object to 32 members, decoded strings to 160 UTF-16 units with an encoded-length bound, and numeric tokens to 64 characters. Existing depth and 32 MiB transport limits remain. The same subprocess now exits normally with a `ValidationError` before excessive growth. Maximum-valid 5,000-row/eight-column Unicode projects still round-trip; the builder's additional maximum case includes all 300 nodes and display overrides.

## Export interpretation

Flourish documents Source/Target and ordered numeric Step from/Step to bindings, with Value controlling flow weight. Its overview describes label normalization in the mode that derives values from record counts. The generated alphanumeric IDs avoid ambiguity even under that normalization; the handoff explicitly instructs binding Value and makes raw/display labels lookup fields rather than identity keys. Live consumer import and display customization still require testing. [Flourish format reference](https://helpcenter.flourish.studio/hc/en-us/articles/8761554327183-How-to-format-your-data-to-build-classic-and-alluvial-Sankeys), [Flourish overview](https://helpcenter.flourish.studio/hc/en-us/articles/8761554356879-Sankey-diagram-an-overview)

Plotly documents source and target as integer indices into the node array and value as flow volume. The exported arrays satisfy those structural relationships in the independent checks. This establishes the documented data contract, not rendered behavior for zero-valued links or an empty retained graph. [Plotly Sankey reference](https://plotly.com/javascript/reference/sankey/)

Machine CSV preserves source text and remains capable of containing spreadsheet formulas. Spreadsheet mode prefixes detected risky text with an apostrophe, changes those strings, and uses separate filenames. The guide correctly warns that this is unsuitable for exact round trips and depends on spreadsheet handling. JSON remains the exact-text record.

Adjacent aggregates cannot establish full-path correlation. Per-row paths and contributions preserve the recorded association separately; the complete project also retains excluded and unmapped source cells. Display overrides do not rewrite those source values or their identities.

## Remaining release checks

- Run the **18 authored sandboxed browser scenarios** against the final commit and inspect saved screenshots, downloads, and print artifacts
- Exercise actual Flourish imports and Plotly rendering, including all-excluded input, zero values, label overrides, and maximum bounds
- Inspect narrow layouts, typography, keyboard behavior in the real browser, and printable output; perform any claimed assistive-technology testing separately
- Refresh and verify source/static archives and manifests after including this report and the reviewer tests

No browser, consumer account, publication, or shared-browser action was performed by this review. Recommend retaining the explicit “documented-schema handoff” wording until consumer evidence exists.
