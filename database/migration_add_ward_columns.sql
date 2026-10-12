-- ============================================================================
-- CIVIC SMART: SAFE POSTGRESQL MIGRATION — ADD MISSING 'WARD' COLUMNS
-- Fixes: "ERROR: column 'ward' does not exist", SQLSTATE 42703
-- Preserves ALL existing data without dropping tables or losing records.
-- Fully idempotent (can be executed repeatedly without errors).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Ensure 'ward' and 'tehsil' exist on 'complaints'
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'complaints' AND table_schema = 'public') THEN
        -- Add 'ward' if it does not exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'ward' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN ward VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central';
            UPDATE complaints SET ward = 'Ward 1 - Dehradun Central' WHERE ward IS NULL;
            ALTER TABLE complaints ALTER COLUMN ward SET NOT NULL;
            RAISE NOTICE '✓ Added column "ward" to table "complaints".';
        ELSE
            RAISE NOTICE '✓ Column "ward" already exists on "complaints".';
        END IF;

        -- Add 'tehsil' if it does not exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'tehsil' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN tehsil VARCHAR(100) DEFAULT 'Dehradun Sadar';
            UPDATE complaints SET tehsil = 'Dehradun Sadar' WHERE tehsil IS NULL;
            ALTER TABLE complaints ALTER COLUMN tehsil SET NOT NULL;
            RAISE NOTICE '✓ Added column "tehsil" to table "complaints".';
        ELSE
            RAISE NOTICE '✓ Column "tehsil" already exists on "complaints".';
        END IF;

        -- Ensure priority scoring and MLQ scheduling columns exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'severity_base' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN severity_base INT DEFAULT 60;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'duplicate_boost' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN duplicate_boost INT DEFAULT 0;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'aging_boost' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN aging_boost INT DEFAULT 0;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'process_state' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN process_state VARCHAR(100) DEFAULT 'NEW / READY (MLQ Lane 2)';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'complaints' AND column_name = 'cluster_id' AND table_schema = 'public'
        ) THEN
            ALTER TABLE complaints ADD COLUMN cluster_id VARCHAR(50) DEFAULT 'CLUS-SINGLE';
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Ensure 'ward' and 'tehsil' exist on 'citizens' (or 'users')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'citizens' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'citizens' AND column_name = 'ward' AND table_schema = 'public'
        ) THEN
            ALTER TABLE citizens ADD COLUMN ward VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central';
            RAISE NOTICE '✓ Added column "ward" to table "citizens".';
        ELSE
            RAISE NOTICE '✓ Column "ward" already exists on "citizens".';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'citizens' AND column_name = 'tehsil' AND table_schema = 'public'
        ) THEN
            ALTER TABLE citizens ADD COLUMN tehsil VARCHAR(100) DEFAULT 'Dehradun Sadar';
            RAISE NOTICE '✓ Added column "tehsil" to table "citizens".';
        ELSE
            RAISE NOTICE '✓ Column "tehsil" already exists on "citizens".';
        END IF;
    END IF;

    -- Also support legacy 'users' table if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'ward' AND table_schema = 'public'
        ) THEN
            ALTER TABLE users ADD COLUMN ward VARCHAR(100) DEFAULT 'Ward 1 - Dehradun Central';
            RAISE NOTICE '✓ Added column "ward" to table "users".';
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Ensure 'ward' and 'service_areas' exist on 'authorities' (or 'officers')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'authorities' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'authorities' AND column_name = 'ward' AND table_schema = 'public'
        ) THEN
            ALTER TABLE authorities ADD COLUMN ward VARCHAR(100) DEFAULT 'Dehradun Municipal Corporation';
            RAISE NOTICE '✓ Added column "ward" to table "authorities".';
        ELSE
            RAISE NOTICE '✓ Column "ward" already exists on "authorities".';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'authorities' AND column_name = 'service_areas' AND table_schema = 'public'
        ) THEN
            ALTER TABLE authorities ADD COLUMN service_areas TEXT[] NOT NULL DEFAULT '{}';
            RAISE NOTICE '✓ Added column "service_areas" to table "authorities".';
        ELSE
            RAISE NOTICE '✓ Column "service_areas" already exists on "authorities".';
        END IF;
    END IF;

    -- Also support legacy 'officers' table if present
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'officers' AND table_schema = 'public') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'officers' AND column_name = 'ward' AND table_schema = 'public'
        ) THEN
            ALTER TABLE officers ADD COLUMN ward VARCHAR(100) DEFAULT 'Dehradun Municipal Corporation';
            RAISE NOTICE '✓ Added column "ward" to table "officers".';
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Re-create / verify indexes safely
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'complaints' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_complaints_ward ON complaints (ward);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'citizens' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_citizens_ward ON citizens (ward);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'authorities' AND table_schema = 'public') THEN
        CREATE INDEX IF NOT EXISTS idx_authorities_ward ON authorities (ward);
    END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- 5. Verification Query
-- ----------------------------------------------------------------------------
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('complaints', 'citizens', 'authorities')
  AND column_name IN ('ward', 'tehsil', 'service_areas')
ORDER BY table_name, column_name;
