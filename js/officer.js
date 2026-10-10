document.addEventListener('DOMContentLoaded', () => {
    const officerSelect = document.getElementById('officerSelect');
    const officerName = document.getElementById('officerName');
    const officerMeta = document.getElementById('officerMeta');
    const assignmentList = document.getElementById('assignmentList');
    const notificationList = document.getElementById('officerNotifications');
    const auditList = document.getElementById('officerAudit');

    function populateOfficers() {
        officerSelect.innerHTML = CivicData.getOfficers().map(officer => `
            <option value="${officer.id}">${officer.name} - ${officer.department}</option>
        `).join('');
        officerSelect.value = localStorage.getItem('civics_smart_active_officer') || CivicData.getOfficers()[0].id;
    }

    function currentOfficer() {
        return CivicData.getOfficers().find(officer => officer.id === officerSelect.value) || CivicData.getOfficers()[0];
    }

    function renderOfficerHeader(officer) {
        officerName.textContent = officer.name;
        officerMeta.textContent = `${officer.role} | ${officer.department} | Capacity ${officer.capacity}`;
    }

    function complaintFor(assignment) {
        return CivicData.getComplaints().find(c => c.id === assignment.complaintId);
    }

    function renderAssignments() {
        const officer = currentOfficer();
        renderOfficerHeader(officer);
        localStorage.setItem('civics_smart_active_officer', officer.id);

        const assignments = CivicData.getAssignments()
            .filter(a => a.officerId === officer.id)
            .filter(a => a.state !== 'REJECTED')
            .map(a => ({ assignment: a, complaint: complaintFor(a) }))
            .filter(item => item.complaint)
            .sort((a, b) => b.complaint.priorityScore - a.complaint.priorityScore);

        if (!assignments.length) {
            assignmentList.innerHTML = `
                <div class="assignment-card" style="text-align: center; padding: var(--space-3xl);">
                    <h3 class="assignment-card__title">No Active Assignments</h3>
                    <p style="font-size: var(--text-sm); color: var(--taupe);">Authority allocation will place verified complaints here when this officer is eligible and available.</p>
                </div>
            `;
            return;
        }

        assignmentList.innerHTML = assignments.map(({ assignment, complaint }) => `
            <article class="assignment-card">
                <div class="assignment-card__top">
                    <div>
                        <span class="assignment-card__id">#${complaint.id} | ${assignment.id}</span>
                        <h2 class="assignment-card__title">${complaint.title}</h2>
                    </div>
                    <div style="display: flex; gap: var(--space-sm); align-items: flex-start; flex-wrap: wrap;">
                        <span class="badge ${complaint.priorityScore >= 85 ? 'badge--critical' : 'badge--high'}">Score ${complaint.priorityScore}</span>
                        <span class="badge badge--progress">${assignment.state.replace(/_/g, ' ')}</span>
                    </div>
                </div>

                <div class="assignment-card__meta">
                    <span>${complaint.category}</span>
                    <span>${complaint.location}</span>
                    <span>${complaint.ward}</span>
                </div>

                <p style="font-size: var(--text-sm); color: var(--taupe); margin-bottom: var(--space-lg);">${complaint.description}</p>

                <div class="assignment-actions">
                    ${assignment.state === 'PENDING_ACCEPTANCE' ? `
                        <button class="btn btn--primary btn--sm officer-action" data-action="ACCEPTED" data-id="${assignment.id}">Accept</button>
                        <button class="btn btn--secondary btn--sm officer-action" data-action="REJECTED" data-id="${assignment.id}">Reject</button>
                    ` : ''}
                    ${['ACCEPTED', 'BLOCKED'].includes(assignment.state) ? `
                        <button class="btn btn--primary btn--sm officer-action" data-action="IN_PROGRESS" data-id="${assignment.id}">Start Work</button>
                    ` : ''}
                    ${assignment.state === 'IN_PROGRESS' ? `
                        <button class="btn btn--secondary btn--sm officer-action" data-action="BLOCKED" data-id="${assignment.id}">Report Blocker</button>
                        <button class="btn btn--primary btn--sm officer-action" data-action="COMPLETION_SUBMITTED" data-id="${assignment.id}">Submit Completion</button>
                    ` : ''}
                    <a href="track.html?id=${complaint.id}" class="btn btn--ghost btn--sm">Open Timeline</a>
                </div>
            </article>
        `).join('');

        document.querySelectorAll('.officer-action').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                const details = { actor: `Officer Portal - ${officer.name}` };
                if (action === 'REJECTED') details.rejectionReason = 'Officer rejected due to workload or area mismatch.';
                if (action === 'BLOCKED') details.blocker = 'Waiting for materials, access, or supervisory clearance.';
                if (action === 'COMPLETION_SUBMITTED') details.completionNote = 'Field work completed and evidence submitted for authority verification.';
                CivicData.updateAssignment(button.dataset.id, action, details);
                renderAll();
            });
        });
    }

    function renderSidebars() {
        notificationList.innerHTML = CivicData.getNotifications('OFFICER').slice(0, 6).map(item => `
            <div class="mini-feed__item">
                <strong>${item.complaintId}</strong>
                ${item.message}<br>
                <span>${item.timestamp}</span>
            </div>
        `).join('') || '<p style="font-size: var(--text-sm); color: var(--taupe);">No officer notifications yet.</p>';

        auditList.innerHTML = CivicData.getAudit().slice(0, 6).map(item => `
            <div class="mini-feed__item">
                <strong>${item.action}</strong>
                ${item.complaintId} | ${item.actor}<br>
                <span>${item.timestamp}</span>
            </div>
        `).join('');
    }

    function renderAll() {
        renderAssignments();
        renderSidebars();
    }

    populateOfficers();
    officerSelect.addEventListener('change', renderAll);
    renderAll();
});
