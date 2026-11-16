# Enhancement Development — v4.7.0 Readiness Record

**Audit date:** 16 November 2026  
**Repository:** `rogerangliss-byte/KoW-Officer-Companion-Development`  
**Branch:** `feature/officer-data-validation`  
**Audited commit:** `df1d883141d37044aa94add422f12c1df5b222ac`  
**Application version:** `4.7.0`  
**Officer data version:** `2026.11.14-01`

## Purpose and release status

This is a development validation record, not a production release or deployment instruction. The current application version remains **v4.7.0**. The work recorded here does not justify an automatic version increment: the application is still based on the approved v4.7.0 English Live baseline, with isolated Development-only hardening and regression-test coverage.

No English Test, Multilingual Test, English Live or Multilingual Live repository has been modified or promoted by this work. Promotion, release packaging and any future version increment remain subject to explicit user approval.

## Verified application and data inventory

| Item | Verified result |
|---|---:|
| Application title | Officer Command Centre v4.7.0 |
| Runtime application version | 4.7.0 |
| Full Officer database | 68 records |
| Seasonal default dataset | 46 records |
| Full Officer CSV | 68 data rows |
| Defaults CSV | 46 data rows |
| Officer portraits | 68 image files |
| Data manifest | 2026.11.14-01 |
| S8 Po and S8 Sara | 720 ORV / 360 SRV |
| Local assets referenced by the entry page | All present |
| Production CNAME in Development | Absent by design |

The full Officer database and seasonal defaults are separate datasets and are not expected to have equal row counts.

## Validation evidence

### Browser regression
- Workflow: `.github/workflows/application-regression.yml`
- Run: [43952115069](https://github.com/rogerangliss-byte/KoW-Officer-Companion-Development/actions/runs/43952115069)
- Commit: `48ec2edcf289c6d55a082f2147f846d045942031`
- Result: **161 passed, 0 failed**
- Browser log confirms no uncaught JavaScript exceptions.
- Coverage includes the Single-Officer, Multi-Officer and Advanced Planner paths; saved progress and plan persistence; forecast boundaries; mixed-rarity calculations; Selection Chest eligibility; partial badge funding; ORV remainder handling; and simultaneous allocation of all five resource types.

### Officer data validation
- Workflow: `.github/workflows/officer-data-validation.yml`
- Run: [43884997100](https://github.com/rogerangliss-byte/KoW-Officer-Companion-Development/actions/runs/43884997100)
- Result: **2,036 checks passed, 0 errors**
- The validator checks Officer data, CSV exports and portrait correspondence. The audited data manifest and datasets are recorded above.

## Officer Database editor enhancement — 16 November 2026

The current Development commit adds editable Rarity and Role fields to the Officer Database editor and includes both fields in CSV import/export. CSV import now handles quoted commas, escaped quotes, embedded line breaks and CRLF/LF endings; it checks required headers, validates imported data, asks for confirmation before replacing the local database and reports file-read errors. Older CSV files without Rarity or Role remain compatible.

- Browser regression workflow: [43958525071](https://github.com/rogerangliss-byte/KoW-Officer-Companion-Development/actions/runs/43958525071) — **161 passed, 0 failed**.
- Officer-data validation workflow: [43958525148](https://github.com/rogerangliss-byte/KoW-Officer-Companion-Development/actions/runs/43958525148) — **completed successfully**.
- The enhancement does not change skill costs, calculator logic, Officer datasets, runtime application version or deployment configuration.

## Version and release controls

- Keep the application version at **v4.7.0** for this Development validation cycle.
- Do not label this work v4.8.0 or another new release until a separately approved feature scope and release decision exist.
- Keep historical v4.6.0 release notes as archived history; they are not the current version authority.
- Use `README.md` for the authoritative baseline and environment boundaries, this record for the current audit evidence, and `CHANGELOG.md` for chronological changes.
- Do not add a production CNAME or deploy this private Development repository as a production site.
- Do not promote to either Test or Live without explicit approval.

## Outstanding release gates

The documentation/version mismatch identified in the 16 November audit is resolved: README, Changelog, User Guide and this readiness record consistently identify v4.7.0 as the current application baseline. The User Guide's What's New section now identifies v4.7.0, and the Officer Database editor enhancement is documented as Development-only. This does **not** mean a new production release has been approved.

Before any future promotion, run the relevant target-environment checks against the exact candidate commit, verify language-specific assets and translations in the Multilingual repositories, confirm target CNAME and deployment configuration, and obtain explicit approval for the named destination repository.
