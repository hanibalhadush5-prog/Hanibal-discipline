
// ==========================================
// HANIBAL DISCIPLINE V10.0
// Main application engine
// ==========================================

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
let focusInterval = null;
let focusSeconds = 0;
let focusRunning = false;
let notificationInterval = null;

// ==========================================
// GENERAL HELPERS
// ==========================================

function el(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function todayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showMessage(id, message) {
  if (el(id)) el(id).textContent = message;
}

function setButtonLoading(button, loading, normalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : normalText;
}

function showLogin() {
  if (el("auth-section")) el("auth-section").hidden = false;
  if (el("app-content")) el("app-content").hidden = true;
  if (el("logout-btn")) el("logout-btn").hidden = true;
}

function showApp() {
  if (el("auth-section")) el("auth-section").hidden = true;
  if (el("app-content")) el("app-content").hidden = false;
  if (el("logout-btn")) el("logout-btn").hidden = false;
}

function showSection(sectionId) {
  document.querySelectorAll(".app-section").forEach(section => {
    section.hidden = section.id !== sectionId;
  });

  if (sectionId === "reports-section") loadReports();
  if (sectionId === "planning-section") loadPlans();
  if (sectionId === "calendar-section") loadEvents();
  if (sectionId === "reminders-section") loadReminders();
  if (sectionId === "kpi-section") loadKPIs();
}

// ==========================================
// AUTHENTICATION
// ==========================================

async function signUp() {
  const email = el("email").value.trim();
  const password = el("password").value;

  if (!email || !password) {
    showMessage("auth-message", "Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    showMessage("auth-message", "Password must be at least 6 characters.");
    return;
  }

  showMessage("auth-message", "Creating your account...");

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    showMessage("auth-message", error.message);
    return;
  }

  if (data.session) {
    await handleUser(data.user);
  } else {
    showMessage(
      "auth-message",
      "Account created. Check your email if confirmation is required, then log in."
    );
  }
}

async function signIn() {
  const email = el("email").value.trim();
  const password = el("password").value;

  if (!email || !password) {
    showMessage("auth-message", "Enter your email and password.");
    return;
  }

  showMessage("auth-message", "Logging in...");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage("auth-message", error.message);
    return;
  }

  await handleUser(data.user);
}

async function signOut() {
  if (!confirm("Are you sure you want to log out?")) return;

  stopReminderChecker();
  resetFocus();

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert(error.message);
    return;
  }

  currentUser = null;
  tasks = [];
  showLogin();
}

async function handleUser(user) {
  if (!user) return;

  currentUser = user;
  showApp();

  if (el("today")) {
    el("today").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  await loadUserData();
  await loadPlans();
  await loadEvents();
  await loadReminders();
  await loadKPIs();

  showSection("dashboard-section");
  startReminderChecker();
}

// ==========================================
// USER DATA AND MISSIONS
// ==========================================

async function loadUserData() {
  if (!currentUser) return;

  const profileResult = await supabaseClient
    .from("profiles")
    .select("xp, streak")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileResult.error) {
    console.error("Profile loading error:", profileResult.error);
  }

  if (profileResult.data) {
    xp = Number(profileResult.data.xp) || 0;
    streak = Number(profileResult.data.streak) || 0;
  } else {
    xp = 0;
    streak = 0;
  }

  const missionResult = await supabaseClient
    .from("missions")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (missionResult.error) {
    alert("Could not load missions: " + missionResult.error.message);
    return;
  }

  tasks = missionResult.data || [];

  if (tasks.length === 0) {
    const defaults = defaultTasks.map(title => ({
      user_id: currentUser.id,
      title,
      completed: false
    }));

    const { data, error } = await supabaseClient
      .from("missions")
      .insert(defaults)
      .select();

    if (error) {
      alert("Could not create default missions: " + error.message);
    } else {
      tasks = data || [];
    }
  }

  renderTasks();
  updateDashboard();
}

