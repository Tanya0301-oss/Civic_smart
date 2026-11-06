

BEGIN;

-- =========================================================
-- M1.9: CENTRAL AUTHENTICATION ACCOUNT REGISTRY
-- Target database: civic_smart_m1_8c_test
-- =========================================================

-- 1. Validate existing source account data before migration.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.citizens
        WHERE COALESCE(BTRIM(password_hash), '') = ''
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: at least one citizen has no password hash.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.authorities
        WHERE COALESCE(BTRIM(password_hash), '') = ''
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: at least one authority has no password hash.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.citizens
        WHERE name IS NULL OR BTRIM(name) = ''
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: a citizen has no valid display name.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.authorities
        WHERE name IS NULL OR BTRIM(name) = ''
           OR officer_id IS NULL OR BTRIM(officer_id) = ''
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: an authority has incomplete account identity data.';
    END IF;
END;
$$;

-- 2. Detect duplicate login identifiers across all source accounts.
-- A single identifier must belong to exactly one account.

DO $$
BEGIN
    IF EXISTS (
        SELECT LOWER(BTRIM(identifier))
        FROM (
            SELECT phone AS identifier
            FROM public.citizens
            WHERE phone IS NOT NULL AND BTRIM(phone) <> ''

            UNION ALL

            SELECT email
            FROM public.citizens
            WHERE email IS NOT NULL AND BTRIM(email) <> ''

            UNION ALL

            SELECT officer_id
            FROM public.authorities

            UNION ALL

            SELECT email
            FROM public.authorities
            WHERE email IS NOT NULL AND BTRIM(email) <> ''
        ) AS source_identifiers
        GROUP BY LOWER(BTRIM(identifier))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: duplicate normalized login identifiers exist in source accounts.';
    END IF;
END;
$$;

-- 3. Central authentication account registry.

CREATE TABLE IF NOT EXISTS public.app_users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    role VARCHAR(30) NOT NULL
        CHECK (role IN (
            'CITIZEN',
            'OFFICER',
            'WARD_SUPERIOR',
            'ADMIN'
        )),

    citizen_id INTEGER UNIQUE
        REFERENCES public.citizens(citizen_id)
        ON DELETE RESTRICT,

    officer_id VARCHAR(30) UNIQUE
        REFERENCES public.authorities(officer_id)
        ON DELETE RESTRICT,

    display_name VARCHAR(120) NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    session_version INTEGER NOT NULL DEFAULT 1
        CHECK (session_version >= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_app_user_account_link CHECK (
        (
            role = 'CITIZEN'
            AND citizen_id IS NOT NULL
            AND officer_id IS NULL
        )
        OR
        (
            role = 'OFFICER'
            AND officer_id IS NOT NULL
            AND citizen_id IS NULL
        )
        OR
        (
            role IN ('WARD_SUPERIOR', 'ADMIN')
            AND citizen_id IS NULL
            AND officer_id IS NULL
        )
    )
);

-- 4. Login identifier registry.

CREATE TABLE IF NOT EXISTS public.app_user_identifiers (
    identifier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES public.app_users(user_id)
        ON DELETE CASCADE,

    identifier VARCHAR(180) NOT NULL,

    identifier_normalized VARCHAR(180)
        GENERATED ALWAYS AS (
            LOWER(BTRIM(identifier))
        ) STORED,

    identifier_type VARCHAR(20) NOT NULL
        CHECK (identifier_type IN (
            'PHONE',
            'EMAIL',
            'OFFICER_ID',
            'USERNAME'
        )),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_app_user_identifier
        UNIQUE (identifier_normalized)
);

-- 5. Supporting indexes.

CREATE INDEX IF NOT EXISTS idx_app_users_role_active
    ON public.app_users(role, is_active);

CREATE INDEX IF NOT EXISTS idx_app_user_identifiers_user
    ON public.app_user_identifiers(user_id);

-- 6. Migrate existing citizen accounts.

INSERT INTO public.app_users (
    role,
    citizen_id,
    display_name,
    password_hash,
    is_active
)
SELECT
    'CITIZEN',
    c.citizen_id,
    c.name,
    c.password_hash,
    COALESCE(c.is_active, TRUE)
FROM public.citizens c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.citizen_id = c.citizen_id
);

