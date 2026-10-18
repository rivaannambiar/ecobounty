
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js";

// =====================================================
// 1. FIREBASE CONFIGURATION
// Keep your existing project's real values.
// =====================================================

const firebaseConfig = {
  apiKey: "AIzaSyDh-YSzgA5HvRIHHHpxkDgul1A1hPCxPOw",
  authDomain: "ecobounty-6db82.firebaseapp.com",
  projectId: "ecobounty-6db82",
  storageBucket: "ecobounty-6db82.firebasestorage.app",
  messagingSenderId: "946446535936",
  databaseURL: "https://ecobounty-6db82-default-rtdb.firebaseio.com",
  appId: "1:946446535936:web:2aaa34f46b887da613b7e5"
};

// =====================================================
// 2. DOM ELEMENTS
// =====================================================

const $ = (selector) => document.querySelector(selector);

const ui = {
  connectionText: $("#connectionText"),
  connectionDot: $("#connectionDot"),
  pointsValue: $("#pointsValue"),
  scansValue: $("#scansValue"),
  recyclableValue: $("#recyclableValue"),
  levelValue: $("#levelValue"),
  nextLevelCaption: $("#nextLevelCaption"),
  greetingName: $("#greetingName"),
  avatarBadge: $("#avatarBadge"),
  profileAvatar: $("#profileAvatar"),
  displayNameInput: $("#displayNameInput"),
  saveNameBtn: $("#saveNameBtn"),
  uidText: $("#uidText"),
  copyUidBtn: $("#copyUidBtn"),
  historyList: $("#historyList"),
  historyCount: $("#historyCount"),
  leaderboardList: $("#leaderboardList"),
  levelProgressText: $("#levelProgressText"),
  levelProgress: $("#levelProgress"),
  nextLevelName: $("#nextLevelName"),
  currentLevelName: $("#currentLevelName"),
  progressPercent: $("#progressPercent"),
  claimForm: $("#claimForm"),
  claimCodeInput: $("#claimCodeInput"),
  claimButton: $("#claimButton"),
  claimStatus: $("#claimStatus"),
  claimQueue: $("#claimQueue"),
  toast: $("#toast"),
  authGate: $("#authGate"),
authForm: $("#authForm"),
authEmail: $("#authEmail"),
authPassword: $("#authPassword"),
authTitle: $("#authTitle"),
authDescription: $("#authDescription"),
authSubmit: $("#authSubmit"),
authStatus: $("#authStatus"),
authModeToggle: $("#authModeToggle"),
authForgotBtn: $("#authForgotBtn"),
kioskAccessForm: $("#kioskAccessForm"),
kioskNumberInput: $("#kioskNumberInput"),
kioskAccessButton: $("#kioskAccessButton"),
kioskCodesStatus: $("#kioskCodesStatus"),
kioskCodesBadge: $("#kioskCodesBadge"),
kioskCodesUnlocked: $("#kioskCodesUnlocked"),
kioskLatestCode: $("#kioskLatestCode"),
kioskCodesList: $("#kioskCodesList"),
};

const requiredElements = [
  "connectionText",
  "connectionDot",
  "pointsValue",
  "claimForm",
  "claimCodeInput",
  "claimButton",
  "claimStatus",
  "claimQueue"
];

for (const name of requiredElements) {
  if (!ui[name]) {
    console.error(
      `[EcoBounty] Missing HTML element for ui.${name}`
    );
  }
}

// =====================================================
// 3. APP STATE
// =====================================================

let app;
let auth;
let db;

let currentUid = null;
let activeUid = null;
let signingIn = false;

let stopListeners = [];
let toastTimer = null;
let dashboardRefreshVersion = 0;

let authMode = "login";

const levels = [
  { name: "Sprout", min: 0 },
  { name: "Recycler", min: 100 },
  { name: "Green Guardian", min: 300 },
  { name: "Planet Hero", min: 700 },
  { name: "Earth Legend", min: 1500 }
];

// =====================================================
// 4. UI UTILITIES
// =====================================================

function setConnection(text, mode = "loading") {
  ui.connectionText.textContent = text;
  ui.connectionDot.className = "status-dot " + mode;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    ui.toast.classList.remove("visible");
  }, 3200);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function numberFormat(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(0, number).toLocaleString()
    : "0";
}

function friendlyError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "");

  if (
    code.includes("permission-denied") ||
    message.toUpperCase().includes("PERMISSION_DENIED")
  ) {
    return "Firebase denied access. Check your published Database Rules.";
  }

  if (
    code.includes("network-request-failed") ||
    message.toLowerCase().includes("network")
  ) {
    return "Network error. Check your internet connection.";
  }

  if (code.includes("operation-not-allowed")) {
    return "Enable Anonymous sign-in in Firebase Authentication.";
  }

  if (code.includes("invalid-api-key")) {
    return "Check the Firebase API key in app.js.";
  }

  if (code.includes("app-check")) {
    return "Firebase App Check needs additional configuration.";
  }

  return message || "Something went wrong.";
}