function renderTasks() {
  const list = el("task-list");
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = '<p class="empty-message">No missions yet. Add your first mission!</p>';
    return;
  }

  list.innerHTML = tasks.map(task => `
    <div class="task ${task.completed ? "done" : ""}">
      <span>${escapeHTML(task.title)}</span>
      <button onclick="toggleTask('${task.id}')">
        ${task.completed ? "Undo" : "Complete"}
      </button>
    </div>
  `).join("");
}

function updateDashboard() {
  if (el("xp")) el("xp").textContent = `${xp} XP`;
  if (el("streak")) el("streak").textContent = `${streak} Days`;

  const completed = tasks.filter(task => task.completed).length;
  const total = tasks.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  if (el("percent")) el("percent").textContent = `${percent}%`;
  if (el("count")) {
    el("count").textContent = `${completed} of ${total} missions completed`;
  }
  if (el("progress-bar")) {
    el("progress-bar").style.width = `${percent}%`;
  }
}

async function saveXP() {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from("profiles")
    .update({ xp })
    .eq("id", currentUser.id);

  if (error) {
    console.error("XP update error:", error);
  }
}

async function toggleTask(id) {
  if (!currentUser) return;

  const task = tasks.find(item => item.id === id);
  if (!task) return;

  const newStatus = !task.completed;

  const { error } = await supabaseClient
    .from("missions")
    .update({ completed: newStatus })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("Could not update mission: " + error.message);
    return;
  }

  task.completed = newStatus;
  xp = Math.max(0, xp + (newStatus ? 10 : -10));

  await saveXP();

  await supabaseClient.from("mission_logs").insert({
    user_id: currentUser.id,
    mission_id: id,
    mission_title: task.title,
    action: newStatus ? "completed" : "reopened"
  });

  renderTasks();
  updateDashboard();
}

