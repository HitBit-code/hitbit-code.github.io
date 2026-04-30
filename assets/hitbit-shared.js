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

  const GAME_META = {
    stack:          { label: "HitBit Stack",      icon: "📦", scoreKey: "hitbit_stack_highscore",   unit: "ft",  histKey: null },
    orbfall:        { label: "Orb-Fall",           icon: "🔮", scoreKey: "orbFallHighscore",          unit: "pts", histKey: "orbFallScores" },
    strafe:         { label: "HitBit Strafe",      icon: "🎯", scoreKey: "hitbit_strafe_highscore",  unit: "pts", histKey: null },
    memory:         { label: "HitBit Memory",      icon: "🧠", scoreKey: "hitbit_memory_highscore",  unit: "pts", histKey: null },
    timing:         { label: "Timing Challenge",   icon: "⏱️", scoreKey: "hitbit_timing_highscore",  unit: "pts", histKey: null },
    visualreaction: { label: "Visual Reaction",    icon: "⚡", scoreKey: "hitbit_reaction_best",     unit: "ms",  histKey: null }
  };

  const RANKS = [
    { min: 200, label: "Mythic",  color: "#ff44aa" },
    { min: 100, label: "Diamond", color: "#44ddff" },
    { min:  50, label: "Gold",    color: "#ffd700" },
    { min:  20, label: "Silver",  color: "#c0c0c0" },
    { min:   5, label: "Bronze",  color: "#cd7f32" },
    { min:   0, label: "Rookie",  color: "#9fb1a5" }
  ];

  function getRank(totalGames) {
    return RANKS.find(r => totalGames >= r.min) || RANKS[RANKS.length - 1];
  }

  function getNextRank(totalGames) {
    const idx = RANKS.findIndex(r => totalGames >= r.min);
    return idx > 0 ? RANKS[idx - 1] : null;
  }

  function getProfileStats() {
    const bests = [];
    let totalGames = 0;

    for (const [id, meta] of Object.entries(GAME_META)) {
      const val = localStorage.getItem(meta.scoreKey);
      const hist = meta.histKey ? JSON.parse(localStorage.getItem(meta.histKey) || "[]") : [];
      totalGames += hist.length;
      if (val !== null && val !== "") {
        bests.push({ id, label: meta.label, icon: meta.icon, unit: meta.unit, best: val, plays: hist.length });
      }
    }

    return { bests, totalGames };
  }

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
    return String(name || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10);
  }

  function isValidNameFormat(name) {
    return NAME_PATTERN.test(name);
  }

  function collapseRepeatedLetters(value) {
    return String(value || "").replace(/([a-z])\1+/gi, "$1");
  }

  function normalizeNameForProfanity(name) {
    const stripped = String(name || "").toLowerCase().replace(/[_-]+/g, "").replace(/[^a-z0-9]/g, "");
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
      <div class="hb-modal hb-modal-wide" style="max-width:500px;">
        <div class="hb-modal-top">
          <h2>Profile</h2>
          <button type="button" class="hb-close" data-close="profile">✕</button>
        </div>

        <!-- Player card -->
        <div id="hbPlayerCard" style="
          display:flex; align-items:center; gap:16px;
          padding:14px 16px; border-radius:14px;
          background:rgba(0,255,136,0.05);
          border:1px solid rgba(0,255,136,0.14);
          margin-bottom:6px;
        ">
          <div id="hbAvatar" style="
            width:54px; height:54px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            font-size:20px; font-weight:800; flex-shrink:0;
            border:2px solid var(--hb-accent);
            background:rgba(0,255,136,0.1);
            color:var(--hb-accent);
          "></div>
          <div style="flex:1; min-width:0;">
            <div id="hbCardName" style="font-size:1.15rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div id="hbCardGames" style="font-size:1.5rem; font-weight:800; color:var(--hb-accent); line-height:1;"></div>
            <div style="font-size:0.75rem; color:var(--hb-text-dim); margin-top:2px;">games played</div>
          </div>
        </div>

        <!-- Personal bests -->
        <div id="hbPersonalBests" style="margin-bottom:14px;"></div>

        <!-- Name editor -->
        <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:14px;">
          <div style="font-size:0.78rem; font-weight:700; color:var(--hb-text-dim); letter-spacing:0.07em; text-transform:uppercase; margin-bottom:8px;">Change Display Name</div>
          <div style="display:flex; gap:8px;">
            <input id="hbDisplayNameInput" class="hb-input" type="text" maxlength="10" placeholder="3–10 chars" style="flex:1;">
            <button type="button" class="hb-save" id="hbSaveProfileBtn" style="padding:0 16px; white-space:nowrap;">Save</button>
          </div>
          <div class="hb-feedback" id="hbProfileFeedback" style="margin-top:8px; min-height:18px;"></div>
        </div>
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

  function renderProfileModal() {
    ensureProfile();
    const { bests, totalGames } = getProfileStats();
    const name = state.profile.displayName;
    const initials = name.slice(0, 2).toUpperCase();

    // Avatar
    document.getElementById("hbAvatar").textContent = initials;

    // Name
    document.getElementById("hbCardName").textContent = name;

    // Games played
    document.getElementById("hbCardGames").textContent = totalGames;

    // Personal bests
    const pbEl = document.getElementById("hbPersonalBests");
    if (bests.length === 0) {
      pbEl.innerHTML = `<p style="color:var(--hb-text-dim); font-size:0.9rem; margin:8px 0;">Play some games to see your personal bests here!</p>`;
    } else {
      const label = `<div style="font-size:0.78rem; font-weight:700; color:var(--hb-text-dim); letter-spacing:0.07em; text-transform:uppercase; margin-bottom:8px;">Personal Bests</div>`;
      const grid = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:8px;">
        ${bests.map(b => `
          <div style="
            padding:10px 12px; border-radius:12px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.07);
          ">
            <div style="font-size:1rem; margin-bottom:4px;">${b.icon} <span style="font-size:0.8rem; color:var(--hb-text-dim);">${b.label}</span></div>
            <div style="font-size:1.25rem; font-weight:800; color:var(--hb-accent);">${b.best}<span style="font-size:0.75rem; font-weight:400; color:var(--hb-text-dim); margin-left:2px;">${b.unit}</span></div>
          </div>
        `).join("")}
      </div>`;
      pbEl.innerHTML = label + grid;
    }
  }

  function openProfileModal() {
    const modal = document.getElementById("hbProfileModal");
    renderProfileModal();
    document.getElementById("hbDisplayNameInput").value = state.profile.displayName;
    document.getElementById("hbProfileFeedback").textContent = "";
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
    feedback.textContent = "Name saved!";
    renderProfileModal();
    document.getElementById("hbDisplayNameInput").value = nextName;
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
        headers: { "Content-Type": "text/plain;charset=utf-8" },
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
