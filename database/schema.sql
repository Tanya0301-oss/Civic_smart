-- ============================================================================
-- CIVIC SMART: POSTGRESQL RELATIONAL DATABASE SCHEMA (DDL)
-- Municipal Grievance & OS-Inspired Workflow Management System (Dehradun)
-- ============================================================================
-- Modules covered: Citizens, Complaints, Authorities, Assignments, Status_History
-- Includes: Primary Keys, Foreign Keys, Check Constraints, B-Tree Indexes,
--           Triggers for Auto-Audit & Priority Calculations, Stored Procedures, Views.
-- Fully Idempotent: Can be executed repeatedly on new or pre-existing databases.
-- ============================================================================

-- 1. EXTENSIONS & DOMAINS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 2. TABLE DEFINITIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table 1: Citizens (Grievance Filers & Public Users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS citizens (
    citizen_id          SERIAL PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    phone               VARCHAR(20) UNIQUE,
    email               VARCHAR(150) UNIQUE,
    address             VARCHAR(255),
    tehsil              VARCHAR(100) DEFAULT 'Dehradun Sadar',
    ward                VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central',
    password_hash       VARCHAR(255),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_citizen_name_nonempty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_citizen_contact CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

COMMENT ON TABLE citizens IS 'Registered and anonymous civic residents filing grievances.';
COMMENT ON COLUMN citizens.phone IS 'Primary identifier for citizen OTP/password authentication.';

-- ----------------------------------------------------------------------------
-- Table 2: Authorities (Municipal Officers, Field Supervisors, Admins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authorities (
    officer_id          VARCHAR(30) PRIMARY KEY, -- e.g. 'OFF-RD-104'
    name                VARCHAR(120) NOT NULL,
    role                VARCHAR(100) NOT NULL, -- e.g. 'Junior Engineer - Roads'
    department          VARCHAR(120) NOT NULL, -- e.g. 'Road Infrastructure & Maintenance'
    skills              TEXT[] NOT NULL DEFAULT '{}', -- e.g. ARRAY['Roads', 'Drainage']
    service_areas       TEXT[] NOT NULL DEFAULT '{}', -- e.g. ARRAY['Ward 32 - Ballupur', 'Dehradun Municipal Corporation']
    ward                VARCHAR(100) DEFAULT 'Dehradun Municipal Corporation', -- Primary headquarters ward
    capacity            INT NOT NULL DEFAULT 4,
    availability        VARCHAR(30) NOT NULL DEFAULT 'Available',
    phone               VARCHAR(20),
    email               VARCHAR(150) UNIQUE,
    password_hash       VARCHAR(255),
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_authority_capacity CHECK (capacity >= 1),
    CONSTRAINT chk_authority_availability CHECK (
        availability IN ('Available', 'Busy', 'On Leave', 'Suspended')
    )
);

COMMENT ON TABLE authorities IS 'Municipal field supervisors, engineers and administrative staff.';
COMMENT ON COLUMN authorities.capacity IS 'Maximum concurrent active assignments an officer can hold.';

-- ----------------------------------------------------------------------------
-- Table 3: Complaints (Process Control Block - PCB in OS Scheduling)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
    complaint_id         VARCHAR(30) PRIMARY KEY, -- e.g. 'CS1024'
    citizen_id           INT REFERENCES citizens(citizen_id) ON DELETE SET NULL,
    citizen_name         VARCHAR(120) NOT NULL DEFAULT 'Anonymous Citizen',
    title                VARCHAR(255) NOT NULL,
    description          TEXT NOT NULL,
    category             VARCHAR(50) NOT NULL,
    department           VARCHAR(120) NOT NULL,
    location             VARCHAR(255) NOT NULL,
    tehsil               VARCHAR(100) NOT NULL DEFAULT 'Dehradun Sadar',
    ward                 VARCHAR(100) NOT NULL DEFAULT 'Ward 1 - Dehradun Central',
    severity             VARCHAR(20) NOT NULL DEFAULT 'Medium',
    severity_base        INT NOT NULL DEFAULT 60,
    duplicate_count      INT NOT NULL DEFAULT 1,
    duplicate_boost      INT NOT NULL DEFAULT 0,
    waiting_days         INT NOT NULL DEFAULT 0,
    aging_boost          INT NOT NULL DEFAULT 0,
    priority_score       INT NOT NULL DEFAULT 60,
    status               VARCHAR(40) NOT NULL DEFAULT 'Reported',
    process_state        VARCHAR(100) NOT NULL DEFAULT 'NEW / READY (MLQ Pending Verification)',
    photo_url            TEXT,
    cluster_id           VARCHAR(50) DEFAULT 'CLUS-SINGLE',
    assigned_officer_id  VARCHAR(30) REFERENCES authorities(officer_id) ON DELETE SET NULL,
    resolved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_complaint_category CHECK (
        category IN ('Roads', 'Water', 'Waste', 'Lighting', 'Drainage', 'Electricity', 'Other')
    ),
    CONSTRAINT chk_complaint_severity CHECK (
        severity IN ('Low', 'Medium', 'High', 'Critical')
    ),
    CONSTRAINT chk_complaint_severity_base CHECK (
        severity_base IN (40, 60, 75, 90)
    ),
    CONSTRAINT chk_complaint_counters CHECK (
        duplicate_count >= 1 AND
        duplicate_boost >= 0 AND
        waiting_days >= 0 AND
        aging_boost >= 0
    ),
    CONSTRAINT chk_complaint_priority_range CHECK (
        priority_score BETWEEN 0 AND 100
    ),
    CONSTRAINT chk_complaint_status CHECK (
        status IN (
            'Reported',
            'Verified',
            'Assigned',
            'In Progress',
            'Blocked',
            'Completion Submitted',
            'Resolved',
            'Disputed',
            'Rejected'
        )
    )
);

COMMENT ON TABLE complaints IS 'Core grievance records acting as OS Processes with priority scoring.';
COMMENT ON COLUMN complaints.priority_score IS 'Computed dynamically: SeverityBase + DuplicateBoost + AgingBoost.';

-- ----------------------------------------------------------------------------
-- Table 4: Assignments (Task Dispatch & Dispatcher State)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
    assignment_id       VARCHAR(40) PRIMARY KEY, -- e.g. 'ASN-CS1024-1'
    complaint_id        VARCHAR(30) NOT NULL REFERENCES complaints(complaint_id) ON DELETE CASCADE,
    officer_id          VARCHAR(30) NOT NULL REFERENCES authorities(officer_id) ON DELETE RESTRICT,
    state               VARCHAR(40) NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    actor               VARCHAR(100) NOT NULL DEFAULT 'Authority Console',
    deadline            TIMESTAMPTZ,
    rejection_reason    TEXT,
    blocker             TEXT,
    completion_note     TEXT,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_assignment_state CHECK (
        state IN (
            'PENDING_ACCEPTANCE',
            'ACCEPTED',
            'IN_PROGRESS',
            'BLOCKED',
            'COMPLETION_SUBMITTED',
            'REJECTED',
            'COMPLETED'
        )
    )
);

COMMENT ON TABLE assignments IS 'Work order dispatches linking municipal officers to complaints.';

-- ----------------------------------------------------------------------------
-- Table 5: Status_History (Audit Trail & Process State Transitions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_history (
    history_id          BIGSERIAL PRIMARY KEY,
    complaint_id        VARCHAR(30) NOT NULL REFERENCES complaints(complaint_id) ON DELETE CASCADE,
    actor               VARCHAR(100) NOT NULL,
    role                VARCHAR(30) NOT NULL,
    action              VARCHAR(120) NOT NULL,
    from_status         VARCHAR(40),
    to_status           VARCHAR(40),
    message             TEXT NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_history_role CHECK (
        role IN ('CITIZEN', 'ADMIN', 'OFFICER', 'SYSTEM')
    )
);

COMMENT ON TABLE status_history IS 'Immutable chronological audit log of all complaint state transitions.';

-- ----------------------------------------------------------------------------
-- Table 6: Notifications (System Alerts & Citizen Tracking Feeds)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    notification_id     BIGSERIAL PRIMARY KEY,
    target_role         VARCHAR(30) NOT NULL,
    complaint_id        VARCHAR(30) REFERENCES complaints(complaint_id) ON DELETE CASCADE,
    message             TEXT NOT NULL,
    is_read             BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_notification_role CHECK (
        target_role IN ('CITIZEN', 'ADMIN', 'OFFICER')
    )
);

COMMENT ON TABLE notifications IS 'Role-directed alerts triggered on complaint state changes.';

-- ============================================================================
-- 2.1 INLINE IDEMPOTENT MIGRATIONS
-- Guarantees pre-existing tables automatically receive missing columns without
-- data loss or SQLSTATE 42703 (undefined_column) errors.
-- ============================================================================

-- Ensure complaints table has all required columns
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS ward VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS tehsil VARCHAR(100) DEFAULT 'Dehradun Sadar';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS severity_base INT DEFAULT 60;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS duplicate_boost INT DEFAULT 0;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS aging_boost INT DEFAULT 0;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS process_state VARCHAR(100) DEFAULT 'NEW / READY (MLQ Lane 2)';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS cluster_id VARCHAR(50) DEFAULT 'CLUS-SINGLE';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_officer_id VARCHAR(30);

-- Populate existing rows where ward or tehsil may be NULL before re-enforcing NOT NULL
UPDATE complaints SET ward = 'Ward 1 - Dehradun Central' WHERE ward IS NULL;
UPDATE complaints SET tehsil = 'Dehradun Sadar' WHERE tehsil IS NULL;

-- Ensure citizens table has ward and tehsil
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS ward VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central';
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS tehsil VARCHAR(100) DEFAULT 'Dehradun Sadar';

-- Ensure authorities table has ward and service_areas
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS ward VARCHAR(100) DEFAULT 'Dehradun Municipal Corporation';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Complaints indexes
CREATE INDEX IF NOT EXISTS idx_complaints_status 
    ON complaints (status);

-- Multilevel Queue (MLQ) priority scheduler index
CREATE INDEX IF NOT EXISTS idx_complaints_mlq_priority 
    ON complaints (status, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_complaints_ward 
    ON complaints (ward);

CREATE INDEX IF NOT EXISTS idx_complaints_tehsil 
    ON complaints (tehsil);

CREATE INDEX IF NOT EXISTS idx_complaints_category 
    ON complaints (category);

CREATE INDEX IF NOT EXISTS idx_complaints_cluster 
    ON complaints (cluster_id);

CREATE INDEX IF NOT EXISTS idx_complaints_citizen 
    ON complaints (citizen_id);

CREATE INDEX IF NOT EXISTS idx_complaints_officer 
    ON complaints (assigned_officer_id);

-- Citizens indexes
CREATE INDEX IF NOT EXISTS idx_citizens_ward 
    ON citizens (ward);

-- Authorities indexes
CREATE INDEX IF NOT EXISTS idx_authorities_ward 
    ON authorities (ward);

-- Assignments indexes
CREATE INDEX IF NOT EXISTS idx_assignments_officer_active 
    ON assignments (officer_id, state);

CREATE INDEX IF NOT EXISTS idx_assignments_complaint 
    ON assignments (complaint_id);

-- Status history timeline index
CREATE INDEX IF NOT EXISTS idx_status_history_timeline 
    ON status_history (complaint_id, created_at DESC);

-- Notifications unread index
CREATE INDEX IF NOT EXISTS idx_notifications_role_unread 
    ON notifications (target_role, is_read, created_at DESC);

-- ============================================================================
-- 4. STORED FUNCTIONS & TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function & Trigger A: Update timestamp on row modification
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_citizens_updated_at ON citizens;
CREATE TRIGGER trg_citizens_updated_at
    BEFORE UPDATE ON citizens
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_authorities_updated_at ON authorities;
CREATE TRIGGER trg_authorities_updated_at
    BEFORE UPDATE ON authorities
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;
CREATE TRIGGER trg_complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON assignments;
CREATE TRIGGER trg_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ----------------------------------------------------------------------------
-- Function & Trigger B: Compute Dynamic Priority Score & MLQ Lane
-- Formula: Priority = Base Severity + (DuplicateCount - 1)*2 + WaitingDays*2
-- Lane 0: Score >= 85 (Critical)
-- Lane 1: 70 <= Score < 85 (High)
-- Lane 2: Score < 70 (Routine)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalculate_complaint_priority()
RETURNS TRIGGER AS $$
DECLARE
    v_base INT;
    v_dup_boost INT;
    v_aging_boost INT;
    v_score INT;
    v_lane INT;
BEGIN
    -- Determine base score
    v_base := CASE NEW.severity
        WHEN 'Critical' THEN 90
        WHEN 'High'     THEN 75
        WHEN 'Medium'   THEN 60
        WHEN 'Low'      THEN 40
        ELSE 60
    END;

    NEW.severity_base := v_base;
    NEW.duplicate_boost := GREATEST(0, (COALESCE(NEW.duplicate_count, 1) - 1) * 2);
    NEW.aging_boost := GREATEST(0, COALESCE(NEW.waiting_days, 0) * 2);
    
    -- Bound priority score to maximum of 99
    v_score := LEAST(99, v_base + NEW.duplicate_boost + NEW.aging_boost);
    NEW.priority_score := v_score;

    -- Compute MLQ Lane
    v_lane := CASE 
        WHEN v_score >= 85 THEN 0
        WHEN v_score >= 70 THEN 1
        ELSE 2
    END;

    -- Update OS Process State string according to status and queue lane
    NEW.process_state := CASE NEW.status
        WHEN 'Reported'             THEN 'NEW / READY (MLQ Lane ' || v_lane || ')'
        WHEN 'Verified'             THEN 'READY (MLQ Lane ' || v_lane || ')'
        WHEN 'Assigned'             THEN 'ASSIGNED (MLQ Lane ' || v_lane || ')'
        WHEN 'In Progress'          THEN 'RUNNING / IN PROGRESS (MLQ Lane ' || v_lane || ')'
        WHEN 'Blocked'              THEN 'WAITING / BLOCKED'
        WHEN 'Completion Submitted' THEN 'WAITING / AWAITING VERIFICATION'
        WHEN 'Resolved'             THEN 'TERMINATED / RESOLVED'
        WHEN 'Disputed'             THEN 'WAITING / DISPUTE REVIEW'
        ELSE UPPER(COALESCE(NEW.status, 'REPORTED'))
    END;

    -- Track resolution timestamp
    IF NEW.status = 'Resolved' AND (OLD IS NULL OR OLD.status != 'Resolved') THEN
        NEW.resolved_at := CURRENT_TIMESTAMP;
    ELSIF NEW.status != 'Resolved' THEN
        NEW.resolved_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_priority_calc ON complaints;
CREATE TRIGGER trg_complaints_priority_calc
    BEFORE INSERT OR UPDATE OF severity, duplicate_count, waiting_days, status
    ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION fn_recalculate_complaint_priority();

-- ----------------------------------------------------------------------------
-- Function & Trigger C: Automatically Log Status History on Transitions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_complaint_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO status_history (
            complaint_id,
            actor,
            role,
            action,
            from_status,
            to_status,
            message
        ) VALUES (
            NEW.complaint_id,
            COALESCE(current_setting('civic_smart.current_actor', true), 'System / Console'),
            COALESCE(current_setting('civic_smart.current_role', true), 'SYSTEM'),
            'Status Transition',
            OLD.status,
            NEW.status,
            'Complaint transitioned from ' || OLD.status || ' to ' || NEW.status || '.'
        );

        -- Also record an admin/citizen notification
        INSERT INTO notifications (target_role, complaint_id, message)
        VALUES (
            'CITIZEN',
            NEW.complaint_id,
            'Complaint ' || NEW.complaint_id || ' status changed to ' || NEW.status || '.'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_complaints_status_audit ON complaints;
CREATE TRIGGER trg_complaints_status_audit
    AFTER UPDATE OF status ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_complaint_status_change();

-- ============================================================================
-- 5. STORED PROCEDURES (OS SCHEDULING SIMULATION)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Procedure: sp_simulate_daily_aging
-- Simulates a 24-hour cycle: increments waitingDays by 1 for all unresolved
-- complaints and boosts priority score to prevent starvation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_simulate_daily_aging()
LANGUAGE plpgsql
AS $$
DECLARE
    v_affected INT;
BEGIN
    UPDATE complaints
    SET waiting_days = waiting_days + 1
    WHERE status NOT IN ('Resolved', 'Completion Submitted');

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    -- Audit log the scheduler run
    INSERT INTO status_history (
        complaint_id,
        actor,
        role,
        action,
        from_status,
        to_status,
        message
    )
    SELECT
        complaint_id,
        'OS Scheduler',
        'SYSTEM',
        'Aging Simulation',
        status,
        status,
        '24-Hour aging step incremented waiting days to ' || waiting_days || ' (Score: ' || priority_score || ').'
    FROM complaints
    WHERE status NOT IN ('Resolved', 'Completion Submitted');

    RAISE NOTICE 'Daily aging applied to % active complaints.', v_affected;
END;
$$;

-- ----------------------------------------------------------------------------
-- Procedure: sp_allocate_officer
-- Automated least-workload officer dispatcher matching department/ward
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_allocate_officer(
    p_complaint_id VARCHAR,
    p_actor VARCHAR DEFAULT 'Authority Console'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_complaint RECORD;
    v_chosen_officer VARCHAR(30);
    v_assignment_id VARCHAR(40);
BEGIN
    SELECT * INTO v_complaint FROM complaints WHERE complaint_id = p_complaint_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found.', p_complaint_id;
    END IF;

    -- Select best officer: matches department or skill, has service area or ward, available, least load
    SELECT a.officer_id INTO v_chosen_officer
    FROM authorities a
    LEFT JOIN assignments asn 
        ON a.officer_id = asn.officer_id 
        AND asn.state NOT IN ('REJECTED', 'COMPLETED', 'COMPLETION_SUBMITTED')
    WHERE a.availability = 'Available'
      AND (a.department = v_complaint.department OR v_complaint.category = ANY(a.skills))
      AND (
          'Dehradun Municipal Corporation' = ANY(a.service_areas) 
          OR a.ward = COALESCE(v_complaint.ward, '')
          OR COALESCE(v_complaint.ward, '') = ANY(a.service_areas)
          OR COALESCE(v_complaint.tehsil, '') = ANY(a.service_areas)
      )
    GROUP BY a.officer_id, a.capacity, a.name
    HAVING COUNT(asn.assignment_id) < a.capacity
    ORDER BY COUNT(asn.assignment_id) ASC, a.name ASC
    LIMIT 1;

    IF v_chosen_officer IS NULL THEN
        RAISE NOTICE 'No eligible officer available for complaint %', p_complaint_id;
        RETURN;
    END IF;

    -- Generate assignment ID
    v_assignment_id := 'ASN-' || p_complaint_id || '-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS');

    -- Create assignment
    INSERT INTO assignments (
        assignment_id,
        complaint_id,
        officer_id,
        state,
        actor,
        deadline
    ) VALUES (
        v_assignment_id,
        p_complaint_id,
        v_chosen_officer,
        'PENDING_ACCEPTANCE',
        p_actor,
        CURRENT_TIMESTAMP + INTERVAL '48 hours'
    );

    -- Update complaint
    UPDATE complaints
    SET assigned_officer_id = v_chosen_officer,
        status = 'Assigned'
    WHERE complaint_id = p_complaint_id;

    -- Audit trail
    INSERT INTO status_history (
        complaint_id, actor, role, action, from_status, to_status, message
    ) VALUES (
        p_complaint_id,
        p_actor,
        'ADMIN',
        'Officer Allocated',
        v_complaint.status,
        'Assigned',
        'Officer ' || v_chosen_officer || ' allocated via workload-aware dispatcher.'
    );

    RAISE NOTICE 'Complaint % successfully assigned to %.', p_complaint_id, v_chosen_officer;
END;
$$;

-- ============================================================================
-- 6. VIEWS FOR REPORTING & MONITORING
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View 1: Priority Queue MLQ Status (OS Multilevel Ready Queue)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_priority_queue_mlq AS
SELECT 
    c.complaint_id,
    c.title,
    c.category,
    c.ward,
    c.department,
    c.severity,
    c.duplicate_count,
    c.waiting_days,
    c.priority_score,
    CASE 
        WHEN c.priority_score >= 85 THEN 0
        WHEN c.priority_score >= 70 THEN 1
        ELSE 2
    END AS mlq_lane,
    CASE 
        WHEN c.priority_score >= 85 THEN 'Queue 0: Critical (Immediate Action)'
        WHEN c.priority_score >= 70 THEN 'Queue 1: High Urgency'
        ELSE 'Queue 2: Standard Routine'
    END AS mlq_tier_name,
    c.status,
    c.process_state,
    c.assigned_officer_id,
    a.name AS assigned_officer_name,
    c.created_at
FROM complaints c
LEFT JOIN authorities a ON c.assigned_officer_id = a.officer_id
WHERE c.status NOT IN ('Resolved', 'Rejected')
ORDER BY c.priority_score DESC, c.created_at ASC;

-- ----------------------------------------------------------------------------
-- View 2: Officer Workload & Capacity Utilization
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_officer_workload AS
SELECT 
    a.officer_id,
    a.name AS officer_name,
    a.role,
    a.department,
    a.capacity AS max_capacity,
    COUNT(asn.assignment_id) FILTER (
        WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
    ) AS active_assignments,
    a.capacity - COUNT(asn.assignment_id) FILTER (
        WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
    ) AS available_slots,
    ROUND(
        (COUNT(asn.assignment_id) FILTER (
            WHERE asn.state IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'BLOCKED')
        )::NUMERIC / a.capacity::NUMERIC) * 100, 
        1
    ) AS utilization_percent,
    a.availability
FROM authorities a
LEFT JOIN assignments asn ON a.officer_id = asn.officer_id
GROUP BY a.officer_id, a.name, a.role, a.department, a.capacity, a.availability
ORDER BY utilization_percent DESC, a.name ASC;

-- ----------------------------------------------------------------------------
-- View 3: Ward Grievance Hotspots & Resolution Performance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_ward_hotspots AS
SELECT 
    c.tehsil,
    c.ward,
    COUNT(*) AS total_complaints,
    COUNT(*) FILTER (WHERE c.status NOT IN ('Resolved', 'Rejected')) AS pending_complaints,
    COUNT(*) FILTER (WHERE c.status = 'Resolved') AS resolved_complaints,
    COUNT(*) FILTER (WHERE c.priority_score >= 85 AND c.status != 'Resolved') AS critical_pending,
    ROUND(AVG(c.priority_score), 1) AS avg_priority_score,
    ROUND(
        (COUNT(*) FILTER (WHERE c.status = 'Resolved')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100,
        1
    ) AS resolution_rate_percent
FROM complaints c
GROUP BY c.tehsil, c.ward
ORDER BY total_complaints DESC, avg_priority_score DESC;

-- ----------------------------------------------------------------------------
-- View 4: Complete Complaint Details with Assignment & Latest Status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_complaint_full_details AS
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
    c.duplicate_count,
    c.waiting_days,
    c.cluster_id,
    c.citizen_id,
    c.citizen_name,
    cit.phone AS citizen_phone,
    cit.email AS citizen_email,
    cit.ward AS citizen_ward,
    c.assigned_officer_id,
    auth.name AS officer_name,
    auth.role AS officer_role,
    auth.ward AS officer_ward,
    asn.assignment_id,
    asn.state AS assignment_state,
    asn.deadline AS assignment_deadline,
    c.created_at,
    c.updated_at,
    c.resolved_at
FROM complaints c
LEFT JOIN citizens cit ON c.citizen_id = cit.citizen_id
LEFT JOIN authorities auth ON c.assigned_officer_id = auth.officer_id
LEFT JOIN assignments asn ON c.complaint_id = asn.complaint_id AND asn.state != 'REJECTED';
