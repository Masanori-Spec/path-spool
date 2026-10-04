# Existing tools and the chosen scope

Reviewed against primary sources on 2026-10-04. This is a product-positioning exercise, not a novelty, patentability, market-size or unmet-demand claim. We have not interviewed users or measured adoption.

| Existing tool | Existing strength | PathSpool's focused role |
| --- | --- | --- |
| [Flourish Sankey/alluvial template](https://helpcenter.flourish.studio/hc/en-us/articles/8761554327183-How-to-format-your-data-to-build-classic-and-alluvial-Sankeys) | Hosted visual authoring, long-form Source/Target data and ordered numeric step bindings | Prepare that explicit handoff locally and retain a row-to-link audit trail and exclusion evidence |
| [Plotly Sankey](https://plotly.com/javascript/sankey-diagram/) | Programmable rendering using node indices and source/target/value arrays | Build those arrays from a bounded staged table without requiring a custom data-wrangling script |
| [RAWGraphs](https://www.rawgraphs.io/) and its [alluvial chart](https://www.rawgraphs.io/learning/how-to-make-an-alluvial-diagram) | Established browser-based visual mapping and vector export for tabular data | A smaller evidence-oriented handoff: policy comparison, exact stage identities and complete original-row paths alongside aggregate links |

The difference is the combination of a bounded input contract, explicit missing policy, collision-resistant stage identity and exportable row evidence. We do not claim other tools lack these capabilities in every configuration. PathSpool does not replace chart design, rendering or publication features.

## Contract details that changed the implementation

The [Flourish overview](https://helpcenter.flourish.studio/hc/en-us/articles/8761554356879-Sankey-diagram-an-overview) documents normalization when deriving flows from records. PathSpool cannot assume arbitrary raw labels retain their identity inside every consumer configuration. It therefore binds generated alphanumeric IDs, always exports explicit values, and includes both numeric step columns plus a raw-label lookup. This sacrifices immediate human-readable chart labels for an inspectable handoff identity. Display-label customization is left for the consumer and must be checked there.

The [Plotly Sankey reference](https://plotly.com/javascript/reference/sankey/) defines integer source/target indices and per-link values. The [layout metadata reference](https://plotly.com/javascript/reference/layout/#layout-meta) places metadata in `layout.meta`. PathSpool uses this documented location and avoids inventing a top-level figure metadata extension.

The exports are checked against those documented shapes and independent parsers. A live consumer import/render has not been performed, so documentation does not call them verified compatible.

## When this tool is useful

A workshop organizer has one row per participant or cohort, with discovery channel, session and next action. They want to hand data to a chart designer while explaining why a link has its displayed weight. An empty session field changes the retained total by four in the sample. The organizer can compare both policies and deliver the full paths and exclusions with the aggregate file.

The same pattern applies to synthetic workflow transitions or grouped survey stages when values are nonnegative integer counts. It does not support partial transitions, fractional weights, continuous measurements, merging datasets or inferred missing values.

## What remains unvalidated

User demand, willingness to pay, chart consumer rendering, label customization inside consumers, assistive-technology behavior, real customer workflows and any commercial claim. No customer contact, account creation or publication is part of the app.