function setButtonsEnabled(enabled) {
  ui.saveNameBtn.disabled = !enabled;
  ui.copyUidBtn.disabled = !enabled;
  ui.claimButton.disabled = !enabled;
  ui.displayNameInput.disabled = !enabled;
  ui.claimCodeInput.disabled = !enabled;
}

// =====================================================
// 5. PROFILE
// =====================================================

function updateNameUI(name) {
  const safeName = String(name || "EcoRanger").trim();

  ui.greetingName.textContent = safeName;

  const initial = safeName.charAt(0).toUpperCase() || "E";

  ui.avatarBadge.textContent = initial;
  ui.profileAvatar.textContent = initial;

  if (document.activeElement !== ui.displayNameInput) {
    ui.displayNameInput.value = safeName;
  }
}

async function initializeProfile(user) {
  const profileRef = ref(
    db,
    `profiles/${user.uid}/displayName`
  );

  try {
    const existing = await get(profileRef);

    if (!existing.exists()) {
      const defaultName =
        `EcoRanger-${user.uid.slice(0, 5).toUpperCase()}`;

      await set(profileRef, defaultName);
    }

    const unsubscribe = onValue(
      profileRef,
      (snapshot) => {
        const name = snapshot.val();

        updateNameUI(
          typeof name === "string" && name.trim()
            ? name
            : "EcoRanger"
        );
      },
      (error) => {
        console.error("Profile listener:", error);
        showToast(friendlyError(error));
      }
    );

    stopListeners.push(unsubscribe);
  } catch (error) {
    console.error("Profile initialization:", error);
    showToast(friendlyError(error));
  }
}

// =====================================================
// 6. LEVEL PROGRESS
// =====================================================

function updateLevel(points) {
  const score = Math.max(0, Number(points) || 0);

  let index = 0;

  for (let i = 0; i < levels.length; i++) {
    if (score >= levels[i].min) {
      index = i;
    }
  }

  const current = levels[index];
  const next = levels[index + 1] || null;

  ui.levelValue.textContent = current.name;
  ui.currentLevelName.textContent = current.name;

  if (!next) {
    ui.nextLevelName.textContent = "MAX LEVEL";
    ui.levelProgressText.textContent =
      "You've reached the top level!";
    ui.progressPercent.textContent = "100%";
    ui.levelProgress.style.width = "100%";
    ui.nextLevelCaption.textContent = "Earth Legend status";
    return;
  }

  const range = next.min - current.min;
  const progress = score - current.min;
  const percentage = Math.min(
    100,
    Math.round((progress / range) * 100)
  );

  ui.nextLevelName.textContent = next.name;

  ui.levelProgressText.textContent =
    `${numberFormat(progress)} / ${numberFormat(range)} points to next level`;

  ui.progressPercent.textContent = `${percentage}%`;
  ui.levelProgress.style.width = `${percentage}%`;

  ui.nextLevelCaption.textContent =
    `${numberFormat(next.min - score)} points to ${next.name}`;
}

// =====================================================
// 7. CATEGORY AND STATUS HELPERS
// =====================================================

function categoryEmoji(category) {
  const value = String(category || "").toLowerCase();

  if (value.includes("plastic")) return "♻️";
  if (value.includes("paper")) return "📄";
  if (value.includes("metal")) return "🥫";
  if (value.includes("glass")) return "🫙";
  if (value.includes("e-waste")) return "🔌";
  if (value.includes("organic")) return "🍃";

  return "🌱";
}

function recyclableStatus(record) {
  const value = String(
    record?.recyclable ?? record?.status ?? "UNSURE"
  ).toUpperCase();

  if (value === "YES" || value === "RECYCLABLE") {
    return { text: "Recyclable", css: "yes" };
  }

  if (value === "NO" || value === "NOT RECYCLABLE") {
    return { text: "Not recyclable", css: "no" };
  }

  return { text: "Needs review", css: "unsure" };
}

