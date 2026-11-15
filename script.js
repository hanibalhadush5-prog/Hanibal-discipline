
// ========================================
// HANIBAL DISCIPLINE
// Version 7.0 - Weekly & All-Time Leaderboards
// ========================================

// ========================================
// DATE SYSTEM
// ========================================

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return dateKey(new Date());
}

function getWeekStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);

  return dateKey(date);
}

const defaultTasks = [
  "Wake up early",
  "Make my bed",
  "Study for 20 minutes",
  "Practice a useful skill",
  "Exercise or play football",
  "Read something educational",
  "Review my day"
];

let currentUser = null;
let tasks = [];
let records = {};
let xp = 0;
let weeklyXp = 0;

let saving = Promise.resolve();
let loading = false;
let activeUserId = null;

// ========================================
// ACCOUNT SYSTEM
// ========================================

function showMessage(message) {
  const element = document.getElementById("auth-message");

  if (element) {
    element.textContent = message;
  }
}

function showDashboard() {
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("app-content").style.display = "block";
}

function showLogin() {
  document.getElementById("auth-section").style.display = "block";
  document.getElementById("app-content").style.display = "none";
}

async function signUp() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must have at least 6 characters.");
    return;
  }

  showMessage("Creating your account...");

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    showMessage(error.message);
    return;
  }

  if (data.session) {
    showMessage("Account created successfully!");
  } else {
    showMessage("Account created! Check your email to confirm it, then log in.");
  }
}

async function signIn() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Enter your email and password.");
    return;
  }

  showMessage("Logging in...");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage(error.message);
  }
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert(error.message);
  }
}

// ========================================
// USER STORAGE
// ========================================

function storageKey(name) {
  return "hanibal_" + currentUser.id + "_" + name;
}

// ========================================
// LOAD USER DATA
// ========================================

async function loadUserData() {
  if (!currentUser) return;

  loading = true;

  const userId = currentUser.id;

  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Cloud loading error:", error.message);
    showMessage("Could not load progress: " + error.message);
    loading = false;
    return;
  }

  if (!currentUser || currentUser.id !== userId) {
    loading = false;
    return;
  }

  if (data) {
    tasks = Array.isArray(data.tasks) ? data.tasks : [];
    records = data.records || {};
    xp = Number(data.xp) || 0;
  } else {
    tasks = JSON.parse(
      localStorage.getItem(storageKey("tasks"))
    ) || defaultTasks.map((name, index) => ({
      id: index + 1,
      name
    }));

    records = JSON.parse(
      localStorage.getItem(storageKey("records"))
    ) || {};

    xp = Number(
      localStorage.getItem(storageKey("xp"))
    ) || 0;
  }

  // Load this user's weekly XP
  const { data: score, error: scoreError } = await supabaseClient
    .from("leaderboard")
    .select("weekly_xp, week_start")
    .eq("user_id", userId)
    .maybeSingle();

  if (scoreError) {
    console.error("Leaderboard loading error:", scoreError.message);
    weeklyXp = 0;
  } else if (score && score.week_start === getWeekStart()) {
    weeklyXp = Number(score.weekly_xp) || 0;
  } else {
    // A new week starts with zero weekly XP.
    weeklyXp = 0;
  }

  if (!currentUser || currentUser.id !== userId) {
    loading = false;
    return;
  }

  const today = getTodayKey();

  if (!records[today]) {
    records[today] = [];
  }

  loading = false;

  updateDashboard();
  ensureLeaderboardUI();
  loadLeaderboard();

  showMessage("Your progress is ready!");
}

// ========================================
// SAVE PROGRESS AND LEADERBOARD
// ========================================

function saveData() {
  if (!currentUser || loading) return;

  const userId = currentUser.id;
  const weekStart = getWeekStart();

  const progress = {
    user_id: userId,
    tasks: JSON.parse(JSON.stringify(tasks)),
    records: JSON.parse(JSON.stringify(records)),
    xp: xp,
    updated_at: new Date().toISOString()
  };

  const score = {
    user_id: userId,
    xp: xp,
    weekly_xp: weeklyXp,
    week_start: weekStart,
    updated_at: new Date().toISOString()
  };

  localStorage.setItem(
    storageKey("tasks"),
    JSON.stringify(tasks)
  );

  localStorage.setItem(
    storageKey("records"),
    JSON.stringify(records)
  );

  localStorage.setItem(storageKey("xp"), xp);

  saving = saving.then(async () => {
    if (!currentUser || currentUser.id !== userId) return;

    // Save personal progress
    const { error: progressError } = await supabaseClient
      .from("user_progress")
      .upsert(progress, {
        onConflict: "user_id"
      });

    if (progressError) {
      console.error("Cloud saving error:", progressError.message);
      return;
    }

    console.log("Personal progress saved!");

    if (!currentUser || currentUser.id !== userId) return;

    // Save weekly and all-time XP
    const { error: leaderboardError } = await supabaseClient
      .from("leaderboard")
      .upsert(score, {
        onConflict: "user_id"
      });

    if (leaderboardError) {
      console.error(
        "Leaderboard saving error:",
        leaderboardError.message
      );
    } else {
      console.log("Weekly and all-time XP saved!");
      loadLeaderboard();
    }
  }).catch(error => {
    console.error("Saving failed:", error);
  });
}

