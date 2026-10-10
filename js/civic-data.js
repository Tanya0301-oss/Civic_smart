const CivicData = (() => {
    const KEYS = {
        complaints: 'civics_smart_records_v2',
        officers: 'civics_smart_officers_v2',
        assignments: 'civics_smart_assignments_v2',
        audit: 'civics_smart_audit_v2',
        notifications: 'civics_smart_notifications_v2'
    };

    const categoryDepartment = {
        Roads: 'Road Infrastructure & Maintenance',
        Water: 'Municipal Water & Sewerage Board',
        Waste: 'Solid Waste & Sanitation Department',
        Lighting: 'Electrical & Street Lighting Wing',
        Drainage: 'Stormwater Drainage Division',
        Electricity: 'Electrical & Street Lighting Wing',
        Other: 'General Municipal Works'
    };

    const defaultComplaints = [
        {
            id: 'CS1060',
            title: 'Fallen tree branch hanging precariously on power transformer',
            description: 'A large branch is resting on the transformer cage and may fall into the service lane.',
            category: 'Electricity',
            location: 'Near Ballawala feeder transformer, Dehradun',
            tehsil: 'Dehradun Sadar',
            ward: 'Ward 98 - Ballawala',
            department: 'Electrical & Street Lighting Wing',
            priorityScore: 96,
            severity: 'Critical',
            severityBase: 90,
            duplicateCount: 8,
            duplicateBoost: 14,
            waitingDays: 1,
            agingBoost: 2,
            status: 'Verified',
            processState: 'READY (MLQ Lane 0: Critical)',
            citizen: 'Residents Welfare Group',
            date: 'Oct 06, 2026',
            time: '09:20 AM',
            photo: 'images/lighting.png',
            clusterId: 'CLUS-9910',
            assignedOfficerId: null
        },
        {
            id: 'CS1024',
            title: 'Large pothole near Sector 15 main market intersection',
            description: 'Severe road surface cave-in causing congestion and risk to two-wheelers.',
            category: 'Roads',
            location: 'Ballupur Chowk service lane, Dehradun',
            tehsil: 'Dehradun Sadar',
            ward: 'Ward 32 - Ballupur',
            department: 'Road Infrastructure & Maintenance',
            priorityScore: 95,
            severity: 'High',
            severityBase: 75,
            duplicateCount: 12,
            duplicateBoost: 22,
            waitingDays: 4,
            agingBoost: 8,
            status: 'Assigned',
            processState: 'ASSIGNED (MLQ Lane 0: Critical)',
            citizen: 'Aarav Mehra',
            date: 'Sept 12, 2026',
            time: '09:14 AM',
            photo: 'images/roads.jpg',
            clusterId: 'CLUS-8924',
            assignedOfficerId: 'OFF-RD-104'
        },
        {
            id: 'CS1031',
            title: 'Underground drinking water pipeline burst with heavy wastage',
            description: 'Pipeline rupture flooding the service lane and reducing water pressure.',
            category: 'Water',
            location: 'Harrawala main road, near railway crossing',
            tehsil: 'Doiwala',
            ward: 'Ward 97 - Harrawala',
            department: 'Municipal Water & Sewerage Board',
            priorityScore: 88,
            severity: 'High',
            severityBase: 75,
            duplicateCount: 7,
            duplicateBoost: 12,
            waitingDays: 3,
            agingBoost: 6,
            status: 'In Progress',
            processState: 'RUNNING / IN PROGRESS (MLQ Lane 0)',
            citizen: 'Local Residents Committee',
            date: 'Sept 13, 2026',
            time: '06:40 AM',
            photo: 'images/water.jpg',
            clusterId: 'CLUS-7102',
            assignedOfficerId: 'OFF-WT-201'
        },
        {
            id: 'CS1009',
            title: 'Garbage dump overflowing outside community park',
            description: 'Secondary garbage point overflowing near the park boundary.',
            category: 'Waste',
            location: 'Raipur community park boundary, Dehradun',
            tehsil: 'Dehradun Sadar',
            ward: 'Ward 66 - Raipur',
            department: 'Solid Waste & Sanitation Department',
            priorityScore: 83,
            severity: 'Medium',
            severityBase: 60,
            duplicateCount: 15,
            duplicateBoost: 28,
            waitingDays: 0,
            agingBoost: 0,
            status: 'Resolved',
            processState: 'TERMINATED / RESOLVED',
            citizen: 'Neha Kapoor',
            date: 'Sept 08, 2026',
            time: '07:00 AM',
            photo: 'images/waste.jpg',
            clusterId: 'CLUS-5401',
            assignedOfficerId: 'OFF-SW-304'
        },
        {
            id: 'CS1045',
            title: 'Street light pole wiring sparked and blacked out whole lane',
            description: 'Electrical sparking was observed before the lane lights failed.',
            category: 'Lighting',
            location: 'Rajpur Road inner lane, Dehradun',
            tehsil: 'Dehradun Sadar',
            ward: 'Ward 4 - Rajpur',
            department: 'Electrical & Street Lighting Wing',
            priorityScore: 58,
            severity: 'Medium',
            severityBase: 60,
            duplicateCount: 4,
            duplicateBoost: 6,
            waitingDays: 1,
            agingBoost: 2,
            status: 'Resolved',
            processState: 'TERMINATED / RESOLVED',
            citizen: 'Ishaan Rao',
            date: 'Sept 04, 2026',
            time: '08:20 PM',
            photo: 'images/lighting.png',
            clusterId: 'CLUS-3209',
            assignedOfficerId: 'OFF-EL-118'
        },
        {
            id: 'CS1052',
            title: 'Clogged storm drain backing up into pedestrian walkway',
            description: 'Drain blockage is forcing dirty water onto a school approach road.',
            category: 'Drainage',
            location: 'Rishpana bridge approach road, Dehradun',
            tehsil: 'Dehradun Sadar',
            ward: 'Ward 14 - Rishpana',
            department: 'Stormwater Drainage Division',
            priorityScore: 59,
            severity: 'Low',
            severityBase: 40,
            duplicateCount: 3,
            duplicateBoost: 4,
            waitingDays: 5,
            agingBoost: 10,
            status: 'Reported',
            processState: 'NEW / READY (MLQ Lane 2)',
            citizen: 'Maya Singh',
            date: 'Oct 03, 2026',
            time: '05:45 PM',
            photo: 'images/footpath.jpg',
            clusterId: 'CLUS-6502',
            assignedOfficerId: null
        }
    ];

    const defaultOfficers = [
        { id: 'OFF-RD-104', name: 'Er. Rajesh Varma', role: 'Junior Engineer - Roads', department: 'Road Infrastructure & Maintenance', skills: ['Roads', 'Drainage'], serviceAreas: ['Dehradun Municipal Corporation', 'Ward 32 - Ballupur', 'Ward 14 - Rishpana', 'Ward 78 - Turner Road'], capacity: 4, availability: 'Available' },
        { id: 'OFF-WT-201', name: 'S. K. Nambiar', role: 'Assistant Executive Engineer', department: 'Municipal Water & Sewerage Board', skills: ['Water', 'Drainage'], serviceAreas: ['Dehradun Municipal Corporation', 'Ward 97 - Harrawala', 'Ward 84 - Banjarowala', 'Ward 57 - Nehru Colony'], capacity: 3, availability: 'Available' },
        { id: 'OFF-SW-304', name: 'P. Anand', role: 'Sanitary Inspector', department: 'Solid Waste & Sanitation Department', skills: ['Waste'], serviceAreas: ['Dehradun Municipal Corporation', 'Ward 66 - Raipur', 'Ward 70 - Lakhi Bag', 'Ward 80 - Rest Camp'], capacity: 5, availability: 'Available' },
        { id: 'OFF-EL-118', name: 'Amitabh Sen', role: 'AE Electrical', department: 'Electrical & Street Lighting Wing', skills: ['Lighting', 'Electricity'], serviceAreas: ['Dehradun Municipal Corporation', 'Ward 4 - Rajpur', 'Ward 98 - Ballawala', 'Ward 19 - Ghanta Ghar Kalika Mandir Marg'], capacity: 3, availability: 'Available' },
        { id: 'OFF-DR-220', name: 'Meera Kulkarni', role: 'Drainage Supervisor', department: 'Stormwater Drainage Division', skills: ['Drainage', 'Roads'], serviceAreas: ['Dehradun Municipal Corporation', 'Ward 14 - Rishpana', 'Ward 85 - Mothrowala', 'Ward 76 - Niranjanpur'], capacity: 3, availability: 'Available' }
    ];

    function read(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            console.error(error);
            return fallback;
        }
    }

    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function nowStamp() {
        const now = new Date();
        return {
            date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            iso: now.toISOString()
        };
    }

    function seed() {
        if (!localStorage.getItem(KEYS.complaints)) {
            const legacyComplaints = read('civics_smart_complaints', []).map(item => ({
                ...item,
                severityBase: item.severityBase || ({ Low: 40, Medium: 60, High: 75, Critical: 90 }[item.severity] || 60),
                duplicateBoost: item.duplicateBoost || 0,
                agingBoost: item.agingBoost || 0,
                processState: item.processState || `${item.status.toUpperCase()} (MLQ Active)`,
                clusterId: item.clusterId || 'CLUS-SINGLE',
                tehsil: item.tehsil || 'Dehradun Sadar',
                assignedOfficerId: item.assignedOfficerId || null
            }));
            write(KEYS.complaints, [...legacyComplaints, ...defaultComplaints]);
        }
        if (!localStorage.getItem(KEYS.officers)) write(KEYS.officers, defaultOfficers);
        if (!localStorage.getItem(KEYS.assignments)) {
            write(KEYS.assignments, [
                makeAssignment('ASN-CS1024-1', 'CS1024', 'OFF-RD-104', 'ACCEPTED', 'Authority Console'),
                makeAssignment('ASN-CS1031-1', 'CS1031', 'OFF-WT-201', 'IN_PROGRESS', 'Authority Console'),
                makeAssignment('ASN-CS1009-1', 'CS1009', 'OFF-SW-304', 'COMPLETION_SUBMITTED', 'Authority Console'),
                makeAssignment('ASN-CS1045-1', 'CS1045', 'OFF-EL-118', 'COMPLETION_SUBMITTED', 'Authority Console')
            ]);
        }
        if (!localStorage.getItem(KEYS.audit)) {
            write(KEYS.audit, defaultComplaints.map(c => ({
                id: `AUD-${c.id}-1`,
                complaintId: c.id,
                actor: 'System Seed',
                role: 'SYSTEM',
                action: 'Complaint Registered',
                fromStatus: '',
                toStatus: c.status,
                message: `${c.category} complaint initialized in shared datastore.`,
                timestamp: `${c.date} ${c.time}`
            })));
        }
        if (!localStorage.getItem(KEYS.notifications)) write(KEYS.notifications, []);
    }

    function makeAssignment(id, complaintId, officerId, state, actor) {
        const stamp = nowStamp();
        return {
            id,
            complaintId,
            officerId,
            state,
            actor,
            createdAt: stamp.iso,
            deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            rejectionReason: '',
            blocker: '',
            completionNote: ''
        };
    }

    function getComplaints() {
        seed();
        return read(KEYS.complaints, []);
    }

    function saveComplaints(complaints) {
        write(KEYS.complaints, complaints);
    }

    function getOfficers() {
        seed();
        return read(KEYS.officers, []);
    }

    function getAssignments() {
        seed();
        return read(KEYS.assignments, []);
    }

    function saveAssignments(assignments) {
        write(KEYS.assignments, assignments);
    }

    function getAudit() {
        seed();
        return read(KEYS.audit, []);
    }

    function addAudit(event) {
        const stamp = nowStamp();
        const audit = getAudit();
        audit.unshift({
            id: `AUD-${Date.now()}`,
            timestamp: `${stamp.date} ${stamp.time}`,
            ...event
        });
        write(KEYS.audit, audit.slice(0, 80));
    }

    function addNotification(targetRole, complaintId, message) {
        const stamp = nowStamp();
        const notifications = read(KEYS.notifications, []);
        notifications.unshift({
            id: `NTF-${Date.now()}`,
            targetRole,
            complaintId,
            message,
            read: false,
            timestamp: `${stamp.date} ${stamp.time}`
        });
        write(KEYS.notifications, notifications.slice(0, 80));
    }

    function calculatePriority(severity, duplicateCount, waitingDays) {
        const base = { Low: 40, Medium: 60, High: 75, Critical: 90 }[severity] || 60;
        const duplicateBoost = Math.max(0, duplicateCount - 1) * 2;
        const agingBoost = Math.max(0, waitingDays) * 2;
        return {
            severityBase: base,
            duplicateBoost,
            agingBoost,
            priorityScore: Math.min(99, base + duplicateBoost + agingBoost)
        };
    }

    function createComplaint(payload) {
        const complaints = getComplaints();
        const nextNumber = complaints.reduce((max, c) => {
            const n = Number(String(c.id).replace('CS', ''));
            return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 1000) + 1;
        const id = `CS${nextNumber}`;
        const stamp = nowStamp();
        const priority = calculatePriority(payload.severity, 1, 0);
        const complaint = {
            id,
            title: payload.title,
            description: payload.description,
            category: payload.category,
            location: payload.location,
            tehsil: payload.tehsil,
            ward: payload.ward,
            department: categoryDepartment[payload.category] || categoryDepartment.Other,
            severity: payload.severity,
            duplicateCount: 1,
            waitingDays: 0,
            status: 'Reported',
            processState: 'NEW / READY (MLQ Pending Verification)',
            citizen: payload.citizen || 'Anonymous Citizen',
            date: stamp.date,
            time: stamp.time,
            photo: payload.photo || 'images/civic-problem.jpg',
            clusterId: `CLUS-${Math.floor(1000 + Math.random() * 8999)}`,
            assignedOfficerId: null,
            ...priority
        };
        complaints.unshift(complaint);
        saveComplaints(complaints);
        addAudit({
            complaintId: id,
            actor: complaint.citizen,
            role: 'CITIZEN',
            action: 'Complaint Registered',
            fromStatus: '',
            toStatus: 'Reported',
            message: 'Citizen report stored in shared complaint lifecycle.'
        });
        addNotification('ADMIN', id, `New ${complaint.category} complaint ${id} is ready for verification.`);
        return complaint;
    }

    function updateComplaintStatus(id, status, actor = 'Authority Console') {
        const complaints = getComplaints();
        const complaint = complaints.find(c => c.id === id);
        if (!complaint) return null;
        const previous = complaint.status;
        complaint.status = status;
        complaint.processState = processStateForStatus(status, complaint.priorityScore);
        saveComplaints(complaints);
        addAudit({
            complaintId: id,
            actor,
            role: actor.includes('Officer') ? 'OFFICER' : 'ADMIN',
            action: 'Status Transition',
            fromStatus: previous,
            toStatus: status,
            message: `Complaint moved from ${previous} to ${status}.`
        });
        addNotification('CITIZEN', id, `Complaint ${id} status updated to ${status}.`);
        return complaint;
    }

    function processStateForStatus(status, score) {
        const lane = score >= 85 ? 0 : score >= 70 ? 1 : 2;
        const map = {
            Reported: `NEW / READY (MLQ Lane ${lane})`,
            Verified: `READY (MLQ Lane ${lane})`,
            Assigned: `ASSIGNED (MLQ Lane ${lane})`,
            'In Progress': `RUNNING / IN PROGRESS (MLQ Lane ${lane})`,
            Blocked: 'WAITING / BLOCKED',
            'Completion Submitted': 'WAITING / AWAITING VERIFICATION',
            Resolved: 'TERMINATED / RESOLVED',
            Disputed: 'WAITING / DISPUTE REVIEW'
        };
        return map[status] || status.toUpperCase();
    }

    function eligibleOfficers(complaint) {
        const assignments = getAssignments();
        return getOfficers()
            .map(officer => ({
                ...officer,
                activeLoad: assignments.filter(a => a.officerId === officer.id && !['REJECTED', 'COMPLETION_SUBMITTED'].includes(a.state)).length
            }))
            .filter(officer => officer.availability === 'Available')
            .filter(officer => officer.department === complaint.department || officer.skills.includes(complaint.category))
            .filter(officer => officer.serviceAreas.includes('Dehradun Municipal Corporation') || officer.serviceAreas.includes(complaint.ward) || officer.serviceAreas.includes(complaint.tehsil))
            .filter(officer => officer.activeLoad < officer.capacity)
            .sort((a, b) => a.activeLoad - b.activeLoad || a.name.localeCompare(b.name));
    }

    function allocateOfficer(complaintId, actor = 'Authority Console') {
        const complaints = getComplaints();
        const complaint = complaints.find(c => c.id === complaintId);
        if (!complaint) return { ok: false, reason: 'Complaint not found.' };
        const candidates = eligibleOfficers(complaint);
        if (!candidates.length) {
            addAudit({
                complaintId,
                actor,
                role: 'ADMIN',
                action: 'Allocation Failed',
                fromStatus: complaint.status,
                toStatus: complaint.status,
                message: 'No available officer matched department, skill, ward and workload constraints.'
            });
            addNotification('ADMIN', complaintId, `No eligible officer is currently available for ${complaintId}.`);
            return { ok: false, reason: 'No eligible officer available.' };
        }
        const officer = candidates[0];
        const assignments = getAssignments();
        const assignment = makeAssignment(`ASN-${complaintId}-${assignments.length + 1}`, complaintId, officer.id, 'PENDING_ACCEPTANCE', actor);
        assignments.unshift(assignment);
        saveAssignments(assignments);
        complaint.assignedOfficerId = officer.id;
        complaint.status = 'Assigned';
        complaint.processState = processStateForStatus('Assigned', complaint.priorityScore);
        saveComplaints(complaints);
        addAudit({
            complaintId,
            actor,
            role: 'ADMIN',
            action: 'Officer Allocated',
            fromStatus: 'Verified',
            toStatus: 'Assigned',
            message: `${officer.name} selected by workload-aware allocation.`
        });
        addNotification('OFFICER', complaintId, `${complaintId} has been assigned to ${officer.name}.`);
        addNotification('CITIZEN', complaintId, `Complaint ${complaintId} has been assigned to a municipal officer.`);
        return { ok: true, officer, assignment };
    }

    function updateAssignment(assignmentId, nextState, details = {}) {
        const assignments = getAssignments();
        const assignment = assignments.find(a => a.id === assignmentId);
        if (!assignment) return null;
        assignment.state = nextState;
        Object.assign(assignment, details);
        saveAssignments(assignments);
        const statusMap = {
            ACCEPTED: 'Assigned',
            IN_PROGRESS: 'In Progress',
            BLOCKED: 'Blocked',
            COMPLETION_SUBMITTED: 'Completion Submitted',
            REJECTED: 'Verified'
        };
        updateComplaintStatus(assignment.complaintId, statusMap[nextState] || 'Assigned', details.actor || 'Officer Portal');
        if (nextState === 'REJECTED') {
            const complaints = getComplaints();
            const complaint = complaints.find(c => c.id === assignment.complaintId);
            if (complaint) {
                complaint.assignedOfficerId = null;
                saveComplaints(complaints);
            }
        }
        return assignment;
    }

    function simulateAging() {
        const complaints = getComplaints().map(c => {
            if (!['Resolved', 'Completion Submitted'].includes(c.status)) {
                c.waitingDays += 1;
                const priority = calculatePriority(c.severity, c.duplicateCount, c.waitingDays);
                Object.assign(c, priority);
                c.processState = processStateForStatus(c.status, c.priorityScore);
            }
            return c;
        });
        saveComplaints(complaints);
        addAudit({
            complaintId: 'SYSTEM',
            actor: 'OS Scheduler',
            role: 'SYSTEM',
            action: 'Aging Simulation',
            fromStatus: '',
            toStatus: '',
            message: 'All unresolved ready complaints received a 24-hour aging recalculation.'
        });
        return complaints;
    }

    function getNotifications(role) {
        seed();
        return read(KEYS.notifications, []).filter(n => !role || n.targetRole === role);
    }

    function resetDemoData() {
        Object.values(KEYS).forEach(key => localStorage.removeItem(key));
        seed();
    }

    seed();

    return {
        categoryDepartment,
        getComplaints,
        getOfficers,
        getAssignments,
        getAudit,
        getNotifications,
        createComplaint,
        updateComplaintStatus,
        allocateOfficer,
        updateAssignment,
        simulateAging,
        eligibleOfficers,
        processStateForStatus,
        resetDemoData
    };
})();
