/**
 * Civics Smart — Left Sidebar & Mobile Navigation Controller
 * Handles:
 *   - Desktop: collapse / expand sidebar (persisted via localStorage)
 *   - Mobile: open / close sidebar drawer
 */
document.addEventListener('DOMContentLoaded', () => {
    const appSidebar    = document.getElementById('appSidebar');
    const toggleBtn     = document.getElementById('sidebarToggleBtn');   // mobile hamburger
    const closeBtn      = document.getElementById('sidebarCloseBtn');    // mobile X button
    const collapseBtn   = document.getElementById('sidebarCollapseBtn'); // desktop chevron
    const overlay       = document.getElementById('sidebarOverlay');

    // ── DESKTOP: Collapse / Expand ──────────────────────────────────────────
    const COLLAPSE_KEY = 'sidebar-collapsed';

    function setCollapsed(collapsed) {
        if (!appSidebar) return;
        if (collapsed) {
            appSidebar.classList.add('collapsed');
            if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'false');
            localStorage.setItem(COLLAPSE_KEY, '1');
        } else {
            appSidebar.classList.remove('collapsed');
            if (collapseBtn) collapseBtn.setAttribute('aria-expanded', 'true');
            localStorage.removeItem(COLLAPSE_KEY);
        }
    }

    // Restore persisted state on page load (desktop only)
    if (window.innerWidth >= 992) {
        if (localStorage.getItem(COLLAPSE_KEY) === '1') {
            setCollapsed(true);
        }
    }

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            const isCollapsed = appSidebar && appSidebar.classList.contains('collapsed');
            setCollapsed(!isCollapsed);
        });
    }

    // ── MOBILE: Open / Close Drawer ─────────────────────────────────────────
    function openSidebar() {
        if (appSidebar) appSidebar.classList.add('open');
        if (toggleBtn) toggleBtn.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
        if (appSidebar) appSidebar.classList.remove('open');
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = appSidebar && appSidebar.classList.contains('open');
            isOpen ? closeSidebar() : openSidebar();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // Close drawer on any sidebar link click (mobile)
    if (appSidebar) {
        appSidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 992) {
                    closeSidebar();
                }
            });
        });
    }

    // Escape key closes mobile drawer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && appSidebar && appSidebar.classList.contains('open')) {
            closeSidebar();
        }
    });
});
