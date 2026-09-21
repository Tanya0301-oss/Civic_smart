document.addEventListener('DOMContentLoaded', () => {
    // Navigation / View Switching
    const navItems = document.querySelectorAll('.admin-nav-item');
    const views = document.querySelectorAll('.admin-view');
    const viewTitle = document.getElementById('viewTitle');
    const sidebar = document.getElementById('adminSidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');

    // Title map
    const titles = {
        'overview': 'Dashboard Overview',
        'priority-queue': 'Operating Systems Priority Queue',
        'complaint-mgmt': 'Civic Complaint Management',
        'department-load': 'Department Workload & Allocations',
        'engine-viz': 'OS & DBMS Architecture Visualizer'
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.dataset.view;
            
            navItems.forEach(i => i.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            item.classList.add('active');
            const activeView = document.getElementById(`view-${targetView}`);
            if (activeView) activeView.classList.add('active');

            if (viewTitle) viewTitle.textContent = titles[targetView] || 'Overview';

            if (window.innerWidth <= 900 && sidebar) {
                sidebar.classList.remove('open');
            }
        });
    });

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Complaints dataset
    let adminComplaints = [
        {
            id: 'CS1024',
            title: 'Large pothole near Sector 15 main market intersection',
            category: 'Roads',
            location: 'Sector 15 Market',
            department: 'Road Maintenance',
            baseSeverity: 65,
            duplicateCount: 12,
            waitingDays: 4,
            agingRate: 2,
            priorityScore: 87,
            status: 'Assigned'
        },
        {
            id: 'CS1031',
            title: 'Underground drinking water pipeline burst with heavy wastage',
            category: 'Water',
            location: 'MG Road, Pillar 142',
            department: 'Water & Sewerage',
            baseSeverity: 70,
            duplicateCount: 7,
            waitingDays: 3,
            agingRate: 2,
            priorityScore: 82,
            status: 'In Progress'
        },
        {
            id: 'CS1009',
            title: 'Garbage dump overflowing outside community park',
            category: 'Waste',
            location: 'Green Park Enclave',
            department: 'Solid Waste & Sanitation',
            baseSeverity: 55,
            duplicateCount: 15,
            waitingDays: 5,
            agingRate: 2,
            priorityScore: 79,
            status: 'Assigned'
        },
        {
            id: 'CS1045',
            title: 'Street light pole wiring sparked and blacked out whole lane',
            category: 'Lighting',
            location: 'Subhash Nagar Lane 4',
            department: 'Electrical Wing',
            baseSeverity: 50,
            duplicateCount: 4,
            waitingDays: 2,
            agingRate: 2,
            priorityScore: 65,
            status: 'Verified'
        },
        {
            id: 'CS1052',
            title: 'Clogged storm drain backing up into pedestrian walkway',
            category: 'Drainage',
            location: 'School Road, Sector 8',
            department: 'Drainage Division',
            baseSeverity: 45,
            duplicateCount: 3,
            waitingDays: 6,
            agingRate: 2,
            priorityScore: 58,
            status: 'Reported'
        },
        {
            id: 'CS1060',
            title: 'Fallen tree branch hanging precariously on power transformer',
            category: 'Electricity',
            location: 'Block C Park',
            department: 'Electrical Wing',
            baseSeverity: 80,
            duplicateCount: 8,
            waitingDays: 1,
            agingRate: 2,
            priorityScore: 92,
            status: 'Assigned'
        }
    ];

    // Load any user reports from localStorage
    try {
        const custom = JSON.parse(localStorage.getItem('civics_smart_complaints') || '[]');
        custom.forEach(c => {
            adminComplaints.unshift({
                id: c.id,
                title: c.title,
                category: c.category,
                location: c.location,
                department: c.department,
                baseSeverity: 60,
                duplicateCount: 1,
                waitingDays: 0,
                agingRate: 2,
                priorityScore: c.priorityScore,
                status: c.status
            });
        });
    } catch (e) {
        console.error(e);
    }

    // Render overview top queue table
    function renderOverviewTable() {
        const tbody = document.getElementById('topQueueTableBody');
        if (!tbody) return;

        // Sort descending by priorityScore
        const sorted = [...adminComplaints].sort((a, b) => b.priorityScore - a.priorityScore);

        tbody.innerHTML = sorted.map((c, idx) => {
            const isCritical = c.priorityScore >= 85;
            const badgeClass = isCritical ? 'badge--critical' : (c.priorityScore >= 70 ? 'badge--high' : 'badge--normal');

            return `
                <tr>
                    <td style="font-family: var(--font-heading); font-size: var(--text-base); color: var(--taupe);">${idx + 1}</td>
                    <td><strong style="color: var(--burgundy); font-family: monospace;">#${c.id}</strong></td>
                    <td>
                        <div style="font-weight: 600; font-size: var(--text-sm);">${c.title}</div>
                        <div style="font-size: var(--text-xs); color: var(--taupe);">${c.location}</div>
                    </td>
                    <td><span class="badge badge--normal">${c.category}</span></td>
                    <td>
                        <span class="badge ${badgeClass}" style="font-size: var(--text-xs); font-weight: bold;">
                            ${c.priorityScore}
                        </span>
                    </td>
                    <td><span class="badge badge--progress">${c.status}</span></td>
                    <td style="font-size: var(--text-xs);">
                        ${c.waitingDays}d <span style="color: var(--gold);">(+${c.waitingDays * c.agingRate} boost)</span>
                    </td>
                    <td>
                        <button class="table-btn status-modal-trigger" data-id="${c.id}" data-status="${c.status}">
                            Update
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        attachModalTriggers();
    }

    // Render Multilevel Feedback Queue (Queue 0, 1, 2)
    function renderMLQ() {
        const q0 = document.getElementById('queue0Body');
        const q1 = document.getElementById('queue1Body');
        const q2 = document.getElementById('queue2Body');
        if (!q0 || !q1 || !q2) return;

        const sorted = [...adminComplaints].sort((a, b) => b.priorityScore - a.priorityScore);

        function rowHTML(c) {
            return `
                <tr>
                    <td style="width: 100px;"><strong style="color: var(--burgundy); font-family: monospace;">#${c.id}</strong></td>
                    <td>${c.title}</td>
                    <td><span class="badge badge--normal">${c.department}</span></td>
                    <td style="font-weight: bold; width: 80px;">Score: ${c.priorityScore}</td>
                    <td style="width: 120px;"><span class="badge badge--progress">${c.status}</span></td>
                    <td style="width: 90px;">
                        <button class="table-btn status-modal-trigger" data-id="${c.id}" data-status="${c.status}">Dispatch</button>
                    </td>
                </tr>
            `;
        }

        q0.innerHTML = sorted.filter(c => c.priorityScore >= 85).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">No critical queue complaints.</td></tr>';
        q1.innerHTML = sorted.filter(c => c.priorityScore >= 70 && c.priorityScore < 85).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">Queue empty.</td></tr>';
        q2.innerHTML = sorted.filter(c => c.priorityScore < 70).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">Queue empty.</td></tr>';

        attachModalTriggers();
    }

    // Render All Complaints in Management Table
    function renderAllComplaints(filterText = '', catFilter = 'all') {
        const tbody = document.getElementById('allComplaintsTableBody');
        if (!tbody) return;

        const filtered = adminComplaints.filter(c => {
            if (catFilter !== 'all' && c.category.toLowerCase() !== catFilter.toLowerCase()) return false;
            if (filterText) {
                const match = c.id.toLowerCase().includes(filterText) ||
                              c.title.toLowerCase().includes(filterText) ||
                              c.department.toLowerCase().includes(filterText);
                if (!match) return false;
            }
            return true;
        });

        tbody.innerHTML = filtered.map(c => `
            <tr>
                <td><strong style="color: var(--burgundy); font-family: monospace;">#${c.id}</strong></td>
                <td>
                    <div style="font-weight: 600;">${c.title}</div>
                    <div style="font-size: var(--text-xs); color: var(--taupe);">${c.location}</div>
                </td>
                <td>${c.category}</td>
                <td>${c.department}</td>
                <td><span class="badge ${c.priorityScore >= 80 ? 'badge--critical' : 'badge--normal'}">${c.priorityScore}</span></td>
                <td><span class="badge badge--progress">${c.status}</span></td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="table-btn status-modal-trigger" data-id="${c.id}" data-status="${c.status}">Status</button>
                        <a href="track.html?id=${c.id}" class="table-btn" target="_blank">Track</a>
                    </div>
                </td>
            </tr>
        `).join('');

        attachModalTriggers();
    }

    // Search and filter in Complaints Table
    const tableSearch = document.getElementById('adminTableSearch');
    const catSelect = document.getElementById('adminCategoryFilter');

    if (tableSearch) {
        tableSearch.addEventListener('input', (e) => {
            renderAllComplaints(e.target.value.toLowerCase().trim(), catSelect ? catSelect.value : 'all');
        });
    }

    if (catSelect) {
        catSelect.addEventListener('change', (e) => {
            renderAllComplaints(tableSearch ? tableSearch.value.toLowerCase().trim() : '', e.target.value);
        });
    }

    // OS Concept: Aging Simulation (+24h Boost)
    const agingBtn = document.getElementById('simulateAgingBtn');
    if (agingBtn) {
        agingBtn.addEventListener('click', () => {
            adminComplaints.forEach(c => {
                c.waitingDays += 1;
                c.priorityScore = Math.min(99, c.priorityScore + c.agingRate);
            });

            agingBtn.innerHTML = '&#10003; Aging Applied (+2 pts)';
            renderOverviewTable();
            renderMLQ();
            renderAllComplaints();

            setTimeout(() => {
                agingBtn.innerHTML = 'Simulate Aging (+24h Boost)';
            }, 2500);
        });
    }

    const recalcBtn = document.getElementById('recalcQueueBtn');
    if (recalcBtn) {
        recalcBtn.addEventListener('click', () => {
            recalcBtn.innerHTML = 'Scheduling...';
            setTimeout(() => {
                renderMLQ();
                renderOverviewTable();
                recalcBtn.innerHTML = 'Scheduler Complete';
                setTimeout(() => { recalcBtn.innerHTML = 'Re-run Scheduler'; }, 2000);
            }, 400);
        });
    }

    // Status Transition Modal
    const statusModal = document.getElementById('statusModal');
    const modalRef = document.getElementById('modalComplaintRef');
    const modalStatusSelect = document.getElementById('modalStatusSelect');
    const closeStatusModal = document.getElementById('closeStatusModal');
    const saveStatusBtn = document.getElementById('saveStatusBtn');

    let activeComplaintId = null;

    function attachModalTriggers() {
        document.querySelectorAll('.status-modal-trigger').forEach(btn => {
            btn.onclick = () => {
                activeComplaintId = btn.dataset.id;
                const curr = btn.dataset.status;
                if (modalRef) modalRef.textContent = `Modifying record #${activeComplaintId}`;
                if (modalStatusSelect) modalStatusSelect.value = curr;
                if (statusModal) statusModal.style.display = 'flex';
            };
        });
    }

    if (closeStatusModal && statusModal) {
        closeStatusModal.addEventListener('click', () => {
            statusModal.style.display = 'none';
        });
    }

    if (saveStatusBtn && statusModal) {
        saveStatusBtn.addEventListener('click', () => {
            const target = adminComplaints.find(c => c.id === activeComplaintId);
            if (target && modalStatusSelect) {
                target.status = modalStatusSelect.value;
                renderOverviewTable();
                renderMLQ();
                renderAllComplaints();
            }
            statusModal.style.display = 'none';
        });
    }

    // Initial render
    renderOverviewTable();
    renderMLQ();
    renderAllComplaints();
});
