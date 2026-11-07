
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIGURATION - LINEX BUILDERS
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyB5uMpQPweSjvFT8lW6etkLQiTPKKR1_Zw",
  authDomain: "linex-builders.firebaseapp.com",
  projectId: "linex-builders",
  storageBucket: "linex-builders.firebasestorage.app",
  messagingSenderId: "310453994968",
  appId: "1:310453994968:web:b35362a87e2cd28e13dead",
  measurementId: "G-16DSMNFDFM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// APP STATE
// ==========================================

const $ = id => document.getElementById(id);

let currentUser = null;
let currentUsername = "";
let currentClient = null;
let isRegistering = false;

let clientsUnsubscribe = null;
let entriesUnsubscribe = null;

let dashboardEntryUnsubs = new Map();
let dashboardTotals = new Map();

let currentEntries = [];
let authReady = false;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatMoney(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function usernameEmail(username) {
  return username.toLowerCase() + "@buildledger.app";
}

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  if (!date) return "-";

  const parts = date.split("-");

  if (parts.length !== 3) return date;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function showMessage(message, success = false) {
  $("authMessage").textContent = message;

  $("authMessage").style.color = success
    ? "#15966a"
    : "#dc5555";
}

function setLoading(show) {
  $("loadingScreen").classList.toggle("hidden", !show);
}

function setAuthButtonText(text) {
  $("authButton").textContent = text;
}

function getUserClientsPath() {
  return collection(db, "users", currentUser.uid, "clients");
}

function getEntriesPath(clientId) {
  return collection(
    db,
    "users",
    currentUser.uid,
    "clients",
    clientId,
    "entries"
  );
}

// ==========================================
// SCREEN MANAGEMENT
// ==========================================

function showDashboard() {
  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");

  $("dashboard").classList.remove("hidden");
  $("ledgerSection").classList.add("hidden");
}

function resetSubscriptions() {
  if (clientsUnsubscribe) clientsUnsubscribe();
  if (entriesUnsubscribe) entriesUnsubscribe();

  clientsUnsubscribe = null;
  entriesUnsubscribe = null;

  dashboardEntryUnsubs.forEach(unsubscribe => unsubscribe());
  dashboardEntryUnsubs.clear();

  dashboardTotals.clear();
}

// ==========================================
// AUTHENTICATION TABS
// ==========================================

function setAuthMode(registering) {
  isRegistering = registering;

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);

  setAuthButtonText(
    registering ? "Create Account" : "Sign In"
  );

  $("password").minLength = registering ? 8 : 6;

  $("password").setAttribute(
    "autocomplete",
    registering ? "new-password" : "current-password"
  );

  showMessage("");
}

$("loginTab").addEventListener("click", () => {
  setAuthMode(false);
});

$("registerTab").addEventListener("click", () => {
  setAuthMode(true);
});

// ==========================================
// SHOW PASSWORD
// ==========================================

$("showPassword").addEventListener("change", event => {
  $("password").type = event.target.checked
    ? "text"
    : "password";
});

// ==========================================
// REGISTER AND LOGIN
// ==========================================

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("username").value.trim().toLowerCase();
  const password = $("password").value;

  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    showMessage(
      "Username must contain 3–20 letters, numbers, dots, _ or -."
    );
    return;
  }

  if (password.length < (isRegistering ? 8 : 6)) {
    showMessage(
      isRegistering
        ? "Password must contain at least 8 characters."
        : "Please enter your password."
    );
    return;
  }

  $("authButton").disabled = true;
  setAuthButtonText("Please wait...");

  try {
    const email = usernameEmail(username);

    if (isRegistering) {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await setDoc(
        doc(db, "users", credential.user.uid),
        {
          username,
          createdAt: serverTimestamp()
        }
      );

      showMessage("Account created successfully!", true);

    } else {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
    }

  } catch (error) {
    console.error("Authentication error:", error);

    const messages = {
      "auth/email-already-in-use":
        "This username is already taken.",

      "auth/invalid-credential":
        "Incorrect username or password.",

      "auth/user-not-found":
        "Account not found. Please register first.",

      "auth/weak-password":
        "Please choose a stronger password.",

      "auth/too-many-requests":
        "Too many attempts. Try again later.",

      "auth/network-request-failed":
        "Check your internet connection.",

      "auth/operation-not-allowed":
        "Enable Email/Password in Firebase Authentication."
    };

    showMessage(messages[error.code] || error.message);

  } finally {
    $("authButton").disabled = false;

    setAuthButtonText(
      isRegistering ? "Create Account" : "Sign In"
    );
  }
});

