-- Civic Smart Phase III
-- M1.8: Concurrency-safe identifier sequences

BEGIN;

-- Complaint IDs: CS1001, CS1002, ...
CREATE SEQUENCE IF NOT EXISTS public.complaint_id_seq
    START WITH 1000
    INCREMENT BY 1;

-- Continue after the largest existing numeric complaint ID.
SELECT setval(
    'public.complaint_id_seq',
    GREATEST(
        COALESCE(
            (
                SELECT MAX(SUBSTRING(complaint_id FROM 3)::BIGINT)
                FROM public.complaints
                WHERE complaint_id ~ '^CS[0-9]+$'
            ),
            1000
        ),
        (SELECT last_value FROM public.complaint_id_seq)
    ),
    true
);

-- Unique sequence for assignment identifiers.
CREATE SEQUENCE IF NOT EXISTS public.assignment_id_seq
    START WITH 1
    INCREMENT BY 1;

-- Continue beyond existing numeric assignment suffixes.
SELECT setval(
    'public.assignment_id_seq',
    GREATEST(
        COALESCE(
            (
                SELECT MAX(SUBSTRING(assignment_id FROM '([0-9]+)$')::BIGINT)
                FROM public.assignments
                WHERE assignment_id ~ '^ASN-.*-[0-9]+$'
            ),
            1
        ),
        (SELECT last_value FROM public.assignment_id_seq)
    ),
    true
);

COMMIT;
