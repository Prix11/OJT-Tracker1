/**
 * Firebase Auth + Firestore — same account & data on any device when configured.
 * Requires firebase-config.js with a valid apiKey.
 */
(function (global) {
  var firebase = global.firebase;
  /** Single init promise — Save calls OJTApp.init() again; Firestore allows enablePersistence only once. */
  var firestoreInitPromise = null;

  function looksLikePlaceholder(str) {
    if (!str || typeof str !== "string") return true;
    var s = str.trim();
    if (s.length < 8) return true;
    if (/YOUR_|your_api|placeholder|xxxxxxxx/i.test(s)) return true;
    return false;
  }

  function useCloud() {
    var c = global.OJT_FIREBASE_CONFIG;
    if (!c || typeof c.apiKey !== "string") return false;
    if (looksLikePlaceholder(c.apiKey)) return false;
    if (looksLikePlaceholder(c.projectId)) return false;
    return c.apiKey.length > 0;
  }

  function sanitize(obj) {
    var o = {};
    if (!obj) return o;
    Object.keys(obj).forEach(function (k) {
      if (obj[k] !== undefined) o[k] = obj[k];
    });
    return o;
  }

  function startOfWeekMonday(d) {
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var mon = new Date(d);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(d.getDate() + diff);
    return mon;
  }

  function recomputeFromEntries(entries) {
    var weekStart = startOfWeekMonday(new Date());
    var total = 0;
    var week = 0;
    var otTotal = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var th = e.totalHours != null ? e.totalHours : 0;
      var ot = e.overtimeHours != null ? e.overtimeHours : 0;
      total += th;
      otTotal += ot;
      var ed = new Date(e.date + "T12:00:00");
      if (ed >= weekStart) week += th;
    }
    return {
      total: Math.round(total * 1000) / 1000,
      week: Math.round(week * 1000) / 1000,
      overtimeTotal: Math.round(otTotal * 1000) / 1000
    };
  }

  function getDashboardRef(uid) {
    return firebase
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("meta")
      .doc("dashboard");
  }

  function mapAuthError(err) {
    var code = err && err.code;
    if (code === "auth/email-already-in-use") {
      return "An account with this email already exists.";
    }
    if (code === "auth/invalid-email") return "Invalid email address.";
    if (code === "auth/weak-password") return "Password must be at least 6 characters.";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
      return "Incorrect password.";
    }
    if (code === "auth/user-not-found") return "No account found for this email.";
    if (code === "auth/too-many-requests") {
      return "Too many attempts. Wait a few minutes and try again.";
    }
    if (code === "auth/missing-email") return "Enter your email address.";
    return (err && err.message) || "Sign in failed.";
  }

  function mapFirestoreError(err) {
    var code = err && err.code;
    if (code === "permission-denied") {
      return (
        "Firestore blocked saving your data. In Firebase Console open Firestore → Rules, " +
        "publish rules that allow read/write under users/{userId} only when signed in " +
        "(see firebase-config.example.js). Make sure you clicked Publish."
      );
    }
    return null;
  }

  function ensureAuthToken(user) {
    if (!user) return Promise.reject(new Error("Not signed in."));
    return user.getIdToken(true);
  }

  function firebaseInit() {
    if (!useCloud()) return Promise.resolve(false);
    if (firestoreInitPromise) return firestoreInitPromise;
    if (!firebase.apps.length) {
      firebase.initializeApp(global.OJT_FIREBASE_CONFIG);
    }
    var db = firebase.firestore();
    /* Persistence must run before other Firestore calls; only one enablePersistence per app lifetime. */
    firestoreInitPromise = db
      .enablePersistence({ synchronizeTabs: true })
      .catch(function () {
        /* offline cache unavailable (e.g. private mode) — app still works online */
        return;
      })
      .then(function () {
        try {
          db.settings({ ignoreUndefinedProperties: true, merge: true });
        } catch (e) {
          /* settings() may only run once */
        }
        return true;
      });
    return firestoreInitPromise;
  }

  function setPersistence(remember) {
    var p = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    return firebase.auth().setPersistence(p);
  }

  function cloudWaitForAuth() {
    if (!useCloud()) return Promise.resolve();
    var auth = firebase.auth();
    /* Wait until initial session restore finishes (avoids first callback = null race). */
    if (typeof auth.authStateReady === "function") {
      return auth.authStateReady();
    }
    return new Promise(function (resolve) {
      var unsub = auth.onAuthStateChanged(function () {
        unsub();
        resolve();
      });
    });
  }

  function cloudGetUser() {
    if (!useCloud()) return null;
    var u = firebase.auth().currentUser;
    if (!u) return null;
    return { email: u.email, uid: u.uid, cloud: true };
  }

  function cloudGetAllEntries(uid) {
    return firebase
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("entries")
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          out.push(doc.data());
        });
        out.sort(function (a, b) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        return out;
      });
  }

  function cloudGetHoursData(uid) {
    return getDashboardRef(uid)
      .get()
      .then(function (snap) {
        if (!snap.exists) {
          return { total: 0, week: 0, goal: null, overtimeTotal: 0 };
        }
        var d = snap.data();
        return {
          total: d.total != null ? d.total : 0,
          week: d.week != null ? d.week : 0,
          goal: d.goal != null ? d.goal : null,
          overtimeTotal: d.overtimeTotal != null ? d.overtimeTotal : 0
        };
      });
  }

  function cloudSyncHoursFromEntries(uid) {
    return cloudGetAllEntries(uid).then(function (entries) {
      return getDashboardRef(uid).get().then(function (snap) {
        var goal = null;
        if (snap.exists) {
          var da = snap.data();
          goal = da.goal != null ? da.goal : null;
        }
        var payload = { goal: goal };
        if (!entries.length) {
          payload.total = 0;
          payload.week = 0;
          payload.overtimeTotal = 0;
          return getDashboardRef(uid).set(payload, { merge: true });
        }
        var agg = recomputeFromEntries(entries);
        agg.goal = goal;
        return getDashboardRef(uid).set(agg, { merge: true });
      });
    });
  }

  function cloudSetGoal(uid, raw) {
    if (raw === "" || raw === null || raw === undefined) {
      return getDashboardRef(uid).set({ goal: null }, { merge: true });
    }
    var n = parseFloat(String(raw).replace(",", "."), 10);
    if (isNaN(n) || n < 0) {
      return getDashboardRef(uid).set({ goal: null }, { merge: true });
    }
    var g = Math.round(n * 1000) / 1000;
    return getDashboardRef(uid).set({ goal: g }, { merge: true });
  }

  function cloudAddEntry(uid, email, entry) {
    var u = firebase.auth().currentUser;
    if (!u) {
      return Promise.reject(new Error("Session expired. Sign in again from the dashboard."));
    }
    var docUid = u.uid;
    entry.userEmail = ((email != null && email !== "") ? email : u.email || "")
      .trim()
      .toLowerCase();
    var ref = firebase
      .firestore()
      .collection("users")
      .doc(docUid)
      .collection("entries")
      .doc(String(entry.id));
    return ensureAuthToken(u)
      .then(function () {
        return ref.set(sanitize(entry));
      })
      .then(function () {
        return cloudSyncHoursFromEntries(docUid).catch(function (syncErr) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("OJT: entry saved; dashboard totals sync failed", syncErr);
          }
        });
      });
  }

  function cloudUpdateEntry(uid, email, entry) {
    return cloudAddEntry(uid, email, entry);
  }

  function cloudDeleteEntry(uid, entryId) {
    var u = firebase.auth().currentUser;
    if (!u || String(u.uid) !== String(uid)) {
      return Promise.reject(new Error("Session expired. Sign in again from the dashboard."));
    }
    var docUid = u.uid;
    var ref = firebase
      .firestore()
      .collection("users")
      .doc(docUid)
      .collection("entries")
      .doc(String(entryId));
    return ensureAuthToken(u)
      .then(function () {
        return ref.delete();
      })
      .then(function () {
        return cloudSyncHoursFromEntries(docUid).catch(function (syncErr) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("OJT: entry deleted; dashboard totals sync failed", syncErr);
          }
        });
      });
  }

  function migrateLocalToCloud(uid, email) {
    return OJTDB.init()
      .then(function () {
        return OJTDB.getAllEntriesRaw();
      })
      .then(function (all) {
        var norm = (email || "").trim().toLowerCase();
        var mine = [];
        for (var i = 0; i < all.length; i++) {
          var e = all[i];
          if (!e.userEmail || e.userEmail === norm) {
            mine.push(e);
          }
        }
        if (!mine.length) return;
        var db = firebase.firestore();
        var refBase = db.collection("users").doc(uid).collection("entries");
        var chunk = 400;
        function writeBatch(start) {
          var batch = db.batch();
          var end = Math.min(start + chunk, mine.length);
          for (var j = start; j < end; j++) {
            var ent = mine[j];
            var copy = {};
            for (var k in ent) {
              if (Object.prototype.hasOwnProperty.call(ent, k)) copy[k] = ent[k];
            }
            copy.userEmail = norm;
            batch.set(refBase.doc(String(copy.id)), sanitize(copy));
          }
          return batch.commit().then(function () {
            if (end < mine.length) return writeBatch(end);
          });
        }
        return writeBatch(0);
      });
  }

  function cloudRegister(email, password, passwordConfirm, remember) {
    if (!useCloud()) return Promise.reject(new Error("Cloud not configured"));
    if (password !== passwordConfirm) {
      return Promise.resolve({ ok: false, error: "Passwords do not match." });
    }
    if (password.length < 6) {
      return Promise.resolve({
        ok: false,
        error: "Password must be at least 6 characters."
      });
    }
    return setPersistence(!!remember)
      .then(function () {
        return firebase.auth().createUserWithEmailAndPassword(email, password);
      })
      .then(function () {
        var u = firebase.auth().currentUser;
        return ensureAuthToken(u).then(function () {
          return migrateLocalToCloud(u.uid, u.email);
        }).then(function () {
          return cloudSyncHoursFromEntries(u.uid);
        }).then(function () {
          return { ok: true, email: u.email, isFirst: false };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          error: mapFirestoreError(err) || mapAuthError(err)
        };
      });
  }

  function cloudLogin(email, password, remember) {
    if (!useCloud()) return Promise.reject(new Error("Cloud not configured"));
    return setPersistence(!!remember)
      .then(function () {
        return firebase.auth().signInWithEmailAndPassword(email, password);
      })
      .then(function () {
        var u = firebase.auth().currentUser;
        return ensureAuthToken(u).then(function () {
          return migrateLocalToCloud(u.uid, u.email);
        }).then(function () {
          return cloudSyncHoursFromEntries(u.uid);
        }).then(function () {
          return { ok: true, email: u.email };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          error: mapFirestoreError(err) || mapAuthError(err)
        };
      });
  }

  function cloudLogout() {
    if (!useCloud()) return Promise.resolve();
    return firebase.auth().signOut();
  }

  function cloudSendPasswordResetEmail(email) {
    if (!useCloud()) {
      return Promise.reject(
        new Error("Password reset is only available when Firebase is configured.")
      );
    }
    var addr = (email != null ? String(email) : "").trim();
    if (!addr) {
      return Promise.reject(new Error("Enter your email address."));
    }
    return firebaseInit()
      .then(function () {
        return firebase.auth().sendPasswordResetEmail(addr);
      })
      .catch(function (err) {
        throw new Error(mapAuthError(err) || (err && err.message) || "Could not send reset email.");
      });
  }

  global.OJTCloud = {
    useCloud: useCloud,
    init: firebaseInit,
    waitForAuth: cloudWaitForAuth,
    getUser: cloudGetUser,
    register: cloudRegister,
    login: cloudLogin,
    logout: cloudLogout,
    sendPasswordResetEmail: cloudSendPasswordResetEmail,
    getAllEntries: cloudGetAllEntries,
    getHoursData: cloudGetHoursData,
    syncHoursFromEntries: cloudSyncHoursFromEntries,
    setGoal: cloudSetGoal,
    addEntry: cloudAddEntry,
    updateEntry: cloudUpdateEntry,
    deleteEntry: cloudDeleteEntry
  };
})(typeof window !== "undefined" ? window : self);