// ==========================================
// AUTHENTICATION STATE
// ==========================================

onAuthStateChanged(auth, user => {
  resetSubscriptions();

  currentUser = user;
  currentClient = null;
  currentEntries = [];

  if (!user) {
    currentUsername = "";

    $("appScreen").classList.add("hidden");
    $("authScreen").classList.remove("hidden");

    if (authReady) showMessage("");

    authReady = true;
    setLoading(false);

    return;
  }

  currentUsername = user.email
    ? user.email.split("@")[0]
    : "User";

  $("displayUsername").textContent = currentUsername;

  $("userAvatar").textContent =
    currentUsername.charAt(0).toUpperCase();

  $("todayDisplay").textContent =
    new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });

  showDashboard();
  listenToClients();

  authReady = true;
  setLoading(false);
});

// ==========================================
// LOGOUT
// ==========================================

$("logoutBtn").addEventListener("click", async () => {
  if (!confirm("Are you sure you want to sign out?")) {
    return;
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("Could not sign out: " + error.message);
  }
});

// ==========================================
// CLIENT FORM
// ==========================================

$("addClientBtn").addEventListener("click", () => {
  $("clientForm").classList.remove("hidden");
  $("clientName").focus();
});

$("cancelClientBtn").addEventListener("click", () => {
  $("clientForm").reset();
  $("clientForm").classList.add("hidden");
});

// ==========================================
// ADD CLIENT
// ==========================================

$("clientForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const name = $("clientName").value.trim();

  if (!name) return;

  try {
    await addDoc(getUserClientsPath(), {
      name,
      createdAt: serverTimestamp()
    });

    $("clientForm").reset();
    $("clientForm").classList.add("hidden");

  } catch (error) {
    console.error(error);
    alert("Could not add client: " + error.message);
  }
});

// ==========================================
// LISTEN TO CLIENTS
// ==========================================

function listenToClients() {
  if (clientsUnsubscribe) clientsUnsubscribe();

  const clientsQuery = query(
    getUserClientsPath(),
    orderBy("createdAt", "desc")
  );

  clientsUnsubscribe = onSnapshot(
    clientsQuery,
    snapshot => {
      const clients = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderClients(clients);
      watchDashboardTotals(clients);
    },
    error => {
      console.error(error);
      alert("Unable to load clients: " + error.message);
    }
  );
}

// ==========================================
// DISPLAY CLIENTS
// ==========================================

function renderClients(clients) {
  const container = $("clientsList");

  container.replaceChildren();

  $("clientCount").textContent =
    `${clients.length} ${clients.length === 1 ? "Client" : "Clients"}`;

  $("clientCountNumber").textContent = clients.length;

  if (clients.length === 0) {
    const empty = document.createElement("div");

    empty.className = "empty-state";
    empty.textContent =
      "No clients added yet. Click + Add New Client to begin.";

    container.appendChild(empty);
    return;
  }

  clients.forEach(client => {
    const card = document.createElement("div");
    card.className = "client-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const title = document.createElement("h3");
    title.textContent = client.name;

    const description = document.createElement("p");
    description.textContent = "Client financial account";

    const arrow = document.createElement("div");
    arrow.className = "client-arrow";
    arrow.textContent = "Open Ledger →";

    card.append(title, description, arrow);

    card.addEventListener("click", () => openClient(client));

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openClient(client);
      }
    });

    container.appendChild(card);
  });
}