-- 7. Migrate existing authority accounts as OFFICER accounts.
-- Availability is not used as account activation status.

INSERT INTO public.app_users (
    role,
    officer_id,
    display_name,
    password_hash,
    is_active
)
SELECT
    'OFFICER',
    a.officer_id,
    a.name,
    a.password_hash,
    TRUE
FROM public.authorities a
WHERE NOT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.officer_id = a.officer_id
);

-- 8. Migrate citizen phone identifiers.

INSERT INTO public.app_user_identifiers (
    user_id,
    identifier,
    identifier_type
)
SELECT
    u.user_id,
    c.phone,
    'PHONE'
FROM public.citizens c
JOIN public.app_users u
    ON u.citizen_id = c.citizen_id
WHERE c.phone IS NOT NULL
  AND BTRIM(c.phone) <> '';

-- 9. Migrate citizen email identifiers.

INSERT INTO public.app_user_identifiers (
    user_id,
    identifier,
    identifier_type
)
SELECT
    u.user_id,
    c.email,
    'EMAIL'
FROM public.citizens c
JOIN public.app_users u
    ON u.citizen_id = c.citizen_id
WHERE c.email IS NOT NULL
  AND BTRIM(c.email) <> '';

-- 10. Migrate officer ID identifiers.

INSERT INTO public.app_user_identifiers (
    user_id,
    identifier,
    identifier_type
)
SELECT
    u.user_id,
    a.officer_id,
    'OFFICER_ID'
FROM public.authorities a
JOIN public.app_users u
    ON u.officer_id = a.officer_id;

-- 11. Migrate authority email identifiers.

INSERT INTO public.app_user_identifiers (
    user_id,
    identifier,
    identifier_type
)
SELECT
    u.user_id,
    a.email,
    'EMAIL'
FROM public.authorities a
JOIN public.app_users u
    ON u.officer_id = a.officer_id
WHERE a.email IS NOT NULL
  AND BTRIM(a.email) <> '';

-- 12. Final integrity checks before committing.

DO $$
DECLARE
    citizen_count BIGINT;
    officer_count BIGINT;
    migrated_citizen_count BIGINT;
    migrated_officer_count BIGINT;
    identifier_count BIGINT;
BEGIN
    SELECT COUNT(*)
    INTO citizen_count
    FROM public.citizens;

    SELECT COUNT(*)
    INTO officer_count
    FROM public.authorities;

    SELECT COUNT(*)
    INTO migrated_citizen_count
    FROM public.app_users
    WHERE role = 'CITIZEN';

    SELECT COUNT(*)
    INTO migrated_officer_count
    FROM public.app_users
    WHERE role = 'OFFICER';

    SELECT COUNT(*)
    INTO identifier_count
    FROM public.app_user_identifiers;

    IF citizen_count <> migrated_citizen_count THEN
        RAISE EXCEPTION
            'Citizen migration mismatch: source %, migrated %.',
            citizen_count, migrated_citizen_count;
    END IF;

    IF officer_count <> migrated_officer_count THEN
        RAISE EXCEPTION
            'Officer migration mismatch: source %, migrated %.',
            officer_count, migrated_officer_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.app_users u
        JOIN public.citizens c
            ON c.citizen_id = u.citizen_id
        WHERE u.password_hash <> c.password_hash
    ) THEN
        RAISE EXCEPTION
            'Citizen password hash mismatch detected.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.app_users u
        JOIN public.authorities a
            ON a.officer_id = u.officer_id
        WHERE u.password_hash <> a.password_hash
    ) THEN
        RAISE EXCEPTION
            'Officer password hash mismatch detected.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.app_users u
        WHERE u.role IN ('CITIZEN', 'OFFICER')
          AND NOT EXISTS (
              SELECT 1
              FROM public.app_user_identifiers i
              WHERE i.user_id = u.user_id
          )
    ) THEN
        RAISE EXCEPTION
            'At least one migrated account has no login identifier.';
    END IF;

    RAISE NOTICE 'Authentication migration validation passed.';
    RAISE NOTICE 'Citizens migrated: %', migrated_citizen_count;
    RAISE NOTICE 'Officers migrated: %', migrated_officer_count;
    RAISE NOTICE 'Login identifiers created: %', identifier_count;
END;
$$;

COMMIT;

