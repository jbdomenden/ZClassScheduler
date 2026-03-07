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
                alert("Login succeeded, but no token was returned. Please contact the administrator.");
                return;
            }

            localStorage.setItem("token", String(token));

            // Store current user identity for role-based sidebar (sidebar resolves role by email).
            localStorage.setItem("currentUserEmail", String(payload.email || "").trim().toLowerCase());
            localStorage.removeItem("role");

            // Decide landing page based on JWT role.
            // Teachers should land on schedules; admins/super admins land on dashboard.
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

                    if (role === "TEACHER") {
                        window.location.href = "/ZClassScheduler/html/SchedulesOverview.html";
                        return;
                    }
                }
            } catch (_) {
                // fall through
            }

            window.location.href = "/ZCSDash";
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

        alert(msg);
    } catch (err) {
        // Network / unexpected failure path (fetch throws).
        console.error("Login failed:", err);
        alert("Unable to login right now. Please check your connection and try again.");
    } finally {
        // IMPORTANT: Always clear loading state, even after errors or early returns.
        setLoginLoading(false);
    }
});
