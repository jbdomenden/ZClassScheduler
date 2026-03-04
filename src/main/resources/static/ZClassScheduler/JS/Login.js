// Initialize UI behavior once the DOM is ready (ensures elements exist before querying).
document.addEventListener("DOMContentLoaded", () => {
    const splash = document.getElementById("splashScreen");

    // Fade out the splash overlay shortly after initial load.
    // IMPORTANT: Timeouts align with CSS transition timing for smooth visual state changes.
    if (splash) {
        setTimeout(() => splash.classList.remove("overlay--visible"), 450);
        // After the fade transition, mark as hidden for accessibility and to stop interaction capture.
        setTimeout(() => splash.setAttribute("aria-hidden", "true"), 750);
    }
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
            // Store current user identity for role-based sidebar (nav.js resolves role via /api/settings/teachers)
            // IMPORTANT: role is derived from Manage Teachers record of this email.
            localStorage.setItem("currentUserEmail", String(payload.email || "").trim().toLowerCase());
            // Clear any stale role; it will be re-resolved on next page load
            localStorage.removeItem("role");

            // Redirect on successful login (server indicates success via HTTP status).
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
