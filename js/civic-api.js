/**
 * Civic Smart - PostgreSQL Backend Integration & Sync Bridge
 * Transparently hooks into CivicData to synchronize state with the PostgreSQL DBMS.
 * Works seamlessly in both live database mode and offline localStorage demo mode.
 */

const CivicAPI = (() => {
    const API_BASE = 'http://localhost:5000/api';
    let isConnected = false;
    let checkedConnection = false;

    /**
     * Test connection to PostgreSQL REST API backend
     */
    async function checkHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                isConnected = data.database && data.database.connected;
                checkedConnection = true;
                updateBadge(isConnected, data.database ? data.database.database : null);
                return { online: true, databaseConnected: isConnected, info: data };
            }
        } catch (e) {
            isConnected = false;
            checkedConnection = true;
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
            const [complaintsRes, officersRes, assignRes, auditRes] = await Promise.all([
                fetch(`${API_BASE}/complaints`),
                fetch(`${API_BASE}/officers`),
                fetch(`${API_BASE}/assignments`),
                fetch(`${API_BASE}/audit`)
            ]);

            if (complaintsRes.ok) {
                const complaints = await complaintsRes.json();
                if (complaints && complaints.length > 0) {
                    localStorage.setItem('civics_smart_records_v2', JSON.stringify(complaints));
                }
            }

            if (officersRes.ok) {
                const officers = await officersRes.json();
                if (officers && officers.length > 0) {
                    localStorage.setItem('civics_smart_officers_v2', JSON.stringify(officers));
                }
            }

            if (assignRes.ok) {
                const assignments = await assignRes.json();
                localStorage.setItem('civics_smart_assignments_v2', JSON.stringify(assignments));
            }

            if (auditRes.ok) {
                const audit = await auditRes.json();
                localStorage.setItem('civics_smart_audit_v2', JSON.stringify(audit));
            }

            console.log('[CivicAPI] Live PostgreSQL records synced into local store.');
            window.dispatchEvent(new CustomEvent('civic:data-synced', { detail: { count: complaints ? complaints.length : 0 } }));
            return true;
        } catch (err) {
            console.warn('[CivicAPI] Sync failed:', err.message);
            return false;
        }
    }

    /**
     * Asynchronously mirror local complaint creation to PostgreSQL
     */
    async function mirrorCreateComplaint(complaint) {
        if (!isConnected) return;
        try {
            await fetch(`${API_BASE}/complaints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(complaint)
            });
            console.log('[CivicAPI] Complaint mirrored to PostgreSQL:', complaint.id);
        } catch (err) {
            console.warn('[CivicAPI] Failed to mirror complaint creation:', err.message);
        }
    }

    /**
     * Asynchronously mirror status update to PostgreSQL
     */
    async function mirrorUpdateStatus(id, status, actor) {
        if (!isConnected) return;
        try {
            await fetch(`${API_BASE}/complaints/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, actor })
            });
            console.log('[CivicAPI] Status update mirrored to PostgreSQL:', id, status);
        } catch (err) {
            console.warn('[CivicAPI] Failed to mirror status update:', err.message);
        }
    }

    /**
     * Asynchronously mirror officer allocation to PostgreSQL
     */
    async function mirrorAllocateOfficer(complaintId, actor) {
        if (!isConnected) return;
        try {
            await fetch(`${API_BASE}/complaints/${encodeURIComponent(complaintId)}/allocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actor })
            });
            console.log('[CivicAPI] Allocation mirrored to PostgreSQL:', complaintId);
        } catch (err) {
            console.warn('[CivicAPI] Failed to mirror allocation:', err.message);
        }
    }

    /**
     * Asynchronously mirror aging simulation to PostgreSQL
     */
    async function mirrorSimulateAging() {
        if (!isConnected) return;
        try {
            await fetch(`${API_BASE}/scheduler/aging`, { method: 'POST' });
            console.log('[CivicAPI] Aging simulation executed in PostgreSQL.');
        } catch (err) {
            console.warn('[CivicAPI] Failed to trigger PostgreSQL aging:', err.message);
        }
    }

    /**
     * Run the integrated C++ scheduler through Flask/PostgreSQL.
     */
    async function runScheduler(actor = 'Authority Console') {
        if (!isConnected) {
            return { ok: false, offline: true, message: 'PostgreSQL backend is offline.' };
        }

        const res = await fetch(`${API_BASE}/scheduler/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                ...data,
                message: data.message || data.error || 'Scheduler request failed.'
            };
        }
        await syncFromPostgres();
        return data;
    }

    /**
     * Decorate CivicData methods to achieve transparent dual-write
     */
    function hookCivicData() {
        if (typeof CivicData === 'undefined') return;

        const origCreate = CivicData.createComplaint;
        CivicData.createComplaint = function (payload) {
            const created = origCreate.call(CivicData, payload);
            mirrorCreateComplaint(created);
            return created;
        };

        const origStatus = CivicData.updateComplaintStatus;
        CivicData.updateComplaintStatus = function (id, status, actor) {
            const updated = origStatus.call(CivicData, id, status, actor);
            mirrorUpdateStatus(id, status, actor);
            return updated;
        };

        const origAllocate = CivicData.allocateOfficer;
        CivicData.allocateOfficer = function (complaintId, actor) {
            const result = origAllocate.call(CivicData, complaintId, actor);
            mirrorAllocateOfficer(complaintId, actor);
            return result;
        };

        const origAging = CivicData.simulateAging;
        CivicData.simulateAging = function () {
            const result = origAging.call(CivicData);
            mirrorSimulateAging();
            return result;
        };
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
        hookCivicData();
        checkHealth().then(status => {
            if (status.databaseConnected) {
                syncFromPostgres();
            }
        });
    });

    return {
        checkHealth,
        syncFromPostgres,
        runScheduler,
        isDatabaseConnected: () => isConnected,
        API_BASE
    };
})();

window.CivicAPI = CivicAPI;
