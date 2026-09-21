document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('trackingContainer');
    const searchForm = document.getElementById('trackSearchForm');
    const searchInput = document.getElementById('trackInput');
    const chips = document.querySelectorAll('.track-chip');

    // Database of complaints
    const complaintsDB = {
        'CS1024': {
            id: 'CS1024',
            title: 'Large pothole near Sector 15 main market intersection',
            description: 'Severe road surface cave-in approximately 4 feet wide and 8 inches deep. Causing severe traffic congestion during peak hours and hazardous for two-wheelers at night.',
            category: 'Roads',
            location: 'Sector 15 Main Market, Gate No. 2, Chandigarh',
            ward: 'Central Zone — Ward 14',
            department: 'Road Infrastructure & Maintenance',
            officer: 'Er. Rajesh Varma (Junior Engineer - Roads)',
            priorityScore: 87,
            severity: 'High',
            severityBase: 65,
            duplicateCount: 12,
            duplicateBoost: 14,
            waitingDays: 4,
            agingBoost: 8,
            status: 'Assigned',
            processState: 'ASSIGNED (MLQ Lane 1: High Priority)',
            date: 'Sept 12, 2026',
            photo: 'images/roads.jpg',
            clusterId: 'CLUS-8924',
            history: [
                {
                    title: 'Complaint Registered',
                    date: 'Sept 12, 2026 — 9:14 AM',
                    desc: 'Initial report filed by citizen. Automated duplicate check linked 11 other geo-located complaints to cluster CLUS-8924.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Field Verification Completed',
                    date: 'Sept 12, 2026 — 2:30 PM',
                    desc: 'Municipal inspector verified road distress. Verified depth: 22cm. Upgraded severity to High.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Dispatched to Department',
                    date: 'Sept 13, 2026 — 10:00 AM',
                    desc: 'Assigned to Road Maintenance Div 3. Materials request (asphalt & cold-mix) requisitioned.',
                    completed: true,
                    current: true
                },
                {
                    title: 'Physical Repair in Progress',
                    date: 'Scheduled for Sept 19, 2026',
                    desc: 'Road roller and patch crew scheduled for night execution to minimize daytime traffic disruption.',
                    completed: false,
                    current: false
                },
                {
                    title: 'Quality Audit & Resolution',
                    date: 'Awaiting Completion',
                    desc: 'Final site inspection and photographic proof upload before closing ticket in municipal DBMS.',
                    completed: false,
                    current: false
                }
            ]
        },
        'CS1031': {
            id: 'CS1031',
            title: 'Underground drinking water pipeline burst with heavy wastage',
            description: 'Major pipeline rupture flooding the service lane. Clean potable water gushing for past 36 hours, dropping water pressure for neighboring blocks.',
            category: 'Water',
            location: 'MG Road, Opposite Metro Pillar 142',
            ward: 'North Zone — Ward 08',
            department: 'Municipal Water & Sewerage Board',
            officer: 'S. K. Nambiar (Assistant Executive Engineer)',
            priorityScore: 82,
            severity: 'High',
            severityBase: 70,
            duplicateCount: 7,
            duplicateBoost: 6,
            waitingDays: 3,
            agingBoost: 6,
            status: 'In Progress',
            processState: 'RUNNING / IN PROGRESS (MLQ Lane 1)',
            date: 'Sept 13, 2026',
            photo: 'images/water.jpg',
            clusterId: 'CLUS-7102',
            history: [
                {
                    title: 'Complaint Registered',
                    date: 'Sept 13, 2026 — 6:40 AM',
                    desc: 'Reported by local residents committee.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Telemetry Verified',
                    date: 'Sept 13, 2026 — 8:15 AM',
                    desc: 'Pressure sensor telemetry confirmed pressure drop in Sector feeder valve.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Emergency Isolation Valve Closed',
                    date: 'Sept 13, 2026 — 11:30 AM',
                    desc: 'Excavation team mobilized to expose 300mm ductile iron pipe joint.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Pipe Weld & Replacement Active',
                    date: 'Sept 14, 2026 — Ongoing',
                    desc: 'Welding collar replacement in progress. Water tankers routed as temporary relief.',
                    completed: true,
                    current: true
                },
                {
                    title: 'Pressure Test & Closure',
                    date: 'Expected Today 8:00 PM',
                    desc: 'System backwash and bacteriological testing before supply resumption.',
                    completed: false,
                    current: false
                }
            ]
        },
        'CS1009': {
            id: 'CS1009',
            title: 'Garbage dump overflowing outside community park',
            category: 'Waste',
            location: 'Pocket B, Green Park Enclave',
            ward: 'South Zone — Ward 05',
            department: 'Solid Waste & Sanitation Department',
            officer: 'P. Anand (Sanitary Inspector)',
            priorityScore: 79,
            severity: 'Medium',
            severityBase: 55,
            duplicateCount: 15,
            duplicateBoost: 24,
            waitingDays: 0,
            agingBoost: 0,
            status: 'Resolved',
            processState: 'TERMINATED / RESOLVED',
            date: 'Sept 08, 2026',
            photo: 'images/waste.jpg',
            clusterId: 'CLUS-5401',
            history: [
                {
                    title: 'Reported',
                    date: 'Sept 08, 2026 — 7:00 AM',
                    desc: 'Multiple reports clustered.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Sanitation Truck Assigned',
                    date: 'Sept 08, 2026 — 9:30 AM',
                    desc: 'Compactor vehicle #DL-1M-4821 dispatched.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Cleared & Disinfected',
                    date: 'Sept 08, 2026 — 1:15 PM',
                    desc: 'Waste cleared, secondary bin replaced, and lime powder sanitized.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Audit Complete & Resolved',
                    date: 'Sept 08, 2026 — 4:00 PM',
                    desc: 'Citizen confirmation received. Issue closed in municipal database.',
                    completed: true,
                    current: true
                }
            ]
        },
        'CS1045': {
            id: 'CS1045',
            title: 'Street light pole wiring sparked and blacked out whole lane',
            category: 'Lighting',
            location: 'Lane 4, Subhash Nagar',
            ward: 'West Zone — Ward 12',
            department: 'Electrical & Street Lighting Wing',
            officer: 'Amitabh Sen (AE Electrical)',
            priorityScore: 65,
            severity: 'Medium',
            severityBase: 50,
            duplicateCount: 4,
            duplicateBoost: 15,
            waitingDays: 0,
            agingBoost: 0,
            status: 'Resolved',
            processState: 'TERMINATED / RESOLVED',
            date: 'Sept 04, 2026',
            photo: 'images/lighting.png',
            clusterId: 'CLUS-3209',
            history: [
                {
                    title: 'Reported',
                    date: 'Sept 04, 2026 — 8:20 PM',
                    desc: 'Hazardous short circuit reported.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Fuse Isolated',
                    date: 'Sept 04, 2026 — 9:45 PM',
                    desc: 'Emergency lineworker de-energized feeder line.',
                    completed: true,
                    current: false
                },
                {
                    title: 'Cable Rewired & LED Restored',
                    date: 'Sept 05, 2026 — 11:30 AM',
                    desc: 'Faulty underground junction box replaced.',
                    completed: true,
                    current: true
                }
            ]
        }
    };

    // Also pull complaints from localStorage
    try {
        const stored = JSON.parse(localStorage.getItem('civics_smart_complaints') || '[]');
        stored.forEach(item => {
            complaintsDB[item.id] = {
                ...item,
                severityBase: item.priorityScore - 5,
                duplicateBoost: 0,
                processState: item.status.toUpperCase() + ' (MLQ Active)',
                history: [
                    {
                        title: 'Complaint Registered',
                        date: item.date + ' — ' + item.time,
                        desc: 'Submitted through citizen web portal. Seeded into municipal staging queue.',
                        completed: true,
                        current: true
                    },
                    {
                        title: 'Verification Pending',
                        date: 'Queued for inspection',
                        desc: 'System evaluating priority scheduling algorithm.',
                        completed: false,
                        current: false
                    }
                ]
            };
        });
    } catch (e) {
        console.error(e);
    }

    function renderComplaint(id) {
        const cleanId = id.toUpperCase().replace('#', '').trim();
        const data = complaintsDB[cleanId];

        if (!data) {
            container.innerHTML = `
                <div class="card" style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
                    <div style="font-size: var(--text-3xl); margin-bottom: var(--space-md); color: var(--status-critical);">&#9888;</div>
                    <h3 style="font-size: var(--text-2xl); margin-bottom: var(--space-sm);">Complaint #${cleanId} Not Found</h3>
                    <p style="color: var(--taupe); max-width: 480px; margin: 0 auto var(--space-xl) auto; font-size: var(--text-sm);">
                        We could not find an active or historical complaint matching this reference. Please check your tracking number or try one of the active cases below.
                    </p>
                    <div style="display: flex; gap: var(--space-sm); justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn--secondary btn--sm quick-demo-btn" data-id="CS1024">View CS1024 (Road)</button>
                        <button class="btn btn--secondary btn--sm quick-demo-btn" data-id="CS1031">View CS1031 (Water)</button>
                    </div>
                </div>
            `;

            document.querySelectorAll('.quick-demo-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    renderComplaint(btn.dataset.id);
                });
            });
            return;
        }

        const isResolved = data.status.toLowerCase() === 'resolved';
        const badgeClass = isResolved ? 'badge--resolved' : (data.priorityScore >= 80 ? 'badge--critical' : (data.priorityScore >= 70 ? 'badge--high' : 'badge--normal'));

        container.innerHTML = `
            <article class="tracking-main-card">
                <!-- Hero Header -->
                <div class="tracking-hero-header">
                    <div class="tracking-hero-left">
                        <div class="tracking-badge-row">
                            <span class="badge ${badgeClass}">${data.status}</span>
                            <span class="badge badge--normal">${data.category}</span>
                            <span class="state-pill">OS STATE: ${data.processState}</span>
                        </div>
                        <span style="font-size: var(--text-xs); color: var(--taupe); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                            Complaint Reference #${data.id}
                        </span>
                        <h2 class="tracking-title">${data.title}</h2>
                        <div class="tracking-location">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span>${data.location} &bull; ${data.ward}</span>
                        </div>
                    </div>

                    <div class="tracking-score-card">
                        <div class="tracking-score-number">${data.priorityScore}</div>
                        <div class="tracking-score-label">Priority Score</div>
                        <span style="font-size: 0.75rem; color: var(--taupe); display: block; margin-top: 4px;">Dynamic Queue Priority</span>
                    </div>
                </div>

                <!-- Main Details Grid -->
                <div class="tracking-grid">
                    
                    <!-- Left: Status Stepper -->
                    <div>
                        <h4 style="font-size: var(--text-base); font-family: var(--font-body); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: var(--space-2xl); color: var(--charcoal);">
                            Lifecycle Timeline & Status History
                        </h4>

                        <div class="stepper">
                            ${data.history.map((step, idx) => `
                                <div class="stepper-item ${step.completed ? 'completed' : ''} ${step.current ? 'current' : ''}">
                                    <div class="stepper-node">
                                        ${step.completed ? '&#10003;' : (idx + 1)}
                                    </div>
                                    <div class="stepper-content">
                                        <div class="stepper-title">${step.title}</div>
                                        ${step.date ? `<div class="stepper-date">${step.date}</div>` : ''}
                                        <div class="stepper-desc">${step.desc}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        ${data.photo ? `
                            <div style="margin-top: var(--space-3xl); padding-top: var(--space-2xl); border-top: var(--border-thin);">
                                <h5 style="font-size: var(--text-sm); font-family: var(--font-body); font-weight: 600; text-transform: uppercase; color: var(--taupe); margin-bottom: var(--space-md);">
                                    Field Photographic Evidence
                                </h5>
                                <div style="border-radius: var(--radius-md); overflow: hidden; max-height: 280px; border: var(--border-thin);">
                                    <img src="${data.photo}" alt="Complaint site evidence photo" style="width: 100%; height: 280px; object-fit: cover;">
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Right: OS & DBMS Architecture Insights -->
                    <div>
                        <div class="engine-insight-box">
                            <div class="insight-header">
                                <h4>Priority Engine Mechanics</h4>
                                <span style="font-size: 0.7rem; color: var(--burgundy); font-weight: bold;">OS Scheduling</span>
                            </div>

                            <div class="insight-formula-row">
                                <div><strong>Scheduling Algorithm:</strong></div>
                                <code>Priority = Base (${data.severityBase}) + Duplicates (+${data.duplicateBoost}) + Aging (+${data.agingBoost}) = <strong>${data.priorityScore}</strong></code>
                            </div>

                            <div class="insight-data-list">
                                <div class="insight-data-item">
                                    <span class="label">Base Severity Class:</span>
                                    <span class="value">${data.severity} (${data.severityBase} pts)</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Duplicate Reports:</span>
                                    <span class="value">${data.duplicateCount} citizens reported (+${data.duplicateBoost} pts)</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Waiting Time:</span>
                                    <span class="value">${data.waitingDays} days pending</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">OS Aging Compensation:</span>
                                    <span class="value" style="color: var(--burgundy);">+${data.agingBoost} pts boost</span>
                                </div>
                            </div>

                            <div class="divider" style="margin-block: var(--space-sm);"></div>

                            <div class="insight-header">
                                <h4>DBMS Relational Attributes</h4>
                                <span style="font-size: 0.7rem; color: var(--gold); font-weight: bold;">Normalized Schema</span>
                            </div>

                            <div class="insight-data-list">
                                <div class="insight-data-item">
                                    <span class="label">Primary Key (PK):</span>
                                    <span class="value" style="font-family: monospace;">COMPLAINT_ID = '${data.id}'</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Department Assigned (FK):</span>
                                    <span class="value">${data.department}</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Field Officer:</span>
                                    <span class="value">${data.officer || 'Superintending Engineer'}</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Duplicate Cluster (FK):</span>
                                    <span class="value" style="font-family: monospace;">${data.clusterId || 'CLUS-SINGLE'}</span>
                                </div>
                            </div>

                            <div style="margin-top: var(--space-md); padding: var(--space-md); background: rgba(233,223,208,0.3); border-radius: var(--radius-sm); font-size: var(--text-xs); color: var(--taupe);">
                                Relational integrity constraints ensure that all status transitions are logged in an immutable audit table with ACID transactional consistency.
                            </div>
                        </div>
                    </div>

                </div>
            </article>
        `;

        // Update URL without page reload
        history.replaceState(null, '', `?id=${data.id}`);
    }

    // Handle form submit
    if (searchForm && searchInput) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = searchInput.value.trim();
            if (val) renderComplaint(val);
        });
    }

    // Quick chips
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.id;
            searchInput.value = id;
            renderComplaint(id);
        });
    });

    // Check URL parameters for id
    const urlParams = new URLSearchParams(window.location.search);
    const initialId = urlParams.get('id') || 'CS1024';
    searchInput.value = initialId;
    renderComplaint(initialId);
});