async function addTask() {
  if (!currentUser) return;

  const input = el("task-input");
  const title = input.value.trim();

  if (!title) {
    alert("Enter a mission first.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("missions")
    .insert({
      user_id: currentUser.id,
      title,
      completed: false
    })
    .select()
    .single();

  if (error) {
    alert("Could not add mission: " + error.message);
    return;
  }

  tasks.push(data);
  input.value = "";
  renderTasks();
  updateDashboard();
}

// ==========================================
// PLANNING
// ==========================================

async function addPlan() {
  if (!currentUser) return;

  const title = el("plan-title").value.trim();
  const details = el("plan-details").value.trim();
  const planDate = el("plan-date").value || todayString();
  const priority = el("plan-priority").value;

  if (!title) {
    alert("Enter a plan title.");
    return;
  }

  const { error } = await supabaseClient.from("plans").insert({
    user_id: currentUser.id,
    title,
    details,
    plan_date: planDate,
    priority
  });

  if (error) {
    alert("Could not save plan: " + error.message);
    return;
  }

  el("plan-title").value = "";
  el("plan-details").value = "";
  await loadPlans();
}

async function loadPlans() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("plans")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("plan_date", { ascending: true });

  if (error) {
    showMessage("plans-list", "Could not load plans: " + error.message);
    return;
  }

  const list = el("plans-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = '<p class="empty-message">No plans yet.</p>';
    return;
  }

  list.innerHTML = data.map(plan => `
    <div class="plan-item">
      <div>
        <strong>${escapeHTML(plan.title)}</strong>
        <p>${escapeHTML(plan.details || "")}</p>
        <small>${escapeHTML(plan.plan_date)} · ${escapeHTML(plan.priority)} priority</small>
        <p>${plan.completed ? "Completed" : "In progress"}</p>
      </div>
      <div>
        <button onclick="togglePlan('${plan.id}', ${!plan.completed})">
          ${plan.completed ? "Undo" : "Done"}
        </button>
        <button class="secondary-btn" onclick="deletePlan('${plan.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

async function togglePlan(id, completed) {
  const { error } = await supabaseClient
    .from("plans")
    .update({ completed })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadPlans();
}

async function deletePlan(id) {
  if (!confirm("Delete this plan?")) return;

  const { error } = await supabaseClient
    .from("plans")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadPlans();
}

// ==========================================
// CALENDAR EVENTS
// ==========================================

async function addEvent() {
  if (!currentUser) return;

  const title = el("event-title").value.trim();
  const details = el("event-details").value.trim();
  const eventDate = el("event-date").value;
  const startTime = el("event-start").value || null;
  const endTime = el("event-end").value || null;

  if (!title || !eventDate) {
    alert("Enter an event title and date.");
    return;
  }

  const { error } = await supabaseClient.from("calendar_events").insert({
    user_id: currentUser.id,
    title,
    details,
    event_date: eventDate,
    start_time: startTime,
    end_time: endTime
  });

  if (error) {
    alert("Could not save event: " + error.message);
    return;
  }

  el("event-title").value = "";
  el("event-details").value = "";
  await loadEvents();
}

async function loadEvents() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("calendar_events")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("event_date", { ascending: true });

  if (error) {
    showMessage("events-list", "Could not load events: " + error.message);
    return;
  }

  const list = el("events-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = '<p class="empty-message">No events scheduled.</p>';
    return;
  }

  list.innerHTML = data.map(event => `
    <div class="event-item">
      <div>
        <strong>${escapeHTML(event.title)}</strong>
        <p>${escapeHTML(event.details || "")}</p>
        <small>
          ${escapeHTML(event.event_date)}
          ${event.start_time ? " · " + escapeHTML(event.start_time.slice(0, 5)) : ""}
          ${event.end_time ? "–" + escapeHTML(event.end_time.slice(0, 5)) : ""}
        </small>
      </div>
      <button class="secondary-btn" onclick="deleteEvent('${event.id}')">Delete</button>
    </div>
  `).join("");
}

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;

  const { error } = await supabaseClient
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadEvents();
}

// ==========================================
// REMINDERS AND BROWSER NOTIFICATIONS
// ==========================================

async function addReminder() {
  if (!currentUser) return;

  const title = el("reminder-title").value.trim();
  const notes = el("reminder-notes").value.trim();
  const remindAt = el("reminder-time").value;

  if (!title || !remindAt) {
    alert("Enter a reminder title and date/time.");
    return;
  }

  const date = new Date(remindAt);
  if (Number.isNaN(date.getTime())) {
    alert("Please enter a valid date and time.");
    return;
  }

  if (date.getTime() <= Date.now()) {
    alert("Choose a future date and time.");
    return;
  }

  const { error } = await supabaseClient.from("reminders").insert({
    user_id: currentUser.id,
    title,
    notes,
    remind_at: date.toISOString(),
    notified: false
  });

  if (error) {
    alert("Could not save reminder: " + error.message);
    return;
  }

  el("reminder-title").value = "";
  el("reminder-notes").value = "";
  el("reminder-time").value = "";
  await loadReminders();
}

async function loadReminders() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("reminders")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("remind_at", { ascending: true });

  if (error) {
    showMessage("reminders-list", "Could not load reminders: " + error.message);
    return;
  }

  const list = el("reminders-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = '<p class="empty-message">No reminders yet.</p>';
    return;
  }

  list.innerHTML = data.map(reminder => `
    <div class="reminder-item">
      <div>
        <strong>${escapeHTML(reminder.title)}</strong>
        <p>${escapeHTML(reminder.notes || "")}</p>
        <small>${escapeHTML(new Date(reminder.remind_at).toLocaleString())}</small>
        <p>${reminder.notified ? "Alert delivered while app was open" : "Waiting"}</p>
      </div>
      <button class="secondary-btn" onclick="deleteReminder('${reminder.id}')">Delete</button>
    </div>
  `).join("");
}

async function deleteReminder(id) {
  if (!confirm("Delete this reminder?")) return;

  const { error } = await supabaseClient
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadReminders();
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    alert("Notifications enabled. Keep HANIBAL open for reminder alerts.");
    checkDueReminders();
  } else {
    alert("Notification permission was not granted. You can still see reminders inside the app.");
  }
}

async function checkDueReminders() {
  if (!currentUser) return;

  const now = new Date().toISOString();

  const { data, error } = await supabaseClient
    .from("reminders")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("notified", false)
    .lte("remind_at", now);

  if (error || !data) return;

  for (const reminder of data) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("HANIBAL Reminder", {
        body: reminder.title
      });
    } else {
      alert("Reminder: " + reminder.title);
    }

    await supabaseClient
      .from("reminders")
      .update({ notified: true })
      .eq("id", reminder.id)
      .eq("user_id", currentUser.id);
  }

  if (data.length) loadReminders();
}

function startReminderChecker() {
  stopReminderChecker();
  checkDueReminders();
  notificationInterval = setInterval(checkDueReminders, 30000);
}

function stopReminderChecker() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
  }
}

// ==========================================
// KPI GOALS
// ==========================================

async function addKPI() {
  if (!currentUser) return;

  const title = el("kpi-title").value.trim();
  const target = Number(el("kpi-target").value);
  const current = Number(el("kpi-current").value || 0);
  const unit = el("kpi-unit").value.trim() || "tasks";
  const deadline = el("kpi-deadline").value || null;

  if (!title || !Number.isFinite(target) || target <= 0) {
    alert("Enter a goal name and a target greater than zero.");
    return;
  }

  if (!Number.isFinite(current) || current < 0) {
    alert("Enter a valid current progress value.");
    return;
  }

  const { error } = await supabaseClient.from("kpi_goals").insert({
    user_id: currentUser.id,
    title,
    target_value: target,
    current_value: current,
    unit,
    deadline
  });

  if (error) {
    alert("Could not save goal: " + error.message);
    return;
  }

  el("kpi-title").value = "";
  el("kpi-target").value = "";
  el("kpi-current").value = "";
  el("kpi-unit").value = "";
  el("kpi-deadline").value = "";

  loadKPIs();
}

async function loadKPIs() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("kpi_goals")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    showMessage("kpi-list", "Could not load goals: " + error.message);
    return;
  }

  const list = el("kpi-list");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = '<p class="empty-message">Create your first performance goal.</p>';
    return;
  }

  list.innerHTML = data.map(goal => {
    const target = Number(goal.target_value) || 1;
    const current = Number(goal.current_value) || 0;
    const percent = Math.min(100, Math.round((current / target) * 100));

    return `
      <div class="kpi-item">
        <div style="width:100%">
          <strong>${escapeHTML(goal.title)}</strong>
          <p>${current} / ${target} ${escapeHTML(goal.unit)}</p>
          <div class="progress-bg">
            <div class="progress-bar" style="width:${percent}%"></div>
          </div>
          <small>${percent}% complete · Deadline: ${escapeHTML(goal.deadline || "Not set")}</small>
          <label for="kpi-current-${goal.id}">Update progress</label>
          <input id="kpi-current-${goal.id}" type="number" min="0" value="${current}">
          <button onclick="updateKPI('${goal.id}')">Update</button>
          <button class="secondary-btn" onclick="deleteKPI('${goal.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

async function updateKPI(id) {
  const input = el("kpi-current-" + id);
  const value = Number(input.value);

  if (!Number.isFinite(value) || value < 0) {
    alert("Enter a valid progress value.");
    return;
  }

  const { error } = await supabaseClient
    .from("kpi_goals")
    .update({ current_value: value })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("Could not update goal: " + error.message);
    return;
  }

  loadKPIs();
}

async function deleteKPI(id) {
  if (!confirm("Delete this goal?")) return;

  const { error } = await supabaseClient
    .from("kpi_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadKPIs();
}

// ==========================================
// REPORTS
// ==========================================

async function loadReports() {
  if (!currentUser) return;

  const output = el("reports-content");
  if (!output) return;

  output.innerHTML = '<p class="empty-message">Loading your report...</p>';

  const [missionResult, focusResult, planResult, goalResult] =
    await Promise.all([
      supabaseClient
        .from("mission_logs")
        .select("id, action, created_at")
        .eq("user_id", currentUser.id),
      supabaseClient
        .from("focus_sessions")
        .select("duration_minutes")
        .eq("user_id", currentUser.id),
      supabaseClient
        .from("plans")
        .select("id, completed")
        .eq("user_id", currentUser.id),
      supabaseClient
        .from("kpi_goals")
        .select("id, current_value, target_value")
        .eq("user_id", currentUser.id)
    ]);

  const error =
    missionResult.error ||
    focusResult.error ||
    planResult.error ||
    goalResult.error;

  if (error) {
    output.innerHTML = `<p>Report error: ${escapeHTML(error.message)}</p>`;
    return;
  }

  const logs = missionResult.data || [];
  const sessions = focusResult.data || [];
  const plans = planResult.data || [];
  const goals = goalResult.data || [];

  const completedMissions = logs.filter(item => item.action === "completed").length;
  const totalFocus = sessions.reduce(
    (sum, item) => sum + (Number(item.duration_minutes) || 0), 0
  );
  const completedPlans = plans.filter(item => item.completed).length;

  output.innerHTML = `
    <div class="report-card">
      <strong>Mission completions recorded</strong>
      <p>${completedMissions}</p>
    </div>
    <div class="report-card">
      <strong>Focus time recorded</strong>
      <p>${totalFocus} minutes</p>
    </div>
    <div class="report-card">
      <strong>Plans completed</strong>
      <p>${completedPlans} of ${plans.length}</p>
    </div>
    <div class="report-card">
      <strong>KPI goals created</strong>
      <p>${goals.length}</p>
    </div>
    <p class="small-note">
      Reports count activity recorded since V10.0 history tracking began.
      Older activity from V9.0 may not appear here.
    </p>
  `;
}

// ==========================================
// FOCUS TIMER
// ==========================================

function updateFocusDisplay() {
  const minutes = Math.floor(focusSeconds / 60);
  const seconds = focusSeconds % 60;

  if (el("focus-timer")) {
    el("focus-timer").textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}

function startFocus() {
  if (focusRunning) return;

  if (focusSeconds <= 0) {
    const duration = Number(el("focus-duration").value);

    if (!Number.isFinite(duration) || duration < 1 || duration > 180) {
      alert("Choose a session between 1 and 180 minutes.");
      return;
    }

    focusSeconds = Math.round(duration * 60);
  }

  focusRunning = true;
  showMessage("focus-message", "Stay focused. You can do this!");

  focusInterval = setInterval(async () => {
    if (focusSeconds > 0) {
      focusSeconds--;
      updateFocusDisplay();
    }

    if (focusSeconds <= 0) {
      clearInterval(focusInterval);
      focusInterval = null;
      focusRunning = false;

      showMessage("focus-message", "Focus session completed! Great work.");

      if (currentUser) {
        const duration = Number(el("focus-duration").value);

        const { error } = await supabaseClient.from("focus_sessions").insert({
          user_id: currentUser.id,
          duration_minutes: duration
        });

        if (error) {
          console.error("Could not save focus session:", error);
        }
      }

      alert("Focus session completed! Well done!");
    }
  }, 1000);
}

function pauseFocus() {
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = null;
  focusRunning = false;
  showMessage("focus-message", "Focus session paused.");
}

function resetFocus() {
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = null;
  focusRunning = false;

  const duration = Number(el("focus-duration")?.value) || 25;
  focusSeconds = Math.max(1, Math.min(180, duration)) * 60;

  updateFocusDisplay();
  showMessage("focus-message", "Ready when you are.");
}

// ==========================================
// APP STARTUP
// ==========================================

async function startApp() {
  if (typeof supabaseClient === "undefined") {
    alert("Supabase configuration was not found. Check config.js.");
    return;
  }

  showLogin();

  if (el("plan-date")) el("plan-date").value = todayString();
  if (el("event-date")) el("event-date").value = todayString();

  resetFocus();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      handleUser(session.user);
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      stopReminderChecker();
      showLogin();
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showMessage("auth-message", error.message);
    return;
  }

  if (data.session?.user) {
    await handleUser(data.session.user);
  }
}

document.addEventListener("DOMContentLoaded", startApp);
