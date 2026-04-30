(function () {
  const API_URL = "https://script.google.com/macros/s/AKfycbywQbvGc9H_MOb8pbCbC1C-rWNT3MFwgcvkr13JN0P92bNi5n7ta8_s0WHrYjzo0QXQdw/exec";
  const DISPLAY_NAME_KEY = "hitbit_display_name";
  const PLAYER_ID_KEY = "hitbit_player_id";
  const NAME_PATTERN = /^[a-zA-Z0-9_-]{3,10}$/;
  const leaderboards = [
    { id: "stack", label: "HitBit Stack" },
    { id: "orbfall", label: "Orb-Fall" },
    { id: "strafe", label: "HitBit Strafe" },
    { id: "memory", label: "HitBit Memory" },
    { id: "timing", label: "Timing Challenge" }
  ];

  const state = {
    currentGame: null,
    sessionTokens: {},
    sessionPromises: {},
    profile: null,
    profanityModulePromise: null
  };

  function ensureProfile() {
    let displayName = localStorage.getItem(DISPLAY_NAME_KEY);
    let playerId = localStorage.getItem(PLAYER_ID_KEY);

    if (!displayName || !isValidNameFormat(displayName)) {
      displayName = createDefaultName();
      localStorage.setItem(DISPLAY_NAME_KEY, displayName);
    }

    if (!playerId) {
      playerId = createUuid();
      localStorage.setItem(PLAYER_ID_KEY, playerId);
    }

    state.profile = { displayName, playerId };
    return state.profile;
  }

  function createDefaultName() {
    const number = Math.floor(1000 + Math.random() * 9000);
    return `player${number}`;
  }

  function createUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      const value = char === "x" ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function sanitizeName(name) {
    return String(name || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 10);
  }

  function isValidNameFormat(name) {
    return NAME_PATTERN.test(name);
  }

  function collapseRepeatedLetters(value) {
    return String(value || "").replace(/([a-z])\1+/gi, "$1");
  }

  function normalizeNameForProfanity(name) {
    const stripped = String(name || "")
      .toLowerCase()
      .replace(/[_-]+/g, "")
      .replace(/[^a-z0-9]/g, "");

    return collapseRepeatedLetters(stripped);
  }

  function loadProfanityModule() {
    if (!state.profanityModulePromise) {
      state.profanityModulePromise = import("https://cdn.skypack.dev/leo-profanity");
    }

    return state.profanityModulePromise;
  }

  async function isBlockedName(name) {
    try {
      const module = await loadProfanityModule();
      if (!module || typeof module.check !== "function") return false;
      const normalized = normalizeNameForProfanity(name);
      return module.check(name) || module.check(normalized);
    } catch (error) {
      return false;
    }
  }

  function init() {
    const body = document.body;
    if (!body || body.dataset.hitbitReady === "true") return;

    body.dataset.hitbitReady = "true";
    body.classList.add("hb-with-toolbar");
    state.currentGame = body.dataset.hitbitGame || "";
    ensureProfile();
    injectToolbar();
    injectProfileModal();
    injectLeaderboardModal();
    removeLegacyButtons();
  }

  function injectToolbar() {
    const isHome = document.body.dataset.hitbitPage === "home";
    const homeHref = isHome ? "index.html" : "../../index.html";
    const logoSrc = isHome ? "favicon.ico?v=3" : "../../favicon.ico?v=3";
    const toolbar = document.createElement("div");
    toolbar.className = "hb-toolbar";
    toolbar.innerHTML = `
      <div class="hb-toolbar-inner">
        <a class="hb-brand" href="${homeHref}">
          <img src="${logoSrc}" alt="HitBit logo">
          <span>HitBit</span>
        </a>
        <div class="hb-toolbar-actions">
          <button type="button" class="hb-toolbar-btn" id="hbLeaderboardsBtn">Leaderboards</button>
          <button type="button" class="hb-toolbar-btn" id="hbProfileBtn">Profile</button>
        </div>
      </div>
    `;

    document.body.prepend(toolbar);

    document.getElementById("hbLeaderboardsBtn").addEventListener("click", () => {
      openLeaderboardModal(state.currentGame || "stack");
    });

    document.getElementById("hbProfileBtn").addEventListener("click", openProfileModal);
  }

  function injectProfileModal() {
    const modal = document.createElement("div");
    modal.className = "hb-modal-backdrop";
    modal.id = "hbProfileModal";
    modal.innerHTML = `
      <div class="hb-modal">
        <div class="hb-modal-top">
          <h2>Profile</h2>
          <button type="button" class="hb-close" data-close="profile">x</button>
        </div>
        <p class="hb-profile-copy">Your name is saved on this device. Use 3 to 10 letters, numbers, - or _.</p>
        <div class="hb-profile-row">
          <label for="hbDisplayNameInput">Display name</label>
          <input id="hbDisplayNameInput" class="hb-input" type="text" maxlength="10">
        </div>
        <button type="button" class="hb-save" id="hbSaveProfileBtn">Save Name</button>
        <div class="hb-feedback" id="hbProfileFeedback"></div>
        <div class="hb-profile-meta" id="hbProfileMeta"></div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeProfileModal();
    });

    modal.querySelector("[data-close='profile']").addEventListener("click", closeProfileModal);
    document.getElementById("hbSaveProfileBtn").addEventListener("click", () => {
      void saveProfileName();
    });
  }

  function injectLeaderboardModal() {
    const tabs = leaderboards.map((game) => (
      `<button type="button" class="hb-game-tab" data-game="${game.id}">${game.label}</button>`
    )).join("");

    const modal = document.createElement("div");
    modal.className = "hb-modal-backdrop";
    modal.id = "hbLeaderboardModal";
    modal.innerHTML = `
      <div class="hb-modal hb-modal-wide">
        <div class="hb-modal-top">
          <h2>Leaderboards</h2>
          <button type="button" class="hb-close" data-close="leaderboard">x</button>
        </div>
        <div class="hb-game-tabs">${tabs}</div>
        <p class="hb-leaderboard-note" id="hbLeaderboardNote">Loading leaderboard...</p>
        <table class="hb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody id="hbLeaderboardBody"></tbody>
        </table>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeLeaderboardModal();
    });

    modal.querySelector("[data-close='leaderboard']").addEventListener("click", closeLeaderboardModal);
    modal.querySelectorAll(".hb-game-tab").forEach((tab) => {
      tab.addEventListener("click", () => openLeaderboardModal(tab.dataset.game));
    });
  }

  function removeLegacyButtons() {
    const raw = document.body.dataset.hitbitRemove || "";
    if (!raw) return;

    raw.split("|").map((selector) => selector.trim()).filter(Boolean).forEach((selector) => {
      const node = document.querySelector(selector);
      if (node) node.remove();
    });
  }

  function openProfileModal() {
    ensureProfile();
    const modal = document.getElementById("hbProfileModal");
    const input = document.getElementById("hbDisplayNameInput");
    const meta = document.getElementById("hbProfileMeta");
    const feedback = document.getElementById("hbProfileFeedback");

    input.value = state.profile.displayName;
    meta.textContent = `Current name: ${state.profile.displayName}`;
    feedback.textContent = "";
    modal.classList.add("open");
  }

  function closeProfileModal() {
    document.getElementById("hbProfileModal").classList.remove("open");
  }

  async function saveProfileName() {
    const input = document.getElementById("hbDisplayNameInput");
    const feedback = document.getElementById("hbProfileFeedback");
    const nextName = sanitizeName(input.value);

    if (!isValidNameFormat(nextName)) {
      feedback.textContent = "Use 3 to 10 letters, numbers, - or _.";
      return;
    }

    if (await isBlockedName(nextName)) {
      feedback.textContent = "That name isn't allowed.";
      return;
    }

    localStorage.setItem(DISPLAY_NAME_KEY, nextName);
    state.profile.displayName = nextName;
    document.getElementById("hbProfileMeta").textContent = `Current name: ${nextName}`;
    feedback.textContent = "Name saved.";
  }

  function openLeaderboardModal(gameId) {
    const modal = document.getElementById("hbLeaderboardModal");
    modal.classList.add("open");

    const selected = leaderboards.some((game) => game.id === gameId) ? gameId : "stack";
    modal.querySelectorAll(".hb-game-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.game === selected);
    });

    fetchLeaderboard(selected);
  }

  function closeLeaderboardModal() {
    document.getElementById("hbLeaderboardModal").classList.remove("open");
  }

  async function fetchLeaderboard(gameId) {
    const note = document.getElementById("hbLeaderboardNote");
    const body = document.getElementById("hbLeaderboardBody");
    body.innerHTML = "";
    note.textContent = "Loading leaderboard...";

    try {
      const url = `${API_URL}?action=leaderboard&game=${encodeURIComponent(gameId)}&limit=10`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok) {
        note.textContent = data.error || "Could not load leaderboard.";
        return;
      }

      if (!Array.isArray(data.leaderboard) || data.leaderboard.length === 0) {
        note.textContent = "No scores yet.";
        return;
      }

      if (data.leaderboard.length === 0) {
        note.textContent = "No scores yet.";
        return;
      }

      note.textContent = "";
      data.leaderboard.forEach((entry, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${index + 1}</td>
          <td>${entry.display_name}</td>
          <td>${entry.score}</td>
        `;
        body.appendChild(row);
      });
    } catch (error) {
      note.textContent = "Could not load leaderboard.";
    }
  }

  async function startSession(game) {
    ensureProfile();
    state.sessionPromises[game] = (async () => {
      try {
      const url = `${API_URL}?action=start_session&player_id=${encodeURIComponent(state.profile.playerId)}&game=${encodeURIComponent(game)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok || !data.session_token) return "";
      state.sessionTokens[game] = data.session_token;
      return data.session_token;
      } catch (error) {
        return "";
      }
    })();

    return state.sessionPromises[game];
  }

  async function resolveSessionToken(game, explicitToken) {
    if (explicitToken) return explicitToken;
    if (state.sessionTokens[game]) return state.sessionTokens[game];
    if (state.sessionPromises[game]) return state.sessionPromises[game];
    return "";
  }

  async function submitScore(payload) {
    ensureProfile();
    const game = payload.game;
    const sessionToken = await resolveSessionToken(game, payload.sessionToken);

    if (!game || !sessionToken) {
      return { ok: false, error: "Missing game or session token" };
    }

    try {
      const requestBody = JSON.stringify({
        player_id: state.profile.playerId,
        display_name: state.profile.displayName,
        game,
        score: payload.score,
        session_token: sessionToken,
        stats: payload.stats || {}
      });

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: requestBody
      });

      const data = await response.json();
      const tokenWasConsumed = data && (
        data.ok ||
        data.suspicious === true ||
        data.reason === "Session token already used"
      );

      if (tokenWasConsumed) {
        delete state.sessionTokens[game];
        delete state.sessionPromises[game];
      }
      return data;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  window.HitBitGlobal = {
    init,
    getProfile: () => ({ ...ensureProfile() }),
    openProfile: openProfileModal,
    openLeaderboards: (gameId) => openLeaderboardModal(gameId),
    startSession,
    submitScore,
    apiUrl: API_URL
  };

  document.addEventListener("DOMContentLoaded", init);
})();