function formatDate(value) {
  const date = new Date(Number(value));

  if (!Number.isFinite(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// =====================================================
// 8. REDEMPTION POINT CALCULATOR
//
// The stored claim record is subject to Database Rules.
// This function does not accept arbitrary points from an input.
// =====================================================

function pointsForRedeemedCode(record) {
  if (
    String(record?.recyclable || "").toUpperCase() !== "YES"
  ) {
    return 0;
  }

  const table = {
    plastic: 10,
    paper: 5,
    metal: 15,
    glass: 8,
    "e-waste": 20,
    organic: 3,
    other: 0
  };

  return table[
    String(record?.category || "").toLowerCase()
  ] || 0;
}

// =====================================================
// 9. RENDER REDEMPTION HISTORY AND DASHBOARD
// =====================================================

function renderHistory(history) {
  const rows = Object.values(history || {})
    .sort((a, b) =>
      Number(b.timestamp || 0) - Number(a.timestamp || 0)
    );

  ui.historyCount.textContent =
    `${rows.length} record${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    ui.historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">↻</div>
        <strong>Your story starts here</strong>
        <p>Your redeemed kiosk items will appear here.</p>
      </div>`;
    return;
  }

  ui.historyList.innerHTML = rows.slice(0, 8).map((record) => {
    const name = escapeHTML(
      record.objectName || "Unknown item"
    );

    const category = escapeHTML(record.category || "other");
    const status = recyclableStatus(record);
    const date = escapeHTML(formatDate(record.timestamp));
    const points = Math.max(0, Number(record.points) || 0);

    return `
      <div class="history-row">
        <div class="category-icon">
          ${categoryEmoji(category)}
        </div>

        <div class="history-info">
          <div class="history-name">${name}</div>

          <div class="history-meta">
            <span>${category}</span>
            <span>·</span>
            <span>${date}</span>
            <span class="status-chip ${status.css}">
              ${status.text}
            </span>
          </div>
        </div>

        <div class="history-points">+${numberFormat(points)}</div>
      </div>`;
  }).join("");
}

function renderUserData(data = {}) {
  const points = Math.max(0, Number(data.points) || 0);
  const history = data.history || {};

  ui.pointsValue.textContent = numberFormat(points);
  ui.scansValue.textContent = numberFormat(
    data.totalScans ?? Object.keys(history).length
  );

  const recyclableCount = Object.values(history).filter(
    (record) =>
      String(record.recyclable || "").toUpperCase() === "YES"
  ).length;

  ui.recyclableValue.textContent =
    numberFormat(recyclableCount);

  updateLevel(points);
  renderHistory(history);
}

// =====================================================
// 10. LOAD DASHBOARD FROM VERIFIED REDEMPTIONS
//
// Data structure:
// users/{uid}/redemptions/{claimCode} = true
//
// We load the corresponding claim record and verify that
// Firebase says it was redeemed by the current UID.
// =====================================================

async function refreshDashboardFromRedemptions(uid) {
  if (!db || !uid || uid !== currentUid) {
    return;
  }

  const myVersion = ++dashboardRefreshVersion;

  const receiptsSnapshot = await get(
    ref(db, `users/${uid}/redemptions`)
  );

  const receipts = receiptsSnapshot.val() || {};

  const codes = Object.entries(receipts)
    .filter(([, value]) => value === true)
    .map(([code]) => code);

  const results = await Promise.all(
    codes.map(async (code) => {
      try {
        const snapshot = await get(
          ref(db, `claimCodes/${code}`)
        );

        if (!snapshot.exists()) {
          return null;
        }

        const record = snapshot.val();

        // Never include a code unless the stored record confirms
        // that this account redeemed it.
        if (
          record.status !== "redeemed" ||
          record.redeemedBy !== uid
        ) {
          return null;
        }

        // Publish this verified redemption to the leaderboard.
// A leaderboard sync failure must not break the dashboard.
try {
  await ensureLeaderboardEntry(uid, code, record);
} catch (error) {
  console.warn(
    `Could not sync leaderboard entry for ${code}:`,
    error
  );
}

        const points = pointsForRedeemedCode(record);

        return {
          code,
          objectName: record.objectName || "Unknown item",
          category: record.category || "other",
          recyclable: record.recyclable || "UNSURE",
          confidence: Number(record.confidence) || 0,
          reason: record.reason || "",
          points,
          timestamp: Number(record.redeemedAt || record.issuedAt)
        };
      } catch (error) {
        console.error(
          `Could not read redeemed code ${code}:`,
          error
        );

        return null;
      }
    })
  );

  // If a newer refresh started meanwhile, ignore this older result.
  if (
    myVersion !== dashboardRefreshVersion ||
    uid !== currentUid
  ) {
    return;
  }

  const history = {};
  let totalPoints = 0;

  for (const record of results.filter(Boolean)) {
    history[record.code] = record;
    totalPoints += record.points;
  }

  // This demo's point total is derived from redeemed records;
  // the browser does not write a balance to Firebase.
  renderUserData({
    points: totalPoints,
    totalScans: Object.keys(history).length,
    history
  });

  renderRedeemedCodes(history);
}

// =====================================================
// 11. SHOW RECENT REDEEMED CODES
// =====================================================

function renderRedeemedCodes(history = {}) {
  const rows = Object.values(history)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 4);

  if (!rows.length) {
    ui.claimQueue.innerHTML = "";
    return;
  }

  ui.claimQueue.innerHTML = rows.map((record) => `
    <div class="claim-queue-row">
      <span>
        ${escapeHTML(record.code)}
      </span>
      <span class="status-tag">
        +${numberFormat(record.points)} pts
      </span>
    </div>
  `).join("");
}

// =====================================================
// 12. LEADERBOARD
// The leaderboard is read-only on the client.
// Without a trusted publisher, it may remain empty.
// =====================================================

function renderLeaderboard(entries = {}) {
  const sorted = Object.entries(entries)
    .map(([uid, codeEntries]) => {
      if (
        !codeEntries ||
        typeof codeEntries !== "object"
      ) {
        return null;
      }

      // Each user contains a collection of verified
      // redemption entries, indexed by their claim code.
      const claims = Object.values(codeEntries).filter(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof entry.code === "string" &&
          Number.isFinite(Number(entry.points)) &&
          Number(entry.points) >= 0
      );

      if (!claims.length) return null;

      const points = claims.reduce(
        (total, entry) =>
          total + Number(entry.points),
        0
      );

      const newest = claims.reduce(
        (latest, entry) =>
          Number(entry.issuedAt || 0) >
          Number(latest.issuedAt || 0)
            ? entry
            : latest,
        claims[0]
      );

      return {
        uid,
        displayName: newest.displayName || "EcoRanger",
        points,
        totalScans: claims.length
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points)
    .slice(0, 8);

  if (!sorted.length) {
    ui.leaderboardList.innerHTML = `
      <div class="empty-state small-empty">
        <div class="empty-icon">♜</div>
        <strong>The leaderboard is warming up</strong>
        <p>Redeem a kiosk code to start the rankings.</p>
      </div>`;
    return;
  }

  ui.leaderboardList.innerHTML = sorted.map(
    (entry, index) => {
      const name = escapeHTML(entry.displayName);
      const points = numberFormat(entry.points);
      const scans = numberFormat(entry.totalScans);
      const isMe = entry.uid === currentUid;

      const rank =
        ["🥇", "🥈", "🥉"][index] ||
        String(index + 1);

      return `
        <div class="leader-row ${isMe ? "me" : ""}">
          <div class="rank-number">${rank}</div>

          <div class="leader-avatar">
            ${escapeHTML(name.charAt(0).toUpperCase())}
          </div>

          <div class="leader-info">
            <strong>
              ${name}${isMe ? " (you)" : ""}
            </strong>
            <span>${scans} redeemed items</span>
          </div>

          <div class="leader-score">
            ${points} pts
          </div>
        </div>`;
    }
  ).join("");
}

// =====================================================
// 13. SAVE DISPLAY NAME
// =====================================================

ui.saveNameBtn.addEventListener("click", async () => {
  if (!currentUid || !db) {
    showToast("Wait for Firebase sign-in first.");
    return;
  }

  const name = ui.displayNameInput.value.trim();

  if (name.length < 2 || name.length > 22) {
    showToast("Use a name between 2 and 22 characters.");
    return;
  }

  ui.saveNameBtn.disabled = true;

  try {
    await set(
      ref(db, `profiles/${currentUid}/displayName`),
      name
    );

    updateNameUI(name);
    showToast("Display name saved.");
  } catch (error) {
    console.error("Saving profile:", error);
    showToast(friendlyError(error));
  } finally {
    ui.saveNameBtn.disabled = false;
  }
});

// =====================================================
// 14. COPY FIREBASE UID
// =====================================================

ui.copyUidBtn.addEventListener("click", async () => {
  if (!currentUid) return;

  try {
    await navigator.clipboard.writeText(currentUid);
    showToast("Firebase user ID copied.");
  } catch (error) {
    console.error("Copy UID:", error);
    showToast("Clipboard unavailable in this browser.");
  }
});

// =====================================================
// 15. REDEEM CLAIM CODE
//
// The transaction changes an available code to redeemed.
// Database Rules determine whether that write is allowed.
// A separate receipt prevents the same user redeeming twice.
// =====================================================

ui.claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const user = auth?.currentUser;

  if (!user || !db) {
    showToast("Wait for Firebase sign-in first.");
    return;
  }

  const code = ui.claimCodeInput.value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  const codePattern =
    /^ECO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

  if (!codePattern.test(code)) {
    ui.claimStatus.textContent =
      "Enter a valid code, for example ECO-7ABC-3XYZ.";

    ui.claimStatus.className = "form-status error";
    return;
  }

  ui.claimButton.disabled = true;
  ui.claimStatus.textContent = "Checking claim code…";
  ui.claimStatus.className = "form-status";

  try {
    
const uid = user.uid;

const codeRef = ref(db, `claimCodes/${code}`);
const receiptRef = ref(
  db,
  `users/${uid}/redemptions/${code}`
);

// Check whether this user already has a receipt.
const existingReceipt = await get(receiptRef);

if (existingReceipt.exists()) {
  ui.claimStatus.textContent =
    "You've already redeemed this code.";

  ui.claimStatus.className = "form-status error";
  return;
}

// IMPORTANT: Explicitly fetch the claim record first.
ui.claimStatus.textContent = "Loading claim record...";

const initialSnapshot = await get(codeRef);

if (!initialSnapshot.exists()) {
  throw new Error(
    "Claim code not found. Check that the code matches its Firebase database key."
  );
}

let record = initialSnapshot.val();

console.log("[EcoBounty] Claim precheck:", {
  code,
  status: record.status,
  expiresAt: record.expiresAt,
  currentTime: Date.now(),
  redeemedBy: record.redeemedBy || null
});

// Allow recovery if the code was already redeemed by this
// same user but writing their receipt previously failed.
const alreadyRedeemedByThisUser =
  record.status === "redeemed" &&
  record.redeemedBy === uid;

if (!alreadyRedeemedByThisUser) {
  if (record.status !== "available") {
    throw new Error(
      record.status === "redeemed"
        ? "This code has already been redeemed."
        : `This code is unavailable. Current status: ${record.status || "missing"}.`
    );
  }

  const expiry = Number(record.expiresAt);

  if (!Number.isFinite(expiry)) {
    throw new Error(
      "This claim record has a missing or invalid expiry timestamp."
    );
  }

  if (expiry <= Date.now()) {
    throw new Error("This claim code has expired.");
  }

  // Now transact against the explicitly fetched record.
  const result = await runTransaction(
    codeRef,
    (current) => {
      // The local cache may not have loaded the server record yet.
// Return null so the transaction can reconcile with server data.
if (current === null) {
  return null;
}

// Abort if the actual record is missing or unavailable.
if (!current || current.status !== "available") {
  return;
}

      const currentExpiry = Number(current.expiresAt);

      if (
        !Number.isFinite(currentExpiry) ||
        currentExpiry <= Date.now()
      ) {
        return;
      }

      return {
        ...current,
        status: "redeemed",
        redeemedBy: uid,
        redeemedAt: Date.now()
      };
    },
    { applyLocally: false }
  );

  record = result.snapshot.val();

  const sameUserAlreadyRedeemed =
    record?.status === "redeemed" &&
    record?.redeemedBy === uid;

  if (!result.committed && !sameUserAlreadyRedeemed) {
    console.error(
      "[EcoBounty] Transaction was not committed. Final record:",
      record
    );

    if (!record) {
      throw new Error(
        "The claim transaction returned no record."
      );
    }

    if (
      record.status === "available" &&
      Number(record.expiresAt) <= Date.now()
    ) {
      throw new Error("This claim code has expired.");
    }

    if (record.status === "redeemed") {
      throw new Error(
        "This code has already been redeemed by another account."
      );
    }

    throw new Error(
      `Redemption was not committed. Status: ${record.status || "missing"}.`
    );
  }
}

// Verify the record belongs to this redemption flow.
if (
  !record ||
  record.status !== "redeemed" ||
  record.redeemedBy !== uid
) {
  throw new Error(
    "The claim record could not be verified after redemption."
  );
}

// Create the user's receipt if it does not already exist.
// Database Rules must authorize this specific write.
const receiptAfterTransaction = await get(receiptRef);

if (!receiptAfterTransaction.exists()) {
  await set(receiptRef, true);
}

const points = pointsForRedeemedCode(record);

ui.claimCodeInput.value = "";

ui.claimStatus.textContent =
  `Redeemed successfully! +${points} EcoPoints.`;

ui.claimStatus.className = "form-status success";

showToast(`+${points} EcoPoints redeemed!`);

await refreshDashboardFromRedemptions(uid);


  } catch (error) {
    console.error("Redeem failed:", error);

    ui.claimStatus.textContent = friendlyError(error);
    ui.claimStatus.className = "form-status error";

  } finally {
    ui.claimButton.disabled = false;
  }
});

// =====================================================
// 16. FIREBASE USER SESSION
//
// IMPORTANT FIX:
// Do not read users/{uid} as if it contained {points, history}.
// Listen to users/{uid}/redemptions and derive the dashboard
// from the corresponding redeemed claim-code records.
// =====================================================

async function startUserSession(user) {
  currentUid = user.uid;

  ui.uidText.textContent = user.uid;

  setButtonsEnabled(true);
  setConnection("Firebase connected", "");

  if (activeUid === user.uid) return;

  stopListeners.forEach((unsubscribe) => unsubscribe());
  stopListeners = [];
  activeUid = user.uid;

  await initializeProfile(user);

  // Listen ONLY to the account's redemption receipt keys.
  const redemptionsRef = ref(
    db,
    `users/${user.uid}/redemptions`
  );

  const stopRedemptions = onValue(
    redemptionsRef,
    () => {
      refreshDashboardFromRedemptions(user.uid)
        .catch((error) => {
          console.error("Refreshing dashboard:", error);
          showToast(friendlyError(error));
        });
    },
    (error) => {
      console.error("Redemption listener:", error);
      setConnection("Database access issue", "error");
      showToast(friendlyError(error));
    }
  );

  stopListeners.push(stopRedemptions);

  // Public leaderboard. It will be empty until populated
  // by a trusted publisher.
  const stopLeaderboard = onValue(
    ref(db, "leaderboard"),
    (snapshot) => {
      renderLeaderboard(snapshot.val() || {});
    },
    (error) => {
      console.error("Leaderboard listener:", error);

      ui.leaderboardList.innerHTML = `
        <div class="empty-state small-empty">
          <strong>Leaderboard unavailable</strong>
          <p>${escapeHTML(friendlyError(error))}</p>
        </div>`;
    }
  );

  stopListeners.push(stopLeaderboard);

  // Load initial totals even if the account has no receipts.
  await refreshDashboardFromRedemptions(user.uid);
}

// =====================================================
// 17. FIREBASE CONFIGURATION CHECK
// =====================================================

function isFirebaseConfigured(config) {
  const required = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    databaseURL: config.databaseURL,
    projectId: config.projectId,
    appId: config.appId
  };

  const missing = Object.entries(required)
    .filter(([, value]) =>
      typeof value !== "string" ||
      value.trim() === "" ||
      /PASTE_|YOUR_/i.test(value)
    )
    .map(([name]) => name);

  if (missing.length) {
    console.error(
      "[EcoBounty] Missing Firebase configuration:",
      missing.join(", ")
    );

    return false;
  }

  return true;
}

