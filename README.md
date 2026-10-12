# Civic Smart

Civic Smart is an OS and DBMS inspired civic grievance management project for Dehradun. It lets citizens report civic issues, track complaint progress, and view complaint history. It also includes an authority dashboard, an officer portal, and a C++ operating-system scheduling simulator that models complaints as processes.

## Project Overview

The project demonstrates how civic complaints can be managed using concepts from:

- Operating Systems
- DBMS
- Scheduling algorithms
- Role-based workflows
- Complaint lifecycle tracking
- Municipal ward jurisdiction mapping

The current version is a frontend demo with browser `localStorage` used as the shared data store. The C++ scheduler exists separately as an OS simulation module.

## Main Features

- Citizen complaint submission
- Dehradun tehsil and ward selection
- Full Dehradun municipal ward list from Ward 1 to Ward 100
- Complaint tracking by complaint ID
- My Complaints page for citizen history
- Authority dashboard for triage and status updates
- Officer portal for assignment handling
- Officer allocation simulation
- Priority score calculation
- Aging simulation for pending complaints
- Audit trail and notifications
- C++ OS scheduling engine
- Exportable `scheduled_complaints.json`

## Dehradun Jurisdiction Support

The complaint form includes Dehradun-specific jurisdiction fields.

Tehsils / Sub-Districts:

- Dehradun Sadar
- Doiwala
- Rishikesh
- Vikasnagar
- Chakrata
- Kalsi
- Tyuni
- Mussoorie

Municipal wards:

- Ward 1 - Malshi
- Ward 2 - Vijay Pur
- Ward 3 - Ranjhawala
- ...
- Ward 100 - Nathuawala

These fields help identify where the complaint belongs and which municipal jurisdiction should handle it.

## Pages

| Page | File | Purpose |
| --- | --- | --- |
| Home | `index.html` | Landing page and project overview |
| Report Complaint | `report.html` | Citizen complaint submission |
| Track Complaint | `track.html` | Complaint status tracking |
| My Complaints | `my-complaints.html` | Citizen complaint history |
| Authority Dashboard | `admin.html` | Municipal admin triage and monitoring |
| Officer Portal | `officer.html` | Officer assignment workflow |
| Login | `login.html` | Role-based demo login |

## JavaScript Modules

| File | Purpose |
| --- | --- |
| `js/civic-data.js` | Shared browser-side data store, complaint lifecycle, assignments, audit, notifications |
| `js/report.js` | Handles complaint form submission |
| `js/track.js` | Displays complaint tracking details |
| `js/my-complaints.js` | Shows citizen complaint list and filters |
| `js/admin.js` | Handles authority dashboard logic |
| `js/officer.js` | Handles officer portal actions |
| `js/nav.js` | Sidebar and navigation behavior |

## How To Run The Website

Open the project folder in VS Code:

```text
C:\Users\Hp\OneDrive\Desktop\Civics Smart
```

Open a new terminal in VS Code:

```text
Terminal -> New Terminal
```

Run:

```powershell
py -m http.server 8000
```

Then open this URL in your browser:

```text
http://localhost:8000/index.html
```

Important: type the URL in the browser address bar, not in PowerShell.

## Demo Flow

1. Open `report.html`.
2. Select a category.
3. Select a Dehradun tehsil.
4. Select a Dehradun municipal ward.
5. Enter the complaint title, description, location, severity, and citizen details.
6. Submit the complaint.
7. Copy the generated complaint ID.
8. Open `track.html`.
9. Search the complaint ID.
10. Open `admin.html`.
11. Update status or allocate an officer.
12. Open `officer.html`.
13. Accept, start, block, or submit completion for assigned work.
14. Return to `track.html` to see updated status.

## Data Storage

This version uses browser `localStorage`.

That means:

- Data stays in the same browser.
- Refreshing the page keeps the data.
- Clearing browser site data removes the complaints.
- It is not a real production database.

To reset demo data, open the browser console and run:

```javascript
CivicData.resetDemoData()
```

Then refresh the page.

## C++ OS Scheduling Engine

The file `civic_os_engine.cpp` implements an OS-style complaint scheduler.

It models:

- Process Control Blocks
- Process states
- Priority scheduling
- Multilevel queues
- Aging
- Dispatcher behavior
- Blocking and unblocking
- Process termination

Compile and run:

```powershell
g++ -std=c++11 civic_os_engine.cpp -o civic_os_engine.exe
.\civic_os_engine.exe
```

Or run:

```powershell
.\compile_and_run.bat
```

More details are available in:

```text
README_OS_BACKEND.md
```

## Scheduling Formula

The priority score is based on:

```text
Priority Score = Base Severity + Duplicate Boost + Aging Boost
```

Example:

- Critical complaints start with higher priority.
- Duplicate citizen reports increase importance.
- Older unresolved complaints receive aging boost to avoid starvation.

## PostgreSQL DBMS Backend Integration

Civic Smart now includes a complete production-grade **PostgreSQL DBMS** implementation:

- **Relational Tables**: `citizens`, `authorities`, `complaints`, `assignments`, `status_history`, and `notifications`
- **Integrity**: Primary keys, foreign keys (`ON DELETE CASCADE` / `SET NULL`), and `CHECK` constraints
- **Indexes**: Composite B-tree indexes for Multilevel Queue (MLQ) priority retrieval, ward analytics, and timelines
- **Automated Triggers**: Dynamic priority score computation and auto-audit history logging
- **Stored Procedures**: `sp_simulate_daily_aging()` (anti-starvation aging) and `sp_allocate_officer()` (workload-aware dispatch)
- **Analytical Views**: `vw_priority_queue_mlq`, `vw_officer_workload`, `vw_ward_hotspots`, `vw_complaint_full_details`
- **REST API Backends**: Complete Node.js (Express) and Python (Flask) backends in `backend/`
- **1-Click Database Setup**: `setup_database.bat`

For complete step-by-step setup instructions, please read:
👉 **[POSTGRES_SETUP_GUIDE.md](file:///c:/Users/suhan/OneDrive/Desktop/Projects/Civic_smart/Civic_smart/POSTGRES_SETUP_GUIDE.md)**

## Current Limitations & Fallback Mode

The application supports dual-mode operation:
- **Offline / Standalone Mode**: If PostgreSQL is not connected or the backend server is stopped, the app transparently operates using browser `localStorage` so the frontend demo never breaks.
- **PostgreSQL Live Mode**: Once PostgreSQL and the backend API are started on `http://localhost:5000`, the topbar badge automatically displays `PostgreSQL Live: civic_smart_db` with live data sync.

## Team / Module

Project: Civic Smart  
Module: Operating Systems and DBMS Based Civic Grievance Management  
Focus Area: Dehradun municipal complaint workflow  
DBMS Module: PostgreSQL Relational Implementation & REST Backend  
OS Module: C++ Multilevel Feedback Queue Scheduling Engine  
