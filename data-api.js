/**
 * Unified API: Firebase cloud (when firebase-config.js has apiKey) or local auth + IndexedDB.
 */
(function (global) {
  var STORAGE_USER = "ojt_tracker_user";

  function getLocalUser() {
    try {
      var rawSession = sessionStorage.getItem(STORAGE_USER);
      if (rawSession) return JSON.parse(rawSession);
      var raw = localStorage.getItem(STORAGE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearLocalUser() {
    sessionStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_USER);
  }

  function setLocalUser(user, remember) {
    clearLocalUser();
    if (!user) return;
    var payload = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(STORAGE_USER, payload);
    } else {
      sessionStorage.setItem(STORAGE_USER, payload);
    }
  }

  function isCloud() {
    return typeof OJTCloud !== "undefined" && OJTCloud.useCloud();
  }

  var OJTApp = {
    isCloud: function () {
      return isCloud();
    },

    init: function () {
      if (isCloud()) return OJTCloud.init();
      return OJTDB.init();
    },

    waitForAuth: function () {
      if (isCloud()) return OJTCloud.waitForAuth();
      return Promise.resolve();
    },

    getUser: function () {
      if (isCloud()) return OJTCloud.getUser();
      var u = getLocalUser();
      if (!u || !u.email) return null;
      return { email: u.email, cloud: false };
    },

    register: function (email, pass, pass2, remember) {
      if (isCloud()) {
        return OJTCloud.register(email, pass, pass2, remember);
      }
      return OJTAuth.registerAccount(email, pass, pass2).then(function (res) {
        if (!res.ok) return res;
        return OJTDB.init()
          .then(function () {
            return OJTDB.migrateLegacyToUser(res.email, res.isFirst);
          })
          .then(function () {
            return OJTDB.syncHoursFromEntries(res.email);
          })
          .then(function () {
            setLocalUser({ email: res.email, at: Date.now() }, !!remember);
            return res;
          });
      });
    },

    login: function (email, password, remember) {
      if (isCloud()) {
        return OJTCloud.login(email, password, remember);
      }
      return OJTAuth.verifyLogin(email, password).then(function (res) {
        if (!res.ok) return res;
        return OJTDB.init()
          .then(function () {
            return OJTDB.syncHoursFromEntries(res.email);
          })
          .then(function () {
            setLocalUser({ email: res.email, at: Date.now() }, !!remember);
            return res;
          });
      });
    },

    logout: function () {
      if (isCloud()) {
        return OJTCloud.logout().then(function () {
          clearLocalUser();
        });
      }
      clearLocalUser();
      return Promise.resolve();
    },

    getHoursData: function (user) {
      if (!user || !user.email) {
        return Promise.resolve({
          total: 0,
          week: 0,
          goal: null,
          overtimeTotal: 0
        });
      }
      if (isCloud() && user.uid) {
        return OJTCloud.getHoursData(user.uid);
      }
      return Promise.resolve(OJTDB.getHoursData(user.email));
    },

    setGoal: function (value, user) {
      if (!user) return Promise.resolve();
      if (isCloud() && user.uid) {
        return OJTCloud.setGoal(user.uid, value);
      }
      OJTDB.setGoal(value, user.email);
      return Promise.resolve();
    },

    syncHours: function (user) {
      if (!user) return Promise.resolve();
      if (isCloud() && user.uid) {
        return OJTCloud.syncHoursFromEntries(user.uid);
      }
      return OJTDB.syncHoursFromEntries(user.email);
    },

    getAllEntries: function (user) {
      if (!user) return Promise.resolve([]);
      if (isCloud() && user.uid) {
        return OJTCloud.getAllEntries(user.uid);
      }
      return OJTDB.getAllEntries(user.email);
    },

    addEntry: function (entry, user) {
      if (isCloud()) {
        var cu =
          typeof firebase !== "undefined" && firebase.auth
            ? firebase.auth().currentUser
            : null;
        var uid = (user && user.uid) || (cu && cu.uid);
        var email = (user && user.email) || (cu && cu.email);
        if (!uid) {
          return Promise.reject(
            new Error("Not signed in for cloud save. Open the dashboard and sign in again.")
          );
        }
        return OJTCloud.addEntry(uid, email, entry);
      }
      return OJTDB.addEntry(entry, user.email);
    }
  };

  global.OJTApp = OJTApp;
})(typeof window !== "undefined" ? window : self);
