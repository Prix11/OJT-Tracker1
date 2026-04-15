/**
 * OJT Tracker — stacked notification toasts (success / error / warning / info).
 * Requires toast.css. Reads --surface, --text, --muted, --accent, etc. from the page.
 */
(function (global) {
  var NS = "http://www.w3.org/2000/svg";

  var ICONS = {
    success:
      '<svg xmlns="' +
      NS +
      '" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
    error:
      '<svg xmlns="' +
      NS +
      '" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    warning:
      '<svg xmlns="' +
      NS +
      '" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 20h20L12 2z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info:
      '<svg xmlns="' +
      NS +
      '" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    trash:
      '<svg xmlns="' +
      NS +
      '" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
  };

  var TYPE_DEFAULTS = {
    success: { title: "Success", icon: "success" },
    error: { title: "Error", icon: "error" },
    warning: { title: "Warning", icon: "warning" },
    info: { title: "Info", icon: "info" },
    deleted: { title: "Deleted", icon: "trash" }
  };

  function ensureRoot() {
    var root = document.getElementById("ojt-toast-root");
    if (root) return root;
    root = document.createElement("div");
    root.id = "ojt-toast-root";
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-relevant", "additions");
    document.body.appendChild(root);
    return root;
  }

  function show(opts) {
    if (!document.body) {
      return { dismiss: function () {} };
    }
    if (!opts || typeof opts !== "object") opts = {};
    var type = TYPE_DEFAULTS[opts.type] ? opts.type : "success";
    var def = TYPE_DEFAULTS[type];
    var title = opts.title != null ? String(opts.title) : def.title;
    var message = opts.message != null ? String(opts.message) : "";
    var duration =
      typeof opts.duration === "number" && !isNaN(opts.duration) ? opts.duration : 4000;

    var root = ensureRoot();
    var el = document.createElement("div");
    el.className = "ojt-toast ojt-toast--" + type;
    el.setAttribute("role", type === "error" ? "alert" : "status");

    var accent = document.createElement("div");
    accent.className = "ojt-toast-accent";
    accent.setAttribute("aria-hidden", "true");

    var iconWrap = document.createElement("div");
    iconWrap.className = "ojt-toast-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    iconWrap.innerHTML = ICONS[def.icon] || ICONS.success;

    var copy = document.createElement("div");
    copy.className = "ojt-toast-copy";
    var titleEl = document.createElement("div");
    titleEl.className = "ojt-toast-title";
    titleEl.textContent = title;
    copy.appendChild(titleEl);
    if (message) {
      var msgEl = document.createElement("p");
      msgEl.className = "ojt-toast-msg";
      msgEl.textContent = message;
      copy.appendChild(msgEl);
    }

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ojt-toast-close";
    closeBtn.innerHTML = "\u00d7";
    closeBtn.setAttribute("aria-label", "Dismiss notification");

    var inner = document.createElement("div");
    inner.className = "ojt-toast-inner";
    inner.appendChild(accent);
    inner.appendChild(iconWrap);
    inner.appendChild(copy);
    inner.appendChild(closeBtn);

    var prog = document.createElement("div");
    prog.className = "ojt-toast-progress";
    var fill = document.createElement("div");
    fill.className = "ojt-toast-progress-fill";
    fill.style.setProperty("--ojt-toast-dur", Math.max(0, duration) + "ms");
    prog.appendChild(fill);

    el.appendChild(inner);
    el.appendChild(prog);

    var tid = null;
    function dismiss() {
      if (tid !== null) {
        clearTimeout(tid);
        tid = null;
      }
      if (!el.parentNode) return;
      el.classList.remove("ojt-toast--in");
      el.classList.add("ojt-toast--out");
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 240);
    }

    closeBtn.addEventListener("click", dismiss);
    if (duration > 0) {
      tid = setTimeout(dismiss, duration);
    }

    root.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add("ojt-toast--in");
      });
    });

    return { dismiss: dismiss };
  }

  global.OJTToast = {
    show: show,
    success: function (message, title) {
      return show({
        type: "success",
        message: message || "",
        title: title != null ? title : TYPE_DEFAULTS.success.title
      });
    },
    error: function (message, title) {
      return show({
        type: "error",
        message: message || "",
        title: title != null ? title : TYPE_DEFAULTS.error.title
      });
    },
    warning: function (message, title) {
      return show({
        type: "warning",
        message: message || "",
        title: title != null ? title : TYPE_DEFAULTS.warning.title
      });
    },
    info: function (message, title) {
      return show({
        type: "info",
        message: message || "",
        title: title != null ? title : TYPE_DEFAULTS.info.title
      });
    },
    deleted: function (message, title) {
      return show({
        type: "deleted",
        message: message || "",
        title: title != null ? title : TYPE_DEFAULTS.deleted.title
      });
    }
  };
})(typeof window !== "undefined" ? window : this);