// ================================================
// EMAIL/PASSWORD AUTHENTICATION
// ================================================

function setAuthMode(mode) {
  authMode = mode;

  const isSignup = mode === "signup";

  ui.authTitle.textContent = isSignup
    ? "Join EcoBounty."
    : "Welcome back.";

  ui.authDescription.textContent = isSignup
    ? "Create an account and start your green journey."
    : "Sign in to access your EcoBounty dashboard.";

  ui.authSubmit.textContent = isSignup
    ? "Create account →"
    : "Sign in →";

  ui.authModeToggle.textContent = isSignup
    ? "Already registered? Sign in"
    : "New here? Create an account";

  ui.authForgotBtn.hidden = isSignup;

  ui.authPassword.autocomplete = isSignup
    ? "new-password"
    : "current-password";

  ui.authStatus.textContent = "";
  ui.authStatus.className = "form-status";
}

ui.authModeToggle.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

ui.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = ui.authEmail.value.trim();
  const password = ui.authPassword.value;

  ui.authSubmit.disabled = true;
  ui.authStatus.textContent = "Please wait...";
  ui.authStatus.className = "form-status";

  try {
    if (authMode === "signup") {
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      ui.authStatus.textContent =
        "Account created! Opening your dashboard...";

    } else {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      ui.authStatus.textContent =
        "Signed in! Opening your dashboard...";
    }

    ui.authStatus.className = "form-status success";

    // Firebase's auth listener will show the dashboard.

  } catch (error) {
    console.error("Authentication error:", error);

    const messages = {
      "auth/email-already-in-use":
        "An account already exists with this email. Sign in instead.",

      "auth/invalid-email":
        "Enter a valid email address.",

      "auth/invalid-credential":
        "Incorrect email or password. Check your details.",

      "auth/weak-password":
        "Choose a stronger password.",

      "auth/operation-not-allowed":
        "Enable Email/Password in Firebase Authentication.",

      "auth/too-many-requests":
        "Too many attempts. Try again later."
    };

    ui.authStatus.textContent =
      messages[error.code] || friendlyError(error);

    ui.authStatus.className = "form-status error";

  } finally {
    ui.authSubmit.disabled = false;
  }
});

