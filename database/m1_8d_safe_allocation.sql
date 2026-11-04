BEGIN;

-- Prevent more than one active assignment for a complaint.
-- Rejected and completed assignments are historical, inactive records.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_one_active_per_complaint
    ON public.assignments (complaint_id)
    WHERE state NOT IN ('REJECTED', 'COMPLETED');

CREATE OR REPLACE PROCEDURE public.sp_allocate_officer(
    p_complaint_id VARCHAR,
    p_officer_id VARCHAR,
    p_actor VARCHAR DEFAULT 'M1.8-D Development Ward Superior'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_complaint public.complaints%ROWTYPE;
    v_officer public.authorities%ROWTYPE;
    v_active_count INTEGER;
    v_assignment_id VARCHAR(40);
    v_actor VARCHAR(100);
BEGIN
    v_actor := COALESCE(
        NULLIF(BTRIM(p_actor), ''),
        'M1.8-D Development Ward Superior'
    );

    -- Lock complaint first; every allocation locks rows in the same order.
    SELECT *
    INTO v_complaint
    FROM public.complaints
    WHERE complaint_id = p_complaint_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = 'Complaint not found';
    END IF;

    IF v_complaint.status NOT IN ('Reported', 'Verified') THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Complaint is not eligible for allocation';
    END IF;

    IF v_complaint.assigned_officer_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Complaint already has an assigned officer';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.assignments
        WHERE complaint_id = p_complaint_id
          AND state NOT IN ('REJECTED', 'COMPLETED')
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Complaint already has an active assignment';
    END IF;

    -- Serialize capacity checks for the selected officer.
    SELECT *
    INTO v_officer
    FROM public.authorities
    WHERE officer_id = p_officer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Selected officer does not exist';
    END IF;

    IF v_officer.availability <> 'Available' THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Selected officer is not available';
    END IF;

    IF NOT (
        v_officer.department = v_complaint.department
        OR v_complaint.category = ANY(v_officer.skills)
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Officer department or skills do not match complaint';
    END IF;

    -- COALESCE ensures a NULL officer ward cannot bypass this validation.
    IF NOT COALESCE(
        v_officer.ward = v_complaint.ward
        OR v_complaint.ward = ANY(v_officer.service_areas),
        FALSE
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Officer is not assigned to the complaint ward';
    END IF;

    SELECT COUNT(*)
    INTO v_active_count
    FROM public.assignments
    WHERE officer_id = p_officer_id
      AND state IN (
          'PENDING_ACCEPTANCE',
          'ACCEPTED',
          'IN_PROGRESS',
          'BLOCKED',
          'COMPLETION_SUBMITTED'
      );

    IF v_active_count >= v_officer.capacity THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Selected officer has reached assignment capacity';
    END IF;

    -- ASN- plus 32 hexadecimal characters (36 characters total).
    v_assignment_id := 'ASN-' || REPLACE(gen_random_uuid()::TEXT, '-', '');

    PERFORM set_config('civic_smart.current_actor', v_actor, TRUE);
    PERFORM set_config('civic_smart.current_role', 'SYSTEM', TRUE);

    INSERT INTO public.assignments (
        assignment_id, complaint_id, officer_id, state, actor, deadline
    ) VALUES (
        v_assignment_id,
        p_complaint_id,
        p_officer_id,
        'PENDING_ACCEPTANCE',
        v_actor,
        CURRENT_TIMESTAMP + INTERVAL '48 hours'
    );

    -- Existing complaint trigger writes status history and citizen notice.
    UPDATE public.complaints
    SET assigned_officer_id = p_officer_id,
        status = 'Assigned'
    WHERE complaint_id = p_complaint_id;

    INSERT INTO public.assignment_history (
        assignment_id, complaint_id, officer_id, previous_state,
        new_state, actor, actor_role, detail
    ) VALUES (
        v_assignment_id,
        p_complaint_id,
        p_officer_id,
        NULL,
        'PENDING_ACCEPTANCE',
        v_actor,
        'WARD_SUPERIOR',
        'Assignment created after ward, department, availability and capacity validation.'
    );

    INSERT INTO public.notifications (target_role, complaint_id, message)
    VALUES
        (
            'OFFICER',
            p_complaint_id,
            'New assignment ' || v_assignment_id || ' is awaiting your acceptance.'
        ),
        (
            'ADMIN',
            p_complaint_id,
            'Complaint ' || p_complaint_id || ' assigned to officer ' || p_officer_id || '.'
        );
END;
$$;

COMMIT;
