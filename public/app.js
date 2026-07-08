const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginUsername = document.querySelector("#loginUsername");
const loginPassword = document.querySelector("#loginPassword");
const loginMessage = document.querySelector("#loginMessage");
const form = document.querySelector("#jobForm");
const userForm = document.querySelector("#userForm");

const fields = {
  id: document.querySelector("#jobId"),
  creatorPrefix: document.querySelector("#creatorPrefix"),
  billNo: document.querySelector("#billNo"),
  shopName: document.querySelector("#shopName"),
  netSales: document.querySelector("#netSales"),
  isTransferred: document.querySelector("#isTransferred"),
  canProduceFirst: document.querySelector("#canProduceFirst"),
  isDeposit: document.querySelector("#isDeposit"),
  isCancelled: document.querySelector("#isCancelled"),
  productionOpened: document.querySelector("#productionOpened"),
  quotationReceived: document.querySelector("#quotationReceived"),
  depositAmount: document.querySelector("#depositAmount"),
  note: document.querySelector("#note"),
};

const userFields = {
  editingUsername: document.querySelector("#editingUsername"),
  username: document.querySelector("#managedUsername"),
  name: document.querySelector("#managedName"),
  password: document.querySelector("#managedPassword"),
  prefix: document.querySelector("#managedPrefix"),
  role: document.querySelector("#managedRole"),
  active: document.querySelector("#managedActive"),
};