// ========================================
// DASHBOARD
// ========================================

function updateDashboard() {
  if (!currentUser) return;

  const today = getTodayKey();
  const completed = records[today] || [];
  const total = tasks.length;

  const done = tasks.filter(task =>
    completed.includes(task.id)
  ).length;

  const percent = total
    ? Math.round((done / total) * 100)
    : 0;

  document.getElementById("xp").textContent = xp;

  document.getElementById("percent").textContent =
    percent + "%";

  document.getElementById("progress-bar").style.width =
    percent + "%";

  document.getElementById("count").textContent =
    done + " of " + total + " missions completed";

  document.getElementById("streak").textContent =
    calculateStreak() + " 🔥";

  renderTasks();
  saveData();
}

// ========================================
// RENDER MISSIONS
// ========================================

function renderTasks() {
  const list = document.getElementById("task-list");
  const today = getTodayKey();

  list.innerHTML = "";

  tasks.forEach(task => {
    const isDone = (records[today] || []).includes(task.id);

    const div = document.createElement("div");
    div.className = "task" + (isDone ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isDone;

    checkbox.onchange = () => toggleTask(task.id);

    const name = document.createElement("span");
    name.textContent = task.name;

    div.appendChild(checkbox);
    div.appendChild(name);

    list.appendChild(div);
  });
}

// ========================================
// COMPLETE MISSION
// ========================================

function toggleTask(id) {
  if (!currentUser) return;

  const today = getTodayKey();
  const completed = records[today] || [];

  if (completed.includes(id)) {
    records[today] = completed.filter(
      item => item !== id
    );

    xp = Math.max(0, xp - 10);
    weeklyXp = Math.max(0, weeklyXp - 10);
  } else {
    records[today] = [...completed, id];

    xp += 10;
    weeklyXp += 10;
  }

  updateDashboard();
}

// ========================================
// ADD MISSION
// ========================================

function addTask() {
  if (!currentUser) return;

  const input = document.getElementById("task-input");
  const name = input.value.trim();

  if (!name) {
    alert("Please write a mission!");
    return;
  }

  tasks.push({
    id: Date.now(),
    name
  });

  input.value = "";

  updateDashboard();
}

// ========================================
// STREAK SYSTEM
// ========================================

function calculateStreak() {
  let streak = 0;
  let date = new Date();

  date.setHours(0, 0, 0, 0);

  const today = getTodayKey();

  if (!(records[today] || []).length) {
    date.setDate(date.getDate() - 1);
  }

  while (streak < 3650) {
    const key = dateKey(date);

    if ((records[key] || []).length > 0) {
      streak++;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// ========================================
// LEADERBOARD DESIGN
// ========================================

function ensureLeaderboardUI() {
  const app = document.getElementById("app-content");

  if (document.getElementById("leaderboard-section")) {
    return;
  }

  const section = document.createElement("section");
  section.id = "leaderboard-section";

  section.style.cssText = `
    margin-top: 25px;
    padding: 18px;
    background: #111c30;
    color: white;
    border-radius: 14px;
  `;

  const heading = document.createElement("h2");
  heading.textContent = "🏆 HANIBAL LEADERBOARD";
  heading.style.textAlign = "center";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Compete with family and friends!";
  subtitle.style.textAlign = "center";
  subtitle.style.color = "#c5c5c5";

  const weeklyTitle = document.createElement("h3");
  weeklyTitle.textContent = "📅 Weekly Rankings";

  const weeklyList = document.createElement("div");
  weeklyList.id = "weekly-ranking-list";

  const allTimeTitle = document.createElement("h3");
  allTimeTitle.textContent = "👑 All-Time Rankings";

  const allTimeList = document.createElement("div");
  allTimeList.id = "alltime-ranking-list";

  section.appendChild(heading);
  section.appendChild(subtitle);
  section.appendChild(weeklyTitle);
  section.appendChild(weeklyList);
  section.appendChild(allTimeTitle);
  section.appendChild(allTimeList);

  app.appendChild(section);
}

// ========================================
// DISPLAY RANKINGS
// ========================================

function renderRanking(listId, players, scoreField) {
  const list = document.getElementById(listId);

  if (!list) return;

  list.innerHTML = "";

  if (!players.length) {
    const empty = document.createElement("p");
    empty.textContent = "No players yet. Be the first!";
    empty.style.color = "#cccccc";
    list.appendChild(empty);
    return;
  }

  players.forEach((player, index) => {
    const row = document.createElement("div");

    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      margin: 7px 0;
      background: #1c2a42;
      border-radius: 9px;
    `;

    const name = document.createElement("span");
    const medals = ["🥇", "🥈", "🥉"];
    const medal = medals[index] || `#${index + 1}`;

    name.textContent = `${medal} ${player.name}`;

    const points = document.createElement("strong");
    points.textContent = `${Number(player[scoreField]) || 0} XP`;

    row.appendChild(name);
    row.appendChild(points);

    list.appendChild(row);
  });
}

// ========================================
// LOAD WEEKLY AND ALL-TIME LEADERBOARDS
// ========================================

async function loadLeaderboard() {
  if (!currentUser) return;

  const userId = currentUser.id;

  ensureLeaderboardUI();

  const weeklyList = document.getElementById("weekly-ranking-list");
  const allTimeList = document.getElementById("alltime-ranking-list");

  if (weeklyList) weeklyList.textContent = "Loading rankings...";
  if (allTimeList) allTimeList.textContent = "Loading rankings...";

  const { data: scores, error } = await supabaseClient
    .from("leaderboard")
    .select("user_id, xp, weekly_xp, week_start")
    .order("xp", { ascending: false });

  if (error) {
    console.error("Could not load leaderboard:", error.message);

    if (weeklyList) weeklyList.textContent = "Could not load rankings.";
    if (allTimeList) allTimeList.textContent = "Could not load rankings.";

    return;
  }

  if (!currentUser || currentUser.id !== userId) return;

  const currentWeek = getWeekStart();

  const userIds = scores.map(player => player.user_id);

  let profiles = [];

  if (userIds.length > 0) {
    const { data: profileData, error: profileError } = await supabaseClient
      .from("profiles")
      .select("user_id, username, display_name")
      .in("user_id", userIds);

    if (profileError) {
      console.error("Profile loading error:", profileError.message);
    } else {
      profiles = profileData || [];
    }
  }

  if (!currentUser || currentUser.id !== userId) return;

  const profileMap = {};

  profiles.forEach(profile => {
    profileMap[profile.user_id] =
      profile.display_name || profile.username || "Player";
  });

  const players = scores.map(player => ({
    user_id: player.user_id,
    name: profileMap[player.user_id] || "Player",
    xp: Number(player.xp) || 0,
    weekly_xp:
      player.week_start === currentWeek
        ? Number(player.weekly_xp) || 0
        : 0
  }));

  const weeklyPlayers = [...players].sort(
    (a, b) => b.weekly_xp - a.weekly_xp
  );

  const allTimePlayers = [...players].sort(
    (a, b) => b.xp - a.xp
  );

  renderRanking(
    "weekly-ranking-list",
    weeklyPlayers,
    "weekly_xp"
  );

  renderRanking(
    "alltime-ranking-list",
    allTimePlayers,
    "xp"
  );
}

// ========================================
// COMMUNITY
// ========================================

function comingSoon() {
  alert(
    "HANIBAL COMMUNITY\n\nFamily and friends features are coming soon!"
  );
}

// ========================================
// AUTHENTICATION SESSION
// ========================================

async function handleUser(user) {
  const nextUserId = user ? user.id : null;

  if (activeUserId === nextUserId) return;

  activeUserId = nextUserId;
  currentUser = user;

  if (user) {
    tasks = [];
    records = {};
    xp = 0;
    weeklyXp = 0;

    showDashboard();
    await loadUserData();
  } else {
    tasks = [];
    records = {};
    xp = 0;
    weeklyXp = 0;

    showLogin();
  }
}

// ========================================
// START APPLICATION
// ========================================

document.getElementById("today").textContent =
  new Date().toDateString();

async function startApp() {
  showLogin();
  showMessage("Checking your account...");

  supabaseClient.auth.onAuthStateChange((event, session) => {
    Promise.resolve().then(() => {
      handleUser(session ? session.user : null);
    });
  });

  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) {
    showMessage(error.message);
    return;
  }

  await handleUser(
    data.session ? data.session.user : null
  );
}

startApp();

console.log("HANIBAL DISCIPLINE Version 7.0 is ready!");
