document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('trackingContainer');
    const searchForm = document.getElementById('trackSearchForm');
    const searchInput = document.getElementById('trackInput');
    const chips = document.querySelectorAll('.track-chip');

    const lifecycle = ['Reported', 'Verified', 'Assigned', 'In Progress', 'Completion Submitted', 'Resolved'];

    function officerName(id) {
        const officer = CivicData.getOfficers().find(item => item.id === id);
        return officer ? `${officer.name} (${officer.role})` : 'Awaiting eligible officer allocation';
    }

    function timelineFor(complaint) {
        const auditEvents = CivicData.getAudit()
            .filter(event => event.complaintId === complaint.id)
            .reverse();

        const statusIndex = lifecycle.indexOf(complaint.status);
        const currentIndex = statusIndex >= 0 ? statusIndex : Math.min(3, lifecycle.length - 1);
        return lifecycle.map((status, idx) => {
            const event = auditEvents.find(item => item.toStatus === status || item.action.includes(status));
            return {
                title: status === 'Completion Submitted' ? 'Completion Submitted for Verification' : `${status} ${idx === 0 ? '' : 'Stage'}`.trim(),
                date: event ? event.timestamp : (idx <= statusIndex ? `${complaint.date} ${complaint.time}` : 'Pending'),
                desc: event ? event.message : defaultTimelineText(status, complaint),
                completed: idx < currentIndex || complaint.status === 'Resolved',
                current: idx === currentIndex && complaint.status !== 'Resolved'
            };
        });
    }

    function defaultTimelineText(status, complaint) {
        const text = {
            Reported: 'Citizen report stored in the complaint repository with a generated primary key.',
            Verified: 'Authority review validates category, ward and duplicate cluster.',
            Assigned: 'Allocation module selects an eligible officer by skill, service area and workload.',
            'In Progress': 'Officer accepts the assignment and begins field work.',
            'Completion Submitted': 'Officer submits work notes and evidence for authority verification.',
            Resolved: 'Authority verifies completion and closes the complaint.'
        };
        return text[status] || complaint.description;
    }

    function renderComplaint(id) {
        const cleanId = id.toUpperCase().replace('#', '').trim();
        const data = CivicData.getComplaints().find(item => item.id === cleanId);

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
                    searchInput.value = btn.dataset.id;
                    renderComplaint(btn.dataset.id);
                });
            });
            return;
        }

        const isResolved = data.status.toLowerCase() === 'resolved';
        const badgeClass = isResolved ? 'badge--resolved' : (data.priorityScore >= 85 ? 'badge--critical' : (data.priorityScore >= 70 ? 'badge--high' : 'badge--normal'));
        const timeline = timelineFor(data);

        container.innerHTML = `
            <article class="tracking-main-card">
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

                <div class="tracking-grid">
                    <div>
                        <h4 style="font-size: var(--text-base); font-family: var(--font-body); font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: var(--space-2xl); color: var(--charcoal);">
                            Lifecycle Timeline & Status History
                        </h4>

                        <div class="stepper">
                            ${timeline.map((step, idx) => `
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
                                <h4>Workflow Accountability</h4>
                                <span style="font-size: 0.7rem; color: var(--gold); font-weight: bold;">DBMS Contract</span>
                            </div>

                            <div class="insight-data-list">
                                <div class="insight-data-item">
                                    <span class="label">Primary Key:</span>
                                    <span class="value" style="font-family: monospace;">COMPLAINT_ID = '${data.id}'</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Department Assigned:</span>
                                    <span class="value">${data.department}</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Field Officer:</span>
                                    <span class="value">${officerName(data.assignedOfficerId)}</span>
                                </div>
                                <div class="insight-data-item">
                                    <span class="label">Duplicate Cluster:</span>
                                    <span class="value" style="font-family: monospace;">${data.clusterId || 'CLUS-SINGLE'}</span>
                                </div>
                            </div>

                            <div style="margin-top: var(--space-md); padding: var(--space-md); background: rgba(233,223,208,0.3); border-radius: var(--radius-sm); font-size: var(--text-xs); color: var(--taupe);">
                                Every visible transition is mirrored into the local audit trail. A real backend would enforce these same transitions with transactions and authorization.
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        `;

        history.replaceState(null, '', `?id=${data.id}`);
    }

    if (searchForm && searchInput) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = searchInput.value.trim();
            if (val) renderComplaint(val);
        });
    }

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const id = chip.dataset.id;
            searchInput.value = id;
            renderComplaint(id);
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const initialId = urlParams.get('id') || 'CS1024';
    searchInput.value = initialId;
    renderComplaint(initialId);
});
