/**
 * Civic Smart - Authenticated PostgreSQL API Client
 *
 * PostgreSQL is the authoritative application datastore.
 * All protected API calls are routed through CivicAuth.
 * No local-first writes, data mirroring or automatic data synchronization.
 */

const CivicAPI = (() => {
    const API_BASE = "/api";
    const HEALTH_TIMEOUT_MS = 3000;

    let healthState = {
        checked: false,
        online: false,
        databaseConnected: false,
        message: "Connection not checked",
        checkedAt: null
    };

    function updateBadge(connected) {
        document.querySelectorAll(".live-badge").forEach(badge => {
            if (connected) {
                badge.style.background = "#E8F5E9";
                badge.style.borderColor = "#A5D6A7";
                badge.style.color = "#1B5E20";
                badge.innerHTML = `
                    <span class="live-dot"
                        style="background:#2E7D32;box-shadow:0 0 0 3px rgba(46,125,50,.25);">
                    </span>
                    <span>PostgreSQL Connected</span>
                `;
                badge.title = "Flask API and PostgreSQL health check succeeded.";
            } else {
                badge.style.background = "#FFF3E0";
                badge.style.borderColor = "#FFE0B2";
                badge.style.color = "#B78103";
                badge.innerHTML = `
                    <span class="live-dot"
                        style="background:#F57C00;box-shadow:0 0 0 3px rgba(245,124,0,.2);">
                    </span>
                    <span>Database Unavailable</span>
                `;
                badge.title = "The PostgreSQL health check failed.";
            }
        });
    }

    async function checkHealth() {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
            () => controller.abort(),
            HEALTH_TIMEOUT_MS
        );

        try {
            const response = await fetch(`${API_BASE}/health`, {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal
            });

            const data = await response.json().catch(() => ({}));

            const connected =
                response.ok &&
                data.status === "healthy" &&
                data.databaseConnected === true;

            healthState = {
                checked: true,
                online: response.ok,
                databaseConnected: connected,
                message: connected
                    ? "Flask API and PostgreSQL are healthy."
                    : (data.error || data.status || "Database unavailable"),
                checkedAt: new Date().toISOString()
            };

            updateBadge(connected);

            return {
                ...healthState,
                info: data
            };
        } catch (error) {
            healthState = {
                checked: true,
                online: false,
                databaseConnected: false,
                message: error.name === "AbortError"
                    ? "Health check timed out."
                    : error.message,
                checkedAt: new Date().toISOString()
            };

            updateBadge(false);

            return { ...healthState };
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    function getHealthState() {
        return { ...healthState };
    }

    function buildQuery(params = {}) {
        const query = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
            ) {
                query.set(key, String(value));
            }
        });

        const result = query.toString();
        return result ? `?${result}` : "";
    }

    async function request(path, options = {}) {
        if (typeof path !== "string" || !path.startsWith("/") ||
            path.startsWith("//")) {
            throw new Error("Invalid API path.");
        }

        if (
            !window.CivicAuth ||
            typeof window.CivicAuth.apiRequest !== "function"
        ) {
            throw new Error(
                "Authentication API is unavailable. Check the auth.js script."
            );
        }

        return window.CivicAuth.apiRequest(path, {
            ...options,
            cache: "no-store"
        });
    }

    async function getComplaints(filters = {}) {
        return request(`/complaints${buildQuery(filters)}`);
    }

    async function getComplaint(complaintId) {
        if (!complaintId) {
            throw new Error("Complaint ID is required.");
        }

        return request(
            `/complaints/${encodeURIComponent(complaintId)}`
        );
    }

    async function createComplaint(payload) {
        if (!payload || typeof payload !== "object") {
            throw new Error("A valid complaint payload is required.");
        }

        return request("/complaints", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async function getAssignments(filters = {}) {
        return request(`/assignments${buildQuery(filters)}`);
    }

    async function updateAssignmentState(assignmentId, payload) {
        if (!assignmentId || !payload || typeof payload !== "object") {
            throw new Error("Assignment ID and valid payload are required.");
        }

        return request(
            `/assignments/${encodeURIComponent(assignmentId)}/state`,
            {
                method: "PATCH",
                body: JSON.stringify(payload)
            }
        );
    }

    async function getOfficers() {
        return request("/officers");
    }

    async function getAnalytics() {
        return request("/analytics/overview");
    }

    async function getMLQ() {
        return request("/scheduler/mlq");
    }

    async function getAudit(filters = {}) {
        return request(`/audit${buildQuery(filters)}`);
    }

    async function getNotifications() {
        return request("/notifications");
    }

    async function allocateOfficer(complaintId, officerId) {
        if (!complaintId || !officerId) {
            throw new Error("Complaint ID and officer ID are required.");
        }

        return request(
            `/complaints/${encodeURIComponent(complaintId)}/allocate`,
            {
                method: "POST",
                body: JSON.stringify({ officerId })
            }
        );
    }

    async function simulateAging() {
        return request("/scheduler/aging", {
            method: "POST",
            body: JSON.stringify({})
        });
    }

    /**
     * Scheduler execution remains deliberately disabled in M2-A.
     * It will be connected to the Admin dashboard in M2-D.
     */
    async function runScheduler() {
        throw new Error(
            "Scheduler execution is temporarily disabled during M2-A. " +
            "It will be enabled after the Admin dashboard migration in M2-D."
        );
    }

    function isDatabaseConnected() {
        return healthState.databaseConnected;
    }

    function initialize() {
        checkHealth();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, {
            once: true
        });
    } else {
        initialize();
    }

    return {
        API_BASE,
        request,
        checkHealth,
        getHealthState,
        isDatabaseConnected,
        getComplaints,
        getComplaint,
        createComplaint,
        getAssignments,
        updateAssignmentState,
        getOfficers,
        getAnalytics,
        getMLQ,
        getAudit,
        getNotifications,
        allocateOfficer,
        simulateAging,
        runScheduler
    };
})();

window.CivicAPI = CivicAPI;
