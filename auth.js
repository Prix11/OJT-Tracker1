/**
 * Local account registry (per browser). Passwords stored as SHA-256 hashes.
 */
(function (global) {
  var STORAGE_ACCOUNTS = "ojt_tracker_accounts";

  function normalizeEmail(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function getAccounts() {
    try {
      var raw = global.localStorage.getItem(STORAGE_ACCOUNTS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveAccounts(accounts) {
    global.localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(accounts));
  }

  function hashPassword(email, password) {
    var norm = normalizeEmail(email);
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error("Secure hashing is not available in this context."));
    }
    var enc = new TextEncoder();
    var data = enc.encode(norm + ":" + password);
    return global.crypto.subtle.digest("SHA-256", data).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    });
  }

  function registerAccount(email, password, passwordConfirm) {
    var norm = normalizeEmail(email);
    if (!norm) {
      return Promise.resolve({ ok: false, error: "Please enter a valid email." });
    }
    if (password.length < 6) {
      return Promise.resolve({
        ok: false,
        error: "Password must be at least 6 characters."
      });
    }
    if (password !== passwordConfirm) {
      return Promise.resolve({ ok: false, error: "Passwords do not match." });
    }
    var accounts = getAccounts();
    if (accounts.some(function (a) {
      return a.email === norm;
    })) {
      return Promise.resolve({
        ok: false,
        error: "An account with this email already exists. Sign in instead."
      });
    }
    var isFirst = accounts.length === 0;
    return hashPassword(norm, password).then(function (hash) {
      accounts.push({
        email: norm,
        passHash: hash,
        createdAt: Date.now()
      });
      saveAccounts(accounts);
      return { ok: true, email: norm, isFirst: isFirst };
    });
  }

  function verifyLogin(email, password) {
    var norm = normalizeEmail(email);
    if (!norm) {
      return Promise.resolve({ ok: false, error: "Please enter your email." });
    }
    if (!password) {
      return Promise.resolve({ ok: false, error: "Please enter your password." });
    }
    var accounts = getAccounts();
    var acc = accounts.find(function (a) {
      return a.email === norm;
    });
    if (!acc) {
      return Promise.resolve({
        ok: false,
        error:
          "No account on this browser. If you signed up on another device, the site needs Firebase cloud sync (see DEPLOY.md). Otherwise create an account here."
      });
    }
    return hashPassword(norm, password).then(function (hash) {
      if (hash !== acc.passHash) {
        return { ok: false, error: "Incorrect password." };
      }
      return { ok: true, email: norm };
    });
  }

  function hasAnyAccount() {
    return getAccounts().length > 0;
  }

  global.OJTAuth = {
    normalizeEmail: normalizeEmail,
    registerAccount: registerAccount,
    verifyLogin: verifyLogin,
    hasAnyAccount: hasAnyAccount,
    getAccounts: getAccounts
  };
})(typeof window !== "undefined" ? window : self);