// Password reset email.
ui.authForgotBtn.addEventListener("click", async () => {
  const email = ui.authEmail.value.trim();

  if (!email) {
    ui.authStatus.textContent =
      "Enter your email address first.";

    ui.authStatus.className = "form-status error";
    ui.authEmail.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);

    ui.authStatus.textContent =
      "If the account exists, a password-reset email has been sent.";

    ui.authStatus.className = "form-status success";

  } catch (error) {
    console.error("Password reset error:", error);

    ui.authStatus.textContent = friendlyError(error);
    ui.authStatus.className = "form-status error";
  }
});

// Allow the user to sign out.
const signOutButton = $("#signOutBtn");

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      showToast(friendlyError(error));
    }
  });
}

// =====================================================
// 18. START FIREBASE
// =====================================================

async function startApp() {
  setButtonsEnabled(false);

  const shell = document.querySelector(".app-shell");

  ui.authGate.hidden = false;
  shell.style.display = "none";

  if (!isFirebaseConfigured(firebaseConfig)) {
    setConnection("Setup required", "loading");
    ui.authStatus.textContent =
      "Check the Firebase configuration in app.js.";
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app, firebaseConfig.databaseURL);

    setConnection("Checking sign-in", "loading");

    onAuthStateChanged(auth, async (user) => {
      // No user means show the email/password login screen.
      if (!user) {
        currentUid = null;
        activeUid = null;

        stopListeners.forEach((unsubscribe) => unsubscribe());
        stopListeners = [];

        document.body.classList.remove("authenticated");

        ui.authGate.hidden = false;
        shell.style.display = "none";

        stopKioskCodesListener = null;

ui.kioskCodesUnlocked.hidden = true;
ui.kioskNumberInput.value = "";
ui.kioskCodesBadge.textContent = "LOCKED";
ui.kioskLatestCode.hidden = true;
ui.kioskLatestCode.innerHTML = "";
ui.kioskCodesList.innerHTML = "";

        setButtonsEnabled(false);
        setConnection("Sign in required", "loading");

        return;
      }

      // If an old anonymous session is still stored in this browser,
      // sign it out so it cannot bypass the new login screen.
      if (user.isAnonymous) {
        try {
          await signOut(auth);
        } catch (error) {
          console.error("Could not end old anonymous session:", error);
          setConnection("Sign-in error", "error");
        }

        return;
      }

      try {
        // A real email/password account is now signed in.
        ui.authGate.hidden = true;
        document.body.classList.add("authenticated");
        shell.style.display = "grid";

        await startUserSession(user);

      } catch (error) {
        console.error("User session initialization:", error);

        setConnection("Setup error", "error");
        showToast(friendlyError(error));
      }
    }, (error) => {
      console.error("Firebase auth listener:", error);

      setConnection("Authentication error", "error");
      showToast(friendlyError(error));
    });

  } catch (error) {
    console.error("Firebase initialization:", error);

    setConnection("Firebase error", "error");
    ui.authStatus.textContent = friendlyError(error);
  }
}

