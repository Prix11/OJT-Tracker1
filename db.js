/**
 * OJT Tracker — IndexedDB entries + per-user hour totals in localStorage.
 */
(function (global) {
  var DB_NAME = "ojt-tracker-db";
  var DB_VERSION = 2;
  var STORE_ENTRIES = "entries";
  var STORE_META = "meta";

  var STORAGE_HOURS_LEGACY = "ojt_tracker_hours";
  var STORAGE_ENTRIES_LEGACY = "ojt_tracker_entries";

  var dbPromise = null;
  var readyPromise = null;

  function normalizeUserEmail(userEmail) {
    return String(userEmail || "")
      .trim()
      .toLowerCase();
  }

  function hoursStorageKey(userEmail) {
    return "ojt_tracker_hours:" + encodeURIComponent(normalizeUserEmail(userEmail));
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        var tx = e.target.transaction;
        if (e.oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
            var store = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
            store.createIndex("byDate", "date", { unique: false });
            store.createIndex("byCreated", "createdAt", { unique: false });
            store.createIndex("byUserEmail", "userEmail", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META);
          }
        }
        if (e.oldVersion < 2 && e.oldVersion >= 1 && db.objectStoreNames.contains(STORE_ENTRIES)) {
          var store = tx.objectStore(STORE_ENTRIES);
          if (!store.indexNames.contains("byUserEmail")) {
            store.createIndex("byUserEmail", "userEmail", { unique: false });
          }
        }
      };
    });
    return dbPromise;
  }

  function startOfWeekMonday(d) {
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var mon = new Date(d);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(d.getDate() + diff);
    return mon;
  }

  function recomputeAggregates(entries, userEmail) {
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
    var base = getHoursData(userEmail);
    return {
      total: Math.round(total * 1000) / 1000,
      week: Math.round(week * 1000) / 1000,
      goal: base.goal != null ? base.goal : null,
      overtimeTotal: Math.round(otTotal * 1000) / 1000
    };
  }

  function saveHoursAggregate(agg, userEmail) {
    global.localStorage.setItem(
      hoursStorageKey(userEmail),
      JSON.stringify(agg)
    );
  }

  function getAllEntriesFromDb() {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_ENTRIES, "readonly");
        var store = tx.objectStore(STORE_ENTRIES);
        var req = store.getAll();
        req.onerror = function () {
          reject(req.error);
        };
        req.onsuccess = function () {
          var list = req.result || [];
          list.sort(function (a, b) {
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
          resolve(list);
        };
      });
    });
  }

  function filterEntriesForUser(entries, userEmail) {
    var norm = normalizeUserEmail(userEmail);
    return entries.filter(function (e) {
      return normalizeUserEmail(e.userEmail) === norm;
    });
  }

  function getAllEntriesForUser(userEmail) {
    return getAllEntriesFromDb().then(function (all) {
      return filterEntriesForUser(all, userEmail);
    });
  }

  function putEntry(entry) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_ENTRIES, "readwrite");
        var store = tx.objectStore(STORE_ENTRIES);
        var req = store.put(entry);
        req.onerror = function () {
          reject(req.error);
        };
        tx.oncomplete = function () {
          resolve(entry);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function bulkPutEntries(entries) {
    if (!entries.length) return Promise.resolve();
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_ENTRIES, "readwrite");
        var store = tx.objectStore(STORE_ENTRIES);
        for (var i = 0; i < entries.length; i++) {
          store.put(entries[i]);
        }
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function migrateLegacyEntries() {
    return getAllEntriesFromDb().then(function (existing) {
      if (existing.length > 0) return;
      try {
        var raw = global.localStorage.getItem(STORAGE_ENTRIES_LEGACY);
        if (!raw) return;
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;
        return bulkPutEntries(arr).then(function () {
          global.localStorage.removeItem(STORAGE_ENTRIES_LEGACY);
        });
      } catch (e) {
        return;
      }
    });
  }

  /**
   * First account only: attach orphan entries + copy legacy global hour totals to this user.
   */
  function migrateLegacyToUser(userEmail, claimOrphans) {
    var norm = normalizeUserEmail(userEmail);
    if (!norm) return Promise.resolve();

    return getAllEntriesFromDb().then(function (all) {
      var p = Promise.resolve();
      if (claimOrphans) {
        var orphans = all.filter(function (e) {
          return !e.userEmail;
        });
        if (orphans.length) {
          orphans.forEach(function (e) {
            e.userEmail = norm;
          });
          p = bulkPutEntries(orphans);
        }
      }
      return p.then(function () {
        var key = hoursStorageKey(norm);
        if (global.localStorage.getItem(key)) return;
        try {
          var legacy = global.localStorage.getItem(STORAGE_HOURS_LEGACY);
          if (legacy) {
            global.localStorage.setItem(key, legacy);
            global.localStorage.removeItem(STORAGE_HOURS_LEGACY);
          }
        } catch (err) {
          return;
        }
      });
    });
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = openDatabase()
      .then(function () {
        return migrateLegacyEntries();
      })
      .catch(function (err) {
        console.error("OJTDB init failed", err);
        throw err;
      });
    return readyPromise;
  }

  function syncHoursFromEntries(userEmail) {
    var norm = normalizeUserEmail(userEmail);
    if (!norm) return Promise.resolve();
    return getAllEntriesForUser(norm).then(function (entries) {
      if (!entries.length) {
        var empty = getHoursData(norm);
        empty.total = 0;
        empty.week = 0;
        empty.overtimeTotal = 0;
        saveHoursAggregate(empty, norm);
        return;
      }
      var agg = recomputeAggregates(entries, norm);
      saveHoursAggregate(agg, norm);
    });
  }

  function addEntry(entry, userEmail) {
    var norm = normalizeUserEmail(userEmail);
    if (!norm) return Promise.reject(new Error("Missing user"));
    entry.userEmail = norm;
    return putEntry(entry)
      .then(function () {
        return getAllEntriesForUser(norm);
      })
      .then(function (entries) {
        var agg = recomputeAggregates(entries, norm);
        saveHoursAggregate(agg, norm);
        return entry;
      });
  }

  function getHoursData(userEmail) {
    var norm = normalizeUserEmail(userEmail);
    if (!norm) {
      return { total: 0, week: 0, goal: null, overtimeTotal: 0 };
    }
    try {
      var raw = global.localStorage.getItem(hoursStorageKey(norm));
      return raw
        ? JSON.parse(raw)
        : { total: 0, week: 0, goal: null, overtimeTotal: 0 };
    } catch (e) {
      return { total: 0, week: 0, goal: null, overtimeTotal: 0 };
    }
  }

  function setGoal(goal, userEmail) {
    var norm = normalizeUserEmail(userEmail);
    if (!norm) return;
    var data = getHoursData(norm);
    if (goal === "" || goal === null || goal === undefined) {
      data.goal = null;
    } else {
      var n = parseFloat(String(goal).replace(",", "."), 10);
      if (isNaN(n) || n < 0) {
        data.goal = null;
      } else {
        data.goal = Math.round(n * 1000) / 1000;
      }
    }
    saveHoursAggregate(data, norm);
  }

  global.OJTDB = {
    init: init,
    addEntry: addEntry,
    getAllEntries: getAllEntriesForUser,
    getAllEntriesRaw: getAllEntriesFromDb,
    syncHoursFromEntries: syncHoursFromEntries,
    getHoursData: getHoursData,
    setGoal: setGoal,
    migrateLegacyToUser: migrateLegacyToUser,
    normalizeUserEmail: normalizeUserEmail
  };
})(typeof window !== "undefined" ? window : self);
