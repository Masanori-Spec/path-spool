# Engineering decisions

## Identity before appearance

The model keys each node by `(stageIndex, null-or-exact-string)`. Empty fields become `null` only inside the compiled model. Literal strings such as `(missing)`, whitespace and Unicode normalization variants remain distinct. The implementation uses a separate Map for each stage and real null/string keys. Delimiter concatenation never defines identity.

Optional display overrides are stored separately against the original stage/null-or-string identity. Repeated display text cannot merge nodes, and renaming does not alter links or provenance. The mobile inspector presents contribution rows as stacked cards.

Generated IDs follow first retained occurrence within a stage, and nodes are flattened in stage order. Links sort by boundary and node index. This makes outputs deterministic for the same source order, mapping and policy. A source edit, row reorder or policy switch can change IDs; no stability across edited projects is promised.

## Exact bounded arithmetic

Input weights are strings consisting of ASCII digits. Validation sums them with BigInt and rejects a total above Number.MAX_SAFE_INTEGER before conversion to numbers. With nonnegative integers, each row weight, link total, boundary total and retained/excluded subtotal is then exactly representable. The cap includes excluded records, so switching policy cannot reveal an overflow.

Zero weights are retained in paths, nodes, links and provenance. The schematic renders a minimum thin stroke for visibility and states this explicitly. Consumer zero-flow rendering is outside the model contract.

## Missing policies conserve different populations

Sentinel mode gives each stage its own typed missing node and retains every source row. Exclude mode removes the entire incomplete row before node and link construction. Neither creates a transition across a missing stage. Each retained row contributes its weight once to every adjacent boundary, so each boundary total equals retained input weight.

The 300-node cap counts potential stage identities in all source rows, including excluded rows and zero weights. This intentionally keeps the input bound stable when switching policies.

## Evidence and information loss

Adjacent aggregation is not injective. For example, the two complete path sets `A → X → P, B → X → Q` and `A → X → Q, B → X → P` produce the same adjacent links with unit weights. A rendered aggregate graph cannot establish which full path was originally recorded. PathSpool exports complete per-row node sequences and contribution records to preserve that association separately.

Data-row ordinals are the primary provenance key. User item IDs are optional text, may be repeated or empty, and never drive deduplication. CSV includes an item-ID-present flag; JSON distinguishes null from an empty string.

## Input and output boundaries

The delimited parser is a bounded character-state parser, not a split-on-newline shortcut. It preserves quoted line breaks, quotes and exact whitespace while rejecting ragged rows and ambiguous quoting. A strict JSON parser detects duplicate keys, including escaped spelling aliases. Its depth/byte caps are supplemented by value, member and entry budgets checked before container growth. String decoding is bounded before retaining large values. A maximum valid 18.3 MB Unicode project remains accepted; a small but pathological array of 900,000 objects fails as a validation error under a 128 MB Node heap. UTF-8 files use fatal decoding so malformed bytes cannot silently become replacement characters.

Direct model calls also reject non-plain prototypes, accessor properties, serialization hooks, extra array properties and sparse arrays. JSON import cannot construct those objects, but the public module boundary should not silently lose data if used from another script. Validated projects are cloned on import and staged state boundaries.

All user text is escaped when included in HTML or SVG. Plotly display strings are escaped because its labels can interpret markup, while customdata stores raw labels. No source text is evaluated. Runtime code contains no network calls; the document CSP also disallows network connections, objects and form submission.

CSV is a separate trust boundary: RFC-style quoting preserves syntax but does not prevent spreadsheet formulas. Machine output preserves text. Spreadsheet-safe output prefixes risky textual cells, announces that change and receives separate filenames. It is not sold as universally safe for every spreadsheet workflow.

## State model and interruptions

The compiled project remains unchanged while input or mapping drafts are edited. Edited source must first be parsed into a draft; only a successful compile replaces results. A new table receives provisional column roles without applying the node cap yet, so a high-cardinality ID column can be assigned its intended role before compilation. Downloads are disabled whenever unapplied changes exist. Revert restores the applied project.

Every file read receives a generation token. New reads, typing, mapping edits, format changes, revert, apply and sample replacement invalidate prior reads. Stale resolutions and stale failures are ignored. Language changes preserve drafts. A repeated file can be selected again because the input value is cleared after selection. Unsaved work has unload protection and sample replacement confirmation.

The browser UI uses semantic controls and a paged link/row inspector. The SVG preview is a schematic, scrollable overview with keyboard links and full-label titles; visible labels are shortened. It is not a chart layout library. A clear print notice marks the application screen as possibly partial; the standalone handoff guide is the printable deliverable.

## Architecture

- `json.mjs`: duplicate-key-aware JSON parser
- `core.mjs`: table/project validation, strict delimiter parser and pure compiler
- `state.mjs`: atomic draft/commit boundaries and generation-controlled file input
- `export.mjs`: deterministic CSV, JSON and standalone HTML outputs
- `preview.mjs`: local schematic SVG
- `app.mjs` / `i18n.mjs`: browser interaction and bilingual copy
- `tests/path_oracle.py`: independent tuple-based model reconstruction

There are zero runtime packages. Development dependencies are Playwright for browser verification and the pinned official Plotly distribution for bounded synthetic consumer checks. The Plotly bundle is loaded from the installed test package into isolated pages, never from a CDN or the app build. The build copies static files and modules; reproducible ZIP packaging fixes archive timestamps and emits a SHA-256 source manifest.

## Interview explanation

“I built PathSpool around a data-preparation failure: a flow chart can look plausible while hiding how missing stages or label normalization changed its totals. The project makes those choices explicit, preserves exact labels in stage-specific identities, and records which rows make up each link. I bounded the input to keep the parser and UI reviewable. An independent Python implementation reconstructs the model from structured tuples, and mutation checks demonstrate that the oracle detects wrong weights, identities and provenance. I also made the limitation explicit: adjacent links cannot recover complete path correlation, so the exports preserve that information separately.”

The hard parts are identity, exact arithmetic, information loss and interruption-safe state, rather than the decorative chart. Existing visualization tools are acknowledged; neither novelty nor user demand has been established.