// ==========================================
// DASHBOARD FINANCIAL TOTALS
// ==========================================

function watchDashboardTotals(clients) {
  const validIds = new Set(clients.map(client => client.id));

  // Remove listeners for deleted clients.
  dashboardEntryUnsubs.forEach((unsubscribe, id) => {
    if (!validIds.has(id)) {
      unsubscribe();
      dashboardEntryUnsubs.delete(id);
      dashboardTotals.delete(id);
    }
  });

  // Listen to each client's entries.
  clients.forEach(client => {
    if (dashboardEntryUnsubs.has(client.id)) return;

    dashboardTotals.set(client.id, {
      received: 0,
      balance: 0
    });

    const unsubscribe = onSnapshot(
      query(
        getEntriesPath(client.id),
        orderBy("date", "asc")
      ),
      snapshot => {
        let received = 0;
        let balance = 0;

        snapshot.docs.forEach(item => {
          const entry = item.data();
          const amount = Number(entry.amount) || 0;

          if (entry.received === true) {
            received += amount;
          } else {
            balance += amount;
          }
        });

        dashboardTotals.set(client.id, {
          received,
          balance
        });

        updateDashboardTotals();
      },
      error => {
        console.error("Dashboard totals error:", error);
      }
    );

    dashboardEntryUnsubs.set(client.id, unsubscribe);
  });

  updateDashboardTotals();
}

function updateDashboardTotals() {
  let received = 0;
  let balance = 0;

  dashboardTotals.forEach(total => {
    received += total.received;
    balance += total.balance;
  });

  $("dashboardReceived").textContent = formatMoney(received);
  $("dashboardBalance").textContent = formatMoney(balance);
}

// ==========================================
// OPEN CLIENT LEDGER
// ==========================================

function openClient(client) {
  currentClient = client;

  $("dashboard").classList.add("hidden");
  $("ledgerSection").classList.remove("hidden");

  $("ledgerClientName").textContent = client.name;

  $("entryDate").value = todayDate();

  $("transactionForm").reset();
  $("entryDate").value = todayDate();

  listenToEntries();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// ==========================================
// BACK TO DASHBOARD
// ==========================================

$("backBtn").addEventListener("click", () => {
  currentClient = null;
  currentEntries = [];

  if (entriesUnsubscribe) {
    entriesUnsubscribe();
  }

  entriesUnsubscribe = null;

  $("ledgerSection").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

// ==========================================
// ADD TRANSACTION
// ==========================================

$("transactionForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !currentClient) return;

  const date = $("entryDate").value;
  const description = $("entryDescription").value.trim();
  const amount = Number($("entryAmount").value);

  if (
    !date ||
    !description ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    alert("Please enter valid transaction details.");
    return;
  }

  try {
    await addDoc(getEntriesPath(currentClient.id), {
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      received: false,
      createdAt: serverTimestamp()
    });

    $("transactionForm").reset();
    $("entryDate").value = todayDate();

  } catch (error) {
    console.error(error);
    alert("Could not save transaction: " + error.message);
  }
});

// ==========================================
// LISTEN TO TRANSACTIONS
// ==========================================

function listenToEntries() {
  if (entriesUnsubscribe) entriesUnsubscribe();

  const entriesQuery = query(
    getEntriesPath(currentClient.id),
    orderBy("date", "asc")
  );

  entriesUnsubscribe = onSnapshot(
    entriesQuery,
    snapshot => {
      currentEntries = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderEntries(currentEntries);
    },
    error => {
      console.error(error);
      alert("Unable to load transactions: " + error.message);
    }
  );
}

// ==========================================
// CHANGE PAYMENT STATUS
// ==========================================

async function toggleReceived(entryId, received) {
  if (!currentUser || !currentClient) return;

  try {
    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid,
        "clients",
        currentClient.id,
        "entries",
        entryId
      ),
      { received }
    );

  } catch (error) {
    console.error(error);
    alert("Could not update payment status: " + error.message);
  }
}

// ==========================================
// DELETE TRANSACTION
// ==========================================

