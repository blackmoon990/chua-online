// Chùa Online — server Node.js + Socket.io
// Chạy: npm install && npm start  (mặc định cổng 3000, hoặc PORT do Render cấp)
// Các sự kiện giữ đúng tên trang mẫu dùng: move, meditate, ring_bell,
// offer_incense, bow, chat_message, set_profile, current_users, new_user,
// user_moved, user_left — cộng thêm tiktok_gift và merit_board cho cầu nối TikTok.
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(express.json({ limit: "64kb" }));
// Bản phẳng: toàn bộ file nằm ở gốc repo, không còn thư mục public/.
// Chỉ phục vụ đúng 2 file web, không phơi bày code server ra ngoài.
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/assets/donate-vietqr.png", (req, res) => {
  res.sendFile(path.join(__dirname, "donate-vietqr.png"));
});
app.get("/hall-bg.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "hall-bg.jpg"));
});

const users = new Map(); // socketId -> { id, name, gender, x, y, action, meditating }
const meritBoard = new Map(); // name -> points

function meritEntries() {
  return [...meritBoard.entries()]
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
}
function emitMeritBoard() {
  io.emit("merit_board", { entries: meritEntries() });
}
function addMerit(name, points) {
  const p = Number(points);
  const add = Number.isFinite(p) && p > 0 ? Math.floor(p) : 10;
  meritBoard.set(name, (meritBoard.get(name) || 0) + add);
  emitMeritBoard();
}

function cleanName(v) {
  return String(v == null ? "" : v).trim().slice(0, 20);
}
function cleanGender(v) {
  return v === "nu" ? "nu" : "nam";
}
function clampPos(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(98, n));
}
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    gender: u.gender,
    x: u.x,
    y: u.y,
    action: u.action,
    meditating: !!u.meditating,
  };
}
function broadcastCount() {
  io.emit("user_count", { count: users.size });
}

app.get("/health", (req, res) => res.json({ ok: true, users: users.size }));

app.get("/api/users", (req, res) => {
  res.json([...users.values()].map(publicUser));
});

// Cầu nối TikTok không dùng Socket.io vẫn gửi được quà:
// POST /api/tiktok-gift  { "name": "Tên người tặng", "gift": "Tên món quà", "points": 10, "wish": "Lời cầu hồi hướng" }
// (cũng nhận { "ten": ..., "qua": ... } và "coins"/"xu" làm điểm, "loi"/"nguyen"/"cau" làm lời cầu)
app.post("/api/tiktok-gift", (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name || body.ten);
  const gift = String(body.gift || body.qua || "").trim().slice(0, 60);
  if (!name || !gift) {
    return res.status(400).json({ ok: false, error: "Thiếu name/gift" });
  }
  const wish = String(body.wish || body.loi || body.nguyen || body.cau || body.prayer || "").trim().slice(0, 120);
  io.emit("tiktok_gift", { name, gift, wish });
  addMerit(name, body.points || body.coins || body.xu);
  res.json({ ok: true });
});

// Cầu nối gửi thẳng bảng xếp hạng đã tính sẵn:
// POST /api/merit-board  { "entries": [{ "name": "...", "points": 99 }] }
app.post("/api/merit-board", (req, res) => {
  const entries = (req.body && req.body.entries) || [];
  if (!Array.isArray(entries)) {
    return res.status(400).json({ ok: false, error: "entries phải là mảng" });
  }
  meritBoard.clear();
  entries.forEach((e) => {
    const name = cleanName(e && e.name);
    const points = Number(e && e.points);
    if (name && Number.isFinite(points)) meritBoard.set(name, Math.floor(points));
  });
  emitMeritBoard();
  res.json({ ok: true, entries: meritEntries() });
});

io.on("connection", (socket) => {
  // Người mới vào: gửi ngay danh sách những người đang ở chùa + Bia Công Đức.
  socket.emit("current_users", [...users.values()].map(publicUser));
  socket.emit("merit_board", { entries: meritEntries() });
  broadcastCount();

  socket.on("set_profile", (data) => {
    const d = data || {};
    const name = cleanName(d.name) || "Phật tử";
    const gender = cleanGender(d.gender);
    const prev = users.get(socket.id);
    const user = {
      id: socket.id,
      name,
      gender,
      x: prev ? prev.x : 50,
      y: prev ? prev.y : 78,
      action: prev ? prev.action : "đang đứng",
      meditating: prev ? prev.meditating : false,
    };
    users.set(socket.id, user);
    // Báo cho cả chùa (kể cả người vừa vào) có Phật tử mới.
    io.emit("new_user", publicUser(user));
    broadcastCount();
  });

  socket.on("move", (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    const d = data || {};
    user.x = clampPos(d.x, user.x);
    user.y = clampPos(d.y, user.y);
    if (typeof d.action === "string") user.action = d.action.slice(0, 40);
    if (typeof d.meditating === "boolean") user.meditating = d.meditating;
    socket.broadcast.emit("user_moved", publicUser(user));
  });

  socket.on("meditate", (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.meditating = !!(data && data.meditating);
    user.action = user.meditating ? "đang tọa thiền" : "đang đứng";
    io.emit("user_meditate", publicUser(user));
    socket.broadcast.emit("user_moved", publicUser(user));
  });

  socket.on("ring_bell", () => {
    const user = users.get(socket.id);
    io.emit("bell_rung", {
      by: socket.id,
      name: user ? user.name : "Một Phật tử",
    });
  });

  socket.on("offer_incense", () => {
    const user = users.get(socket.id);
    if (user) user.action = "đang dâng hương";
    io.emit("incense_offered", {
      by: socket.id,
      name: user ? user.name : "Một Phật tử",
    });
    if (user) socket.broadcast.emit("user_moved", publicUser(user));
  });

  socket.on("bow", () => {
    const user = users.get(socket.id);
    if (user) user.action = "đang vái lạy";
    io.emit("user_bowed", {
      by: socket.id,
      name: user ? user.name : "Một Phật tử",
    });
    if (user) socket.broadcast.emit("user_moved", publicUser(user));
  });

  socket.on("chat_message", (data) => {
    const user = users.get(socket.id);
    const text = String((data && data.text) || "").trim().slice(0, 200);
    if (!text) return;
    io.emit("chat_message", {
      id: socket.id,
      name: user ? user.name : "Phật tử",
      gender: user ? user.gender : "nam",
      text,
      time: Date.now(),
    });
  });

  // Cầu nối TikTok gửi qua Socket.io: { name, gift, points?, wish? } (cũng nhận ten/qua, loi/nguyen/cau).
  socket.on("tiktok_gift", (data) => {
    const d = data || {};
    const name = cleanName(d.name || d.ten);
    const gift = String(d.gift || d.qua || "").trim().slice(0, 60);
    if (!name || !gift) return;
    const wish = String(d.wish || d.loi || d.nguyen || d.cau || d.prayer || "").trim().slice(0, 120);
    io.emit("tiktok_gift", { name, gift, wish });
    addMerit(name, d.points || d.coins || d.xu);
  });

  // Cầu nối gửi thẳng bảng xếp hạng đã tính sẵn: { entries: [{ name, points }] }.
  socket.on("merit_board", (data) => {
    const entries = (data && data.entries) || [];
    if (!Array.isArray(entries)) return;
    meritBoard.clear();
    entries.forEach((e) => {
      const name = cleanName(e && e.name);
      const points = Number(e && e.points);
      if (name && Number.isFinite(points)) meritBoard.set(name, Math.floor(points));
    });
    emitMeritBoard();
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("user_left", { id: socket.id });
    broadcastCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Chùa Online đang chạy ở cổng " + PORT);
});
