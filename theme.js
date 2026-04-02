/**
 * Persists theme in localStorage; respects prefers-color-scheme when unset.
 */
(function (global) {
  var STORAGE_KEY = "ojt_theme";

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  var ICON_SUN =
    '<svg class="theme-toggle-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>';

  var ICON_MOON =
    '<svg class="theme-toggle-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>';

  function apply(theme) {
    var t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    updateToggleIcons();
  }

  function updateToggleIcons() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    var nodes = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < nodes.length; i++) {
      var btn = nodes[i];
      btn.innerHTML = isLight ? ICON_MOON : ICON_SUN;
      btn.setAttribute(
        "aria-label",
        isLight ? "Switch to dark mode" : "Switch to light mode"
      );
    }
  }

  function bindToggles() {
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest("[data-theme-toggle]")) {
        ev.preventDefault();
        toggle();
      }
    });
  }

  function init() {
    var stored = getStored();
    if (stored === "light" || stored === "dark") {
      apply(stored);
    } else if (
      global.matchMedia &&
      global.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      apply("light");
    } else {
      apply("dark");
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function onReady() {
        document.removeEventListener("DOMContentLoaded", onReady);
        updateToggleIcons();
        bindToggles();
      });
    } else {
      updateToggleIcons();
      bindToggles();
    }
  }

  function set(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme === "light" ? "light" : "dark");
    } catch (e) {}
    apply(theme);
  }

  function toggle() {
    var cur = document.documentElement.getAttribute("data-theme") || "dark";
    set(cur === "light" ? "dark" : "light");
  }

  global.OJTTheme = {
    init: init,
    set: set,
    toggle: toggle
  };
})(typeof window !== "undefined" ? window : self);