async function deleteEntry(entryId) {
  if (!confirm("Delete this transaction permanently?")) return;

  if (!currentUser || !currentClient) return;

  try {
    await deleteDoc(
      doc(
        db,
        "users",
        currentUser.uid,
        "clients",
        currentClient.id,
        "entries",
        entryId
      )
    );

  } catch (error) {
    console.error(error);
    alert("Could not delete transaction: " + error.message);
  }
}

// ==========================================
// DISPLAY TRANSACTIONS AND TOTALS
// ==========================================

function renderEntries(entries) {
  const tbody = $("entriesBody");

  tbody.replaceChildren();

  let totalAmount = 0;
  let totalReceived = 0;
  let totalBalance = 0;

  $("entryCount").textContent =
    `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;

  if (entries.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.className = "empty-state";
    cell.textContent = "No transactions yet.";

    row.appendChild(cell);
    tbody.appendChild(row);
  }

  entries.forEach(entry => {
    const amount = Number(entry.amount) || 0;
    const received = entry.received === true;

    totalAmount += amount;

    if (received) {
      totalReceived += amount;
    } else {
      totalBalance += amount;
    }

    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(entry.date);

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = entry.description || "";

    const amountCell = document.createElement("td");
    amountCell.textContent = formatMoney(amount);

    const checkboxCell = document.createElement("td");
    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = "received-checkbox";
    checkbox.checked = received;
    checkbox.setAttribute("aria-label", "Mark payment as received");

    checkbox.addEventListener("change", () => {
      toggleReceived(entry.id, checkbox.checked);
    });

    checkboxCell.appendChild(checkbox);

    const receivedCell = document.createElement("td");
    receivedCell.textContent = received ? formatMoney(amount) : "—";

    const balanceCell = document.createElement("td");
    balanceCell.textContent = received ? "—" : formatMoney(amount);

    const deleteCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "delete-entry-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
      deleteEntry(entry.id);
    });

    deleteCell.appendChild(deleteButton);

    row.append(
      dateCell,
      descriptionCell,
      amountCell,
      checkboxCell,
      receivedCell,
      balanceCell,
      deleteCell
    );

    tbody.appendChild(row);
  });

  totalAmount = Math.round(totalAmount * 100) / 100;
  totalReceived = Math.round(totalReceived * 100) / 100;
  totalBalance = Math.round(totalBalance * 100) / 100;

  $("totalAmount").textContent = formatMoney(totalAmount);
  $("totalReceived").textContent = formatMoney(totalReceived);
  $("totalBalance").textContent = formatMoney(totalBalance);

  $("footAmount").textContent = formatMoney(totalAmount);
  $("footReceived").textContent = formatMoney(totalReceived);
  $("footBalance").textContent = formatMoney(totalBalance);
}

// ==========================================
// PROFESSIONAL PDF DOWNLOAD
// ==========================================

$("downloadPdfBtn").addEventListener("click", downloadPDF);

function downloadPDF() {
  if (!currentClient) {
    alert("Please open a client first.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library could not load. Check your internet connection and refresh.");
    return;
  }

  try {
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();

    let totalAmount = 0;
    let totalReceived = 0;
    let totalBalance = 0;

    currentEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;

      totalAmount += amount;

      if (entry.received === true) {
        totalReceived += amount;
      } else {
        totalBalance += amount;
      }
    });

    const pdfMoney = value =>
      "INR " + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

    // Header
    pdf.setFillColor(16, 29, 53);
    pdf.rect(0, 0, pageWidth, 43, "F");

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);

    pdf.text("LineX Builders", 15, 17);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    pdf.text("CLIENT FINANCIAL STATEMENT", 15, 25);
    pdf.text("Payment and balance report", 15, 32);

    // Client details
    pdf.setTextColor(35, 48, 70);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);

    pdf.text("CLIENT DETAILS", 15, 55);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);

    pdf.text("Client Name: " + currentClient.name, 15, 63);
    pdf.text("Prepared: " + new Date().toLocaleDateString("en-IN"), 15, 70);

    // Summary
    pdf.setFillColor(244, 247, 251);
    pdf.roundedRect(15, 79, pageWidth - 30, 28, 3, 3, "F");

    const boxWidth = (pageWidth - 30) / 3;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 125, 145);

    pdf.text("TOTAL AMOUNT", 19, 88);
    pdf.text("TOTAL RECEIVED", 19 + boxWidth, 88);
    pdf.text("BALANCE", 19 + boxWidth * 2, 88);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);

    pdf.setTextColor(35, 48, 70);
    pdf.text(pdfMoney(totalAmount), 19, 98);

    pdf.setTextColor(20, 150, 107);
    pdf.text(pdfMoney(totalReceived), 19 + boxWidth, 98);

    pdf.setTextColor(201, 130, 45);
    pdf.text(pdfMoney(totalBalance), 19 + boxWidth * 2, 98);

    // Transaction table
    const tableRows = currentEntries.map(entry => {
      const amount = Number(entry.amount) || 0;
      const received = entry.received === true;

      return [
        formatDate(entry.date),
        entry.description || "",
        pdfMoney(amount),
        received ? "Received" : "Pending",
        received ? pdfMoney(amount) : "-",
        received ? "-" : pdfMoney(amount)
      ];
    });

    if (typeof pdf.autoTable !== "function") {
      alert("PDF table library could not load. Refresh the page and try again.");
      return;
    }

    pdf.autoTable({
      startY: 119,
      head: [[
        "Date",
        "Description",
        "Amount",
        "Status",
        "Received",
        "Balance"
      ]],
      body: tableRows,
      theme: "grid",

      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 3,
        textColor: [55, 67, 85],
        lineColor: [225, 231, 239],
        lineWidth: 0.2
      },

      headStyles: {
        fillColor: [27, 48, 78],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },

      alternateRowStyles: {
        fillColor: [247, 249, 252]
      },

      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 47 },
        2: { cellWidth: 27, halign: "right" },
        3: { cellWidth: 23 },
        4: { cellWidth: 31, halign: "right" },
        5: { cellWidth: 31, halign: "right" }
      },

      margin: {
        left: 15,
        right: 15,
        bottom: 23
      }
    });

    // Grand total after table
    let finalY = pdf.lastAutoTable.finalY + 9;

    if (finalY > 260) {
      pdf.addPage();
      finalY = 25;
    }

    pdf.setFillColor(244, 247, 251);
    pdf.roundedRect(15, finalY, pageWidth - 30, 25, 3, 3, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(35, 48, 70);

    pdf.text("GRAND TOTAL", 20, finalY + 10);

    pdf.setFontSize(8);
    pdf.text(
      "Amount: " + pdfMoney(totalAmount),
      20,
      finalY + 18
    );

    pdf.setTextColor(20, 150, 107);
    pdf.text(
      "Received: " + pdfMoney(totalReceived),
      90,
      finalY + 18
    );

    pdf.setTextColor(201, 130, 45);
    pdf.text(
      "Balance: " + pdfMoney(totalBalance),
      155,
      finalY + 18
    );

    // Page footers
    const pages = pdf.internal.getNumberOfPages();

    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);

      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setDrawColor(225, 231, 240);
      pdf.line(15, pageHeight - 17, pageWidth - 15, pageHeight - 17);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(130, 140, 155);

      pdf.text(
        "LineX Builders | Client Financial Statement",
        15,
        pageHeight - 10
      );

      pdf.text(
        `Page ${i} of ${pages}`,
        pageWidth - 15,
        pageHeight - 10,
        { align: "right" }
      );
    }

    // Safe filename
    const safeName = currentClient.name
      .replace(/[^a-z0-9_-]/gi, "_")
      .slice(0, 60);

    pdf.save(`LineX_Builders_${safeName}_Statement.pdf`);

  } catch (error) {
    console.error("PDF error:", error);
    alert("Could not create PDF: " + error.message);
  }
}

// ==========================================
// END OF LINEX BUILDERS
// ==========================================
