const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "jobs.json");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const ROLE_LABELS = {
  admin: "ผู้ดูแลระบบ",
  operator: "ผู้ลงใบงาน",
  transfer: "บัญชีลงยอดโอน",
  sales: "เซลล์ดูงาน",
  manager: "หัวหน้าแผนก",
};

const ROLE_PERMISSIONS = {
  admin: { view: true, create: true, edit: true, delete: true, markTransfer: true, manageUsers: true, choosePrefix: true },
  operator: { view: true, create: true, edit: true, delete: false, markTransfer: false, manageUsers: false, choosePrefix: false },
  transfer: { view: true, create: false, edit: false, delete: false, markTransfer: true, manageUsers: false, choosePrefix: false },
  sales: { view: true, create: false, edit: false, delete: false, markTransfer: false, manageUsers: false, choosePrefix: false },
  manager: { view: true, create: false, edit: true, delete: false, markTransfer: true, manageUsers: false, choosePrefix: true },
};

const DEFAULT_USERS = [
  { username: "admin", password: "admin123", name: "ผู้ดูแล", prefix: "A", role: "admin", active: true },
  { username: "person1", password: "1111", name: "คนที่ 1", prefix: "A", role: "operator", active: true },
  { username: "person2", password: "2222", name: "คนที่ 2", prefix: "B", role: "operator", active: true },
  { username: "person3", password: "3333", name: "คนที่ 3", prefix: "C", role: "operator", active: true },
  { username: "person4", password: "4444", name: "คนที่ 4", prefix: "D", role: "operator", active: true },
  { username: "account", password: "account123", name: "บัญชี", prefix: "A", role: "transfer", active: true },
  { username: "sales", password: "sales123", name: "เซลล์", prefix: "A", role: "sales", active: true },
  { username: "manager", password: "manager123", name: "หัวหน้าแผนก", prefix: "A", role: "manager", active: true },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]\n", "utf8");
  if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, "{}\n", "utf8");
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, `${JSON.stringify(DEFAULT_USERS, null, 2)}\n`, "utf8");
}

function readJson(filePath, fallback) {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureStore();
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, filePath);
}

