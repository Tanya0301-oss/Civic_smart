(() => {
    const API_BASE = "/api";
    const ROLE_LABELS = {
        CITIZEN: "Citizen / User",
        OFFICER: "Assigned Officer",
        ADMIN: "Authority / Admin",
        WARD_SUPERIOR: "Ward Superior"
    };

    let currentUser = null;
    let csrfToken = null;

    const destinations = {
        CITIZEN: "my-complaints.html",
        OFFICER: "officer.html",
        ADMIN: "admin.html",
        WARD_SUPERIOR: "ward-superior.html"
    };

    async function requestCsrf() {
        const response = await fetch(`${API_BASE}/auth/csrf`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.csrfToken) {
            throw new Error(data.error || "Could not initialize secure login.");
        }
        csrfToken = data.csrfToken;
        return csrfToken;
    }

    async function apiRequest(path, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers || {});
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
            if (!csrfToken) await requestCsrf();
            headers.set("X-CSRF-Token", csrfToken);
        }
        if (options.body && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            method,
            headers,
            credentials: "same-origin",
            cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) currentUser = null;
        if (!response.ok) {
            const error = new Error(
                data.error || data.message || `Request failed (${response.status}).`
            );
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    async function login(identifier, password, expectedRole) {
        await requestCsrf();
        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({ identifier, password })
        });
        if (!data.user || !data.csrfToken) {
            throw new Error("The server returned an incomplete login response.");
        }

        csrfToken = data.csrfToken;
        currentUser = normalizeUser(data.user);
        if (expectedRole && currentUser.role !== expectedRole) {
            await logout(false);
            throw new Error("The account does not belong to the selected portal.");
        }
        return currentUser;
    }

    function normalizeUser(user) {
        return {
            userId: user.userId,
            role: user.role,
            name: user.displayName,
            citizenId: user.citizenId || null,
            officerId: user.officerId || null
        };
    }

    async function getCurrentSession() {
        return currentUser;
    }

    async function refreshSession() {
        try {
            const data = await apiRequest("/auth/me");
            if (!data.user) throw new Error("Invalid session response.");
            currentUser = normalizeUser(data.user);
            return currentUser;
        } catch (error) {
            currentUser = null;
            return null;
        }
    }

    async function requireRole(roles) {
        const user = await refreshSession();
        if (!user) {
            redirectToLogin();
            return null;
        }
        if (!roles.includes(user.role)) {
            window.location.replace(destinations[user.role] || "login.html");
            return null;
        }
        return user;
    }

    function redirectToLogin() {
        const page = location.pathname.split("/").pop();
        const returnPage = page && page !== "login.html" ? page : "";
        const query = returnPage ? `?return=${encodeURIComponent(returnPage)}` : "";
        window.location.replace(`login.html${query}`);
    }

    async function logout(redirect = true) {
        try {
            if (currentUser) await apiRequest("/auth/logout", { method: "POST" });
        } catch (error) {
            console.warn("[CivicAuth] Server logout request failed:", error.message);
        } finally {
            currentUser = null;
            csrfToken = null;
            if (redirect) window.location.replace("login.html");
        }
    }

    function getRoleDestination(role) {
        return destinations[role] || "login.html";
    }

    window.CivicAuth = {
        login,
        logout,
        refreshSession,
        getCurrentSession,
        requireRole,
        apiRequest,
        getRoleDestination,
        roleLabels: ROLE_LABELS,
        get csrfToken() { return csrfToken; },
        demoOnly: false
    };

    document.addEventListener("DOMContentLoaded", async () => {
        const form = document.getElementById("loginForm");
        if (form) {
            const roles = [...document.querySelectorAll("[data-role]")];
            const identifier = document.getElementById("userInput");
            const password = document.getElementById("passwordInput");
            const label = document.getElementById("usernameLabel");
            const helper = document.getElementById("roleHelp");
            const submit = document.getElementById("submitLoginBtn");
            const error = document.getElementById("loginError");
            let selectedRole = "CITIZEN";
            const config = {
                CITIZEN: ["Mobile number or citizen ID", "Enter your identifier", "Login to Citizen Dashboard"],
                OFFICER: ["Officer ID", "Enter your identifier", "Login to Officer Dashboard"],
                ADMIN: ["Authority ID", "Enter your identifier", "Login to Authority Dashboard"]
            };

            function selectRole(role) {
                if (!config[role]) return;
                selectedRole = role;
                roles.forEach(button => {
                    const active = button.dataset.role === role;
                    button.classList.toggle("active", active);
                    button.setAttribute("aria-pressed", String(active));
                });
                label.textContent = config[role][0];
                identifier.placeholder = config[role][1];
                submit.textContent = config[role][2];
                helper.textContent = role === "ADMIN"
                    ? "Authority accounts must be provisioned by an administrator."
                    : "Sign in using your registered account credentials.";
                error.textContent = "";
            }

            roles.forEach(button => {
                button.addEventListener("click", () => selectRole(button.dataset.role));
            });
            selectRole(selectedRole);

            form.addEventListener("submit", async event => {
                event.preventDefault();
                error.textContent = "";
                const loginIdentifier = identifier.value.trim();
                const loginPassword = password.value;
                if (!loginIdentifier || !loginPassword) {
                    error.textContent = "Enter your identifier and password.";
                    return;
                }
                submit.disabled = true;
                submit.textContent = "Authenticating...";
                try {
                    const user = await login(loginIdentifier, loginPassword, selectedRole);
                    window.location.assign(getRoleDestination(user.role));
                } catch (err) {
                    error.textContent = err.message || "Login failed.";
                } finally {
                    submit.disabled = false;
                    submit.textContent = config[selectedRole][2];
                    password.value = "";
                }
            });

            try {
                await requestCsrf();
            } catch (err) {
                error.textContent = "Authentication service is unavailable. Start the Civic Smart backend.";
                submit.disabled = true;
            }
            return;
        }

        const sidebarFooter = document.querySelector(".sidebar__footer");
        if (sidebarFooter && !document.getElementById("logoutButton")) {
            const user = await refreshSession();
            if (user) {
                const button = document.createElement("button");
                button.id = "logoutButton";
                button.type = "button";
                button.className = "sidebar__login-link";
                button.textContent = `Sign out (${user.name})`;
                button.addEventListener("click", () => logout());
                sidebarFooter.prepend(button);
            }
        }
    });
})();
