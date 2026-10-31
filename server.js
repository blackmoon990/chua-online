// Chùa Online — server Node.js + Socket.io
// Chạy: npm install && npm start  (mặc định cổng 3000, hoặc PORT do Render cấp)
// Các sự kiện giữ đúng tên trang mẫu dùng: move, meditate, ring_bell,
// offer_incense, bow, chat_message, set_profile, current_users, new_user,
// user_moved, user_left — cộng thêm tiktok_gift cho cầu nối TikTok.
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

const users = new Map(); // socketId -> { id, name, gender, x, y, action, meditating }

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
// POST /api/tiktok-gift  { "name": "Tên người tặng", "gift": "Tên món quà" }
// (cũng nhận { "ten": ..., "qua": ... })
app.post("/api/tiktok-gift", (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name || body.ten);
  const gift = String(body.gift || body.qua || "").trim().slice(0, 60);
  if (!name || !gift) {
    return res.status(400).json({ ok: false, error: "Thiếu name/gift" });
  }
  io.emit("tiktok_gift", { name, gift });
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  // Người mới vào: gửi ngay danh sách những người đang ở chùa.
  socket.emit("current_users", [...users.values()].map(publicUser));
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

  // Cầu nối TikTok gửi qua Socket.io: { name, gift } (cũng nhận ten/qua).
  socket.on("tiktok_gift", (data) => {
    const d = data || {};
    const name = cleanName(d.name || d.ten);
    const gift = String(d.gift || d.qua || "").trim().slice(0, 60);
    if (!name || !gift) return;
    io.emit("tiktok_gift", { name, gift });
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
