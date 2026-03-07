// Initialize UI behavior once the DOM is ready (ensures elements exist before querying).
function hideSplash() {
    const splash = document.getElementById("splashScreen");
    if (!splash) return;

    splash.classList.remove("overlay--visible");

    // After the fade transition, fully hide to prevent accidental click-capture.
    setTimeout(() => {
        splash.setAttribute("aria-hidden", "true");
        splash.style.display = "none";
    }, 260);
}

document.addEventListener("DOMContentLoaded", () => {
    // Hide when the page is actually loaded (CSS/fonts/images), not on a fixed timer.
    window.addEventListener("load", hideSplash, { once: true });

    // Failsafe: don't get stuck if the load event is delayed or interrupted.
    setTimeout(hideSplash, 2500);
});

// Login page does not load load-global.js, so provide a minimal modal-based appAlert/appConfirm.
(function ensureLoginDialogs() {
    if (typeof window.appAlert === "function" && typeof window.appConfirm === "function") return;

    const DIALOG_ID = "appDialogOverlay";

    function ensure() {
        if (document.getElementById(DIALOG_ID)) return;
        const wrap = document.createElement("div");
        wrap.id = DIALOG_ID;
        wrap.className = "app-dialog-backdrop hidden";
        wrap.innerHTML = `
  <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
    <h3 class="title" id="appDialogTitle">Message</h3>
    <p class="msg" id="appDialogMsg"></p>
    <div class="actions">
      <button type="button" class="btn btn-secondary" id="appDialogCancelBtn" style="display:none;">Cancel</button>
      <button type="button" class="btn btn-primary" id="appDialogOkBtn">OK</button>
    </div>
  </div>
`;
        document.body.appendChild(wrap);
    }

    function setVisible(v) {
        const el = document.getElementById(DIALOG_ID);
        if (!el) return;
        el.classList.toggle("hidden", !v);
    }

    function setContent({ title, message, mode, okText, cancelText }) {
        const el = document.getElementById(DIALOG_ID);
        if (!el) return;
        el.setAttribute("data-mode", mode || "alert");
        el.querySelector("#appDialogTitle").textContent = title || "Message";
        el.querySelector("#appDialogMsg").textContent = String(message ?? "");
        el.querySelector("#appDialogOkBtn").textContent = okText || "OK";

        const cancel = el.querySelector("#appDialogCancelBtn");
        if ((mode || "alert") === "confirm") {
            cancel.style.display = "";
            cancel.textContent = cancelText || "Cancel";
        } else {
            cancel.style.display = "none";
        }
    }

    window.appAlert = function (message, opts = {}) {
        ensure();
        setContent({ title: opts.title || "Message", message, mode: "alert", okText: opts.okText || "OK" });
        setVisible(true);
        document.getElementById("appDialogOkBtn")?.focus?.();
    };

    window.appConfirm = function (message, opts = {}) {
        ensure();
        setContent({
            title: opts.title || "Confirm",
            message,
            mode: "confirm",
            okText: opts.okText || "OK",
            cancelText: opts.cancelText || "Cancel",
        });
        setVisible(true);

        return new Promise((resolve) => {
            const el = document.getElementById(DIALOG_ID);
            const ok = el.querySelector("#appDialogOkBtn");
            const cancel = el.querySelector("#appDialogCancelBtn");

            const cleanup = () => {
                ok?.removeEventListener("click", onOk);
                cancel?.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onKey);
            };
            const finish = (v) => {
                cleanup();
                setVisible(false);
                resolve(v);
            };
            const onOk = () => finish(true);
            const onCancel = () => finish(false);
            const onKey = (e) => { if (e.key === "Escape") finish(false); };

            ok?.addEventListener("click", onOk);
            cancel?.addEventListener("click", onCancel);
            document.addEventListener("keydown", onKey);
            ok?.focus?.();
        });
    };
})();

/**
 * Toggles the "Signing in" overlay and disables/enables the submit button.
 * IMPORTANT: Disabling the button prevents double submissions.
 */
function setLoginLoading(isLoading) {
    const overlay = document.getElementById("loginLoading");
    const btn = document.querySelector("#loginForm button[type='submit']");

    if (overlay) {
        overlay.classList.toggle("overlay--visible", isLoading);
        overlay.setAttribute("aria-hidden", String(!isLoading));
    }

    if (btn) btn.disabled = isLoading;
}

function clearAuthState() {
    localStorage.removeItem("role");
    localStorage.removeItem("currentUserEmail");
    localStorage.removeItem("token");
    sessionStorage.clear();
}

