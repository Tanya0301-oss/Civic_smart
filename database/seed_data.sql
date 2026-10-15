-- ============================================================================
-- CIVIC SMART: POSTGRESQL INITIAL SEED DATA
-- Municipal Grievance & OS-Inspired Workflow Management System (Dehradun)
-- ============================================================================

-- Disable triggers temporarily during seed insertion if needed or let them run.
-- Here we provide clean inserts that respect all constraints.

-- ----------------------------------------------------------------------------
-- 1. SEED CITIZENS
-- ----------------------------------------------------------------------------
INSERT INTO citizens (citizen_id, name, phone, email, address, tehsil, ward, password_hash)
VALUES
    (1, 'Aarav Mehra', '+91 98102 44921', 'aarav.mehra@example.com', 'House 42, Ballupur Chowk', 'Dehradun Sadar', 'Ward 32 - Ballupur', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'),
    (2, 'Neha Kapoor', '+91 98234 11203', 'neha.kapoor@example.com', 'Lane 3, Raipur Community Park', 'Dehradun Sadar', 'Ward 66 - Raipur', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'),
    (3, 'Ishaan Rao', '+91 98450 77123', 'ishaan.rao@example.com', 'Flat 12B, Rajpur Heights', 'Dehradun Sadar', 'Ward 4 - Rajpur', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'),
    (4, 'Maya Singh', '+91 98765 43210', 'maya.singh@example.com', 'Near Rishpana River Bridge', 'Dehradun Sadar', 'Ward 14 - Rishpana', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'),
    (5, 'Local Residents Committee', '+91 98991 33445', 'residents.harrawala@example.org', 'Harrawala Crossing Community Office', 'Doiwala', 'Ward 97 - Harrawala', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'),
    (6, 'Residents Welfare Group', '+91 98332 55667', 'rwg.ballawala@example.org', 'Ballawala Feeder Lane 4', 'Dehradun Sadar', 'Ward 98 - Ballawala', '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y')
ON CONFLICT (citizen_id) DO NOTHING;

-- Advance citizen_id sequence past seeded records
SELECT setval('citizens_citizen_id_seq', (SELECT MAX(citizen_id) FROM citizens));

-- ----------------------------------------------------------------------------
-- 2. SEED AUTHORITIES (MUNICIPAL OFFICERS & ENGINEERS)
-- ----------------------------------------------------------------------------
INSERT INTO authorities (officer_id, name, role, department, skills, service_areas, ward, capacity, availability, phone, email, password_hash)
VALUES
    (
        'OFF-RD-104',
        'Er. Rajesh Varma',
        'Junior Engineer - Roads',
        'Road Infrastructure & Maintenance',
        ARRAY['Roads', 'Drainage'],
        ARRAY['Dehradun Municipal Corporation', 'Ward 32 - Ballupur', 'Ward 14 - Rishpana', 'Ward 78 - Turner Road'],
        'Ward 32 - Ballupur',
        4,
        'Available',
        '+91 94120 11001',
        'rajesh.varma@dmc.gov.in',
        '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'
    ),
    (
        'OFF-WT-201',
        'S. K. Nambiar',
        'Assistant Executive Engineer',
        'Municipal Water & Sewerage Board',
        ARRAY['Water', 'Drainage'],
        ARRAY['Dehradun Municipal Corporation', 'Ward 97 - Harrawala', 'Ward 84 - Banjarowala', 'Ward 57 - Nehru Colony'],
        'Ward 97 - Harrawala',
        3,
        'Available',
        '+91 94120 11002',
        'sk.nambiar@dmc.gov.in',
        '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'
    ),
    (
        'OFF-SW-304',
        'P. Anand',
        'Sanitary Inspector',
        'Solid Waste & Sanitation Department',
        ARRAY['Waste'],
        ARRAY['Dehradun Municipal Corporation', 'Ward 66 - Raipur', 'Ward 70 - Lakhi Bag', 'Ward 80 - Rest Camp'],
        'Ward 66 - Raipur',
        5,
        'Available',
        '+91 94120 11003',
        'p.anand@dmc.gov.in',
        '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'
    ),
    (
        'OFF-EL-118',
        'Amitabh Sen',
        'AE Electrical',
        'Electrical & Street Lighting Wing',
        ARRAY['Lighting', 'Electricity'],
        ARRAY['Dehradun Municipal Corporation', 'Ward 4 - Rajpur', 'Ward 98 - Ballawala', 'Ward 19 - Ghanta Ghar Kalika Mandir Marg'],
        'Ward 4 - Rajpur',
        3,
        'Available',
        '+91 94120 11004',
        'amitabh.sen@dmc.gov.in',
        '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'
    ),
    (
        'OFF-DR-220',
        'Meera Kulkarni',
        'Drainage Supervisor',
        'Stormwater Drainage Division',
        ARRAY['Drainage', 'Roads'],
        ARRAY['Dehradun Municipal Corporation', 'Ward 14 - Rishpana', 'Ward 85 - Mothrowala', 'Ward 76 - Niranjanpur'],
        'Ward 14 - Rishpana',
        3,
        'Available',
        '+91 94120 11005',
        'meera.kulkarni@dmc.gov.in',
        '$2b$10$e8w.K2K6bW6UoP7o8a6q9O1YwK1M8/J2Yx.c9jJ0G2p1z7x8w4z6y'
    )
ON CONFLICT (officer_id) DO NOTHING;

-- Create login rows after the seeded identities exist. Set usable passwords with
-- backend/set_account_password.py before signing into the demo portals.
INSERT INTO app_users (username, password_hash, role, citizen_id)
SELECT COALESCE(phone, email), password_hash, 'CITIZEN', citizen_id
FROM citizens
WHERE password_hash IS NOT NULL AND COALESCE(phone, email) IS NOT NULL
ON CONFLICT (username) DO NOTHING;

INSERT INTO app_users (username, password_hash, role, officer_id)
SELECT officer_id, password_hash, 'OFFICER', officer_id
FROM authorities
WHERE password_hash IS NOT NULL
ON CONFLICT (username) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. SEED COMPLAINTS
-- ----------------------------------------------------------------------------
INSERT INTO complaints (
    complaint_id, citizen_id, citizen_name, title, description, category, department,
    location, tehsil, ward, severity, duplicate_count, waiting_days, status,
    photo_url, cluster_id, assigned_officer_id, created_at
)
VALUES
    (
        'CS1060',
        6,
        'Residents Welfare Group',
        'Fallen tree branch hanging precariously on power transformer',
        'A large branch is resting on the transformer cage and may fall into the service lane.',
        'Electricity',
        'Electrical & Street Lighting Wing',
        'Near Ballawala feeder transformer, Dehradun',
        'Dehradun Sadar',
        'Ward 98 - Ballawala',
        'Critical',
        8,
        1,
        'Verified',
        'images/lighting.png',
        'CLUS-9910',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '6 days'
    ),
    (
        'CS1024',
        1,
        'Aarav Mehra',
        'Large pothole near Sector 15 main market intersection',
        'Severe road surface cave-in causing congestion and risk to two-wheelers.',
        'Roads',
        'Road Infrastructure & Maintenance',
        'Ballupur Chowk service lane, Dehradun',
        'Dehradun Sadar',
        'Ward 32 - Ballupur',
        'High',
        12,
        4,
        'Assigned',
        'images/roads.jpg',
        'CLUS-8924',
        'OFF-RD-104',
        CURRENT_TIMESTAMP - INTERVAL '30 days'
    ),
    (
        'CS1031',
        5,
        'Local Residents Committee',
        'Underground drinking water pipeline burst with heavy wastage',
        'Pipeline rupture flooding the service lane and reducing water pressure.',
        'Water',
        'Municipal Water & Sewerage Board',
        'Harrawala main road, near railway crossing',
        'Doiwala',
        'Ward 97 - Harrawala',
        'High',
        7,
        3,
        'In Progress',
        'images/water.jpg',
        'CLUS-7102',
        'OFF-WT-201',
        CURRENT_TIMESTAMP - INTERVAL '29 days'
    ),
    (
        'CS1009',
        2,
        'Neha Kapoor',
        'Garbage dump overflowing outside community park',
        'Secondary garbage point overflowing near the park boundary.',
        'Waste',
        'Solid Waste & Sanitation Department',
        'Raipur community park boundary, Dehradun',
        'Dehradun Sadar',
        'Ward 66 - Raipur',
        'Medium',
        15,
        0,
        'Resolved',
        'images/waste.jpg',
        'CLUS-5401',
        'OFF-SW-304',
        CURRENT_TIMESTAMP - INTERVAL '34 days'
    ),
    (
        'CS1045',
        3,
        'Ishaan Rao',
        'Street light pole wiring sparked and blacked out whole lane',
        'Electrical sparking was observed before the lane lights failed.',
        'Lighting',
        'Electrical & Street Lighting Wing',
        'Rajpur Road inner lane, Dehradun',
        'Dehradun Sadar',
        'Ward 4 - Rajpur',
        'Medium',
        4,
        1,
        'Resolved',
        'images/lighting.png',
        'CLUS-3209',
        'OFF-EL-118',
        CURRENT_TIMESTAMP - INTERVAL '38 days'
    ),
    (
        'CS1052',
        4,
        'Maya Singh',
        'Clogged storm drain backing up into pedestrian walkway',
        'Drain blockage is forcing dirty water onto a school approach road.',
        'Drainage',
        'Stormwater Drainage Division',
        'Rishpana bridge approach road, Dehradun',
        'Dehradun Sadar',
        'Ward 14 - Rishpana',
        'Low',
        3,
        5,
        'Reported',
        'images/footpath.jpg',
        'CLUS-6502',
        NULL,
        CURRENT_TIMESTAMP - INTERVAL '9 days'
    )
ON CONFLICT (complaint_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. SEED ASSIGNMENTS
-- ----------------------------------------------------------------------------
INSERT INTO assignments (assignment_id, complaint_id, officer_id, state, actor, deadline)
VALUES
    ('ASN-CS1024-1', 'CS1024', 'OFF-RD-104', 'ACCEPTED', 'Authority Console', CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    ('ASN-CS1031-1', 'CS1031', 'OFF-WT-201', 'IN_PROGRESS', 'Authority Console', CURRENT_TIMESTAMP + INTERVAL '36 hours'),
    ('ASN-CS1009-1', 'CS1009', 'OFF-SW-304', 'COMPLETION_SUBMITTED', 'Authority Console', CURRENT_TIMESTAMP - INTERVAL '2 days'),
    ('ASN-CS1045-1', 'CS1045', 'OFF-EL-118', 'COMPLETION_SUBMITTED', 'Authority Console', CURRENT_TIMESTAMP - INTERVAL '5 days')
ON CONFLICT (assignment_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. SEED STATUS HISTORY
-- ----------------------------------------------------------------------------
INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message, created_at)
VALUES
    ('CS1060', 'Residents Welfare Group', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '6 days'),
    ('CS1060', 'Authority Console', 'ADMIN', 'Status Transition', 'Reported', 'Verified', 'Urgent hazardous condition verified on feeder line.', CURRENT_TIMESTAMP - INTERVAL '5 days'),
    ('CS1024', 'Aarav Mehra', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '30 days'),
    ('CS1024', 'Authority Console', 'ADMIN', 'Officer Allocated', 'Verified', 'Assigned', 'Er. Rajesh Varma selected by workload-aware allocation.', CURRENT_TIMESTAMP - INTERVAL '28 days'),
    ('CS1031', 'Local Residents Committee', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '29 days'),
    ('CS1031', 'Authority Console', 'ADMIN', 'Officer Allocated', 'Verified', 'Assigned', 'S. K. Nambiar selected by workload-aware allocation.', CURRENT_TIMESTAMP - INTERVAL '27 days'),
    ('CS1031', 'S. K. Nambiar', 'OFFICER', 'Status Transition', 'Assigned', 'In Progress', 'Field team dispatched with backhoe and replacement 8-inch pipe.', CURRENT_TIMESTAMP - INTERVAL '26 days'),
    ('CS1009', 'Neha Kapoor', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '34 days'),
    ('CS1009', 'Authority Console', 'ADMIN', 'Status Transition', 'Completion Submitted', 'Resolved', 'Sanitation supervisor verified clean container clearance.', CURRENT_TIMESTAMP - INTERVAL '31 days'),
    ('CS1045', 'Ishaan Rao', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '38 days'),
    ('CS1045', 'Authority Console', 'ADMIN', 'Status Transition', 'Completion Submitted', 'Resolved', 'Cable spliced and 250W LED luminaire restored.', CURRENT_TIMESTAMP - INTERVAL '35 days'),
    ('CS1052', 'Maya Singh', 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in shared complaint lifecycle.', CURRENT_TIMESTAMP - INTERVAL '9 days')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. SEED NOTIFICATIONS
-- ----------------------------------------------------------------------------
INSERT INTO notifications (target_role, complaint_id, message, is_read, created_at)
VALUES
    ('ADMIN', 'CS1060', 'New Electricity complaint CS1060 is ready for verification.', FALSE, CURRENT_TIMESTAMP - INTERVAL '6 days'),
    ('OFFICER', 'CS1024', 'CS1024 has been assigned to Er. Rajesh Varma.', TRUE, CURRENT_TIMESTAMP - INTERVAL '28 days'),
    ('CITIZEN', 'CS1024', 'Complaint CS1024 has been assigned to a municipal officer.', TRUE, CURRENT_TIMESTAMP - INTERVAL '28 days'),
    ('CITIZEN', 'CS1031', 'Complaint CS1031 status updated to In Progress.', TRUE, CURRENT_TIMESTAMP - INTERVAL '26 days'),
    ('ADMIN', 'CS1052', 'New Drainage complaint CS1052 is ready for verification.', FALSE, CURRENT_TIMESTAMP - INTERVAL '9 days')
ON CONFLICT DO NOTHING;

UPDATE notifications n
SET target_user_id = u.user_id
FROM complaints c
JOIN app_users u ON u.citizen_id = c.citizen_id AND u.role = 'CITIZEN'
WHERE n.complaint_id = c.complaint_id AND n.target_role = 'CITIZEN' AND n.target_user_id IS NULL;

UPDATE notifications n
SET target_user_id = u.user_id
FROM complaints c
JOIN app_users u ON u.officer_id = c.assigned_officer_id AND u.role = 'OFFICER'
WHERE n.complaint_id = c.complaint_id AND n.target_role = 'OFFICER' AND n.target_user_id IS NULL;
