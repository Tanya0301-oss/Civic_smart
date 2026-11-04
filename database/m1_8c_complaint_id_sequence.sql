BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.complaint_id_seq
    AS BIGINT
    START WITH 1000
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;

DO $$
DECLARE
    max_complaint_number BIGINT;
    current_sequence_value BIGINT;
    next_base BIGINT;
BEGIN
    SELECT COALESCE(
        MAX(SUBSTRING(complaint_id FROM '^CS([0-9]+)$')::BIGINT),
        1000
    )
    INTO max_complaint_number
    FROM public.complaints;

    SELECT last_value
    INTO current_sequence_value
    FROM public.complaint_id_seq;

    next_base := GREATEST(
        max_complaint_number,
        current_sequence_value
    );

    PERFORM setval(
        'public.complaint_id_seq',
        next_base,
        true
    );
END $$;

COMMIT;
