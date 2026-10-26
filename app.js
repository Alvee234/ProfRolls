/* SBMCH Student Roll Directory - application logic */
(function () {
  "use strict";

  var cfg = window.SB_CONFIG || {};
  var client = null;
  var session = null;
  var profile = null;
  var UNLOCK_KEY = "sbmch.unlockedBy";
  var el = {};
  var roster = [];
  var loadError = "";

  var IDS = [
    "setup-banner", "alert",
    "auth-view", "login-form", "register-form", "tab-login", "tab-register",
    "goto-register", "goto-login",
    "gate-view", "gate-form", "gate-roll",
    "directory-view", "directory-body", "directory-count", "directory-empty",
    "directory-search",
    "login-roll", "login-session", "reg-name", "class-roll", "prof-roll", "reg-session",
    "header-user", "header-user-name", "logout-btn"
  ];

  document.addEventListener("DOMContentLoaded", function () {
    IDS.forEach(function (id) { el[id] = document.getElementById(id); });
    bind();

    if (!configured()) {
      el["setup-banner"].hidden = false;
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showAlert("Could not load the Supabase library. Check your internet connection and reload.", "error");
      return;
    }
    try {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } catch (err) {
      showAlert("Supabase configuration is invalid: " + message(err), "error");
      return;
    }
    boot();
  });

  /* ------------------------------------------------------------------ setup */

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) &&
      cfg.SUPABASE_URL.indexOf("YOUR-") === -1 &&
      cfg.SUPABASE_ANON_KEY.indexOf("YOUR-") === -1;
  }

  // Every action needs a working Supabase client; before setup there is none.
  function notReady() {
    if (client) return false;
    showAlert("Setup required: add your Supabase project URL and anon key to config.js (see README.md).", "info");
    return true;
  }

  function bind() {
    el["tab-login"].addEventListener("click", function () { switchTab("login"); });
    el["tab-register"].addEventListener("click", function () { switchTab("register"); });
    el["goto-register"].addEventListener("click", function () { switchTab("register"); });
    el["goto-login"].addEventListener("click", function () { switchTab("login"); });

    el["login-form"].addEventListener("submit", onLogin);
    el["register-form"].addEventListener("submit", onRegister);
    el["gate-form"].addEventListener("submit", onGate);
    el["logout-btn"].addEventListener("click", onLogout);
    el["directory-search"].addEventListener("input", render);
  }

  function switchTab(which) {
    var login = which === "login";
    el["login-form"].hidden = !login;
    el["register-form"].hidden = login;
    el["tab-login"].classList.toggle("is-active", login);
    el["tab-register"].classList.toggle("is-active", !login);
    el["tab-login"].setAttribute("aria-selected", String(login));
    el["tab-register"].setAttribute("aria-selected", String(!login));
    showAlert("");
  }

  /* -------------------------------------------------------------- auth flow */

  async function boot() {
    try {
      var res = await client.auth.getSession();
      session = res.data.session;
    } catch (err) {
      session = null;
    }
    if (session) {
      await enterSession();
    } else {
      toAuth();
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    var form = event.target;
    var roll = value("login-roll");
    var chosenSession = value("login-session");
    if (notReady()) return;
    if (!roll || !chosenSession) {
      showAlert("Please fill in every field, including your session.", "error");
      return;
    }

    setBusy(form, true);
    showAlert("");
    try {
      var res = await client.auth.signInWithPassword({
        email: await emailForRoll(roll, chosenSession),
        password: cfg.SHARED_PASSPHRASE
      });
      if (res.error) throw res.error;
      session = res.data.session;

      // The session chosen at login must be the one the roll was registered for.
      await loadProfile();
      if (profile && profile.session && norm(profile.session) !== norm(chosenSession)) {
        var stored = profile.session;
        await client.auth.signOut().catch(function () {});
        session = null;
        profile = null;
        showAlert(
          "That prof roll number is registered for session " + stored +
          ", not " + chosenSession + ". Pick session " + stored + " and try again.",
          "error"
        );
        return;
      }

      unlockState("");
      await enterSession();
    } catch (err) {
      showAlert(loginMessage(err), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function onRegister(event) {
    event.preventDefault();
    var form = event.target;
    var fullName = value("reg-name");
    var classRoll = value("class-roll");
    var profRoll = value("prof-roll");
    var studentSession = value("reg-session");
    if (notReady()) return;
    if (!fullName || !classRoll || !profRoll || !studentSession) {
      showAlert("Please fill in every field, including your session.", "error");
      return;
    }

    setBusy(form, true);
    showAlert("");
    try {
      var signUp = await client.auth.signUp({
        email: await emailForRoll(profRoll, studentSession),
        password: cfg.SHARED_PASSPHRASE,
        options: { data: { full_name: fullName } }
      });
      if (signUp.error) throw signUp.error;
      if (!signUp.data.session) {
        var identities = signUp.data.user && signUp.data.user.identities;
        if (identities && identities.length === 0) {
          throw new Error("That prof roll number is already registered for this session. Use Log in instead.");
        }
        throw new Error(
          "Supabase did not sign you in. Either that prof roll number is already registered, " +
          "or email confirmation is still on: Authentication -> Providers -> Email -> turn off " +
          "\"Confirm email\", then try Log in."
        );
      }

      session = signUp.data.session;
      var saved = await client.from(cfg.TABLE).insert({
        user_id: session.user.id,
        full_name: fullName,
        class_roll: classRoll,
        prof_roll: profRoll,
        session: studentSession
      });
      if (saved.error) {
        await client.auth.signOut().catch(function () {});
        session = null;
        throw saved.error;
      }

      unlockState("");
      await enterSession();
    } catch (err) {
      showAlert(registerMessage(err), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function onLogout() {
    try { await client.auth.signOut(); } catch (err) { /* ignore */ }
    session = null;
    profile = null;
    unlockState("");
    toAuth();
  }

  async function enterSession() {
    showAlert("");
    el["directory-search"].value = "";
    show("gate");
    el["header-user"].hidden = false;
    el["header-user-name"].textContent = "Loading\u2026";

    await loadProfile();

    el["header-user-name"].textContent = profile ? profile.full_name : "SBMCH student";

    if (unlockState() === session.user.id) {
      await openDirectory();
    } else {
      el["gate-form"].reset();
      el["gate-roll"].focus();
    }
  }

  // Loads the signed-in student's own row (name, rolls and session).
  async function loadProfile() {
    try {
      var res = await client
        .from(cfg.TABLE)
        .select("full_name,class_roll,prof_roll,session")
        .eq("user_id", session.user.id)
        .maybeSingle();
      profile = res.error ? null : res.data;
    } catch (err) {
      profile = null;
    }
    return profile;
  }

  function toAuth() {
    show("auth");
    el["header-user"].hidden = true;
    el["header-user-name"].textContent = "";
    el["login-form"].reset();
    el["register-form"].reset();
    switchTab("login");
    showAlert("");
  }

  /* ----------------------------------------------------------- prof roll gate */

  async function onGate(event) {
    event.preventDefault();
    var form = event.target;
    var roll = value("gate-roll");
    if (!roll || notReady()) return;

    setBusy(form, true);
    showAlert("");
    try {
      if (!profile) {
        showAlert("We could not load your student record. Reload the page, or register again.", "error");
        return;
      }
      if (norm(roll) !== norm(profile.class_roll)) {
        showAlert("That does not match the class roll number you registered with.", "error");
        el["gate-roll"].select();
        return;
      }
      unlockState(session.user.id);
      await openDirectory();
    } catch (err) {
      showAlert(message(err), "error");
    } finally {
      setBusy(form, false);
    }
  }

  async function openDirectory() {
    var res;
    try {
      res = await client
        .from(cfg.TABLE)
        .select("prof_roll,full_name,class_roll,session")
        .order("prof_roll", { ascending: true });
    } catch (err) {
      renderError(message(err));
      show("directory");
      return;
    }

    if (res.error) {
      if (res.error.code === "PGRST301" || /jwt|token/i.test(res.error.message || "")) {
        showAlert("Your session has expired. Please log in again.", "info");
        await onLogout();
        return;
      }
      renderError(message(res.error));
      show("directory");
      return;
    }

    // Students only ever see the roll list of their own session.
    var mine = profile ? norm(profile.session) : "";
    roster = (res.data || []).filter(function (row) {
      return norm(row.session) === mine;
    });
    loadError = "";
    render();
    show("directory");
  }

  /* ----------------------------------------------------------------- rendering */

  function show(view) {
    el["auth-view"].hidden = view !== "auth";
    el["gate-view"].hidden = view !== "gate";
    el["directory-view"].hidden = view !== "directory";
    if (view === "auth") el["header-user"].hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    if (loadError) { renderError(loadError); return; }

    var term = norm(el["directory-search"].value);
    var rows = roster.filter(function (row) {
      if (!term) return true;
      return norm(row.prof_roll).indexOf(term) !== -1 || norm(row.full_name).indexOf(term) !== -1;
    });

    var body = el["directory-body"];
    body.textContent = "";

    rows.forEach(function (row, index) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(String(index + 1), "num"));
      tr.appendChild(cell(row.prof_roll || "-", "roll"));
      tr.appendChild(cell(row.full_name || "-"));
      tr.appendChild(cell(row.class_roll || "-"));
      body.appendChild(tr);
    });

    var scope = profile && profile.session ? "Session " + profile.session + " \u00b7 " : "";
    el["directory-count"].textContent = scope + (term
      ? rows.length + " of " + roster.length + " students shown"
      : roster.length + (roster.length === 1 ? " student registered" : " students registered"));

    if (rows.length === 0) {
      el["directory-empty"].hidden = false;
      el["directory-empty"].textContent = roster.length === 0
        ? "No students have registered yet."
        : "No student matches \u201c" + el["directory-search"].value.trim() + "\u201d.";
    } else {
      el["directory-empty"].hidden = true;
      el["directory-empty"].textContent = "";
    }
  }

  function renderError(text) {
    el["directory-body"].textContent = "";
    el["directory-count"].textContent = "";
    el["directory-empty"].hidden = false;
    el["directory-empty"].textContent = "Could not load the directory: " + text;
  }

  function cell(text, className) {
    var td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  /* -------------------------------------------------------------- small utils */

  function value(id) {
    return String(el[id].value || "").replace(/\s+/g, " ").trim();
  }

  function norm(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function message(err) {
    if (!err) return "Something went wrong.";
    if (typeof err === "string") return err;
    return err.message || String(err);
  }

  function loginMessage(err) {
    var text = message(err);
    if (/invalid login credentials/i.test(text)) {
      return "No account is registered with that prof roll number for that session. " +
        "Check the session you picked, or register first.";
    }
    if (/rate limit|too many/i.test(text)) {
      return "Too many attempts. Please wait a minute and try again.";
    }
    return "Could not log in: " + text;
  }

  function registerMessage(err) {
    var text = message(err);
    if (err && err.code === "23505" || /duplicate key/i.test(text)) {
      return "That prof roll number is already registered for this session. " +
        "Use Log in instead, or ask your classmate to correct it.";
    }
    if (/already registered|user_already_exists/i.test(text)) {
      return "An account already exists for that prof roll number in this session. Use Log in instead.";
    }
    if (/password/i.test(text)) return "Could not create the account: " + text;
    return "Could not create the account: " + text;
  }

  function showAlert(text, kind) {
    var box = el["alert"];
    if (!text) {
      box.hidden = true;
      box.textContent = "";
      box.classList.remove("is-ok", "is-info");
      return;
    }
    box.textContent = text;
    box.hidden = false;
    box.classList.toggle("is-ok", kind === "ok");
    box.classList.toggle("is-info", kind === "info");
  }

  function setBusy(form, busy) {
    var buttons = form.querySelectorAll("button");
    Array.prototype.forEach.call(buttons, function (btn) {
      if (busy) {
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.disabled = true;
        if (btn.type === "submit") btn.textContent = "Please wait\u2026";
      } else {
        btn.disabled = false;
        if (btn.dataset.label) btn.textContent = btn.dataset.label;
      }
    });
  }

  function unlockState(value) {
    try {
      if (value === "") { sessionStorage.removeItem(UNLOCK_KEY); return ""; }
      if (value === undefined) return sessionStorage.getItem(UNLOCK_KEY) || "";
      sessionStorage.setItem(UNLOCK_KEY, value);
      return value;
    } catch (err) {
      return "";
    }
  }

  /* ----------------------------------------------- identity derived from roll */

  // The account email is derived from the prof roll number TOGETHER WITH the
  // session, so the same roll number may be registered once per session while
  // each student still logs in with their roll number and session alone. Two
  // hash functions are combined for a stable 64-bit value that works
  // identically in every browser.
  function stableHex(str) {
    var fnv = 0x811c9dc5;
    var djb = 5381;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0;
      djb = (Math.imul(djb, 33) + c) >>> 0;
    }
    return hex(fnv) + hex(djb);
  }

  function hex(n) {
    return ("00000000" + n.toString(16)).slice(-8);
  }

  function emailForRoll(roll, session) {
    var r = String(roll || "").replace(/\s+/g, " ").trim().toLowerCase();
    var s = String(session || "").replace(/\s+/g, " ").trim().toLowerCase();
    return stableHex(r + "|" + s) + "@" + (cfg.EMAIL_DOMAIN || "sbmch.students");
  }
})();