const els = {
  formTitle: document.querySelector("#formTitle"),
  saveBtn: document.querySelector("#saveBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  cancelEditBtn: document.querySelector("#cancelEditBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  newBtn: document.querySelector("#newBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  usersToggleBtn: document.querySelector("#usersToggleBtn"),
  usersPanel: document.querySelector("#usersPanel"),
  userInfo: document.querySelector("#userInfo"),
  generateBillBtn: document.querySelector("#generateBillBtn"),
  depositField: document.querySelector("#depositField"),
  formMessage: document.querySelector("#formMessage"),
  userMessage: document.querySelector("#userMessage"),
  saveUserBtn: document.querySelector("#saveUserBtn"),
  clearUserBtn: document.querySelector("#clearUserBtn"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  summaryGrid: document.querySelector("#summaryGrid"),
  jobsBody: document.querySelector("#jobsBody"),
  usersBody: document.querySelector("#usersBody"),
  rowTemplate: document.querySelector("#rowTemplate"),
  userRowTemplate: document.querySelector("#userRowTemplate"),
  emptyState: document.querySelector("#emptyState"),
  totalCount: document.querySelector("#totalCount"),
  visibleCount: document.querySelector("#visibleCount"),
  printSheet: document.querySelector("#printSheet"),
};

let jobs = [];
let managedUsers = [];
let currentUser = null;
let roleLabels = {};

const moneyFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function perms() {
  return currentUser?.permissions || {};
}

function toMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, ok = false) {
  els.formMessage.textContent = text;
  els.formMessage.classList.toggle("ok", ok);
}

function showUserMessage(text, ok = false) {
  els.userMessage.textContent = text;
  els.userMessage.classList.toggle("ok", ok);
}

function showLoginMessage(text) {
  loginMessage.textContent = text;
}

function setFormEnabled() {
  const canCreate = Boolean(perms().create);
  const canEdit = Boolean(perms().edit);
  const canMarkTransfer = Boolean(perms().markTransfer);
  const editing = Boolean(fields.id.value);
  const generalEnabled = editing ? canEdit : canCreate;

  fields.creatorPrefix.disabled = !perms().choosePrefix || (!canCreate && !canEdit);
  fields.billNo.disabled = !generalEnabled;
  els.generateBillBtn.disabled = !generalEnabled;
  fields.shopName.disabled = !generalEnabled;
  fields.netSales.disabled = !generalEnabled;
  fields.canProduceFirst.disabled = !generalEnabled;
  fields.isDeposit.disabled = !generalEnabled;
  fields.isCancelled.disabled = !generalEnabled;
  fields.productionOpened.disabled = !generalEnabled;
  fields.quotationReceived.disabled = !generalEnabled;
  fields.depositAmount.disabled = !generalEnabled;
  fields.note.disabled = !generalEnabled;
  fields.isTransferred.disabled = !(generalEnabled || canMarkTransfer);
  els.saveBtn.disabled = !(generalEnabled || (editing && canMarkTransfer));
  els.newBtn.disabled = !canCreate;
}

function applyUser(user, roles = roleLabels) {
  currentUser = user;
  roleLabels = roles || roleLabels;
  if (!user) {
    appShell.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginUsername.focus();
    return;
  }

  loginScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  els.userInfo.textContent = `${user.name} (${user.roleLabel})`;
  fields.creatorPrefix.value = user.prefix;
  els.usersToggleBtn.classList.toggle("hidden", !user.permissions.manageUsers);
  els.usersPanel.classList.add("hidden");
  setFormEnabled();
}

function getPayload() {
  return {
    creatorPrefix: fields.creatorPrefix.value,
    billNo: fields.billNo.value,
    autoBill: !fields.id.value && !fields.billNo.value.trim(),
    shopName: fields.shopName.value,
    netSales: fields.netSales.value,
    isTransferred: fields.isTransferred.checked,
    canProduceFirst: fields.canProduceFirst.checked,
    isDeposit: fields.isDeposit.checked,
    isCancelled: fields.isCancelled.checked,
    productionOpened: fields.productionOpened.checked,
    quotationReceived: fields.quotationReceived.checked,
    depositAmount: fields.depositAmount.value,
    note: fields.note.value,
  };
}

function getUserPayload() {
  return {
    username: userFields.username.value,
    name: userFields.name.value,
    password: userFields.password.value,
    prefix: userFields.prefix.value,
    role: userFields.role.value,
    active: userFields.active.checked,
  };
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  if (currentUser) fields.creatorPrefix.value = currentUser.prefix;
  els.formTitle.textContent = "เพิ่มใบงานใหม่";
  els.saveBtn.textContent = "บันทึกใบงาน";
  els.cancelEditBtn.classList.add("hidden");
  toggleDepositField();
  showMessage("");
  setFormEnabled();
  if (perms().create) generateBillNo();
  if (perms().create) fields.shopName.focus();
}

function resetUserForm() {
  userForm.reset();
  userFields.editingUsername.value = "";
  userFields.username.disabled = false;
  userFields.active.checked = true;
  els.saveUserBtn.textContent = "เพิ่มผู้ใช้";
  showUserMessage("");
}

function toggleDepositField() {
  const active = fields.isDeposit.checked;
  els.depositField.classList.toggle("hidden", !active);
  fields.depositAmount.required = active;
  if (!active) fields.depositAmount.value = "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && url !== "/api/login") applyUser(null);
    throw new Error((data.errors || ["ทำรายการไม่สำเร็จ"]).join("\n"));
  }
  return data;
}

async function generateBillNo() {
  if (fields.id.value || !currentUser || !perms().create) return;
  const data = await requestJson(`/api/next-bill?prefix=${encodeURIComponent(fields.creatorPrefix.value)}`);
  fields.billNo.value = data.billNo;
}

async function loadJobs() {
  const data = await requestJson("/api/jobs");
  jobs = data.jobs || [];
  renderSummary();
  renderJobs();
  if (!fields.id.value && !fields.billNo.value && perms().create) await generateBillNo().catch(() => {});
}

async function loadUsers() {
  if (!perms().manageUsers) return;
  const data = await requestJson("/api/users");
  managedUsers = data.users || [];
  roleLabels = data.roles || roleLabels;
  renderUsers();
}

function activeJobs() {
  return jobs.filter((job) => !job.isCancelled);
}

