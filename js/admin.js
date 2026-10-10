document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.admin-nav-item');
    const views = document.querySelectorAll('.admin-view');
    const viewTitle = document.getElementById('viewTitle');

    const titles = {
        overview: 'Dashboard Overview',
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
        });
    });

    const tableSearch = document.getElementById('adminTableSearch');
    const catSelect = document.getElementById('adminCategoryFilter');
    const statusModal = document.getElementById('statusModal');
    const modalRef = document.getElementById('modalComplaintRef');
    const modalStatusSelect = document.getElementById('modalStatusSelect');
    const closeStatusModal = document.getElementById('closeStatusModal');
    const saveStatusBtn = document.getElementById('saveStatusBtn');

    let activeComplaintId = null;

    function complaints() {
        return CivicData.getComplaints().sort((a, b) => b.priorityScore - a.priorityScore);
    }

    function badgeFor(c) {
        if (c.status === 'Resolved') return 'badge--resolved';
        if (c.priorityScore >= 85) return 'badge--critical';
        if (c.priorityScore >= 70) return 'badge--high';
        return 'badge--normal';
    }

    function officerLabel(id) {
        const officer = CivicData.getOfficers().find(item => item.id === id);
        return officer ? officer.name : 'Unassigned';
    }

    function renderStats() {
        const all = CivicData.getComplaints();
        const total = all.length;
        const pending = all.filter(c => ['Reported', 'Verified'].includes(c.status)).length;
        const progress = all.filter(c => ['Assigned', 'In Progress', 'Blocked', 'Completion Submitted'].includes(c.status)).length;
        const critical = all.filter(c => c.priorityScore >= 85 && c.status !== 'Resolved').length;
        const resolved = all.filter(c => c.status === 'Resolved').length;
        const clusters = new Set(all.map(c => c.clusterId).filter(Boolean)).size;
        const values = document.querySelectorAll('.admin-stat-val');
        const footers = document.querySelectorAll('.admin-stat-footer');
        [total, pending, progress, critical, resolved, clusters].forEach((value, index) => {
            if (values[index]) values[index].textContent = value;
        });
        if (footers[0]) footers[0].textContent = `${CivicData.getNotifications('ADMIN').length} admin alerts in notification log`;
    }

    function rowActions(c) {
        const canAllocate = ['Reported', 'Verified'].includes(c.status) || !c.assignedOfficerId;
        return `
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button class="table-btn status-modal-trigger" data-id="${c.id}" data-status="${c.status}">Status</button>
                ${canAllocate ? `<button class="table-btn table-btn--primary allocate-trigger" data-id="${c.id}">Allocate</button>` : ''}
                <a href="track.html?id=${c.id}" class="table-btn" target="_blank">Track</a>
            </div>
        `;
    }

    function renderOverviewTable() {
        const tbody = document.getElementById('topQueueTableBody');
        if (!tbody) return;
        tbody.innerHTML = complaints().map((c, idx) => `
            <tr>
                <td style="font-family: var(--font-heading); font-size: var(--text-base); color: var(--taupe);">${idx + 1}</td>
                <td><strong style="color: var(--burgundy); font-family: monospace;">#${c.id}</strong></td>
                <td>
                    <div style="font-weight: 600; font-size: var(--text-sm);">${c.title}</div>
                    <div style="font-size: var(--text-xs); color: var(--taupe);">${c.location}</div>
                </td>
                <td><span class="badge badge--normal">${c.category}</span></td>
                <td><span class="badge ${badgeFor(c)}" style="font-size: var(--text-xs); font-weight: bold;">${c.priorityScore}</span></td>
                <td><span class="badge badge--progress">${c.status}</span></td>
                <td style="font-size: var(--text-xs);">${c.waitingDays}d <span style="color: var(--gold);">(+${c.agingBoost} boost)</span></td>
                <td>${rowActions(c)}</td>
            </tr>
        `).join('');
    }

    function renderMLQ() {
        const q0 = document.getElementById('queue0Body');
        const q1 = document.getElementById('queue1Body');
        const q2 = document.getElementById('queue2Body');
        if (!q0 || !q1 || !q2) return;

        function rowHTML(c) {
            return `
                <tr>
                    <td style="width: 100px;"><strong style="color: var(--burgundy); font-family: monospace;">#${c.id}</strong></td>
                    <td>
                        <div style="font-weight: 600;">${c.title}</div>
                        <div style="font-size: var(--text-xs); color: var(--taupe);">${c.processState}</div>
                    </td>
                    <td><span class="badge badge--normal">${c.department}</span></td>
                    <td style="font-weight: bold; width: 90px;">Score: ${c.priorityScore}</td>
                    <td style="width: 150px;"><span class="badge badge--progress">${c.status}</span></td>
                    <td style="width: 210px;">${rowActions(c)}</td>
                </tr>
            `;
        }

        q0.innerHTML = complaints().filter(c => c.priorityScore >= 85).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">No critical queue complaints.</td></tr>';
        q1.innerHTML = complaints().filter(c => c.priorityScore >= 70 && c.priorityScore < 85).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">Queue empty.</td></tr>';
        q2.innerHTML = complaints().filter(c => c.priorityScore < 70).map(rowHTML).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--taupe);">Queue empty.</td></tr>';
    }

    function renderAllComplaints(filterText = '', catFilter = 'all') {
        const tbody = document.getElementById('allComplaintsTableBody');
        if (!tbody) return;

        const filtered = complaints().filter(c => {
            if (catFilter !== 'all' && c.category.toLowerCase() !== catFilter.toLowerCase()) return false;
            if (filterText) {
                const match = `${c.id} ${c.title} ${c.department} ${c.location} ${c.status}`.toLowerCase();
                if (!match.includes(filterText)) return false;
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
                <td>
                    <div>${c.department}</div>
                    <div style="font-size: var(--text-xs); color: var(--taupe);">Officer: ${officerLabel(c.assignedOfficerId)}</div>
                </td>
                <td><span class="badge ${badgeFor(c)}">${c.priorityScore}</span></td>
                <td><span class="badge badge--progress">${c.status}</span></td>
                <td>${rowActions(c)}</td>
            </tr>
        `).join('');
    }

    function renderDepartments() {
        const container = document.querySelector('#view-department-load .data-card > div[style*="padding"]');
        if (!container) return;
        const byDepartment = CivicData.getOfficers().map(officer => {
            const active = CivicData.getAssignments().filter(a => a.officerId === officer.id && !['REJECTED', 'COMPLETION_SUBMITTED'].includes(a.state)).length;
            return { officer, active };
        });

        container.innerHTML = byDepartment.map(({ officer, active }) => {
            const percent = Math.min(100, Math.round((active / officer.capacity) * 100));
            const color = percent >= 80 ? 'var(--status-critical)' : percent >= 50 ? 'var(--gold)' : 'var(--status-resolved)';
            return `
                <div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: var(--text-sm); gap: var(--space-md); flex-wrap: wrap;">
                        <strong>${officer.name} - ${officer.department}</strong>
                        <span>${active} / ${officer.capacity} active assignments (${percent}% capacity)</span>
                    </div>
                    <div style="height: 10px; background: var(--beige); border-radius: 5px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: ${color};"></div>
                    </div>
                    <div style="font-size: var(--text-xs); color: var(--taupe); margin-top: 4px;">Skills: ${officer.skills.join(', ')} | Areas: ${officer.serviceAreas.join(', ')}</div>
                </div>
            `;
        }).join('');
    }

    function renderAuditAndNotifications() {
        const auditBody = document.getElementById('auditTableBody');
        if (auditBody) {
            auditBody.innerHTML = CivicData.getAudit().slice(0, 10).map(event => `
                <tr>
                    <td style="font-family: monospace;">${event.complaintId}</td>
                    <td>${event.action}</td>
                    <td>${event.actor} <span style="color: var(--taupe);">(${event.role})</span></td>
                    <td>${event.fromStatus || '-'} &rarr; ${event.toStatus || '-'}</td>
                    <td>${event.timestamp}</td>
                </tr>
            `).join('');
        }

        const notifyBody = document.getElementById('notificationTableBody');
        if (notifyBody) {
            notifyBody.innerHTML = CivicData.getNotifications().slice(0, 10).map(item => `
                <tr>
                    <td><span class="badge badge--normal">${item.targetRole}</span></td>
                    <td style="font-family: monospace;">${item.complaintId}</td>
                    <td>${item.message}</td>
                    <td>${item.timestamp}</td>
                </tr>
            `).join('');
        }
    }

    function refreshAll() {
        renderStats();
        renderOverviewTable();
        renderMLQ();
        renderAllComplaints(tableSearch ? tableSearch.value.toLowerCase().trim() : '', catSelect ? catSelect.value : 'all');
        renderDepartments();
        renderAuditAndNotifications();
        attachActions();
    }

    function attachActions() {
        document.querySelectorAll('.status-modal-trigger').forEach(btn => {
            btn.onclick = () => {
                activeComplaintId = btn.dataset.id;
                if (modalRef) modalRef.textContent = `Modifying record #${activeComplaintId}`;
                if (modalStatusSelect) modalStatusSelect.value = btn.dataset.status;
                if (statusModal) statusModal.style.display = 'flex';
            };
        });

        document.querySelectorAll('.allocate-trigger').forEach(btn => {
            btn.onclick = () => {
                const result = CivicData.allocateOfficer(btn.dataset.id);
                btn.textContent = result.ok ? `Assigned: ${result.officer.name}` : 'No Match';
                setTimeout(refreshAll, 500);
            };
        });
    }

    if (tableSearch) {
        tableSearch.addEventListener('input', (e) => {
            renderAllComplaints(e.target.value.toLowerCase().trim(), catSelect ? catSelect.value : 'all');
            attachActions();
        });
    }

    if (catSelect) {
        catSelect.addEventListener('change', (e) => {
            renderAllComplaints(tableSearch ? tableSearch.value.toLowerCase().trim() : '', e.target.value);
            attachActions();
        });
    }

    const agingBtn = document.getElementById('simulateAgingBtn');
    if (agingBtn) {
        agingBtn.addEventListener('click', () => {
            CivicData.simulateAging();
            agingBtn.innerHTML = '&#10003; Aging Applied (+24h)';
            refreshAll();
            setTimeout(() => {
                agingBtn.innerHTML = 'Simulate Aging (+24h Boost)';
            }, 2200);
        });
    }

    const recalcBtn = document.getElementById('recalcQueueBtn');
    if (recalcBtn) {
        recalcBtn.addEventListener('click', () => {
            recalcBtn.innerHTML = 'Scheduling...';
            setTimeout(() => {
                refreshAll();
                recalcBtn.innerHTML = 'Scheduler Complete';
                setTimeout(() => { recalcBtn.innerHTML = 'Re-run Scheduler'; }, 1800);
            }, 300);
        });
    }

    if (closeStatusModal && statusModal) {
        closeStatusModal.addEventListener('click', () => {
            statusModal.style.display = 'none';
        });
    }

    if (saveStatusBtn && statusModal) {
        saveStatusBtn.addEventListener('click', () => {
            if (activeComplaintId && modalStatusSelect) {
                CivicData.updateComplaintStatus(activeComplaintId, modalStatusSelect.value);
                refreshAll();
            }
            statusModal.style.display = 'none';
        });
    }

    refreshAll();
});
