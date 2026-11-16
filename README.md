# KoW Officer Companion — Enhancement Development

Private development environment for future Officer Companion improvements.

## Authoritative baseline

This repository's application files are synchronized from the English Live repository:
- Source: `rogerangliss-byte/KoW-Companion`
- Source branch: `main`
- Application baseline: **v4.7.0**
- English Live entry file SHA at synchronization: `37cde3b35aea74efd7798e3892ddefc11fcfd04b`
- Officer data manifest: `2026.11.14-01` (68 officers)

English Live is the authoritative production baseline. This repository is for isolated development and testing only.

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
6. Keep the application, officer datasets, portrait assets, backgrounds, supporting scripts and service worker synchronized with the approved baseline unless a deliberate development change is documented.

## Current state

The runtime application and supporting production files were synchronized from English Live on 16 November 2026. The production custom-domain file is intentionally excluded.