// =====================================================
// PUBLIC LEADERBOARD — ONE ENTRY PER VERIFIED REDEMPTION
// =====================================================

async function ensureLeaderboardEntry(uid, code, record) {
  // Only mirror records already verified as redeemed by this user.
  if (
    !uid ||
    record?.status !== "redeemed" ||
    record?.redeemedBy !== uid
  ) {
    return;
  }

  const entryRef = ref(db, `leaderboard/${uid}/${code}`);

  const existing = await get(entryRef);

  // Never overwrite an existing leaderboard entry.
  if (existing.exists()) return;

  const nameSnapshot = await get(
    ref(db, `profiles/${uid}/displayName`)
  );

  const displayName = nameSnapshot.val();

  if (
    typeof displayName !== "string" ||
    !displayName.trim()
  ) {
    throw new Error("Leaderboard display name is missing.");
  }

  const points = Number(record.points);
  const issuedAt = Number(record.issuedAt);

  if (
    !Number.isFinite(points) ||
    points < 0 ||
    !Number.isFinite(issuedAt)
  ) {
    throw new Error("Invalid claim data for leaderboard.");
  }

  const entry = {
    code,
    points,
    displayName,
    issuedAt
  };

  try {
    await set(entryRef, entry);
  } catch (error) {
    // Another dashboard refresh may have created the entry first.
    const after = await get(entryRef);

    if (!after.exists()) throw error;

    const saved = after.val();

    if (
      saved.code !== code ||
      Number(saved.points) !== points
    ) {
      throw error;
    }
  }
}

