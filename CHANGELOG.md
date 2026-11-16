# Changelog

## v4.7.0 — Current application baseline (16 November 2026)
- Establishes v4.7.0 as the current Enhancement Development application identity, synchronized from the approved English Live baseline.
- Officer Command Centre application title and manifest name are aligned.
- Officer data manifest: `2026.11.14-01`; 68 Officers and 68 matching portraits.
- Seasonal default dataset: 46 Officers, maintained separately from the full 68-Officer database.
- Confirmed S8 Po and S8 Sara costs: 720 ORV / 360 SRV.
- Retains the approved rarity-specific badge totals and incremental skill progression rules.
- No application version increment is made by the validation work recorded below.

### Enhancement Development validation — 16 November 2026 (not a production release)
- Hardened global resource capture and restore against unavailable form controls.
- Expanded browser regression coverage for Single-Officer, Multi-Officer and Advanced Planner calculations, saved progress, persistence, mixed-rarity rosters, Selection Chest eligibility, partial badge funding, ORV remainders and mixed-inventory allocation.
- Final browser regression: 161 passed, 0 failed (commit `48ec2edcf289c6d55a082f2147f846d045942031`).
- Officer-data validation: 2,036 checks passed, 0 errors (run `43884997100`).
- These checks validate the isolated Enhancement Development environment only. They do not authorize or constitute promotion to either Test or Live.

## v4.6.0 STABLE
- Promoted the corrected Edit Officer Progress build to Stable.
- Immediate unlock/strand refresh restored.
- Edit-modal MAX uses the proven main Officer MAX routine.

## v4.6.0 LIVE
- Added Upgrade Targets & Recommendations.
- Added Dynamic Officer Data and Global Officer Data status.
- Added database-driven Future Officer Cost Forecasting.
- Historical confirmed forecast baseline at that release: S7 Tank Destroyers, 600 ORV / 300 SRV.
- Promoted the validated English Test build to a clean static Live package.

## v4.5.0 TEST
- Rebuilt from the stable v4.4.0 English Live baseline.
- Added native working-state persistence for Officer, Progress, Compare and Planner UI state.
- Corrected Legendary Officer Badge Chest and Selection Chest rules.
- Updated Resource Optimiser and Multi-Officer Planner behaviour.
- Reordered Central Inventory using the approved Order in List numbering.
- Removed the non-game 50 XP Book entry.
- Updated README, User Guide, release notes and in-app Help for v4.5.0 TEST.

## v4.4.0 LIVE
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
- Training costs vary by rarity: 5 / 25 / 100 badges per point.
- Skill Strand star-unlock logic remains identical for all rarities.

## v4.3.33 LIVE
- Progress tab retains the three status categories: MAXED, IN PROGRESS and NOT STARTED.
- Within each category, Officers are sorted newest season first.
- Compare Officer Progress season list presents newest seasons first.
- No Officer profile, resource, calculation or Backup & Restore storage schema changes.

## v4.3.31 TEST
- Fixed duplicate season prefix labels.

## v4.3.30 LIVE
- Fixed incomplete cross-device Backup & Restore.
- Export commits the active Officer profile before creating the JSON snapshot.
- Individual Officer Badges Held transfer correctly.
- Officer-specific progress and shared resource inventories are retained.
- Restore avoids stale KoW Companion local-storage values on the destination device.
- Corrected Officer database migration for Epic and Elite Officers and added portrait assets.
- Corrected Dorothea spelling throughout published Officer data and added migration compatibility for previously saved `Dorethea` profiles.
- Rarity-dependent Stars, Skill Promotion and Training information follows the selected Officer rarity.

### v4.3.36 TEST — Progress rarity consistency patch
- Progress uses each Officer's rarity-specific Promotion and Training requirements.
- Fully MAXED profiles report 100% / MAXED consistently.
- Skill-cost summaries follow the selected Officer rarity.

### v4.3.36 TEST — Confirmed Elite badge correction
- Elite unlock: 10 badges.
- Elite Training: 100 badges per training point.
- Elite totals and progression were subsequently superseded by the current approved rarity-specific data model; consult the current validator and application data rather than treating historical figures as current.

## v4.3.58 LIVE
- Added Officer Readiness Intelligence with Ready / Shortfall checks and exact missing resources.
