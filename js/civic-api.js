/**
 * Civic Smart - PostgreSQL Backend Integration & Sync Bridge
 * PostgreSQL API client. localStorage is only a UI cache for rendering existing pages.
 */

const CivicAPI = (() => {
    const API_BASE = 'http://localhost:5000/api';
    let isConnected = false;
    let currentUser = null;
    let csrfToken = null;

    async function request(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || data.error || `Request failed (${response.status}).`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    /**
     * Test connection to PostgreSQL REST API backend
     */
    async function checkHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const res = await fetch(`${API_BASE}/health`, { signal: controller.signal, credentials: 'include' });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                isConnected = data.database && data.database.connected;
                updateBadge(isConnected, data.database ? data.database.database : null);
                if (isConnected) {
                    const auth = await request('/auth/session');
                    currentUser = auth.user;
                    csrfToken = auth.csrfToken;
                }
                return { online: true, databaseConnected: isConnected, info: data };
            }
        } catch (e) {
            isConnected = false;
            updateBadge(false);
        }
        return { online: false, databaseConnected: false };
    }

    /**
     * Pull live PostgreSQL records into local state
     */
    async function syncFromPostgres() {
        if (!isConnected) return false;
        try {
            const sessionResponse = await request('/auth/session');
            currentUser = sessionResponse.user;
            csrfToken = sessionResponse.csrfToken;
            if (!currentUser) return false;
            let complaintCount = 0;
            const [complaintsRes, officersRes, assignRes, auditRes, notificationsRes] = await Promise.all([
                fetch(`${API_BASE}/complaints`, { credentials: 'include' }),
                fetch(`${API_BASE}/officers`, { credentials: 'include' }),
                fetch(`${API_BASE}/assignments`, { credentials: 'include' }),
                fetch(`${API_BASE}/audit`, { credentials: 'include' }),
                fetch(`${API_BASE}/notifications`, { credentials: 'include' })
            ]);

            const requiredResponses = currentUser.role === 'CITIZEN'
                ? [complaintsRes, auditRes, notificationsRes]
                : [complaintsRes, officersRes, assignRes, auditRes, notificationsRes];
            if (requiredResponses.some(response => !response.ok)) {
                throw new Error('One or more authorized database views could not be refreshed.');
            }

            if (complaintsRes.ok) {
                const complaints = await complaintsRes.json();
                complaintCount = complaints.length;
                localStorage.setItem('civics_smart_records_v2', JSON.stringify(complaints));
            }

            if (officersRes.ok) {
                const officers = await officersRes.json();
                localStorage.setItem('civics_smart_officers_v2', JSON.stringify(officers));
            }

            if (assignRes.ok) {
                const assignments = await assignRes.json();
                localStorage.setItem('civics_smart_assignments_v2', JSON.stringify(assignments));
            }

            if (auditRes.ok) {
                const audit = await auditRes.json();
                localStorage.setItem('civics_smart_audit_v2', JSON.stringify(audit));
            }

            if (notificationsRes.ok) {
                const notifications = await notificationsRes.json();
                localStorage.setItem('civics_smart_notifications_v2', JSON.stringify(notifications));
            }

            console.log('[CivicAPI] Live PostgreSQL records synced into local store.');
            window.dispatchEvent(new CustomEvent('civic:data-synced', { detail: { count: complaintCount } }));
            return true;
        } catch (err) {
            console.warn('[CivicAPI] Sync failed:', err.message);
            return false;
        }
    }

    async function login(username, password, role) {
        const existing = await request('/auth/session');
        if (existing.user) {
            csrfToken = existing.csrfToken;
            await request('/auth/logout', { method: 'POST', body: '{}' });
            csrfToken = null;
        }
        const result = await request('/auth/login', {
            method: 'POST', body: JSON.stringify({ username, password, role })
        });
        currentUser = result.user;
        csrfToken = result.csrfToken;
        return result.user;
    }

    async function logout() {
        await request('/auth/logout', { method: 'POST', body: '{}' });
        currentUser = null;
        csrfToken = null;
        window.location.assign('login.html');
    }

    async function requireRole(role) {
        try {
            const result = await request('/auth/session');
            currentUser = result.user;
            csrfToken = result.csrfToken;
            if (!currentUser || (role && currentUser.role !== role)) {
                window.location.assign('login.html');
                return false;
            }
            const health = await checkHealth();
            if (!health.databaseConnected) {
                alert('The PostgreSQL backend is unavailable. This portal needs the database to load official records.');
                return false;
            }
            if (!await syncFromPostgres()) {
                alert('The database is available, but this portal could not load its authorized records. Refresh and try again.');
                return false;
            }
            return true;
        } catch (_) {
            window.location.assign('login.html');
            return false;
        }
    }

    async function createComplaint(complaint) {
        const saved = await request('/complaints', { method: 'POST', body: JSON.stringify(complaint) });
        await syncFromPostgres();
        return saved;
    }

    async function getComplaint(id) {
        return request(`/complaints/${encodeURIComponent(id)}`);
    }

    async function updateStatus(id, status, reason = '') {
        const saved = await request(`/complaints/${encodeURIComponent(id)}/status`, {
            method: 'PATCH', body: JSON.stringify({ status, reason })
        });
        await syncFromPostgres();
        return saved;
    }

    async function allocateOfficer(id, reason = '') {
        const result = await request(`/complaints/${encodeURIComponent(id)}/allocate`, {
            method: 'POST', body: JSON.stringify({ reason })
        });
        await syncFromPostgres();
        return result;
    }

    async function updateAssignment(id, state, details = {}) {
        const result = await request(`/assignments/${encodeURIComponent(id)}/state`, {
            method: 'PATCH', body: JSON.stringify({ state, ...details })
        });
        await syncFromPostgres();
        return result;
    }

    async function simulateAging() {
        const result = await request('/scheduler/aging', { method: 'POST', body: '{}' });
        await syncFromPostgres();
        return result;
    }

    async function getOverview() {
        return request('/analytics/overview');
    }

    /**
     * Run the integrated C++ scheduler through Flask/PostgreSQL.
     */
    async function runScheduler(actor = 'Authority Console') {
        if (!isConnected) {
            return { ok: false, offline: true, message: 'PostgreSQL backend is offline.' };
        }

        const result = await request('/scheduler/run', {
            method: 'POST',
            body: JSON.stringify({ actor })
        });
        await syncFromPostgres();
        return result;
    }

    /**
     * Update UI sync badges in the DOM
     */
    function updateBadge(connected, dbName) {
        const liveBadges = document.querySelectorAll('.live-badge');
        liveBadges.forEach(badge => {
            if (connected) {
                badge.style.background = '#E8F5E9';
                badge.style.borderColor = '#A5D6A7';
                badge.style.color = '#1B5E20';
                badge.innerHTML = `
                    <span class="live-dot" style="background: #2E7D32; box-shadow: 0 0 0 3px rgba(46,125,50,0.25);"></span>
                    <span>PostgreSQL Live: ${dbName || 'civic_smartdb'}</span>
                `;
                badge.title = 'Connected to PostgreSQL DBMS backend at http://localhost:5000.';
            } else {
                badge.style.background = '#FFF3E0';
                badge.style.borderColor = '#FFE0B2';
                badge.style.color = '#B78103';
                badge.innerHTML = `
                    <span class="live-dot" style="background: #F57C00; box-shadow: 0 0 0 3px rgba(245,124,0,0.2);"></span>
                    <span>Offline Demo (localStorage)</span>
                `;
                badge.title = 'PostgreSQL backend not detected on http://localhost:5000. Running in standalone browser mode.';
            }
        });
    }

    // Auto-initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', logout));
        checkHealth().then(status => {
            if (status.databaseConnected) {
                syncFromPostgres();
            }
        });
    });

    return {
        checkHealth,
        login,
        logout,
        requireRole,
        currentUser: () => currentUser,
        syncFromPostgres,
        createComplaint,
        getComplaint,
        updateStatus,
        allocateOfficer,
        updateAssignment,
        simulateAging,
        getOverview,
        runScheduler,
        isDatabaseConnected: () => isConnected,
        API_BASE
    };
})();

window.CivicAPI = CivicAPI;