// =====================================================
// 19. NAVIGATION ACTIVE STATE
// =====================================================

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => {
      nav.classList.remove("active");
    });

    item.classList.add("active");
  });
});

// Update the claim panel text to match the current workflow.
const claimDescription = $("#claims .claim-copy > p");

if (claimDescription) {
  claimDescription.textContent =
    "Enter the one-time code printed by your EcoBounty kiosk to redeem its verified demo points.";
}

const claimNote = $("#claims .claim-note");

if (claimNote) {
  claimNote.textContent =
    "Each code can be redeemed once and expires after 24 hours.";
}

// =====================================================
// CURRENT KIOSK CODES
// Demo kiosk number / access password is always "1".
// Codes are read from claimCodes/{code} in Firebase.
// =====================================================

const KIOSK_ACCESS_PASSWORD = "1";

let stopKioskCodesListener = null;


// -----------------------------------------------------
// Find available, unexpired claim codes and sort newest first.
// -----------------------------------------------------

function getCurrentKioskCodes(data) {
  const now = Date.now();

  return Object.entries(data || {})
    .map(([databaseKey, value]) => {
      if (!value || typeof value !== "object") {
        return null;
      }

      return {
        ...value,
        code: String(value.code || databaseKey).toUpperCase()
      };
    })
    .filter((record) => {
      if (!record) return false;

      if (record.status !== "available") {
        return false;
      }

      const expiry = Number(record.expiresAt);

      // A code must have a valid expiry timestamp.
      if (!Number.isFinite(expiry) || expiry <= now) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      return Number(b.issuedAt || 0) -
             Number(a.issuedAt || 0);
    });
}


// -----------------------------------------------------
// Put a chosen code into the existing redemption form.
// -----------------------------------------------------

function useKioskClaimCode(code) {
  if (!ui.claimCodeInput || !code) return;

  ui.claimCodeInput.value = code;

  document.querySelector("#claims")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  ui.claimCodeInput.focus({ preventScroll: true });

  showToast("Claim code added to the redemption form.");
}


// -----------------------------------------------------
// Render the most recent code and the full current list.
// -----------------------------------------------------

