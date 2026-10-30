# M0 Baseline Audit

Audit date: 2026-10-24 (Asia/Calcutta)

## Project identification and architecture

- Project: Civic Smart, Phase III baseline audit.
- Repository root: `C:\Users\Hp\Downloads\Civic_smart-main\Civic_smart-main` (nested project directory).
- Architecture: static HTML/CSS/JavaScript frontend, Flask REST API, PostgreSQL datastore, and a C++ scheduling component. These components are not independently running microservices in the current setup.

## Repository protection and inventory

- The opened folder contained the project in `Civic_smart-main/`; that nested folder is the repository root.
- The source folder had no `.git` history. A local Git repository was initialized and an untouched source baseline was committed as `85860e8` (`Baseline source before Phase III`).
- Work branch: `phase3-integration`; baseline branch: `master`; working tree was clean immediately after branching.
- No remote was configured or used. Nothing was pushed.
- Source inventory: 7 HTML pages, 11 JavaScript files, 13 CSS files, 3 Python files, 4 SQL files, 8 image assets, and the C++ scheduler, plus setup and project documentation.
- No `scripts/phase3/m0_baseline_check.py` was present.
- Data-preservation confirmation: no database setup, migration, seed operation, or connection to an existing database was performed; no credentials were used. The source baseline commit preserves the original application files.

## Static baseline checks

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Python syntax | Pass | `backend/app.py` and `backend/setup_db.py` parsed with Python 3.12.3. |
| JavaScript syntax | Not run | Node.js is not installed or available on PATH. |
| HTML local references | Pass | 216 local `href`/`src` references scanned across the 7 HTML pages; no missing targets reported. |
| C++ compilation | Pass | `civic_os_engine.cpp` compiled with `g++ -std=c++11` to a temporary directory. |
| C++ scheduler smoke checks | Pass | Sample input selected `high` with score 81; empty input returned `selected: null`. These are local smoke checks, not full-stack tests. |

The prepared audit script was absent, so the checks above were performed directly. No application code or database schema was modified during this audit.

## Local environment and database readiness

- Python: 3.12.3.
- Flask: installed, version 3.1.3.
- Flask-CORS: not installed.
- psycopg2-binary: not installed.
- python-dotenv: not installed (the application has a fallback environment-file parser).
- PostgreSQL Windows service: no matching service was listed.
- `psql`: not available on PATH.
- Flask health check at `http://localhost:5000/api/health`: connection failed; no API response was available.
- Existing project database and records: not inspected; no credentials or database connection were used.
- Live Flask/PostgreSQL integration: blocked pending PostgreSQL/driver readiness and a confirmed target database/backup strategy.

## Browser evidence

The local browser checklist is in [M0_BROWSER_CHECKLIST.md](M0_BROWSER_CHECKLIST.md). Checks were not independently run in this environment; classifications for citizen login, ward options, photo preview, Officer Portal, seeded `CS1024` tracking, and the newly submitted complaint issue are based on screenshots and observations supplied by the user. No screenshots were captured by this audit environment. Do not treat the demo's localStorage or a submission success message as PostgreSQL persistence.

## Confirmed source-level defect log

These are audit findings for planned milestones, not claims of runtime reproduction in this environment.

| ID | Finding | Planned milestone |
| --- | --- | --- |
| D01 | Local-first frontend operations can report success before a backend write is confirmed. | M2 |
| D02 | Officer assignment state changes are not fully persisted through an assignment lifecycle API. | M6 |
| D03 | Login roles are demo-only; Ward Superior and separate Final Admin are missing. | M7 |
| D04 | C++ priority rules differ from frontend and database calculations. | M4 |
| D05 | Scheduler integration does not yet provide independent ward queues. | M5 |
| D06 | Scheduler candidate selection needs a reliable complaint-level SLA deadline. | M4 |
| D07 | Location detection is simulated; real geolocation and verified ward lookup are absent. | M8 |
| D08 | Photo preview does not constitute secure persistent evidence storage. | M8 |
| D09 | Duplicate detection is not yet a complete persistent canonical-issue workflow. | M8 |
| D10 | Setup documentation has inconsistent database names and references to absent files. | M1 / M11 |
| D11 | Database schema does not yet fully represent the proposed supervisor, engineering, evidence and review model. | M3 / M6 / M9 |
| D12 | Backend authorization and static file exposure require security review. | M7 |
| D13 | Concurrent allocation and state transitions require transaction and locking tests. | M6 / M10 |
| D14 | Automated regression tests are not yet present in the original repository. | M10 |
| D15 | Report submission omits the authentication module, so the complaint may lack the active citizen ID used by My Complaints and Track ownership filters; submission success follows a local write without confirmed PostgreSQL persistence. | M2 |

### D15 — Citizen ownership mismatch on report submission

**Files:** `report.html`, `js/report.js`, `js/my-complaints.js`, `js/track.js`

**Observation:** A complaint was reported as successfully recorded, but it did not appear in My Complaints and its tracking timeline was unavailable. The supplied screenshots also show a seeded complaint timeline rendering.

**Source-level confirmation:** `report.html` does not load `js/auth.js`. `js/report.js` reads identity through `window.CivicAuth`, so that value is unavailable on the report page and the complaint is created with a null citizen ID and the entered name or `Anonymous Citizen`. My Complaints and Track filter by citizen ID or exact citizen name. The CivicAPI bridge mirrors the local complaint asynchronously and does not wait for or verify the backend response before the form displays success.

**Status:** Reported in supplied browser screenshots; not independently reproduced in this audit environment. PostgreSQL persistence was not verified.

**Planned resolution:** M2 — reliable persistence and API handling.

## M0 completion criteria

- Original source baseline and working branch are identified and preserved.
- Static check outcomes, browser evidence limits, environment constraints, and findings D01–D15 are recorded.
- All 15 browser checklist items have a result, including `Not tested` where evidence is unavailable.
- No application code, database schema, or seed data was changed during M0.
- The four M0 documentation files are committed, with a clean working tree after the audit commit.

M0 documentation is complete subject to the final local documentation commit and clean-tree verification. PostgreSQL integration, JavaScript syntax checking, and independent browser reproduction remain limitations, not failed tests.

## Outstanding evidence

- Remaining browser flow and console observations require the user's local browser. D15's browser observations above come from the supplied screenshots; the same-name workaround has not been tested.
- Node.js must be installed or made available to complete JavaScript syntax checks.
- Confirm the intended PostgreSQL instance and whether it contains records that must be preserved before any setup or schema work.
