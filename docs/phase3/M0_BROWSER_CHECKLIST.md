# M0 Browser Checklist

Status: Partially tested from user-provided screenshots and observations. No browser session was available for independent reproduction. Use sample data only when running these checks locally.

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Home page loads, styles/images appear, navigation works | Not independently verified | No supplied evidence establishes the full home-page and navigation flow. |
| 2 | Citizen demo login opens My Complaints | Pass (screenshot evidence) | Supplied screenshot shows the citizen demo session on My Complaints. |
| 3 | Officer demo login opens Officer Portal | Pass (screenshot evidence) | Supplied screenshot shows the Officer Portal and an assignment. |
| 4 | Authority demo login opens Authority Dashboard | Not tested | No screenshot or browser observation supplied. |
| 5 | Empty required report fields show validation | Not tested | No validation attempt was documented. |
| 6 | Ward options load and changing ward updates locality suggestions | Pass (screenshot evidence) | Ward options were visible in the supplied report-form screenshot. Changing-ward suggestion behavior was not independently reproduced. |
| 7 | Location detection behavior (simulated detector) | Fail (reported) | The supplied observation indicates the ward-selection requirement appeared before detection. Not independently reproduced. |
| 8 | Sample non-sensitive photo preview and removal | Pass (screenshot evidence) | Photo preview was visible; removal behavior was not independently reproduced. |
| 9 | Sample complaint submission and tracking ID | Reported success; persistence unverified | The form reportedly showed a success message and tracking ID. This does not confirm backend or PostgreSQL persistence. |
| 10 | Sample complaint appears in My Complaints | Fail (reported) | The newly submitted complaint was reportedly missing from My Complaints. Not independently reproduced. |
| 11 | Tracking displays status for sample ID | Pass for seeded ID; fail reported for new ID | Supplied screenshot shows the seeded complaint `CS1024` timeline rendering. The new complaint reportedly showed “Complaint Not Found.” |
| 12 | Authority queue and actions | Not independently verified | No supplied screenshot verifies the full authority queue/action flow. |
| 13 | Officer assignments and status actions | Pass (screenshot evidence) | An assignment was visible in the supplied Officer Portal screenshot; status actions were not independently exercised. |
| 14 | Refresh persistence behavior | Not tested | No refresh behavior was documented. |
| 15 | Browser console errors and failed requests | Not tested | No console or network log was supplied. |

## Browser findings

### Newly submitted complaint visibility

**Expected:** The new complaint appears in My Complaints for the logged-in citizen.

**Observed:** The interface reportedly showed submission success, but the complaint was reportedly absent from My Complaints.

**Evidence:** User-provided screenshots and browser observations. Not independently reproduced here.

**Database persistence:** Not verified.

**Planned resolution:** M2 — Reliable API and database persistence.

### Tracking timeline

**Expected:** Tracking displays the status timeline for a valid complaint ID owned by the citizen.

**Observed:** The seeded complaint `CS1024` timeline rendered in the supplied screenshot. The newly submitted complaint reportedly showed “Complaint Not Found.”

**Evidence:** User-provided screenshots and browser observations. Not independently reproduced here.

**Database persistence:** Not verified.

**Planned resolution:** M2 — Reliable API and database persistence.

Reminder: browser demo persistence is localStorage behavior and does not establish PostgreSQL persistence. Demo login is not secure authentication; location detection is simulated; photo preview does not mean a server upload occurred. The same-name workaround has not been tested in this environment.
