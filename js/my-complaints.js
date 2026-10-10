document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('complaintsList');
    const searchInput = document.getElementById('complaintSearch');
    const filterTabs = document.querySelectorAll('.filter-tab');
    const statTotal = document.getElementById('statTotal');
    const statActive = document.getElementById('statActive');
    const statResolved = document.getElementById('statResolved');

    let currentFilter = 'all';
    let searchQuery = '';

    function updateStats(complaints) {
        const total = complaints.length;
        const resolved = complaints.filter(c => c.status.toLowerCase() === 'resolved').length;
        const active = total - resolved;

        if (statTotal) statTotal.textContent = total;
        if (statActive) statActive.textContent = active;
        if (statResolved) statResolved.textContent = resolved;

        const allTab = document.querySelector('[data-filter="all"]');
        if (allTab) allTab.textContent = `All (${total})`;
    }

    function renderComplaints() {
        if (!listContainer) return;

        const allComplaints = CivicData.getComplaints();
        updateStats(allComplaints);

        const filtered = allComplaints.filter(c => {
            if (currentFilter === 'active' && c.status.toLowerCase() === 'resolved') return false;
            if (currentFilter === 'resolved' && c.status.toLowerCase() !== 'resolved') return false;

            if (searchQuery) {
                const haystack = `${c.id} ${c.title} ${c.location} ${c.category} ${c.department}`.toLowerCase();
                return haystack.includes(searchQuery);
            }
            return true;
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="card" style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
                    <p style="font-size: var(--text-lg); color: var(--charcoal); font-weight: 600;">No complaints found</p>
                    <p style="font-size: var(--text-sm); color: var(--taupe); margin-top: 4px; margin-bottom: var(--space-xl);">Try adjusting your filter or search keywords.</p>
                    <a href="report.html" class="btn btn--primary btn--sm">Report New Issue</a>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filtered.map(c => {
            const isResolved = c.status.toLowerCase() === 'resolved';
            const badgeClass = isResolved ? 'badge--resolved' : (c.priorityScore >= 85 ? 'badge--critical' : (c.priorityScore >= 70 ? 'badge--high' : 'badge--normal'));
            const statusClass = isResolved ? 'badge--resolved' : (c.status.toLowerCase() === 'in progress' ? 'badge--progress' : 'badge--high');

            return `
                <article class="complaint-item" id="card-${c.id}">
                    <div class="complaint-item__top">
                        <div class="complaint-item__id-group">
                            <span class="complaint-item__id">#${c.id}</span>
                            <span class="badge ${badgeClass}">Score: ${c.priorityScore}</span>
                            <span class="badge ${statusClass}">${c.status}</span>
                        </div>
                        <span class="complaint-item__date">Submitted on ${c.date}</span>
                    </div>

                    <h3 class="complaint-item__title">${c.title}</h3>

                    <div class="complaint-item__meta">
                        <span class="complaint-item__meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                            ${c.location}
                        </span>
                        <span class="complaint-item__meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            ${c.department}
                        </span>
                    </div>

                    <div class="complaint-item__footer">
                        <div class="duplicate-tag">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            <span>${c.duplicateCount > 1 ? `<strong>${c.duplicateCount} citizens</strong> reported this problem` : 'Single unique report'}</span>
                            ${c.waitingDays > 0 ? `<span style="margin-left: 8px; color: var(--gold);">&bull; Waiting ${c.waitingDays}d (+${c.agingBoost} Aging)</span>` : ''}
                        </div>
                        <a href="track.html?id=${c.id}" class="btn btn--secondary btn--sm">Track Status &rarr;</a>
                    </div>
                </article>
            `;
        }).join('');
    }

    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderComplaints();
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderComplaints();
        });
    }

    renderComplaints();
});