function renderCurrentKioskCodes(data) {
  const codes = getCurrentKioskCodes(data);

  ui.kioskCodesBadge.textContent =
    `${codes.length} AVAILABLE`;

  if (codes.length === 0) {
    ui.kioskLatestCode.hidden = true;
    ui.kioskLatestCode.innerHTML = "";

    ui.kioskCodesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌕</div>
        <strong>No active codes right now</strong>
        <p>
          No available, unexpired claim codes were found.
          Scan an eligible item at the kiosk and refresh this list.
        </p>
      </div>
    `;

    ui.kioskCodesStatus.textContent =
      "Kiosk 1 verified. Waiting for available claim codes.";

    ui.kioskCodesStatus.className = "form-status";

    return;
  }

  const latest = codes[0];

  // Most recent code — prominently displayed.
  ui.kioskLatestCode.hidden = false;

  ui.kioskLatestCode.innerHTML = `
    <div class="kiosk-latest-header">
      <span>✦ MOST RECENT SCAN</span>
      <span class="status-tag">KIOSK 1</span>
    </div>

    <div class="kiosk-latest-code-value">
      ${escapeHTML(latest.code)}
    </div>

    <div class="kiosk-latest-details">
      <span>
        ${escapeHTML(latest.objectName || "Unknown item")}
      </span>
      <span>·</span>
      <span>
        ${escapeHTML(latest.category || "other")}
      </span>
    </div>

    <div class="kiosk-latest-meta">
      <strong>+${numberFormat(latest.points)} EcoPoints</strong>
      <span>Issued ${escapeHTML(formatDate(latest.issuedAt))}</span>
      <span>Expires ${escapeHTML(formatDate(latest.expiresAt))}</span>
    </div>

    <div class="kiosk-code-actions">
      <button
        type="button"
        class="primary-button"
        data-use-code="${escapeHTML(latest.code)}"
      >
        Use latest code ↗
      </button>

      <button
        type="button"
        class="secondary-button"
        data-copy-code="${escapeHTML(latest.code)}"
      >
        Copy code
      </button>
    </div>
  `;

  // Every currently redeemable code, newest first.
  ui.kioskCodesList.innerHTML = codes.map((record) => {
    const code = escapeHTML(record.code);
    const objectName = escapeHTML(
      record.objectName || "Unknown item"
    );
    const category = escapeHTML(record.category || "other");
    const points = numberFormat(record.points);

    return `
      <article class="kiosk-code-row">
        <div class="category-icon">
          ${categoryEmoji(record.category)}
        </div>

        <div class="kiosk-code-main">
          <strong><code>${code}</code></strong>

          <span>
            ${objectName} · ${category}
          </span>

          <small>
            Issued ${escapeHTML(formatDate(record.issuedAt))}
            · Expires ${escapeHTML(formatDate(record.expiresAt))}
          </small>
        </div>

        <div class="kiosk-code-row-actions">
          <strong>+${points} pts</strong>

          <button
            type="button"
            class="secondary-button"
            data-use-code="${code}"
          >
            Use code ↗
          </button>
        </div>
      </article>
    `;
  }).join("");

  ui.kioskCodesStatus.textContent =
    `Kiosk 1 verified. ${codes.length} available code(s), updating live.`;

  ui.kioskCodesStatus.className = "form-status success";
}


// -----------------------------------------------------
// Unlock the live code list using the kiosk number.
// For this prototype, the password is exactly "1".
// -----------------------------------------------------

ui.kioskAccessForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!auth?.currentUser || !currentUid || !db) {
    ui.kioskCodesStatus.textContent =
      "Sign in to EcoBounty first.";

    ui.kioskCodesStatus.className = "form-status error";
    return;
  }

  const enteredNumber =
    ui.kioskNumberInput.value.trim();

  if (enteredNumber !== KIOSK_ACCESS_PASSWORD) {
    ui.kioskCodesStatus.textContent =
      "Incorrect kiosk number. Try again.";

    ui.kioskCodesStatus.className = "form-status error";
    ui.kioskCodesBadge.textContent = "LOCKED";
    return;
  }

  ui.kioskCodesUnlocked.hidden = false;
  ui.kioskAccessButton.disabled = true;

  ui.kioskCodesStatus.textContent =
    "Kiosk number accepted. Connecting to live claim codes…";

  ui.kioskCodesStatus.className = "form-status";

  // Avoid accidentally creating duplicate live listeners.
  if (stopKioskCodesListener) {
    stopKioskCodesListener();
    stopKioskCodesListener = null;
  }

const availableCodesQuery = query(
  ref(db, "claimCodes"),
  orderByChild("status"),
  equalTo("available")
);

stopKioskCodesListener = onValue(
  availableCodesQuery,

    (snapshot) => {
      renderCurrentKioskCodes(snapshot.val() || {});
    },

    (error) => {
      console.error(
        "[EcoBounty] Kiosk-code listener failed:",
        error
      );

      ui.kioskCodesBadge.textContent = "UNAVAILABLE";

      ui.kioskCodesStatus.textContent =
        friendlyError(error);

      ui.kioskCodesStatus.className = "form-status error";

      ui.kioskCodesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">!</div>
          <strong>Could not load kiosk codes</strong>
          <p>
            Check your Firebase Realtime Database Rules
            and internet connection.
          </p>
        </div>
      `;

      ui.kioskAccessButton.disabled = false;
    }
  );

  // Existing session cleanup unsubscribes this listener on sign-out.
  stopListeners.push(stopKioskCodesListener);

  ui.kioskCodesBadge.textContent = "LIVE";
  ui.kioskAccessButton.disabled = false;
});


// -----------------------------------------------------
// Buttons for copying a code or using it in the claim form.
// -----------------------------------------------------

ui.kioskLatestCode.addEventListener("click", async (event) => {
  const useButton = event.target.closest("[data-use-code]");
  const copyButton = event.target.closest("[data-copy-code]");

  if (useButton) {
    useKioskClaimCode(useButton.dataset.useCode);
    return;
  }

  if (copyButton) {
    try {
      await navigator.clipboard.writeText(
        copyButton.dataset.copyCode
      );

      showToast("Latest claim code copied.");
    } catch (error) {
      console.error("Copy latest code failed:", error);

      useKioskClaimCode(copyButton.dataset.copyCode);
      showToast("Code placed in the redemption form instead.");
    }
  }
});

ui.kioskCodesList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-code]");

  if (!button) return;

  useKioskClaimCode(button.dataset.useCode);
});

// Go!
startApp();
