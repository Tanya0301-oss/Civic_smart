/* Demo-only role navigation. Live deployments must replace this adapter with
   server-issued sessions; browser storage is never an authorization boundary. */
(() => {
    const SESSION_KEY = 'civics_smart_demo_session_v1';
    const DEMO_ACCOUNTS = {
        CITIZEN: { role: 'CITIZEN', id: 'CIT-DN-001', name: 'Aarav Mehra', destination: 'my-complaints.html' },
        OFFICER: { role: 'OFFICER', id: 'OFF-RD-104', name: 'Er. Rajesh Varma', destination: 'officer.html' },
        ADMIN: { role: 'ADMIN', id: 'AUTH-DN-001', name: 'Dehradun Authority', destination: 'admin.html' }
    };
    const ROLE_LABELS = { CITIZEN: 'Citizen / User', OFFICER: 'Assigned Officer', ADMIN: 'Authority / Admin' };

    function getCurrentSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
        catch (_) { return null; }
    }
    function createSession(account) {
        const session = { userId: account.id, role: account.role, name: account.name, issuedAt: new Date().toISOString(), demo: true };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }
    function demoLogin(selectedRole) {
        const account = DEMO_ACCOUNTS[selectedRole];
        if (!account) return false;
        createSession(account);
        window.location.assign(account.destination);
        return true;
    }
    function logout() { sessionStorage.removeItem(SESSION_KEY); window.location.assign('login.html'); }
    function requireRole(roles) {
        const session = getCurrentSession();
        if (!session || !roles.includes(session.role)) {
            window.location.replace('login.html?return=' + encodeURIComponent(location.pathname.split('/').pop()));
            return null;
        }
        return session;
    }
    window.CivicAuth = { getCurrentSession, createSession, demoLogin, logout, requireRole, roleLabels: ROLE_LABELS, demoOnly: true };

    document.addEventListener('DOMContentLoaded', () => {
        const activeSession = getCurrentSession();
        if (activeSession) {
            const sidebarFooter = document.querySelector('.sidebar__footer');
            if (sidebarFooter && !document.getElementById('logoutButton')) {
                const button = document.createElement('button');
                button.id = 'logoutButton';
                button.type = 'button';
                button.className = 'sidebar__login-link';
                button.textContent = `Sign out (${activeSession.name})`;
                button.addEventListener('click', logout);
                sidebarFooter.prepend(button);
            }
        }
        const form = document.getElementById('loginForm');
        if (!form) return;
        const roles = [...document.querySelectorAll('[data-role]')];
        const identifier = document.getElementById('userInput');
        const password = document.getElementById('passwordInput');
        const label = document.getElementById('usernameLabel');
        const helper = document.getElementById('roleHelp');
        const submit = document.getElementById('submitLoginBtn');
        const error = document.getElementById('loginError');
        let selectedRole = 'CITIZEN';
        const config = {
            CITIZEN: ['Mobile number or citizen ID', 'Enter your identifier', 'Password', 'Enter your password', 'Login to Citizen Dashboard'],
            OFFICER: ['Officer ID', 'Enter your identifier', 'Password', 'Enter your password', 'Login to Officer Dashboard'],
            ADMIN: ['Authority ID', 'Enter your identifier', 'Password', 'Enter your password', 'Login to Authority Dashboard']
        };
        function selectRole(role) {
            selectedRole = role;
            roles.forEach(button => {
                const active = button.dataset.role === role;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            const [text, placeholder, passLabel, passPlaceholder, buttonText] = config[role];
            label.textContent = text;
            identifier.placeholder = placeholder;
            password.placeholder = passPlaceholder;
            document.getElementById('passwordLabel').textContent = passLabel;
            submit.textContent = buttonText;
            helper.textContent = `Demo Mode — ${ROLE_LABELS[role]} credentials are displayed for interface demonstration and are not checked.`;
            error.textContent = '';
        }
        roles.forEach(button => button.addEventListener('click', () => selectRole(button.dataset.role)));
        selectRole(selectedRole);
        form.addEventListener('submit', event => {
            event.preventDefault();
            error.textContent = '';
            demoLogin(selectedRole);
        });
    });
})();
