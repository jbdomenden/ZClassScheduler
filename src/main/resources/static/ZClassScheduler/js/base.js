// ZClassScheduler - Base Module
// Global utilities shared across multiple modules/pages.

/**
 * Creates a reusable grid "cell" div element.
 * Used in schedule/grid-based layouts for consistent styling.
 * @param {string} text - Text content of the cell.
 * @param {string} cls - Optional additional CSS class.
 * @returns {HTMLDivElement}
 */
export function cell(text, cls = "") {
    const d = document.createElement("div");
    d.className = `cell ${cls}`;
    d.textContent = text;
    return d;
}

/**
 * Activates a sidebar navigation item by ID.
 * Adds the "active" class if the element exists.
 * @param {string} id - Element ID of the nav item.
 */
export function activateNav(id) {
    document.getElementById(id)?.classList.add("active");
}

/**
 * Creates a reusable searchable dropdown component.
 * Supports filtering, keyboard navigation, selection callback, and optional clear button.
 *
 * Required config:
 *  - inputId: ID of the input field
 *  - dropdownId: ID of the dropdown container
 *
 * Optional config:
 *  - clearBtnId: ID of clear button
 *  - data: array of string values
 *  - onSelect(value): callback when item is selected
 *  - onClear(): callback when cleared
 *
 * @param {Object} config
 * @returns {Object} { updateData(newData) }
 */
export function createSearchDropdown(config) {

    const input = document.getElementById(config.inputId);
    const dropdown = document.getElementById(config.dropdownId);
    const clearBtn = config.clearBtnId
        ? document.getElementById(config.clearBtnId)
        : null;

    // Abort safely if required elements are missing.
    if (!input || !dropdown) {
        console.warn("SearchDropdown init failed:", config);
        return;
    }

    let data = config.data || [];
    let activeIndex = -1;

    /**
     * Renders filtered dropdown items.
     * @param {string[]} filtered - Filtered list of items to display.
     */
    function render(filtered) {
        dropdown.innerHTML = "";
        activeIndex = -1;

        if (!filtered.length) {
            dropdown.classList.remove("show");
            return;
        }

        filtered.forEach((item) => {
            const option = document.createElement("div");
            option.className = "search-item";
            option.textContent = item;

            option.addEventListener("click", () => {
                selectItem(item);
            });

            dropdown.appendChild(option);
        });

        dropdown.classList.add("show");
    }

    /**
     * Handles selecting an item from the dropdown.
     * Updates input value, hides dropdown, triggers onSelect callback.
     * @param {string} value
     */
    function selectItem(value) {
        input.value = value;
        dropdown.classList.remove("show");

        if (clearBtn) clearBtn.style.display = "block";

        config.onSelect?.(value);
    }

    /**
     * Input listener: filters dropdown results based on current input value.
     */
    input.addEventListener("input", function () {
        const value = this.value.trim().toLowerCase();

        if (clearBtn) {
            clearBtn.style.display = value ? "block" : "none";
        }

        if (!value) {
            dropdown.classList.remove("show");
            config.onClear?.();
            return;
        }

        const filtered = data.filter(item =>
            item.toLowerCase().includes(value)
        );

        render(filtered);
    });

    /**
     * Keyboard navigation handler.
     * Supports ArrowUp, ArrowDown, Enter, Escape.
     */
    input.addEventListener("keydown", function (e) {
        const items = dropdown.querySelectorAll(".search-item");
        if (!items.length) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex =
                (activeIndex - 1 + items.length) % items.length;
        }

        if (e.key === "Enter") {
            e.preventDefault();
            if (activeIndex >= 0) {
                selectItem(items[activeIndex].textContent);
            }
        }

        if (e.key === "Escape") {
            dropdown.classList.remove("show");
        }

        items.forEach(item => item.classList.remove("active"));
        if (activeIndex >= 0) {
            items[activeIndex].classList.add("active");
        }
    });

    /**
     * Clear button handler.
     * Resets input, hides dropdown, triggers onClear callback.
     */
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            input.value = "";
            clearBtn.style.display = "none";
            dropdown.classList.remove("show");
            config.onClear?.();
        });
    }

    /**
     * Global click listener to close dropdown
     * when clicking outside the search wrapper.
     */
    document.addEventListener("click", function (e) {
        const wrapper = input.closest(".search-wrapper");
        if (!wrapper?.contains(e.target)) {
            dropdown.classList.remove("show");
        }
    });

    /**
     * Public API: allows updating dropdown data dynamically.
     */
    return {
        updateData(newData) {
            data = newData || [];
        }
    };
}