async function redirectAfterLogin(token) {
    // Decide landing page based on JWT role.
    try {
        const meRes = await fetch("/api/auth/me", {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`,
            }
        });
        if (meRes.ok) {
            const me = await meRes.json().catch(() => null);
            const role = String(me?.role || "").trim().toUpperCase().replace(/\s+/g, "_");
            if (role) localStorage.setItem("role", role);

            if (role === "TEACHER" || role === "CHECKER" || role === "NON_TEACHING") {
                window.location.href = "/ZClassScheduler/html/SchedulesOverview.html";
                return;
            }
        }
    } catch (_) {
        // fall through
    }

    window.location.href = "/ZCSDash";
}

async function requirePasswordChange({ token, oldPassword }) {
    const ID = "forceChangePasswordOverlay";

    function ensure() {
        if (document.getElementById(ID)) return;
        const wrap = document.createElement("div");
        wrap.id = ID;
        wrap.className = "app-dialog-backdrop";
        wrap.innerHTML = `
  <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="forceCpTitle">
    <h3 class="title" id="forceCpTitle">Change password required</h3>
    <p class="msg">Your account is using the default password. You must change it before continuing.</p>

    <div class="field">
      <label for="forceNewPassword">New password</label>
      <input id="forceNewPassword" type="password" autocomplete="new-password" />
    </div>

    <div class="field">
      <label for="forceConfirmPassword">Confirm new password</label>
      <input id="forceConfirmPassword" type="password" autocomplete="new-password" />
    </div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" id="forceCancelBtn">Cancel</button>
      <button type="button" class="btn btn-primary" id="forceSaveBtn">Save</button>
    </div>
  </div>
`;
        document.body.appendChild(wrap);
    }

    ensure();
    const wrap = document.getElementById(ID);
    const newEl = wrap.querySelector("#forceNewPassword");
    const confEl = wrap.querySelector("#forceConfirmPassword");
    const saveBtn = wrap.querySelector("#forceSaveBtn");
    const cancelBtn = wrap.querySelector("#forceCancelBtn");

    newEl.value = "";
    confEl.value = "";
    newEl.focus();

    return await new Promise((resolve) => {
        const cleanup = () => {
            saveBtn?.removeEventListener("click", onSave);
            cancelBtn?.removeEventListener("click", onCancel);
        };

        const onCancel = async () => {
            cleanup();
            clearAuthState();
            wrap.remove();
            appAlert("Password change is required to continue.");
            resolve(false);
        };

        const onSave = async () => {
            const newPassword = String(newEl?.value || "");
            const confirm = String(confEl?.value || "");

            if (!newPassword) {
                appAlert("Please enter a new password.");
                return;
            }
            if (newPassword.length < 6) {
                appAlert("New password must be at least 6 characters.");
                return;
            }
            if (newPassword !== confirm) {
                appAlert("New password and confirmation do not match.");
                return;
            }

            if (saveBtn) saveBtn.disabled = true;
            try {
                const res = await fetch("/api/auth/change-password", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ oldPassword, newPassword }),
                });

                if (!res.ok) {
                    let msg = "Unable to change password.";
                    try {
                        const data = await res.json();
                        if (data?.message) msg = data.message;
                    } catch (_) {
                        // ignore
                    }
                    appAlert(msg);
                    return;
                }

                cleanup();
                wrap.remove();
                resolve(true);
            } catch (err) {
                console.error(err);
                appAlert("Unable to change password right now.");
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        };

        cancelBtn?.addEventListener("click", onCancel);
        saveBtn?.addEventListener("click", onSave);
    });
}

// Handle login form submission via async request.
// IMPORTANT: preventDefault() keeps the page from reloading and allows the overlay UX.
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById("email");
    const passwordEl = document.getElementById("password");
    const rememberEl = document.getElementById("rememberMe");

    setLoginLoading(true);

    // Payload mirrors the form state; null-safe access avoids runtime errors if elements are missing.
    const payload = {
        email: emailEl?.value ?? "",
        password: passwordEl?.value ?? "",
        rememberMe: !!rememberEl?.checked,
    };

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payload }),
        });

        if (res.ok) {
            const data = await res.json().catch(() => null);
            const token = data?.token;
            if (!token) {
                appAlert("Login succeeded, but no token was returned. Please contact the administrator.");
                return;
            }

            localStorage.setItem("token", String(token));

            // Store current user identity for role-based sidebar (sidebar resolves role by email).
            localStorage.setItem("currentUserEmail", String(payload.email || "").trim().toLowerCase());
            localStorage.removeItem("role");

            if (data?.forcePasswordChange === true) {
                // Stop the login overlay before prompting.
                setLoginLoading(false);

                const ok = await requirePasswordChange({ token, oldPassword: payload.password });
                if (!ok) return;
            }

            await redirectAfterLogin(token);
            return;
        }

        // Use API-provided error message when possible; fall back to a safe default.
        let msg = "Invalid credentials";
        try {
            const data = await res.json();
            if (data?.message) msg = data.message;
        } catch (_) {
            // NOTE: Response may not be JSON; ignore parse errors and keep default message.
        }

        appAlert(msg);
    } catch (err) {
        // Network / unexpected failure path (fetch throws).
        console.error("Login failed:", err);
        appAlert("Unable to login right now. Please check your connection and try again.");
    } finally {
        // IMPORTANT: Always clear loading state, even after errors or early returns.
        setLoginLoading(false);
    }
});
