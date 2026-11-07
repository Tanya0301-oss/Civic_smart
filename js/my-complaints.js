document.addEventListener("DOMContentLoaded", async () => {
    if (!window.CivicAuth || !window.CivicAPI) {
        console.error("Citizen authentication/API service unavailable.");
        return;
    }

    const session = await CivicAuth.requireRole(["CITIZEN"]);
    if (!session) return;

    const listContainer = document.getElementById("complaintsList");
    const searchInput = document.getElementById("complaintSearch");
    const filterTabs = document.querySelectorAll(".filter-tab");

    const statTotal = document.getElementById("statTotal");
    const statActive = document.getElementById("statActive");
    const statResolved = document.getElementById("statResolved");

    let allComplaints = [];
    let currentFilter = "all";
    let searchQuery = "";

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function getStatusClass(status) {
        const value = String(status || "").toLowerCase();

        if (value === "resolved") return "badge--resolved";
        if (value === "in progress") return "badge--progress";
        if (value === "blocked") return "badge--critical";
        return "badge--high";
    }

    function updateStats() {
        const total = allComplaints.length;

        const resolved = allComplaints.filter(
            complaint =>
                String(complaint.status).toLowerCase() === "resolved"
        ).length;

        const active = total - resolved;

        if (statTotal) statTotal.textContent = total;
        if (statActive) statActive.textContent = active;
        if (statResolved) statResolved.textContent = resolved;

        const allTab = document.querySelector('[data-filter="all"]');
        if (allTab) allTab.textContent = `All (${total})`;
    }

    function renderComplaints() {
        if (!listContainer) return;

        updateStats();

        const filtered = allComplaints.filter(complaint => {
            const status = String(complaint.status || "").toLowerCase();

            if (
                currentFilter === "active" &&
                status === "resolved"
            ) {
                return false;
            }

            if (
                currentFilter === "resolved" &&
                status !== "resolved"
            ) {
                return false;
            }

            if (searchQuery) {
                const searchable = [
                    complaint.id,
                    complaint.title,
                    complaint.location,
                    complaint.category,
                    complaint.department
                ].join(" ").toLowerCase();

                return searchable.includes(searchQuery);
            }

            return true;
        });

        if (!filtered.length) {
            listContainer.innerHTML = `
                <div class="card"
                    style="text-align:center;padding:var(--space-4xl) var(--space-xl);">
                    <p style="font-size:var(--text-lg);color:var(--charcoal);font-weight:600;">
                        No complaints found
                    </p>
                    <p style="font-size:var(--text-sm);color:var(--taupe);margin-top:4px;margin-bottom:var(--space-xl);">
                        Try adjusting your filter or search keywords.
                    </p>
                    <a href="report.html" class="btn btn--primary btn--sm">
                        Report New Issue
                    </a>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filtered.map(complaint => {
            const status = escapeHtml(complaint.status);
            const priority = Number(complaint.priorityScore || 0);
            const isResolved = status.toLowerCase() === "resolved";

            const priorityClass = isResolved
                ? "badge--resolved"
                : priority >= 85
                    ? "badge--critical"
                    : priority >= 70
                        ? "badge--high"
                        : "badge--normal";

            const id = escapeHtml(complaint.id);

            const duplicateCount = Number(
                complaint.duplicateCount || 1
            );

            const waitingDays = Number(
                complaint.waitingDays || 0
            );

            const agingBoost = Number(
                complaint.agingBoost || 0
            );

            return `
                <article class="complaint-item" id="card-${id}">
                    <div class="complaint-item__top">
                        <div class="complaint-item__id-group">
                            <span class="complaint-item__id">#${id}</span>
                            <span class="badge ${priorityClass}">
                                Score: ${priority}
                            </span>
                            <span class="badge ${getStatusClass(status)}">
                                ${status}
                            </span>
                        </div>

                        <span class="complaint-item__date">
                            Submitted on ${escapeHtml(complaint.date)}
                        </span>
                    </div>

                    <h3 class="complaint-item__title">
                        ${escapeHtml(complaint.title)}
                    </h3>

                    <div class="complaint-item__meta">
                        <span class="complaint-item__meta-item">
                            ${escapeHtml(complaint.location)}
                        </span>
                        <span class="complaint-item__meta-item">
                            ${escapeHtml(complaint.department)}
                        </span>
                    </div>

                    <div class="complaint-item__footer">
                        <div class="duplicate-tag">
                            <span>
                                ${
                                    duplicateCount > 1
                                        ? `<strong>${duplicateCount} citizens</strong> reported this problem`
                                        : "Single unique report"
                                }
                            </span>

                            ${
                                waitingDays > 0
                                    ? `<span style="margin-left:8px;color:var(--gold);">
                                        &bull; Waiting ${waitingDays}d (+${agingBoost} Aging)
                                    </span>`
                                    : ""
                            }
                        </div>

                        <a href="track.html?id=${encodeURIComponent(complaint.id)}"
                            class="btn btn--secondary btn--sm">
                            Track Status &rarr;
                        </a>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function loadComplaints() {
        if (!listContainer) return;

        listContainer.innerHTML = `
            <div class="card" style="padding:var(--space-xl);">
                Loading complaints from PostgreSQL...
            </div>
        `;

        try {
            const response = await CivicAPI.getComplaints();

            if (!Array.isArray(response)) {
                throw new Error("Unexpected complaint-list response.");
            }

            allComplaints = response;
            renderComplaints();

        } catch (error) {
            console.error("[My Complaints] Loading failed:", error);

            listContainer.innerHTML = `
                <div class="card" style="padding:var(--space-xl);">
                    <h3>Unable to load complaints</h3>
                    <p style="color:var(--taupe);">
                        ${escapeHtml(error.message)}
                    </p>
                    <button type="button"
                        class="btn btn--secondary btn--sm"
                        id="retryComplaints">
                        Retry
                    </button>
                </div>
            `;

            const retry = document.getElementById("retryComplaints");

            if (retry) {
                retry.addEventListener("click", loadComplaints);
            }
        }
    }

    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(item => item.classList.remove("active"));

            tab.classList.add("active");
            currentFilter = tab.dataset.filter || "all";

            renderComplaints();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", event => {
            searchQuery = event.target.value.toLowerCase().trim();
            renderComplaints();
        });
    }

    await loadComplaints();
});
