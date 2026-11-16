# Changelog

## v4.7.0 — Current application baseline (16 November 2026)
- Confirms v4.7.0 as the current Enhancement Development application identity, synchronized from the approved English Live baseline.
- Officer Command Centre application title and manifest name are aligned.
- Officer data manifest: `2026.11.14-01`; 68 Officers and 68 matching portraits.
- Seasonal default dataset: 46 Officers, maintained separately from the full 68-Officer database.
- Confirmed S8 Po and S8 Sara costs: 720 ORV / 360 SRV.
- Retains the approved rarity-specific badge totals and incremental skill progression rules.
- The Officer Database editor enhancement is Development-only; no application version increment is made by the work recorded below.

### Enhancement Development validation — 16 November 2026 (not a production release)
- Hardened global resource capture and restore against unavailable form controls.
- Expanded browser regression coverage for Single-Officer, Multi-Officer and Advanced Planner calculations, saved progress, persistence, mixed-rarity rosters, Selection Chest eligibility, partial badge funding, ORV remainders and mixed-inventory allocation.
- Final browser regression: 161 passed, 0 failed (commit `48ec2edcf289c6d55a082f2147f846d045942031`).
- Officer-data validation: 2,036 checks passed, 0 errors (run `43884997100`).
- These checks validate the isolated Enhancement Development environment only. They do not authorize or constitute promotion to either Test or Live.

### Officer Database editor enhancement — 16 November 2026 (Development only)
- Added editable Rarity (Legendary / Epic / Elite) and Role fields to the Officer Database editor.
- Added Rarity and Role to CSV export and import while retaining compatibility with older CSV files that omit those columns.
- Replaced the line-based CSV parser with a parser that supports quoted commas, escaped quotes and embedded line breaks; added required-header checks, import validation, confirmation before replacing the local database and file-read error handling.
- Extended Officer database validation for required names, duplicate names, Season, Rarity and Role while retaining the existing ORV/SRV validation rules.
- Browser regression on this commit: 161 passed, 0 failed (run `43958525071`). Officer-data validation completed successfully (run `43958525148`).
- No skill progression costs, calculator logic, Officer datasets, application version or deployment configuration were changed.

## v4.6.0 STABLE
- Promoted the corrected Edit Officer Progress build to Stable.
- Immediate unlock/strand refresh restored.
- Edit-modal MAX uses the proven main MAX Officer routine.


## v4.6.0 LIVE
- Added Upgrade Targets & Recommendations.
- Added Dynamic Officer Data and Global Officer Data status.
- Added database-driven Future Officer Cost Forecasting.
- Current confirmed forecast baseline at release: S7 Tank Destroyers, 600 ORV / 300 SRV.
- Promoted the validated English Test build to a clean static Live package.


## v4.5.0 TEST
- Rebuilt from the stable v4.4.0 English Live baseline.
- Added native working-state persistence for Officer, Progress, Compare and Planner UI state.
- Corrected Legendary Officer Badge Chest and Selection Chest rules.
- Updated Resource Optimiser and Multi-Officer Planner behaviour.
- Reordered Central Inventory using the approved Order in List numbering.
- Removed the non-game 50 XP Book entry.
- Updated README, User Guide, release notes and in-app Help for v4.5.0 TEST.

# v4.4.0 LIVE
- Added Planning Readiness Dashboard for saved future-Officer scenarios.
- Added Badge, Star and XP readiness percentages and overall limiting-resource readiness.
- Added Priority Target, Suggested Next Action and Open in Planner.
- Updated runtime version metadata and What's New content to v4.4.0.

## v4.3.51 TEST
- Planner: Central Inventory individual Officer Badges applied first and displayed separately.
- Planner: Use current held resources reads Central Inventory directly.

## v4.3.36 TEST
- Added Legendary / Epic / Elite rarity.
- Added rarity filter and rarity colour indicator.
- Added 8 Epic and 2 Elite Original Officers.
- Added multi-role filtering.
- Training costs now vary by rarity: 5 / 25 / 100 badges per point.
- Skill Strand star-unlock logic remains identical for all rarities.

## v4.3.33 LIVE
- Progress tab now keeps the three status categories: MAXED, IN PROGRESS and NOT STARTED.
- Within each category, Officers are sorted newest season first: S7, S6, S5, S4, S3, S2, Original.
- Officers within the same season retain database order in the main Progress table.
- Compare Officer Progress season list now also presents newest seasons first.
- No Officer profile, resource, calculation or Backup & Restore storage schema changes.

## v4.3.31 TEST
- Fixed duplicate season prefix labels.

# Changelog

## v4.3.30 LIVE
- Fixed incomplete cross-device Backup & Restore.
- Export now commits the active Officer profile before creating the JSON snapshot.
- Individual Officer Badges Held now transfer correctly.
- Officer-specific progress and shared resource inventories are retained.
- Restore avoids stale KoW Companion local-storage values on the destination device.

- Corrected v4.3.36 Officer database migration so the 8 Epic and 2 Elite Officers are merged into existing 56-Officer browser databases without resetting saved progress. All Rarities now contains 66 Officers.
- Added portraits for all 8 Epic and 2 Elite Original Officers.
- Corrected Dorothea spelling throughout published Officer data and added migration compatibility for previously saved `Dorethea` profiles.


- Rarity flow correction: Stars and Skill Promotion information now follow the selected Officer rarity. Epic/Elite hide Legendary SRV flow; Planner labels use the matching Star rarity; Skill Promotion totals/sequences are rarity-specific.


### v4.3.36 TEST — Progress rarity consistency patch
- Progress now uses each Officer's rarity-specific Promotion and Training requirements.
- Fully MAXED profiles (5★, Level 70, unlocked, all skills Level 5, Training 180) report 100% / MAXED consistently.
- Skill-cost summaries explicitly follow the currently selected Officer rarity.


### v4.3.36 TEST — Confirmed Elite badge correction
- Elite unlock: 10 badges.
- Elite Skills 1–16: 10,10,15,15,20,20,25,25,30,30,35,35,40,40,45,45 = 440 badges.
- Elite Training: 100 × 180 = 18,000 badges.
- Elite MAX total corrected to 18,450 badges.


### v4.3.36 TEST — Officer rarity refresh fix
- Development now refreshes rarity-dependent text/calculations every time the selected Officer changes and whenever Develop is opened.
- Epic shows 25 badges/training point and 4,950 total to MAX.
- Elite shows 100 badges/training point and 18,450 total to MAX.
- Epic and Elite both use the confirmed 440-badge promotion sequence.
- Removed the stray Elite TEST/provisional suffix from the promotion description.

## v4.3.58 LIVE
- Added Officer Readiness Intelligence with Ready / Shortfall checks and exact missing resources.
