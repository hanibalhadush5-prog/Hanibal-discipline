
// ========================================
// HANIBAL DISCIPLINE
// Version 9.0 - Improved Mission System
// ========================================

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
let xp = 0;
let streak = 0;
let loadingUserId = null;
let loadingPromise = null;

// ========================================
// MESSAGES AND SCREENS
// ========================================

function showMessage(message) {
  const element = document.getElementById("auth-message");
  if (element) element.textContent = message;
}

function showDashboard() {
  document.getElementById("auth-section").style.display = "none";
  document.getElementById("app-content").style.display = "block";
}

function showLogin() {
  document.getElementById("auth-section").style.display = "block";
  document.getElementById("app-content").style.display = "none";
}

// ========================================
// CREATE ACCOUNT
// ========================================

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

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      showMessage("Account created successfully!");
      await handleUser(data.session.user);
    } else {
      showMessage("Account created! Please log in.");
    }
  } catch (error) {
    console.error(error);
    showMessage("Sign-up error: " + error.message);
  }
}

// ========================================
// LOG IN
// ========================================

async function signIn() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Enter your email and password.");
    return;
  }

  showMessage("Logging in...");

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    await handleUser(data.user);
  } catch (error) {
    console.error(error);
    showMessage("Login error: " + error.message);
  }
}

// ========================================
// LOG OUT
// ========================================

async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    tasks = [];
    xp = 0;
    streak = 0;
    showLogin();
  } catch (error) {
    alert("Logout error: " + error.message);
  }
}

// ========================================
// LOAD USER DATA
// ========================================

async function loadUserData() {
  if (!currentUser) return;

  const userId = currentUser.id;

  if (loadingUserId === userId && loadingPromise) {
    return loadingPromise;
  }

  loadingUserId = userId;

  loadingPromise = (async () => {
    try {
      // Load profile separately.
      // A profile error must not stop mission loading.

      const { data: profile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .select("xp, streak")
          .eq("id", userId)
          .maybeSingle();

      if (profileError) {
        console.error("Profile loading error:", profileError);
      }

      xp = Number(profile?.xp) || 0;
      streak = Number(profile?.streak) || 0;

      // Load missions

      const { data: missions, error: missionError } =
        await supabaseClient
          .from("missions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

      if (missionError) throw missionError;

      tasks = (missions || []).map(mission => ({
        id: mission.id,
        name: mission.title,
        completed: mission.completed
      }));

      // Create default missions for new accounts

      if (tasks.length === 0) {
        const newMissions = defaultTasks.map(name => ({
          user_id: userId,
          title: name,
          completed: false
        }));

        const { data, error } = await supabaseClient
          .from("missions")
          .insert(newMissions)
          .select();

        if (error) throw error;

        tasks = (data || []).map(mission => ({
          id: mission.id,
          name: mission.title,
          completed: mission.completed
        }));
      }

      if (!currentUser || currentUser.id !== userId) return;

      updateDashboard();
      showMessage("Your missions are ready!");

    } catch (error) {
      console.error("Data loading error:", error);
      alert("Could not load missions: " + error.message);
    } finally {
      if (loadingUserId === userId) {
        loadingUserId = null;
        loadingPromise = null;
      }
    }
  })();

  return loadingPromise;
}

// ========================================
// HANDLE USER
// ========================================

async function handleUser(user) {
  currentUser = user;

  if (!user) {
    tasks = [];
    xp = 0;
    streak = 0;
    showLogin();
    return;
  }

  showDashboard();
  await loadUserData();
}

// ========================================
// UPDATE DASHBOARD
// ========================================

function updateDashboard() {
  if (!currentUser) return;

  const total = tasks.length;
  const done = tasks.filter(task => task.completed).length;

  const percent = total
    ? Math.round((done / total) * 100)
    : 0;

  document.getElementById("xp").textContent = xp;
  document.getElementById("streak").textContent = streak + " 🔥";
  document.getElementById("percent").textContent = percent + "%";

  document.getElementById("progress-bar").style.width =
    percent + "%";

  document.getElementById("count").textContent =
    done + " of " + total + " missions completed";

  renderTasks();
}

// ========================================
// DISPLAY MISSIONS
// ========================================

function renderTasks() {
  const list = document.getElementById("task-list");
  if (!list) return;

  list.innerHTML = "";

  tasks.forEach(task => {
    const div = document.createElement("div");
    div.className = "task" + (task.completed ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;

    checkbox.addEventListener("change", () => {
      toggleTask(task.id);
    });

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

async function toggleTask(id) {
  if (!currentUser) return;

  const task = tasks.find(item => item.id === id);
  if (!task) return;

  const newState = !task.completed;
  const newXP = Math.max(0, xp + (newState ? 10 : -10));

  try {
    const { error } = await supabaseClient
      .from("missions")
      .update({ completed: newState })
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    task.completed = newState;
    xp = newXP;

    updateDashboard();

    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({ xp: xp })
      .eq("id", currentUser.id);

    if (profileError) {
      console.error("XP saving error:", profileError);
      alert("Mission saved, but XP could not be saved: " +
        profileError.message);
    }

  } catch (error) {
    console.error(error);
    alert("Could not save mission: " + error.message);
  }
}

// ========================================
// ADD MISSION
// ========================================

async function addTask() {
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const input = document.getElementById("task-input");
  const name = input.value.trim();

  if (!name) {
    alert("Please write a mission!");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("missions")
      .insert({
        user_id: currentUser.id,
        title: name,
        completed: false
      })
      .select()
      .single();

    if (error) throw error;

    tasks.push({
      id: data.id,
      name: data.title,
      completed: data.completed
    });

    input.value = "";
    updateDashboard();

  } catch (error) {
    console.error("Add mission error:", error);
    alert("Could not add mission: " + error.message);
  }
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
// START APPLICATION
// ========================================

async function startApp() {
  showLogin();

  const today = document.getElementById("today");
  if (today) today.textContent = new Date().toDateString();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    Promise.resolve().then(() => {
      if (event === "SIGNED_OUT") {
        handleUser(null);
      } else if (event === "SIGNED_IN") {
        handleUser(session ? session.user : null);
      }
    });
  });

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    await handleUser(data.session ? data.session.user : null);

  } catch (error) {
    console.error("Startup error:", error);
    showMessage("Could not connect: " + error.message);
  }
}

startApp();

console.log("HANIBAL DISCIPLINE Version 9.0 is ready!");
