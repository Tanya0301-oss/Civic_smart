-- ============================================================================
-- CIVIC SMART: USEFUL POSTGRESQL QUERIES & ANALYTICAL SCRIPTS
-- Municipal Grievance & OS-Inspired Workflow Management System (Dehradun)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: CITIZEN PORTAL QUERIES
-- ----------------------------------------------------------------------------

-- 1.1 Citizen Complaint History (Used by "My Complaints" page)
-- Input: :citizen_phone (e.g. '+91 98102 44921')
SELECT 
    c.complaint_id,
    c.title,
    c.category,
    c.location,
    c.department,
    c.severity,
    c.priority_score,
    c.status,
    c.duplicate_count,
    c.waiting_days,
    c.created_at,
    COALESCE(auth.name, 'Awaiting Officer') AS assigned_officer
FROM complaints c
JOIN citizens cit ON c.citizen_id = cit.citizen_id
LEFT JOIN authorities auth ON c.assigned_officer_id = auth.officer_id
WHERE cit.phone = '+91 98102 44921'
ORDER BY c.created_at DESC;

-- 1.2 Complaint Tracking & Audit Timeline (Used by "Track Complaint" page)
-- Input: :complaint_id (e.g. 'CS1024')
SELECT 
    c.complaint_id,
    c.title,
    c.description,
    c.category,
    c.department,
    c.location,
    c.tehsil,
    c.ward,
    c.severity,
    c.priority_score,
    c.status,
    c.process_state,
    c.photo_url,
    c.created_at,
    auth.name AS officer_name,
    auth.role AS officer_role,
    auth.phone AS officer_contact,
    asn.state AS assignment_state,
    asn.deadline AS assignment_deadline
FROM complaints c
LEFT JOIN authorities auth ON c.assigned_officer_id = auth.officer_id
LEFT JOIN assignments asn ON c.complaint_id = asn.complaint_id AND asn.state != 'REJECTED'
WHERE c.complaint_id = 'CS1024';

-- 1.3 Full Event Timeline for a Tracked Complaint
SELECT 
    history_id,
    action,
    role,
    actor,
    from_status,
    to_status,
    message,
    created_at
FROM status_history
WHERE complaint_id = 'CS1024'
ORDER BY created_at ASC;


-- ----------------------------------------------------------------------------
-- SECTION 2: AUTHORITY / ADMIN DASHBOARD QUERIES
-- ----------------------------------------------------------------------------

-- 2.1 Live Municipal KPI Summary Metrics
SELECT 
    COUNT(*) AS total_complaints,
    COUNT(*) FILTER (WHERE status IN ('Reported', 'Verified')) AS pending_triage,
    COUNT(*) FILTER (WHERE status IN ('Assigned', 'In Progress', 'Blocked', 'Completion Submitted')) AS in_field_progress,
    COUNT(*) FILTER (WHERE priority_score >= 85 AND status != 'Resolved') AS critical_emergency_cases,
    COUNT(*) FILTER (WHERE status = 'Resolved') AS total_resolved,
    COUNT(DISTINCT cluster_id) AS active_geographic_clusters,
    ROUND(AVG(priority_score) FILTER (WHERE status != 'Resolved'), 1) AS avg_active_priority
FROM complaints;

