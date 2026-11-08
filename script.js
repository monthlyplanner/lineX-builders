
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyByMIpKF3AAldzu_6Cw8rDH41NgVo44-Uo",
  authDomain: "accountancy-804b2.firebaseapp.com",
  projectId: "accountancy-804b2",
  storageBucket: "accountancy-804b2.firebasestorage.app",
  messagingSenderId: "537103223807",
  appId: "1:537103223807:web:1d132e037c245c1fb835ca",
  measurementId: "G-M17HHGNH3C"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

let currentUser = null;
let clients = [];
let activeClient = null;
let allTransactionsCache = [];
let activeClientTransactions = [];
let savingClient = false;
let savingTransaction = false;
let isRegistering = false;
let isLoggingIn = false;

function setVisible(element, visible) {
  if (!element) return;
  element.classList.toggle("hidden", !visible);
  element.hidden = !visible;
}

function usernameToEmail(username) {
  return username.trim().toLowerCase() + "@users.buildledger.invalid";
}

function userCollection(name) {
  return collection(db, "users", currentUser.uid, name);
}

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

// PAGE NAVIGATION
function showPage(page) {
  ["dashboardPage", "clientsPage", "accountPage"].forEach(id => {
    setVisible($(id), id === page);
  });

  const titles = {
    dashboardPage: "Dashboard",
    clientsPage: "Clients",
    accountPage: "Client Account"
  };

  if ($("pageTitle")) {
    $("pageTitle").textContent = titles[page] || "BuildLedger";
  }
}

// LOGIN / REGISTER SWITCH
function switchAuth() {
  const login = $("loginForm");
  const register = $("registerForm");

  if (!login || !register) return;

  const registering = login.classList.contains("hidden");

  setVisible(login, registering);
  setVisible(register, !registering);

  message("loginMessage", "");
  message("registerMessage", "");

  if ($("authTitle")) {
    $("authTitle").textContent = registering
      ? "Welcome back"
      : "Create account";
  }

  if ($("authSubtitle")) {
    $("authSubtitle").textContent = registering
      ? "Sign in to your account"
      : "Register to use BuildLedger";
  }

  if ($("authSwitchText")) {
    $("authSwitchText").textContent = registering
      ? "Don't have an account?"
      : "Already have an account?";
  }

  if ($("switchAuthBtn")) {
    $("switchAuthBtn").textContent = registering
      ? "Create account"
      : "Sign in";
  }
}

$("switchAuthBtn")?.addEventListener("click", switchAuth);

// REGISTER
$("registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (isRegistering) return;

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const confirm = $("confirmPassword").value;

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    message("registerMessage", "Use 3–20 letters, numbers or underscores.");
    return;
  }

  if (password.length < 8) {
    message("registerMessage", "Password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    message("registerMessage", "Passwords do not match.");
    return;
  }

  isRegistering = true;
  const button = $("registerForm").querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Creating account...";
  }

  try {
    await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );
    message("registerMessage", "Account created successfully!");
  } catch (error) {
    console.error(error);
    message("registerMessage", "Registration failed: " + error.message);
  } finally {
    isRegistering = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Create account →";
    }
  }
});

// LOGIN
$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (isLoggingIn) return;

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    message("loginMessage", "Enter your username and password.");
    return;
  }

  isLoggingIn = true;
  const button = $("loginForm").querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Signing in...";
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password
    );
  } catch (error) {
    console.error(error);
    message("loginMessage", "Login failed: " + error.message);
  } finally {
    isLoggingIn = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Sign in →";
    }
  }
});

// LOGOUT
$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Sign out failed: " + error.message);
  }
});

// AUTHENTICATION STATE
onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (user) {
    setVisible($("loginScreen"), false);
    setVisible($("appScreen"), true);

    if ($("currentUsername")) {
      $("currentUsername").textContent =
        user.email?.split("@")[0] || "User";
    }

    showPage("dashboardPage");
    await loadClients();
  } else {
    clients = [];
    activeClient = null;
    allTransactionsCache = [];
    activeClientTransactions = [];
    setVisible($("loginScreen"), true);
    setVisible($("appScreen"), false);
  }
});

// NAVIGATION
$("dashboardNav")?.addEventListener("click", () => {
  showPage("dashboardPage");
  updateDashboard();
});

$("clientsNav")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

$("viewAllClients")?.addEventListener("click", () => {
  showPage("clientsPage");
  renderClients();
});

// CLIENT DIALOG
function openClientDialog() {
  if (savingClient) return;

  $("clientForm")?.reset();
  message("clientMessage", "");

  if ($("clientDialog") && !$("clientDialog").open) {
    $("clientDialog").showModal();
  }
}

$("addClientBtn")?.addEventListener("click", openClientDialog);
$("addClientTop")?.addEventListener("click", openClientDialog);

$("cancelDialog")?.addEventListener("click", () => {
  if (!savingClient) $("clientDialog")?.close();
});

// SAVE CLIENT
$("clientForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingClient) return;

  const name = $("clientName").value.trim();
  const phone = $("clientPhone").value.trim();
  const project = $("clientProject").value.trim();

  if (!currentUser) {
    message("clientMessage", "Please sign in first.");
    return;
  }

  if (!name) {
    message("clientMessage", "Enter a client name.");
    return;
  }

  savingClient = true;

  const form = $("clientForm");
  const button = form.querySelector('button[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  $("clientDialog").close();
  form.reset();

  try {
    const newClient = await addDoc(userCollection("clients"), {
      name,
      phone,
      project,
      createdAt: serverTimestamp()
    });

    clients.push({
      id: newClient.id,
      name,
      phone,
      project,
      income: 0,
      expenses: 0
    });

    renderClients();
    updateDashboard();
    const filter = $("dashboardClientFilter");
    if (filter) {
      const option = document.createElement("option");
      option.value = newClient.id;
      option.textContent = name;
      filter.appendChild(option);
    }
    await loadAllTransactions();
  } catch (error) {
    console.error("Client save failed:", error);
    alert("Client could not be saved: " + error.message);
  } finally {
    savingClient = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Save client";
    }
  }
});

// LOAD CLIENTS
async function loadClients() {
  if (!currentUser) return;

  try {
    const snapshot = await getDocs(userCollection("clients"));

    clients = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderClients();
    updateDashboard();
    const clientFilter = $("dashboardClientFilter");
    if (clientFilter) {
      clientFilter.innerHTML = '<option value="all">All clients</option>';
      clients.forEach(client => {
        const option = document.createElement("option");
        option.value = client.id;
        option.textContent = client.name || "Unnamed client";
        clientFilter.appendChild(option);
      });
    }
    await loadAllTransactions();
  } catch (error) {
    console.error("Loading clients failed:", error);
    alert("Could not load clients: " + error.message);
  }
}

// TRANSACTION EXPLORER: shared search and date filtering
function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateBounds(period, fromDate, toDate) {
  const today = new Date();
  const todayString = localDateString(today);
  if (period === "today") return { from: todayString, to: todayString };
  if (period === "week") {
    const start = new Date(today);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: localDateString(start), to: localDateString(end) };
  }
  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: localDateString(start), to: localDateString(end) };
  }
  if (period === "custom") return { from: fromDate || "", to: toDate || "" };
  return { from: "", to: "" };
}