function readJobs() {
  const parsed = readJson(DATA_FILE, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeJobs(jobs) {
  writeJson(DATA_FILE, jobs);
}

function readUsers() {
  const parsed = readJson(USERS_FILE, DEFAULT_USERS);
  const users = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.value) ? parsed.value : DEFAULT_USERS;
  const existing = new Set(users.map((user) => user.username));
  let changed = false;
  for (const user of DEFAULT_USERS) {
    if (!existing.has(user.username)) {
      users.push(user);
      changed = true;
    }
  }
  if (changed) writeUsers(users);
  return users;
}

function writeUsers(users) {
  writeJson(USERS_FILE, users);
}

function readSessions() {
  const parsed = readJson(SESSION_FILE, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function writeSessions(sessions) {
  writeJson(SESSION_FILE, sessions);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("ข้อมูลใหญ่เกินไป"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanMoney(value) {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function permissionsFor(user) {
  return ROLE_PERMISSIONS[user?.role] || ROLE_PERMISSIONS.sales;
}

function publicUser(user) {
  if (!user) return null;
  return {
    username: user.username,
    name: user.name,
    prefix: user.prefix,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    active: user.active !== false,
    permissions: permissionsFor(user),
  };
}

function publicManageUser(user) {
  return {
    username: user.username,
    name: user.name,
    prefix: user.prefix,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    active: user.active !== false,
  };
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `work_order_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "work_order_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = readSessions();
  sessions[token] = {
    username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  };
  writeSessions(sessions);
  return token;
}

function clearSession(req) {
  const token = parseCookies(req).work_order_session;
  if (!token) return;
  const sessions = readSessions();
  delete sessions[token];
  writeSessions(sessions);
}

function getCurrentUser(req) {
  const token = parseCookies(req).work_order_session;
  if (!token) return null;
  const sessions = readSessions();
  const session = sessions[token];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) {
      delete sessions[token];
      writeSessions(sessions);
    }
    return null;
  }
  const user = readUsers().find((item) => item.username === session.username && item.active !== false);
  return user || null;
}

function normalizeJob(input, existing = {}) {
  const isDeposit = Boolean(input.isDeposit);
  return {
    ...existing,
    creatorPrefix: cleanText(input.creatorPrefix || existing.creatorPrefix).toUpperCase(),
    billNo: cleanText(input.billNo),
    shopName: cleanText(input.shopName),
    netSales: cleanMoney(input.netSales),
    isTransferred: Boolean(input.isTransferred),
    canProduceFirst: Boolean(input.canProduceFirst),
    isDeposit,
    isCancelled: Boolean(input.isCancelled),
    productionOpened: Boolean(input.productionOpened),
    quotationReceived: Boolean(input.quotationReceived),
    depositAmount: isDeposit ? cleanMoney(input.depositAmount) : 0,
    note: cleanText(input.note),
  };
}

function normalizeTransferOnly(input, existing) {
  return {
    ...existing,
    isTransferred: Boolean(input.isTransferred),
  };
}

function validateJob(job) {
  const errors = [];
  if (!job.billNo) errors.push("กรุณาใส่เลขที่บิล");
  if (!/^[A-D]\d{2}\/\d{3}$/.test(job.billNo)) errors.push("เลขที่บิลต้องเป็นรูปแบบ A07/001 ถึง D07/001");
  if (!job.shopName) errors.push("กรุณาใส่ชื่อร้าน");
  if (job.netSales <= 0) errors.push("กรุณาใส่ยอดให้ถูกต้อง");
  if (job.isDeposit && job.depositAmount <= 0) errors.push("กรุณาใส่ยอดมัดจำ");
  if (job.isDeposit && job.depositAmount > job.netSales) errors.push("ยอดมัดจำต้องไม่มากกว่ายอด");
  return errors;
}

function billParts(billNo) {
  const match = String(billNo || "").match(/^([A-D])(\d{2})\/(\d{3})$/);
  if (!match) return null;
  return { prefix: match[1], month: match[2], number: Number(match[3]) };
}

function nextBillNo(jobs, prefix, date = new Date()) {
  const cleanPrefix = cleanText(prefix).toUpperCase();
  if (!/^[A-D]$/.test(cleanPrefix)) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const maxNumber = jobs.reduce((max, job) => {
    const parts = billParts(job.billNo);
    if (!parts || parts.prefix !== cleanPrefix || parts.month !== month) return max;
    return Math.max(max, parts.number);
  }, 0);
  return `${cleanPrefix}${month}/${String(maxNumber + 1).padStart(3, "0")}`;
}

function ensureUniqueBill(jobs, billNo, id = "") {
  return !jobs.some((job) => job.billNo === billNo && job.id !== id);
}

function normalizeUser(input, existing = {}) {
  const username = cleanText(input.username || existing.username).toLowerCase();
  const role = ROLE_PERMISSIONS[input.role] ? input.role : existing.role || "sales";
  const prefix = /^[A-D]$/.test(cleanText(input.prefix).toUpperCase()) ? cleanText(input.prefix).toUpperCase() : existing.prefix || "A";
  return {
    ...existing,
    username,
    password: cleanText(input.password) || existing.password || "1234",
    name: cleanText(input.name) || username,
    prefix,
    role,
    active: input.active !== false,
  };
}

function validateUser(user, users, existingUsername = "") {
  const errors = [];
  if (!/^[a-z0-9_.-]{3,30}$/.test(user.username)) errors.push("ชื่อผู้ใช้ต้องเป็นอังกฤษ/ตัวเลข 3-30 ตัว");
  if (!user.password || user.password.length < 4) errors.push("รหัสผ่านต้องมีอย่างน้อย 4 ตัว");
  if (!user.name) errors.push("กรุณาใส่ชื่อ");
  if (!ROLE_PERMISSIONS[user.role]) errors.push("สิทธิ์ไม่ถูกต้อง");
  if (!/^[A-D]$/.test(user.prefix)) errors.push("ตัวอักษรเลขบิลต้องเป็น A, B, C หรือ D");
  if (users.some((item) => item.username === user.username && item.username !== existingUsername)) errors.push("ชื่อผู้ใช้นี้มีอยู่แล้ว");
  return errors;
}

function requirePermission(user, key, res) {
  if (permissionsFor(user)[key]) return true;
  sendJson(res, 403, { errors: ["บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้"] });
  return false;
}

function routeApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, storage: DATA_DIR });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(getCurrentUser(req)), roles: ROLE_LABELS });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    return readBody(req)
      .then((body) => {
        const incoming = body ? JSON.parse(body) : {};
        const username = cleanText(incoming.username).toLowerCase();
        const password = String(incoming.password || "");
        const user = readUsers().find((item) => item.username === username && item.password === password && item.active !== false);
        if (!user) return sendJson(res, 401, { errors: ["ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"] });
        setSessionCookie(res, createSession(user.username));
        return sendJson(res, 200, { user: publicUser(user), roles: ROLE_LABELS });
      })
      .catch(() => sendJson(res, 400, { errors: ["เข้าสู่ระบบไม่สำเร็จ"] }));
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    clearSession(req);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) return sendJson(res, 401, { errors: ["กรุณาเข้าสู่ระบบ"] });
  const perms = permissionsFor(currentUser);

  if (req.method === "GET" && url.pathname === "/api/users") {
    if (!requirePermission(currentUser, "manageUsers", res)) return;
    return sendJson(res, 200, { users: readUsers().map(publicManageUser), roles: ROLE_LABELS });
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    if (!requirePermission(currentUser, "manageUsers", res)) return;
    return readBody(req)
      .then((body) => {
        const incoming = body ? JSON.parse(body) : {};
        const users = readUsers();
        const user = normalizeUser(incoming);
        const errors = validateUser(user, users);
        if (errors.length) return sendJson(res, 400, { errors });
        users.push(user);
        writeUsers(users);
        return sendJson(res, 201, { user: publicManageUser(user) });
      })
      .catch((error) => sendJson(res, 400, { errors: [error.message || "เพิ่มผู้ใช้ไม่สำเร็จ"] }));
  }

  if (req.method === "PUT" && parts[0] === "api" && parts[1] === "users" && parts[2]) {
    if (!requirePermission(currentUser, "manageUsers", res)) return;
    return readBody(req)
      .then((body) => {
        const users = readUsers();
        const index = users.findIndex((user) => user.username === parts[2]);
        if (index === -1) return sendJson(res, 404, { errors: ["ไม่พบผู้ใช้นี้"] });
        const incoming = body ? JSON.parse(body) : {};
        const updated = normalizeUser(incoming, users[index]);
        const errors = validateUser(updated, users, users[index].username);
        if (updated.username !== users[index].username) errors.push("ไม่สามารถเปลี่ยนชื่อผู้ใช้ได้");
        if (updated.username === "admin" && updated.active === false) errors.push("ปิดใช้งาน admin ไม่ได้");
        if (errors.length) return sendJson(res, 400, { errors });
        users[index] = updated;
        writeUsers(users);
        return sendJson(res, 200, { user: publicManageUser(updated) });
      })
      .catch((error) => sendJson(res, 400, { errors: [error.message || "แก้ไขผู้ใช้ไม่สำเร็จ"] }));
  }

  if (req.method === "DELETE" && parts[0] === "api" && parts[1] === "users" && parts[2]) {
    if (!requirePermission(currentUser, "manageUsers", res)) return;
    if (parts[2] === "admin") return sendJson(res, 400, { errors: ["ลบ admin ไม่ได้"] });
    const users = readUsers();
    const nextUsers = users.filter((user) => user.username !== parts[2]);
    if (nextUsers.length === users.length) return sendJson(res, 404, { errors: ["ไม่พบผู้ใช้นี้"] });
    writeUsers(nextUsers);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    if (!requirePermission(currentUser, "view", res)) return;
    const jobs = readJobs().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return sendJson(res, 200, { jobs });
  }

  if (req.method === "GET" && url.pathname === "/api/next-bill") {
    if (!requirePermission(currentUser, "create", res)) return;
    const prefix = perms.choosePrefix ? url.searchParams.get("prefix") : currentUser.prefix;
    const billNo = nextBillNo(readJobs(), prefix);
    if (!billNo) return sendJson(res, 400, { errors: ["กรุณาเลือกคนลงข้อมูล A, B, C หรือ D"] });
    return sendJson(res, 200, { billNo });
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    if (!requirePermission(currentUser, "create", res)) return;
    return readBody(req)
      .then((body) => {
        const incoming = body ? JSON.parse(body) : {};
        const now = new Date().toISOString();
        const jobs = readJobs();
        if (!perms.choosePrefix) incoming.creatorPrefix = currentUser.prefix;
        if (incoming.autoBill) incoming.billNo = nextBillNo(jobs, incoming.creatorPrefix);
        const job = normalizeJob(incoming, {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          createdBy: currentUser.username,
          createdAt: now,
          updatedAt: now,
        });
        const errors = validateJob(job);
        if (!ensureUniqueBill(jobs, job.billNo)) errors.push("เลขที่บิลนี้มีอยู่แล้ว");
        if (errors.length) return sendJson(res, 400, { errors });
        jobs.push(job);
        writeJobs(jobs);
        return sendJson(res, 201, { job });
      })
      .catch((error) => sendJson(res, 400, { errors: [error.message || "บันทึกไม่สำเร็จ"] }));
  }

  if (req.method === "PUT" && parts[0] === "api" && parts[1] === "jobs" && parts[2]) {
    if (!perms.edit && !perms.markTransfer) return sendJson(res, 403, { errors: ["บัญชีนี้ไม่มีสิทธิ์แก้ไขใบงาน"] });
    return readBody(req)
      .then((body) => {
        const jobs = readJobs();
        const index = jobs.findIndex((job) => job.id === parts[2]);
        if (index === -1) return sendJson(res, 404, { errors: ["ไม่พบใบงานนี้"] });
        const incoming = body ? JSON.parse(body) : {};
        let updated;
        if (perms.edit) {
          if (!perms.choosePrefix) incoming.creatorPrefix = jobs[index].creatorPrefix || currentUser.prefix;
          updated = normalizeJob(incoming, {
            ...jobs[index],
            updatedBy: currentUser.username,
            updatedAt: new Date().toISOString(),
          });
        } else {
          updated = normalizeTransferOnly(incoming, {
            ...jobs[index],
            updatedBy: currentUser.username,
            updatedAt: new Date().toISOString(),
          });
        }
        const errors = validateJob(updated);
        if (!ensureUniqueBill(jobs, updated.billNo, updated.id)) errors.push("เลขที่บิลนี้มีอยู่แล้ว");
        if (errors.length) return sendJson(res, 400, { errors });
        jobs[index] = updated;
        writeJobs(jobs);
        return sendJson(res, 200, { job: updated });
      })
      .catch((error) => sendJson(res, 400, { errors: [error.message || "แก้ไขไม่สำเร็จ"] }));
  }

  if (req.method === "DELETE" && parts[0] === "api" && parts[1] === "jobs" && parts[2]) {
    if (!requirePermission(currentUser, "delete", res)) return;
    const jobs = readJobs();
    const nextJobs = jobs.filter((job) => job.id !== parts[2]);
    if (nextJobs.length === jobs.length) return sendJson(res, 404, { errors: ["ไม่พบใบงานนี้"] });
    writeJobs(nextJobs);
    return sendJson(res, 200, { ok: true });
  }

  return false;
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("ไม่พบหน้านี้");
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function getLocalAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

ensureStore();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    const handled = routeApi(req, res, url);
    if (handled !== false) return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Work order system is ready: http://localhost:${PORT}`);
  for (const address of getLocalAddresses()) {
    console.log(`Network URL: http://${address}:${PORT}`);
  }
});
