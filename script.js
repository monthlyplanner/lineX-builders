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
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyBFiUIycNTKsNk_rCEEhNQsUjXk_9EMuzc",
  authDomain: "linex-builders-92823.firebaseapp.com",
  projectId: "linex-builders-92823",
  storageBucket: "linex-builders-92823.firebasestorage.app",
  messagingSenderId: "768064933626",
  appId: "1:768064933626:web:99c6c60f38b5bd49ea4343"
};

// INITIALIZE FIREBASE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentClient = null;
let editingTransactionId = null;

const $ = id => document.getElementById(id);

// USER COLLECTIONS
function userCollection(name) {
  return collection(db, "users", currentUser.uid, name);
}

function transactionCollection() {
  return collection(
    db,
    "users",
    currentUser.uid,
    "clients",
    currentClient.id,
    "transactions"
  );
}

function transactionDocument(id) {
  return doc(
    db,
    "users",
    currentUser.uid,
    "clients",
    currentClient.id,
    "transactions",
    id
  );
}

// HELPERS
function showMessage(id, message) {
  $(id).textContent = message;
}

function usernameEmail(username) {
  return username.trim().toLowerCase() + "@linexbuilders.app";
}

function money(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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

// KEEP SHARED CLIENT DATA UPDATED
async function syncPublicShare(client, transactions) {
  if (!client.shareId) return;

  const shareId = client.shareId;

  await setDoc(
    doc(db, "publicShares", shareId, "client", "data"),
    {
      name: client.name || "",
      phone: client.phone || "",
      address: client.address || ""
    }
  );

  const sharedTransactions = collection(
    db, "publicShares", shareId, "transactions"
  );

  const existing = await getDocs(sharedTransactions);
  const currentIds = new Set(transactions.map(item => item.id));

  await Promise.all(
    existing.docs
      .filter(item => !currentIds.has(item.id))
      .map(item => deleteDoc(item.ref))
  );

  await Promise.all(
    transactions.map(item =>
      setDoc(doc(sharedTransactions, item.id), {
        date: item.date || "",
        description: item.description || "",
        amount: Number(item.amount || 0),
        paid: Boolean(item.paid)
      })
    )
  );
}

const shareIdFromUrl = new URLSearchParams(window.location.search).get("share");

// READ-ONLY PUBLIC CLIENT PAGE
function renderPublicShare(shareId) {
  document.body.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f7fb; color: #1e293b; font-family: Arial, sans-serif; }
      .public-wrap { max-width: 1050px; margin: 35px auto; padding: 20px; }
      .public-header, .public-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; margin-bottom: 18px; box-shadow: 0 4px 18px rgba(15,23,42,.04); }
      .public-brand { color: #2563eb; font-weight: 800; letter-spacing: 1px; }
      .public-muted { color: #64748b; }
      .public-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
      .public-stat { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; }
      .public-stat span { display: block; color: #64748b; font-size: 13px; margin-bottom: 8px; }
      .public-stat strong { font-size: 21px; }
      .public-table-wrap { overflow-x: auto; }
      .public-table { width: 100%; border-collapse: collapse; min-width: 650px; }
      .public-table th, .public-table td { padding: 13px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
      .public-table th { background: #eff6ff; color: #1e40af; font-size: 12px; }
      .public-table tfoot td { font-weight: 700; background: #f8fafc; }
      .public-status { padding: 40px 20px; text-align: center; background: white; border-radius: 16px; }
      @media (max-width: 650px) {
        .public-wrap { margin: 12px auto; padding: 12px; }
        .public-stats { grid-template-columns: 1fr; }
      }
    </style>
    <main class="public-wrap">
      <header class="public-header">
        <div class="public-brand">LINEX BUILDERS</div>
        <h1>Client Account Statement</h1>
        <p class="public-muted">Read-only shared account view</p>
      </header>
      <section id="publicContent" class="public-status">Loading client account...</section>
    </main>
  `;

  const content = document.getElementById("publicContent");
  const shareRef = doc(db, "publicShares", shareId);
  let stopClientListener = null;
  let stopTransactionsListener = null;

  const showUnavailable = message => {
    if (stopClientListener) stopClientListener();
    if (stopTransactionsListener) stopTransactionsListener();
    content.className = "public-status";
    content.textContent = message;
  };

  onSnapshot(shareRef, shareSnapshot => {
    if (!shareSnapshot.exists() || shareSnapshot.data().enabled !== true) {
      showUnavailable("This shared client page is unavailable.");
      return;
    }
    if (stopClientListener || stopTransactionsListener) return;    const clientRef = doc(db, "publicShares", shareId, "client", "data");
    const transactionsRef = collection(db, "publicShares", shareId, "transactions");
    let clientData = null;
    let transactionData = [];

    const render = () => {
      if (!clientData) return;

      const sorted = [...transactionData].sort((a, b) =>
        (b.date || "").localeCompare(a.date || "")
      );

      let total = 0;
      let received = 0;
      let balance = 0;

      sorted.forEach(item => {
        const amount = Number(item.amount || 0);
        total += amount;
        if (item.paid) received += amount;
        else balance += amount;
      });

      content.className = "";
      content.innerHTML = `
        <section class="public-card">
          <h2>${escapeHTML(clientData.name || "Client")}</h2>
          <p class="public-muted">
            ${clientData.phone ? "Phone: " + escapeHTML(clientData.phone) : ""}
            ${clientData.phone && clientData.address ? " · " : ""}
            ${clientData.address ? "Address: " + escapeHTML(clientData.address) : ""}
          </p>
        </section>
        <section class="public-stats">
          <div class="public-stat"><span>Total Amount</span><strong>${money(total)}</strong></div>
          <div class="public-stat"><span>Received</span><strong>${money(received)}</strong></div>
          <div class="public-stat"><span>Balance</span><strong>${money(balance)}</strong></div>
        </section>
        <section class="public-card">
          <h2>Transaction History</h2>
          <div class="public-table-wrap">
            <table class="public-table">
              <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Received</th><th>Balance</th></tr></thead>
              <tbody>
                ${sorted.length ? sorted.map(item => {
                  const amount = Number(item.amount || 0);
                  const paid = Boolean(item.paid);
                  return `<tr>
                    <td>${escapeHTML(item.date || "")}</td>
                    <td>${escapeHTML(item.description || "")}</td>
                    <td>${money(amount)}</td>
                    <td>${paid ? money(amount) : "—"}</td>
                    <td>${paid ? "—" : money(amount)}</td>
                  </tr>`;
                }).join("") : `<tr><td colspan="5" style="text-align:center">No transactions yet.</td></tr>`}
              </tbody>
              <tfoot><tr><td colspan="2">TOTAL</td><td>${money(total)}</td><td>${money(received)}</td><td>${money(balance)}</td></tr></tfoot>
            </table>
          </div>
          <p class="public-muted" style="font-size:12px">This page is view-only. Account information updates when the owner saves changes.</p>
        </section>
      `;
    };

    stopClientListener = onSnapshot(clientRef, snapshot => {
      if (!snapshot.exists()) {
        showUnavailable("Client details are not available.");
        return;
      }
      clientData = snapshot.data();
      render();
    }, error => {
      console.error(error);
      showUnavailable("Could not load this shared client page.");
    });

    stopTransactionsListener = onSnapshot(transactionsRef, snapshot => {
      transactionData = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      render();
    }, error => {
      console.error(error);
      showUnavailable("Could not load transaction history.");
    });
  }, error => {
    console.error(error);
    showUnavailable("This shared client page is unavailable or the link is invalid.");
  });
}

if (shareIdFromUrl) {
  renderPublicShare(shareIdFromUrl);
}

// AUTH SCREEN SWITCHING
$("showRegister").addEventListener("click", event => {
  event.preventDefault();
  $("loginBox").classList.add("hidden");
  $("registerBox").classList.remove("hidden");
  showMessage("authMessage", "");
});

$("showLogin").addEventListener("click", event => {
  event.preventDefault();
  $("registerBox").classList.add("hidden");
  $("loginBox").classList.remove("hidden");
  showMessage("authMessage", "");
});

// SHOW / HIDE PASSWORD
document.querySelectorAll(".toggle-password").forEach(button => {
  button.addEventListener("click", () => {
    const field = $(button.dataset.target);
    const isPassword = field.type === "password";
    field.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "🙈" : "👁";
  });
});

// REGISTER
$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const confirmPassword = $("confirmPassword").value;

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    showMessage(
      "authMessage",
      "Username must be 3–20 characters and contain only letters, numbers or underscores."
    );
    return;
  }

  if (password.length < 6) {
    showMessage("authMessage", "Password must be at least 6 characters.");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("authMessage", "Passwords do not match.");
    return;
  }

  const submitButton = $("registerForm").querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage("authMessage", "Creating account...");

  try {
    await createUserWithEmailAndPassword(
      auth,
      usernameEmail(username),
      password
    );
    $("registerForm").reset();
    showMessage("authMessage", "");
  } catch (error) {
    console.error(error);
    let message = "Could not create account. Please try again.";

    if (error.code === "auth/email-already-in-use") {
      message = "This username is already taken.";
    } else if (error.code === "auth/weak-password") {
      message = "Please choose a stronger password.";
    } else if (error.code === "auth/operation-not-allowed") {
      message = "Enable Email/Password sign-in in Firebase Authentication.";
    }

    showMessage("authMessage", message);
  } finally {
    submitButton.disabled = false;
  }
});

// LOGIN
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!username || !password) {
    showMessage("authMessage", "Enter your username and password.");
    return;
  }

  const submitButton = $("loginForm").querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage("authMessage", "Logging in...");

  try {
    await signInWithEmailAndPassword(
      auth,
      usernameEmail(username),
      password
    );
    $("loginForm").reset();
    showMessage("authMessage", "");
  } catch (error) {
    console.error(error);
    showMessage("authMessage", "Incorrect username or password.");
  } finally {
    submitButton.disabled = false;
  }
});

// LOGOUT
$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

// AUTH STATE
onAuthStateChanged(auth, async user => {
  if (shareIdFromUrl) return;
  currentUser = user;

  if (user) {    $("authScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");

    const username = user.email.split("@")[0];
    $("welcomeUser").textContent = "Welcome, " + username;

    await loadClients();
    showDashboard();

  } else {
    $("appScreen").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
    $("dashboardPage").classList.remove("hidden");
    $("clientPage").classList.add("hidden");
    currentClient = null;
  }
});

// PAGE NAVIGATION
function showDashboard() {
  $("dashboardPage").classList.remove("hidden");
  $("clientPage").classList.add("hidden");
}

function showClientPage() {
  $("dashboardPage").classList.add("hidden");
  $("clientPage").classList.remove("hidden");
}

$("backBtn").addEventListener("click", () => {
  currentClient = null;
  showDashboard();
});

// CLIENT DIALOG
function openClientDialog() {
  $("clientForm").reset();
  showMessage("clientMessage", "");

  if (!$("clientDialog").open) {
    $("clientDialog").showModal();
  }
}

$("addClientTop").addEventListener("click", openClientDialog);

$("cancelClientBtn").addEventListener("click", () => {
  $("clientDialog").close();
});

// ADD CLIENT
$("clientForm").addEventListener("submit", async event => {
  event.preventDefault();

  const name = $("clientName").value.trim();

  if (!name) {
    showMessage("clientMessage", "Enter the client name.");
    return;
  }

  const button = $("clientForm").querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage("clientMessage", "Saving client...");

  try {
    await addDoc(userCollection("clients"), {
      name,
      phone: $("clientPhone").value.trim(),
      address: $("clientAddress").value.trim(),
      createdAt: new Date().toISOString()
    });

    $("clientDialog").close();
    $("clientForm").reset();
    await loadClients();

  } catch (error) {
    console.error(error);
    showMessage("clientMessage", "Could not save client. Check Firebase rules.");
  } finally {
    button.disabled = false;
  }
});

// LOAD CLIENTS
async function loadClients() {
  if (!currentUser) return;

  try {
    const snapshot = await getDocs(userCollection("clients"));

    const clients = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    $("totalClients").textContent = clients.length;

    if (clients.length === 0) {
      $("clientList").innerHTML =
        '<div class="empty-message">No clients yet. Click + Add Client to begin.</div>';
      return;
    }

    $("clientList").innerHTML = clients.map(client => `
      <div class="client-card" data-id="${escapeHTML(client.id)}">
        <h3>${escapeHTML(client.name)}</h3>
        <p>${escapeHTML(client.phone || "No phone number")}</p>
        <p>${escapeHTML(client.address || "No address")}</p>
        <p>Click to open account →</p>
      </div>
    `).join("");

    document.querySelectorAll(".client-card").forEach(card => {
      card.addEventListener("click", () => {
        const client = clients.find(item => item.id === card.dataset.id);
        if (client) openClient(client);
      });
    });

  } catch (error) {
    console.error(error);
    $("clientList").innerHTML =
      '<div class="empty-message">Could not load clients. Check your Firebase settings.</div>';
  }
}

// OPEN CLIENT
async function openClient(client) {
  currentClient = client;

  $("clientNameTitle").textContent = client.name;
  $("clientDetails").textContent =
    [client.phone, client.address].filter(Boolean).join(" • ");

  showClientPage();
  await loadTransactions();
}

// ADD TRANSACTION BUTTON
$("addTransactionBtn").addEventListener("click", () => {
  editingTransactionId = null;
  $("transactionForm").reset();
  $("transactionDialogTitle").textContent = "Add Transaction";
  $("transactionDate").value = new Date().toISOString().slice(0, 10);
  showMessage("transactionMessage", "");
  $("transactionDialog").showModal();
});

$("cancelTransactionBtn").addEventListener("click", () => {
  $("transactionDialog").close();
});

// SAVE TRANSACTION
$("transactionForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentClient) return;

  const amount = Number($("transactionAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("transactionMessage", "Enter a valid amount.");
    return;
  }

  const transaction = {
    date: $("transactionDate").value,
    description: $("transactionDescription").value.trim(),
    amount,
    paid: $("transactionPaid").checked
  };

  if (!transaction.description || !transaction.date) {
    showMessage("transactionMessage", "Complete all required fields.");
    return;
  }

  const button = $("transactionForm").querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage("transactionMessage", "Saving...");

  try {
    if (editingTransactionId) {
      await updateDoc(
        transactionDocument(editingTransactionId),
        transaction      );
    } else {
      await addDoc(transactionCollection(), {
        ...transaction,
        createdAt: new Date().toISOString()
      });
    }

    $("transactionDialog").close();
    $("transactionForm").reset();
    editingTransactionId = null;
    await loadTransactions();

  } catch (error) {
    console.error(error);
    showMessage("transactionMessage", "Could not save transaction.");
  } finally {
    button.disabled = false;
  }
});

// LOAD TRANSACTIONS
async function loadTransactions() {
  if (!currentClient) return;

  try {
    const snapshot = await getDocs(transactionCollection());

    const transactions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    transactions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    await syncPublicShare(currentClient, transactions);

    let total = 0;
    let received = 0;
    let balance = 0;

    transactions.forEach(transaction => {
      const amount = Number(transaction.amount || 0);
      total += amount;

      if (transaction.paid) {
        received += amount;
      } else {
        balance += amount;
      }
    });

    $("totalAmount").textContent = money(total);
    $("totalReceived").textContent = money(received);
    $("totalBalance").textContent = money(balance);

    $("transactionTotals").innerHTML = `
      <tr class="total-row">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td><strong>${money(total)}</strong></td>
        <td></td>
        <td><strong>${money(received)}</strong></td>
        <td><strong>${money(balance)}</strong></td>
        <td></td>
      </tr>
    `;

    $("bottomTotalAmount").textContent = money(total);
    $("bottomTotalReceived").textContent = money(received);
    $("bottomTotalBalance").textContent = money(balance);

    if (transactions.length === 0) {
      $("transactionList").innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center">
            No transactions yet.
          </td>
        </tr>
      `;
      return;
    }

    $("transactionList").innerHTML = transactions.map(transaction => {
      const amount = Number(transaction.amount || 0);
      const paid = Boolean(transaction.paid);

      return `
        <tr>
          <td>${escapeHTML(transaction.date || "")}</td>
          <td>${escapeHTML(transaction.description || "")}</td>
          <td>${money(amount)}</td>
          <td>
            <input
              type="checkbox"
              class="paid-checkbox"
              data-id="${escapeHTML(transaction.id)}"
              ${paid ? "checked" : ""}
              aria-label="Mark as paid"
            >
          </td>
          <td>${paid ? money(amount) : "—"}</td>
          <td>${paid ? "—" : money(amount)}</td>
          <td>
            <div class="action-buttons">
              <button class="edit-btn" data-id="${escapeHTML(transaction.id)}" title="Edit">
                <i data-lucide="pencil"></i>
              </button>
              <button class="delete-btn" data-id="${escapeHTML(transaction.id)}" title="Delete">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    lucide.createIcons();

    // PAID CHECKBOX
    document.querySelectorAll(".paid-checkbox").forEach(checkbox => {
      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;

        try {
          await updateDoc(transactionDocument(checkbox.dataset.id), {
            paid: checkbox.checked
          });
          await loadTransactions();
        } catch (error) {
          console.error(error);
          alert("Could not update paid status.");
          await loadTransactions();
        }
      });
    });

    // EDIT BUTTON
    document.querySelectorAll(".edit-btn").forEach(button => {
      button.addEventListener("click", () => {
        const transaction = transactions.find(
          item => item.id === button.dataset.id
        );

        if (!transaction) return;

        editingTransactionId = transaction.id;
        $("transactionDialogTitle").textContent = "Edit Transaction";
        $("transactionDate").value = transaction.date || "";
        $("transactionDescription").value = transaction.description || "";
        $("transactionAmount").value = transaction.amount || "";
        $("transactionPaid").checked = Boolean(transaction.paid);

        showMessage("transactionMessage", "");
        $("transactionDialog").showModal();
      });
    });

    // DELETE BUTTON
    document.querySelectorAll(".delete-btn").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this transaction?")) return;

        try {
          await deleteDoc(transactionDocument(button.dataset.id));
          await loadTransactions();
        } catch (error) {
          console.error(error);
          alert("Could not delete transaction.");
        }
      });
    });

  } catch (error) {
    console.error(error);
    $("transactionList").innerHTML = `
      <tr>        <td colspan="7">Could not load transactions.</td>
      </tr>
    `;
  }
}

// SHARE CLIENT
$("shareClientBtn").addEventListener("click", async () => {
  if (!currentClient || !currentUser) return;

  const button = $("shareClientBtn");
  button.disabled = true;
  button.textContent = "Creating link...";

  try {
    const shareId = currentClient.shareId || doc(
      collection(db, "publicShares")
    ).id;

    await setDoc(doc(db, "publicShares", shareId), {
      ownerUid: currentUser.uid,
      clientId: currentClient.id,
      enabled: true
    });

    await updateDoc(
      doc(db, "users", currentUser.uid, "clients", currentClient.id),
      { shareId }
    );

    currentClient.shareId = shareId;

    await loadTransactions();

    const shareLink =
      `${location.origin}${location.pathname}?share=${shareId}`;

    try {
      await navigator.clipboard.writeText(shareLink);
      alert("Share link copied! You can send it to anyone.");
    } catch {
      prompt("Copy this share link:", shareLink);
    }

  } catch (error) {
    console.error(error);
    alert("Could not create the share link. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "🔗 Share Client";
  }
});

// DOWNLOAD CLIENT PDF
// PROFESSIONAL CLIENT PDF STATEMENT
$("downloadPdfBtn").addEventListener("click", async () => {
  if (!currentClient) return;

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library did not load. Check your internet connection.");
    return;
  }

  const button = $("downloadPdfBtn");
  button.disabled = true;
  button.textContent = "Preparing PDF...";

  try {
    const snapshot = await getDocs(transactionCollection());
    const transactions = snapshot.docs.map(item => item.data());

    transactions.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    let y = 15;

    let total = 0;
    let received = 0;
    let balance = 0;

    const formatMoney = value =>
      "Rs. " + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

    pdf.setProperties({
      title: "Client Account Statement - " + currentClient.name,
      subject: "LineX Builders Account Statement",
      author: "LineX Builders"
    });

    // HEADER
    function drawHeader() {
      // ACCOUNT SUMMARY
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(30, 41, 59);
      pdf.text("Account Summary", 14, y);
      y += 8;

      const cards = [
        { title: "TOTAL AMOUNT", value: formatMoney(total), color: [37, 99, 235] },
        { title: "RECEIVED", value: formatMoney(received), color: [22, 163, 74] },
        { title: "BALANCE", value: formatMoney(balance), color: [220, 38, 38] }
      ];

      const cardWidth = 56;
      const cardGap = 7;

      cards.forEach((card, index) => {
        const x = 14 + index * (cardWidth + cardGap);

        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(x, y, cardWidth, 24, 3, 3, "FD");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 116, 139);
        pdf.text(card.title, x + 4, y + 7);

        pdf.setFontSize(10);
        pdf.setTextColor(...card.color);
        pdf.text(card.value, x + 4, y + 17);
      });

      y += 30;

      pdf.setFillColor(239, 246, 255);
      pdf.rect(0, 0, pageWidth, 48, "F");

      pdf.setFillColor(37, 99, 235);
      pdf.roundedRect(14, 12, 15, 15, 3, 3, "F");

      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("LX", 17, 22);

      pdf.setTextColor(30, 64, 120);
      pdf.setFontSize(20);
      pdf.text("LINEX BUILDERS", 35, 19);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text("CLIENT ACCOUNT STATEMENT", 35, 26);

      pdf.setTextColor(71, 85, 105);
      pdf.setFontSize(9);
      pdf.text(
        "Generated: " + new Date().toLocaleDateString("en-IN"),
        196,
        39,
        { align: "right" }
      );

      y = 59;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(30, 41, 59);
      pdf.text("Client Details", margin, y);

      y += 9;

      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(14, y - 5, 182, 24, 3, 3, "F");

      pdf.setFontSize(11);
      pdf.setTextColor(30, 41, 59);
      pdf.text(currentClient.name || "Client", 19, y + 3);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);

      if (currentClient.phone) {
        pdf.text("Phone: " + currentClient.phone, 19, y + 11);
      }

      if (currentClient.address) {        const addressLines = pdf.splitTextToSize(
          "Address: " + currentClient.address,
          105
        );

        pdf.text(addressLines.slice(0, 1), 105, y + 11);
      }

      y += 29;
    }

    // TABLE HEADING
    function drawTableHeading() {
      pdf.setFillColor(37, 99, 235);
      pdf.roundedRect(14, y, 182, 11, 2, 2, "F");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);

      pdf.text("DATE", 17, y + 7);
      pdf.text("DESCRIPTION", 43, y + 7);
      pdf.text("AMOUNT", 112, y + 7, { align: "right" });
      pdf.text("RECEIVED", 151, y + 7, { align: "right" });
      pdf.text("BALANCE", 193, y + 7, { align: "right" });

      y += 15;
    }

    transactions.forEach(transaction => {
      const amount = Number(transaction.amount || 0);
      total += amount;

      if (transaction.paid) received += amount;
      else balance += amount;
    });

    // FIRST PAGE
    drawHeader();

    // ACCOUNT SUMMARY
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(30, 41, 59);
    pdf.text("Account Summary", margin, y);

    y += 8;

    const cards = [
      { title: "TOTAL AMOUNT", value: formatMoney(total), color: [37, 99, 235] },
      { title: "RECEIVED", value: formatMoney(received), color: [22, 163, 74] },
      { title: "BALANCE", value: formatMoney(balance), color: [220, 38, 38] }
    ];

    const cardWidth = 56;
    const cardGap = 7;

    cards.forEach((card, index) => {
      const x = 14 + index * (cardWidth + cardGap);

      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(x, y, cardWidth, 24, 3, 3, "FD");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139);
      pdf.text(card.title, x + 4, y + 7);

      pdf.setFontSize(10);
      pdf.setTextColor(...card.color);
      pdf.text(card.value, x + 4, y + 17);
    });

    y += 35;

    // TRANSACTION HISTORY
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(30, 41, 59);
    pdf.text("Transaction History", margin, y);

    y += 7;
    drawTableHeading();

    // TRANSACTION ROWS
    transactions.forEach((transaction, index) => {
      const amount = Number(transaction.amount || 0);
      const paid = Boolean(transaction.paid);

      const descriptionLines = pdf.splitTextToSize(
        String(transaction.description || ""),
        58
      );

      const rowHeight = Math.max(11, descriptionLines.length * 4 + 5);

      if (y + rowHeight > 255) {
        pdf.addPage();
        y = 20;
        drawTableHeading();
      }

      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(14, y - 4, 182, rowHeight, "F");
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(String(transaction.date || "-"), 17, y + 2);
      pdf.text(descriptionLines, 43, y + 2);

      pdf.setTextColor(30, 41, 59);
      pdf.text(formatMoney(amount), 112, y + 2, { align: "right" });

      if (paid) {
        pdf.setTextColor(22, 163, 74);
        pdf.text(formatMoney(amount), 151, y + 2, { align: "right" });

        pdf.setTextColor(100, 116, 139);
        pdf.text("-", 193, y + 2, { align: "right" });
      } else {
        pdf.setTextColor(100, 116, 139);
        pdf.text("-", 151, y + 2, { align: "right" });

        pdf.setTextColor(220, 38, 38);
        pdf.text(formatMoney(amount), 193, y + 2, { align: "right" });
      }

      y += rowHeight;
    });

    // TOTAL ROW
    if (y + 55 > 270) {
      pdf.addPage();
      y = 25;
    } else {
      y += 5;
    }

    pdf.setFillColor(239, 246, 255);
    pdf.setDrawColor(191, 219, 254);
    pdf.rect(14, y - 4, 182, 14, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(30, 64, 120);

    pdf.text("TOTAL", 43, y + 4);
    pdf.text(formatMoney(total), 112, y + 4, { align: "right" });

    pdf.setTextColor(22, 163, 74);
    pdf.text(formatMoney(received), 151, y + 4, { align: "right" });

    pdf.setTextColor(220, 38, 38);
    pdf.text(formatMoney(balance), 193, y + 4, { align: "right" });

    y += 20;

    // FOOTERS AND PAGE NUMBERS
    const pageCount = pdf.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);

      pdf.setDrawColor(226, 232, 240);
      pdf.line(14, 282, 196, 282);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);

      pdf.text("LineX Builders | Client Account Statement", 14, 289);

      pdf.text(
        "Page " + page + " of " + pageCount,
        196,
        289,
        { align: "right" }
      );
    }

    const safeName = currentClient.name.replace(/[^a-z0-9_-]/gi, "_");

    pdf.save(safeName + "_Statement.pdf");

  } catch (error) {
    console.error(error);
    alert("Could not create PDF. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Download PDF";
  }
});