-- 2.2 Department Workload Breakdown
SELECT 
    department,
    COUNT(*) AS total_cases,
    COUNT(*) FILTER (WHERE status IN ('Reported', 'Verified')) AS unassigned_cases,
    COUNT(*) FILTER (WHERE status IN ('Assigned', 'In Progress')) AS active_field_cases,
    COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved_cases,
    ROUND(
        (COUNT(*) FILTER (WHERE status = 'Resolved')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 
        1
    ) AS resolution_percentage
FROM complaints
GROUP BY department
ORDER BY total_cases DESC;

-- 2.3 Find Eligible Officers for Allocation (Manual or Automated Matcher)
-- Input: :complaint_id (e.g. 'CS1060')
WITH target AS (
    SELECT category, department, ward, tehsil 
    FROM complaints 
    WHERE complaint_id = 'CS1060'
)
SELECT 
    a.officer_id,
    a.name,
    a.role,
    a.department,
    a.capacity,
    COUNT(asn.assignment_id) FILTER (
        WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
    ) AS current_active_load,
    a.capacity - COUNT(asn.assignment_id) FILTER (
        WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
    ) AS remaining_capacity,
    a.availability
FROM authorities a
CROSS JOIN target t
LEFT JOIN assignments asn ON a.officer_id = asn.officer_id
WHERE a.availability = 'Available'
  AND (a.department = t.department OR t.category = ANY(a.skills))
  AND (
      'Dehradun Municipal Corporation' = ANY(a.service_areas)
      OR t.ward = ANY(a.service_areas)
      OR t.tehsil = ANY(a.service_areas)
  )
GROUP BY a.officer_id, a.name, a.role, a.department, a.capacity, a.availability
HAVING COUNT(asn.assignment_id) FILTER (
    WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
) < a.capacity
ORDER BY current_active_load ASC, a.name ASC;


-- ----------------------------------------------------------------------------
-- SECTION 3: OFFICER PORTAL QUERIES
-- ----------------------------------------------------------------------------

-- 3.1 Active Field Worklist for an Officer
-- Input: :officer_id (e.g. 'OFF-RD-104')
SELECT 
    asn.assignment_id,
    asn.state AS assignment_state,
    asn.deadline,
    asn.actor AS assigned_by,
    c.complaint_id,
    c.title,
    c.description,
    c.category,
    c.severity,
    c.priority_score,
    c.location,
    c.ward,
    c.status AS complaint_status,
    c.duplicate_count,
    c.waiting_days,
    c.photo_url,
    c.created_at
FROM assignments asn
JOIN complaints c ON asn.complaint_id = c.complaint_id
WHERE asn.officer_id = 'OFF-RD-104'
  AND asn.state NOT IN ('REJECTED')
ORDER BY c.priority_score DESC, asn.created_at ASC;

-- 3.2 Update Assignment State (Accept / Progress / Block / Complete)
-- Example: Moving ASN-CS1024-1 to IN_PROGRESS
-- UPDATE assignments
-- SET state = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
-- WHERE assignment_id = 'ASN-CS1024-1';
-- UPDATE complaints
-- SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP
-- WHERE complaint_id = 'CS1024';


-- ----------------------------------------------------------------------------
-- SECTION 4: OPERATING SYSTEM SCHEDULING & MLQ QUERIES
-- ----------------------------------------------------------------------------

-- 4.1 Extract Multilevel Queue (MLQ) Process Table for Export / C++ Sync
SELECT 
    complaint_id AS id,
    title,
    category,
    location,
    ward,
    department,
    priority_score AS "priorityScore",
    CASE 
        WHEN priority_score >= 85 THEN 0
        WHEN priority_score >= 70 THEN 1
        ELSE 2
    END AS "queueLevel",
    duplicate_count AS "duplicateCount",
    waiting_days AS "waitingDays",
    aging_boost AS "agingBoost",
    status,
    process_state AS "processState"
FROM complaints
WHERE status NOT IN ('Resolved', 'Rejected')
ORDER BY "queueLevel" ASC, priority_score DESC, created_at ASC;

-- 4.2 Starvation & Anti-Aging Risk Detection
-- Detect complaints waiting longer than 3 days that require urgent dispatch
SELECT 
    complaint_id,
    title,
    category,
    ward,
    severity,
    waiting_days,
    aging_boost,
    priority_score,
    status
FROM complaints
WHERE waiting_days >= 3
  AND status NOT IN ('Resolved', 'Completion Submitted')
ORDER BY waiting_days DESC, priority_score DESC;

-- 4.3 Trigger Daily Aging Simulation (Runs stored procedure)
-- CALL sp_simulate_daily_aging();


-- ----------------------------------------------------------------------------
-- SECTION 5: ANALYTICS & GOVERNANCE INTELLIGENCE
-- ----------------------------------------------------------------------------

-- 5.1 Average Resolution Time per Category (Turnaround SLA)
SELECT 
    category,
    COUNT(*) AS total_resolved,
    ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)::NUMERIC, 1) AS avg_resolution_days,
    MIN(ROUND(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400::NUMERIC, 1)) AS min_days,
    MAX(ROUND(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400::NUMERIC, 1)) AS max_days
FROM complaints
WHERE status = 'Resolved' AND resolved_at IS NOT NULL
GROUP BY category
ORDER BY avg_resolution_days ASC;

-- 5.2 Hotspot Cluster Ranking (Wards with repeated citizen complaints)
SELECT 
    c.cluster_id,
    c.category,
    c.ward,
    c.location,
    SUM(c.duplicate_count) AS total_citizen_reports,
    COUNT(c.complaint_id) AS distinct_tickets,
    MAX(c.priority_score) AS max_priority_score,
    MAX(c.created_at) AS latest_report_time
FROM complaints c
WHERE c.cluster_id != 'CLUS-SINGLE'
GROUP BY c.cluster_id, c.category, c.ward, c.location
ORDER BY total_citizen_reports DESC
LIMIT 10;

-- 5.3 Officer Performance & SLA Compliance
SELECT 
    a.officer_id,
    a.name,
    a.department,
    COUNT(asn.assignment_id) AS total_lifetime_assignments,
    COUNT(asn.assignment_id) FILTER (WHERE asn.state = 'COMPLETION_SUBMITTED' OR c.status = 'Resolved') AS completed_jobs,
    COUNT(asn.assignment_id) FILTER (WHERE asn.state = 'BLOCKED') AS blocked_jobs,
    COUNT(asn.assignment_id) FILTER (WHERE asn.state = 'REJECTED') AS rejected_jobs,
    ROUND(
        (COUNT(asn.assignment_id) FILTER (WHERE asn.state = 'COMPLETION_SUBMITTED' OR c.status = 'Resolved')::NUMERIC 
        / NULLIF(COUNT(asn.assignment_id), 0)::NUMERIC) * 100, 
        1
    ) AS completion_rate_percent
FROM authorities a
LEFT JOIN assignments asn ON a.officer_id = asn.officer_id
LEFT JOIN complaints c ON asn.complaint_id = c.complaint_id
GROUP BY a.officer_id, a.name, a.department
ORDER BY completed_jobs DESC, a.name ASC;
