# Test-only dependencies

PathSpool's browser application and static ZIP contain no third-party runtime package. Dependencies below are installed for verification and excluded from source/static archives as `node_modules`.

## Plotly.js 3.1.0

- Official npm distribution: `plotly.js-dist-min`, pinned to `3.1.0` in package.json and package-lock.json
- Purpose: render synthetic exported figure JSON inside sandboxed browser CI
- License: MIT; the distribution's unmodified notice is preserved in [plotly-3.1.0-LICENSE.txt](third-party/plotly-3.1.0-LICENSE.txt)
- Official project: https://github.com/plotly/plotly.js
- Official installation documentation: https://plotly.com/javascript/getting-started/
- Registry integrity: `sha512-aihvA/+SnwEQxSufaPn8AWDUzdHFAbsCk2+w/IJResDafK3E2tvCvzW+ZV6JlMciJc7hQ3kCILS5Ao22OZ6kWA==`

The installed npm bundle retains its own embedded dependency notices. No bundle is copied into `public`, `src` or `dist`; no chart account, CDN or runtime network dependency is introduced. Test screenshots and machine-readable results describe only the pinned version and synthetic fixtures exercised.

## Playwright 1.56.0

`@playwright/test` is the pinned browser-test dependency, licensed under Apache-2.0. Its package and transitive distributions retain their upstream license notices when installed. Official project: https://github.com/microsoft/playwright

These notices identify test dependencies and do not select a license for PathSpool itself.
