SELECT
    a.assignment_id,
    a.complaint_id,
    a.officer_id,
    a.state AS assignment_state,
    c.status AS complaint_status,
    c.ward,
    c.department,
    c.assigned_officer_id
FROM assignments a
JOIN complaints c
    ON c.complaint_id = a.complaint_id
ORDER BY a.created_at;BEGIN;

CREATE TABLE IF NOT EXISTS public.assignment_history (
    history_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    assignment_id VARCHAR(40) NOT NULL
        REFERENCES public.assignments(assignment_id)
        ON DELETE CASCADE,

    complaint_id VARCHAR(30) NOT NULL
        REFERENCES public.complaints(complaint_id)
        ON DELETE CASCADE,

    officer_id VARCHAR(30) NOT NULL
        REFERENCES public.authorities(officer_id)
        ON DELETE RESTRICT,

    previous_state VARCHAR(40),
    new_state VARCHAR(40) NOT NULL,

    actor VARCHAR(100) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,

    detail TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_assignment_history_role
        CHECK (actor_role IN ('OFFICER', 'ADMIN', 'WARD_SUPERIOR', 'SYSTEM')),

    CONSTRAINT chk_assignment_history_new_state
        CHECK (
            new_state IN (
                'PENDING_ACCEPTANCE',
                'ACCEPTED',
                'IN_PROGRESS',
                'BLOCKED',
                'COMPLETION_SUBMITTED',
                'REJECTED',
                'COMPLETED'
            )
        ),

    CONSTRAINT chk_assignment_history_previous_state
        CHECK (
            previous_state IS NULL
            OR previous_state IN (
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

CREATE INDEX IF NOT EXISTS idx_assignment_history_timeline
    ON public.assignment_history (assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_history_complaint
    ON public.assignment_history (complaint_id, created_at DESC);

COMMIT;