function renderSummary() {
  const cards = [
    ["ยังไม่โอน", activeJobs().filter((job) => !job.isTransferred), "red"],
    ["ผลิตได้ก่อน", activeJobs().filter((job) => job.canProduceFirst), "blue"],
    ["มัดจำ", activeJobs().filter((job) => job.isDeposit), "orange"],
    ["ยกเลิก", jobs.filter((job) => job.isCancelled), "red"],
    ["ยังไม่ได้รับใบเสนอราคา", activeJobs().filter((job) => !job.quotationReceived), "purple"],
  ];

  els.summaryGrid.innerHTML = "";
  for (const [title, list, color] of cards) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `summary-card ${color}`;
    card.innerHTML = `
      <span class="summary-title">${title}</span>
      <strong>${list.length}</strong>
      <small>${list.slice(0, 4).map((job) => escapeHtml(job.billNo)).join(", ") || "ไม่มี"}</small>
    `;
    card.addEventListener("click", () => {
      const filterMap = {
        "ยังไม่โอน": "pendingTransfer",
        "ผลิตได้ก่อน": "canProduceFirst",
        "มัดจำ": "isDeposit",
        "ยกเลิก": "isCancelled",
        "ยังไม่ได้รับใบเสนอราคา": "pendingQuotation",
      };
      els.statusFilter.value = filterMap[title] || "all";
      renderJobs();
    });
    els.summaryGrid.append(card);
  }
}

function filteredJobs() {
  const query = els.searchInput.value.trim().toLowerCase();
  const filter = els.statusFilter.value;
  return jobs.filter((job) => {
    const matchesQuery = !query || `${job.billNo} ${job.shopName}`.toLowerCase().includes(query);
    let matchesStatus = true;
    if (filter === "pendingTransfer") matchesStatus = !job.isTransferred && !job.isCancelled;
    else if (filter === "pendingProduction") matchesStatus = !job.productionOpened && !job.isCancelled;
    else if (filter === "pendingQuotation") matchesStatus = !job.quotationReceived && !job.isCancelled;
    else if (filter !== "all") matchesStatus = Boolean(job[filter]);
    return matchesQuery && matchesStatus;
  });
}

function statusMark(value, positiveLabel = "แล้ว", negativeLabel = "ยังไม่") {
  const span = document.createElement("span");
  span.className = value ? "mark yes" : "mark no";
  span.textContent = value ? positiveLabel : negativeLabel;
  return span;
}

function renderJobs() {
  const visible = filteredJobs();
  els.jobsBody.innerHTML = "";
  els.totalCount.textContent = jobs.length;
  els.visibleCount.textContent = visible.length;
  els.emptyState.classList.toggle("hidden", visible.length > 0);

  for (const job of visible) {
    const row = els.rowTemplate.content.firstElementChild.cloneNode(true);
    if (job.isCancelled) row.classList.add("cancelled-row");
    row.querySelector(".bill-cell").textContent = job.billNo;
    row.querySelector(".shop-cell").textContent = job.shopName;
    row.querySelector(".money-cell").textContent = `${toMoney(job.netSales)} บาท`;
    row.querySelector(".transfer-cell").append(statusMark(job.isTransferred, "โอนแล้ว", "ยังไม่โอน"));
    row.querySelector(".produce-cell").append(statusMark(job.canProduceFirst, "ผลิตได้", "-"));
    row.querySelector(".deposit-cell").append(
      job.isDeposit ? statusMark(true, `มัดจำ ${toMoney(job.depositAmount)}`) : statusMark(false, "-"),
    );
    row.querySelector(".cancel-cell").append(statusMark(job.isCancelled, "ยกเลิก", "-"));
    row.querySelector(".production-cell").append(statusMark(job.productionOpened, "เปิดแล้ว", "ยังไม่เปิด"));
    row.querySelector(".quotation-cell").append(statusMark(job.quotationReceived, "รับแล้ว", "ยังไม่ได้รับ"));

    const actionCell = row.querySelector(".action-cell");
    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.append(makeButton("พิมพ์", "row-button print", () => printJob(job)));
    if (perms().edit || perms().markTransfer) actionRow.append(makeButton("แก้ไข", "row-button", () => editJob(job)));
    if (perms().delete) actionRow.append(makeButton("ลบ", "row-button delete", () => deleteJob(job)));
    actionCell.append(actionRow);
    els.jobsBody.append(row);
  }
}

