# Officer Command Centre — Enhancement Development

Private development environment for future Officer Command Centre improvements.

## Authoritative baseline

This repository's application files are synchronized from the English Live repository:
- Source: `rogerangliss-byte/KoW-Companion`
- Source branch: `main`
- Application baseline: **v4.7.0**
- English Live entry file SHA at synchronization: `37cde3b35aea74efd7798e3892ddefc11fcfd04b`
- Officer data manifest: `2026.11.14-01` (68 Officers)

English Live is the authoritative production baseline. This repository is for isolated development and testing only.

## Current version and release status

- Runtime application version: **v4.7.0**.
- The Development validation work does not increment the application version.
- The current audit record is [DEVELOPMENT-READINESS-v4.7.0.md](DEVELOPMENT-READINESS-v4.7.0.md).
- The chronological history is maintained in `CHANGELOG.md`.
- Historical v4.6.0 documents are retained for reference and are not the current version authority.
- No production release or promotion is authorized by the Development validation record.

## Environment boundaries

- Do not change English Live or Multilingual Live from this repository.
- Do not change English Test or Multilingual Test from this repository.
- Do not deploy this private repository as a production site.
- Do not add the production `CNAME`.
- Do not promote any Enhancement changes without explicit user approval.

## Development rules

1. Preserve all working baseline functionality and data.
2. Inspect the actual source and dependencies before every change.
3. Implement only specifically requested or approved improvements.
4. Test each change in this environment and run regression checks against the baseline.
5. Keep versioning and release packaging under explicit approval.
6. Keep the application, Officer datasets, portrait assets, backgrounds, supporting scripts and service worker synchronized with the approved baseline unless a deliberate Development change is documented.
7. Do not alter the approved skill progression matrix or costs without explicit approval.

## Current validation status

The 16 November 2026 integrated audit is recorded in `DEVELOPMENT-READINESS-v4.7.0.md`:
- Browser regression on the current Officer Database editor commit: 161 passed, 0 failed (run `43958525071`).
- Officer data validation on the current editor commit: completed successfully (run `43958525148`).
- The Officer Database editor now exposes Rarity and Role, exports/imports these fields in CSV, and uses a quoted-field-aware CSV parser.
- Officer database: 68 records; seasonal defaults: 46 records; portraits: 68 files.

The runtime application and supporting production files were synchronized from English Live on 16 November 2026. The production custom-domain file is intentionally excluded.
