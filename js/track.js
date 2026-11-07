document.addEventListener("DOMContentLoaded", async () => {
    if (!window.CivicAuth || !window.CivicAPI) {
        console.error("Authentication or API service unavailable.");
        return;
    }

    const session = await CivicAuth.requireRole(["CITIZEN"]);
    if (!session) return;

    const container = document.getElementById("trackingContainer");
    const searchForm = document.getElementById("trackSearchForm");
    const searchInput = document.getElementById("trackInput");

    const lifecycle = [
        "Reported",
        "Verified",
        "Assigned",
        "In Progress",
        "Blocked",
        "Completion Submitted",
        "Resolved",
        "Disputed"
    ];

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function safePhotoSource(value) {
        if (typeof value !== "string") return "";

        const source = value.trim();

        const validDataImage =
            /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;

        const validImagePath =
            /^(?!.*(?:^|\/)\.\.(?:\/|$))images\/[a-z0-9][a-z0-9._/-]*\.(?:jpg|jpeg|png|webp|gif)$/i;

        if (validDataImage.test(source)) return source;
        if (validImagePath.test(source)) return source;

        return "";
    }

    function defaultTimelineText(status) {
        const descriptions = {
            Reported:
                "Complaint registered in the PostgreSQL complaint repository.",

            Verified:
                "The complaint has passed authority verification.",

            Assigned:
                "The complaint has been assigned to a municipal officer.",

            "In Progress":
                "The assigned officer has started field work.",

            Blocked:
                "The assignment is currently blocked pending further action.",

            "Completion Submitted":
                "The officer has submitted the work for verification.",

            Resolved:
                "The complaint has been marked as resolved.",

            Disputed:
                "The reported resolution is under dispute review."
        };

        return descriptions[status] || "Complaint lifecycle event.";
    }

    function timelineFor(complaint, events) {
        const orderedEvents = [...events].reverse();

        const currentStatusIndex = lifecycle.indexOf(complaint.status);

        return orderedEvents.map((event, index) => ({
            title: event.toStatus
                ? `${event.toStatus} Stage`
                : event.action || "Workflow Event",

            date: event.timestamp || "Date unavailable",

            desc: event.message || defaultTimelineText(event.toStatus),

            completed: index < orderedEvents.length - 1,

            current: index === orderedEvents.length - 1
        }));
    }

    function renderError(message) {
        container.innerHTML = `
            <div class="card"
                style="text-align:center;padding:var(--space-4xl) var(--space-xl);">
                <div style="font-size:var(--text-3xl);margin-bottom:var(--space-md);color:var(--status-critical);">
                    &#9888;
                </div>

                <h3 style="font-size:var(--text-2xl);margin-bottom:var(--space-sm);">
                    Complaint Not Available
                </h3>

                <p style="color:var(--taupe);max-width:480px;margin:0 auto;">
                    ${escapeHtml(message)}
                </p>
            </div>
        `;
    }

    function renderComplaint(payload) {
        const data = payload.complaint;
        const events = Array.isArray(payload.timeline)
            ? payload.timeline
            : [];

        if (!data) {
            renderError("The server returned no complaint details.");
            return;
        }

        const isResolved =
            String(data.status).toLowerCase() === "resolved";

        const priorityScore = Number(data.priorityScore || 0);

        const badgeClass = isResolved
            ? "badge--resolved"
            : priorityScore >= 85
                ? "badge--critical"
                : priorityScore >= 70
                    ? "badge--high"
                    : "badge--normal";

        const timeline = timelineFor(data, events);

        const officer = payload.officer;

        const officerLabel = officer
            ? `${officer.name} (${officer.role})`
            : "Awaiting eligible officer allocation";

        const assignment = payload.assignment;

        const photo = safePhotoSource(data.photo);

        container.innerHTML = `
            <article class="tracking-main-card">

                <div class="tracking-hero-header">
                    <div class="tracking-hero-left">

                        <div class="tracking-badge-row">
                            <span class="badge ${badgeClass}">
                                ${escapeHtml(data.status)}
                            </span>

                            <span class="badge badge--normal">
                                ${escapeHtml(data.category)}
                            </span>

                            <span class="state-pill">
                                OS STATE: ${escapeHtml(data.processState)}
                            </span>
                        </div>

                        <span style="font-size:var(--text-xs);color:var(--taupe);font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                            Complaint Reference #${escapeHtml(data.id)}
                        </span>

                        <h2 class="tracking-title">
                            ${escapeHtml(data.title)}
                        </h2>

                        <div class="tracking-location">
                            <span>
                                ${escapeHtml(data.location)} &bull;
                                ${escapeHtml(data.ward)}
                            </span>
                        </div>

                        <div style="margin-top:var(--space-sm);color:var(--taupe);font-size:var(--text-xs);">
                            Submitted on ${escapeHtml(data.date)}
                        </div>

                    </div>

                    <div class="tracking-score-card">
                        <div class="tracking-score-number">
                            ${priorityScore}
                        </div>

                        <div class="tracking-score-label">
                            Priority Score
                        </div>

                        <span style="font-size:.75rem;color:var(--taupe);display:block;margin-top:4px;">
                            Dynamic Queue Priority
                        </span>
                    </div>
                </div>

                <div class="tracking-grid">
                    <div>

                        <h4 style="font-size:var(--text-base);font-family:var(--font-body);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:var(--space-2xl);color:var(--charcoal);">
                            Lifecycle Timeline & Status History
                        </h4>

                        ${
                            timeline.length
                                ? `
                                    <div class="stepper">
                                        ${timeline.map((step, index) => `
                                            <div class="stepper-item
                                                ${step.completed ? "completed" : ""}
                                                ${step.current ? "current" : ""}">

                                                <div class="stepper-node">
                                                    ${step.completed ? "&#10003;" : index + 1}
                                                </div>

                                                <div class="stepper-content">
                                                    <div class="stepper-title">
                                                        ${escapeHtml(step.title)}
                                                    </div>

                                                    <div class="stepper-date">
                                                        ${escapeHtml(step.date)}
                                                    </div>

                                                    <div class="stepper-desc">
                                                        ${escapeHtml(step.desc)}
                                                    </div>
                                                </div>
                                            </div>
                                        `).join("")}
                                    </div>
                                `
                                : `
                                    <div class="card">
                                        No status history is available yet.
                                    </div>
                                `
                        }

                        ${
                            photo
                                ? `
                                    <div style="margin-top:var(--space-3xl);padding-top:var(--space-2xl);border-top:var(--border-thin);">
                                        <h5 style="font-size:var(--text-sm);font-family:var(--font-body);font-weight:600;text-transform:uppercase;color:var(--taupe);margin-bottom:var(--space-md);">
                                            Field Photographic Evidence
                                        </h5>

                                        <div style="border-radius:var(--radius-md);overflow:hidden;max-height:280px;border:var(--border-thin);">
                                            <img
                                                src="${photo}"
                                                alt="Complaint site evidence"
                                                style="width:100%;height:280px;object-fit:cover;"
                                            >
                                        </div>
                                    </div>
                                `
                                : ""
                        }

                    </div>

                    <div>
                        <div class="engine-insight-box">

                            <div class="insight-header">
                                <h4>Priority Engine Mechanics</h4>
                                <span style="font-size:.7rem;color:var(--burgundy);font-weight:bold;">
                                    OS Scheduling
                                </span>
                            </div>

                            <div class="insight-formula-row">
                                <div><strong>Scheduling Algorithm:</strong></div>

                                <code>
                                    Base (${Number(data.severityBase || 0)})
                                    + Duplicates (+${Number(data.duplicateBoost || 0)})
                                    + Aging (+${Number(data.agingBoost || 0)})
                                    = <strong>${priorityScore}</strong>
                                </code>
                            </div>

                            <div class="insight-data-list">

                                <div class="insight-data-item">
                                    <span class="label">Base Severity Class:</span>
                                    <span class="value">
                                        ${escapeHtml(data.severity)}
                                        (${Number(data.severityBase || 0)} pts)
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">Duplicate Reports:</span>
                                    <span class="value">
                                        ${Number(data.duplicateCount || 1)}
                                        citizens reported
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">Waiting Time:</span>
                                    <span class="value">
                                        ${Number(data.waitingDays || 0)} days
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">OS Aging Compensation:</span>
                                    <span class="value" style="color:var(--burgundy);">
                                        +${Number(data.agingBoost || 0)} pts
                                    </span>
                                </div>

                            </div>

                            <div class="divider" style="margin-block:var(--space-sm);"></div>

                            <div class="insight-header">
                                <h4>Workflow Accountability</h4>
                                <span style="font-size:.7rem;color:var(--gold);font-weight:bold;">
                                    DBMS Contract
                                </span>
                            </div>

                            <div class="insight-data-list">

                                <div class="insight-data-item">
                                    <span class="label">Primary Key:</span>
                                    <span class="value" style="font-family:monospace;">
                                        ${escapeHtml(data.id)}
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">Department:</span>
                                    <span class="value">
                                        ${escapeHtml(data.department)}
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">Field Officer:</span>
                                    <span class="value">
                                        ${escapeHtml(officerLabel)}
                                    </span>
                                </div>

                                <div class="insight-data-item">
                                    <span class="label">Duplicate Cluster:</span>
                                    <span class="value" style="font-family:monospace;">
                                        ${escapeHtml(data.clusterId)}
                                    </span>
                                </div>

                                ${
                                    assignment
                                        ? `
                                            <div class="insight-data-item">
                                                <span class="label">Assignment State:</span>
                                                <span class="value">
                                                    ${escapeHtml(String(assignment.state).replace(/_/g, " "))}
                                                </span>
                                            </div>
                                        `
                                        : ""
                                }

                            </div>

                            <div style="margin-top:var(--space-md);padding:var(--space-md);background:rgba(233,223,208,.3);border-radius:var(--radius-sm);font-size:var(--text-xs);color:var(--taupe);">
                                This tracking information is retrieved from the authenticated PostgreSQL complaint record and status history.
                            </div>

                        </div>
                    </div>
                </div>
            </article>
        `;

        history.replaceState(
            null,
            "",
            `?id=${encodeURIComponent(data.id)}`
        );
    }

    async function loadComplaint(id) {
        const cleanId = String(id || "")
            .toUpperCase()
            .replace("#", "")
            .trim();

        if (!cleanId) {
            renderError("Enter a complaint reference to begin tracking.");
            return;
        }

        container.innerHTML = `
            <div class="card" style="padding:var(--space-xl);">
                Retrieving complaint details from PostgreSQL...
            </div>
        `;

        try {
            const response = await CivicAPI.getComplaint(cleanId);
            renderComplaint(response);

        } catch (error) {
            console.error("[Complaint Tracking] Request failed:", error);
            renderError(
                error.status === 404
                    ? "The complaint does not exist or does not belong to your account."
                    : error.message
            );
        }
    }

    if (searchForm && searchInput) {
        searchForm.addEventListener("submit", async event => {
            event.preventDefault();
            await loadComplaint(searchInput.value);
        });
    }

    const initialId = new URLSearchParams(
        window.location.search
    ).get("id");

    if (initialId) {
        searchInput.value = initialId;
        await loadComplaint(initialId);
    } else {
        renderError(
            "Enter your complaint reference above to view its current status and history."
        );
    }
});