function renderUsers() {
  els.usersBody.innerHTML = "";
  for (const user of managedUsers) {
    const row = els.userRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".managed-username-cell").textContent = user.username;
    row.querySelector(".managed-name-cell").textContent = user.name;
    row.querySelector(".managed-role-cell").textContent = user.roleLabel || roleLabels[user.role] || user.role;
    row.querySelector(".managed-prefix-cell").textContent = user.prefix;
    row.querySelector(".managed-active-cell").append(statusMark(user.active, "ใช้งาน", "ปิด"));
    const actionCell = row.querySelector(".managed-action-cell");
    const actionRow = document.createElement("div");
    actionRow.className = "action-row";
    actionRow.append(makeButton("แก้ไข", "row-button", () => editUser(user)));
    if (user.username !== "admin") actionRow.append(makeButton("ลบ", "row-button delete", () => deleteUser(user)));
    actionCell.append(actionRow);
    els.usersBody.append(row);
  }
}

function makeButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function editJob(job) {
  fields.id.value = job.id;
  fields.creatorPrefix.value = job.creatorPrefix || job.billNo?.slice(0, 1) || currentUser?.prefix || "A";
  fields.billNo.value = job.billNo;
  fields.shopName.value = job.shopName;
  fields.netSales.value = job.netSales;
  fields.isTransferred.checked = job.isTransferred;
  fields.canProduceFirst.checked = job.canProduceFirst;
  fields.isDeposit.checked = job.isDeposit;
  fields.isCancelled.checked = job.isCancelled;
  fields.productionOpened.checked = job.productionOpened;
  fields.quotationReceived.checked = job.quotationReceived;
  fields.depositAmount.value = job.depositAmount || "";
  fields.note.value = job.note || "";
  els.formTitle.textContent = `แก้ไขใบงาน ${job.billNo}`;
  els.saveBtn.textContent = "บันทึกการแก้ไข";
  els.cancelEditBtn.classList.remove("hidden");
  toggleDepositField();
  showMessage("");
  setFormEnabled();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editUser(user) {
  userFields.editingUsername.value = user.username;
  userFields.username.value = user.username;
  userFields.username.disabled = true;
  userFields.name.value = user.name;
  userFields.password.value = "";
  userFields.prefix.value = user.prefix;
  userFields.role.value = user.role;
  userFields.active.checked = user.active;
  els.saveUserBtn.textContent = "บันทึกผู้ใช้";
  showUserMessage("");
  els.usersPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteJob(job) {
  const ok = window.confirm(`ลบใบงาน ${job.billNo} ของ ${job.shopName} ใช่ไหม`);
  if (!ok) return;
  await requestJson(`/api/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
  if (fields.id.value === job.id) resetForm();
  await loadJobs();
}

async function deleteUser(user) {
  const ok = window.confirm(`ลบผู้ใช้ ${user.username} ใช่ไหม`);
  if (!ok) return;
  await requestJson(`/api/users/${encodeURIComponent(user.username)}`, { method: "DELETE" });
  await loadUsers();
}

function printJob(job) {
  const checked = (value) => (value ? "☑" : "☐");
  els.printSheet.innerHTML = `
    <article class="print-page">
      <div class="print-top">
        <div>
          <p class="print-label">WORK ORDER</p>
          <h1>ใบงาน</h1>
        </div>
        <div>
          <div class="print-label">วันที่พิมพ์</div>
          <div class="print-value">${escapeHtml(dateFormatter.format(new Date()))}</div>
        </div>
      </div>
      <div class="print-grid">
        <div class="print-box">
          <div class="print-label">เลขที่บิล</div>
          <div class="print-value">${escapeHtml(job.billNo)}</div>
        </div>
        <div class="print-box">
          <div class="print-label">ชื่อร้าน</div>
          <div class="print-value">${escapeHtml(job.shopName)}</div>
        </div>
        <div class="print-box">
          <div class="print-label">ยอด</div>
          <div class="print-value">${toMoney(job.netSales)} บาท</div>
        </div>
        <div class="print-box">
          <div class="print-label">ยอดมัดจำ</div>
          <div class="print-value">${job.isDeposit ? `${toMoney(job.depositAmount)} บาท` : "-"}</div>
        </div>
      </div>
      <div class="print-checks">
        <div class="print-check">${checked(job.isTransferred)} โอนแล้ว</div>
        <div class="print-check">${checked(job.canProduceFirst)} ผลิตได้ก่อน</div>
        <div class="print-check">${checked(job.isDeposit)} มัดจำ</div>
        <div class="print-check">${checked(job.isCancelled)} ยกเลิก</div>
        <div class="print-check">${checked(job.productionOpened)} เปิดใบผลิตแล้ว</div>
        <div class="print-check">${checked(job.quotationReceived)} รับใบเสนอราคาแล้ว</div>
      </div>
      <div class="print-label">หมายเหตุ</div>
      <div class="print-note">${escapeHtml(job.note || "-").replaceAll("\n", "<br>")}</div>
    </article>
  `;
  window.print();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showLoginMessage("");
  try {
    const data = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value }),
    });
    loginPassword.value = "";
    applyUser(data.user, data.roles);
    resetForm();
    await loadJobs();
    await loadUsers();
  } catch (error) {
    showLoginMessage(error.message);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  const id = fields.id.value;
  const payload = getPayload();
  const url = id ? `/api/jobs/${encodeURIComponent(id)}` : "/api/jobs";
  const method = id ? "PUT" : "POST";

  try {
    await requestJson(url, { method, body: JSON.stringify(payload) });
    resetForm();
    await loadJobs();
    showMessage("บันทึกเรียบร้อย", true);
  } catch (error) {
    showMessage(error.message);
  }
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showUserMessage("");
  const editing = userFields.editingUsername.value;
  const payload = getUserPayload();
  const url = editing ? `/api/users/${encodeURIComponent(editing)}` : "/api/users";
  const method = editing ? "PUT" : "POST";
  try {
    await requestJson(url, { method, body: JSON.stringify(payload) });
    resetUserForm();
    await loadUsers();
    showUserMessage("บันทึกผู้ใช้เรียบร้อย", true);
  } catch (error) {
    showUserMessage(error.message);
  }
});

fields.isDeposit.addEventListener("change", toggleDepositField);
fields.creatorPrefix.addEventListener("change", () => generateBillNo().catch((error) => showMessage(error.message)));
els.generateBillBtn.addEventListener("click", () => generateBillNo().catch((error) => showMessage(error.message)));
els.clearBtn.addEventListener("click", resetForm);
els.cancelEditBtn.addEventListener("click", resetForm);
els.newBtn.addEventListener("click", resetForm);
els.refreshBtn.addEventListener("click", loadJobs);
els.clearUserBtn.addEventListener("click", resetUserForm);
els.usersToggleBtn.addEventListener("click", async () => {
  els.usersPanel.classList.toggle("hidden");
  if (!els.usersPanel.classList.contains("hidden")) await loadUsers();
});
els.logoutBtn.addEventListener("click", async () => {
  await requestJson("/api/logout", { method: "POST" }).catch(() => {});
  jobs = [];
  managedUsers = [];
  resetUserForm();
  applyUser(null);
});
els.searchInput.addEventListener("input", renderJobs);
els.statusFilter.addEventListener("change", renderJobs);

async function init() {
  const data = await requestJson("/api/me");
  applyUser(data.user, data.roles);
  if (data.user) {
    resetForm();
    await loadJobs();
    await loadUsers();
  }
}

init().catch(() => applyUser(null));
