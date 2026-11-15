
// ========================================
// HANIBAL DISCIPLINE
// Version 8.0 - New Supabase Database
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
let loading = false;

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
    const result = await Promise.race([
      supabaseClient.auth.signUp({ email, password }),
      new Promise((_, reject) =>
        setTimeout(() => reject(
          new Error("Connection timed out. Check your internet and try again.")
        ), 20000)
      )
    ]);

    if (result.error) {
      showMessage("Sign-up error: " + result.error.message);
      return;
    }

    if (result.data.session) {
      showMessage("Account created successfully!");
    } else {
      showMessage("Account created. Please log in.");
    }
  } catch (error) {
    console.error("Sign-up error:", error);
    showMessage("Error: " + error.message);
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
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage("Login error: " + error.message);
    }
  } catch (error) {
    console.error("Login error:", error);
    showMessage("Connection error: " + error.message);
  }
}

// ========================================
// LOG OUT
// ========================================

async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      alert(error.message);
    }
  } catch (error) {
    alert("Could not log out: " + error.message);
  }
}

// ========================================
// LOAD USER DATA
// ========================================

async function loadUserData() {
  if (!currentUser || loading) return;

  loading = true;
  showMessage("Loading your progress...");

  try {
    const userId = currentUser.id;

    // Load profile
    const { data: profile, error: profileError } =
      await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

    if (profileError) throw profileError;

    xp = Number(profile.xp) || 0;
    streak = Number(profile.streak) || 0;

    // Load this user's missions
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

    // Add default missions for a new account
    if (tasks.length === 0) {
      for (const name of defaultTasks) {
        const { data, error } = await supabaseClient
          .from("missions")
          .insert({
            user_id: userId,
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
      }
    }

    if (!currentUser || currentUser.id !== userId) return;

    updateDashboard();
    showMessage("Your progress is ready!");

  } catch (error) {
    console.error("Loading error:", error);
    showMessage("Could not load your data: " + error.message);
  } finally {
    loading = false;
  }
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

async function toggleTask(id) {
  if (!currentUser) return;

  const task = tasks.find(item => item.id === id);
  if (!task) return;

  const previousState = task.completed;
  const newState = !previousState;
  const newXP = Math.max(0, xp + (newState ? 10 : -10));

  try {
    const { error: missionError } = await supabaseClient
      .from("missions")
      .update({ completed: newState })
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (missionError) throw missionError;

    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({ xp: newXP })
      .eq("id", currentUser.id);

    if (profileError) throw profileError;

    task.completed = newState;
    xp = newXP;

    updateDashboard();
  } catch (error) {
    console.error("Mission update error:", error);
    alert("Could not save mission: " + error.message);
  }
}

// ========================================
// ADD MISSION
// ========================================

async function addTask() {
  if (!currentUser) return;

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
// AUTHENTICATION SESSION
// ========================================

async function handleUser(user) {
  currentUser = user;

  if (user) {
    tasks = [];
    xp = 0;
    streak = 0;

    showDashboard();
    await loadUserData();
  } else {
    tasks = [];
    xp = 0;
    streak = 0;

    showLogin();
  }
}

// ========================================
// START APPLICATION
// ========================================

async function startApp() {
  showLogin();
  showMessage("Checking your account...");

  supabaseClient.auth.onAuthStateChange((event, session) => {
    Promise.resolve().then(() => {
      handleUser(session ? session.user : null);
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

  document.getElementById("today").textContent =
    new Date().toDateString();
}

startApp();

console.log("HANIBAL DISCIPLINE Version 8.0 is ready!");
