# Chùa Thanh Tịnh Online — bản nhiều người thật

Trang chùa online nhiều người cùng lúc: chánh điện chung, đi dạo, ngồi đệm thiền,
dâng hương, vái lạy, tọa thiền, thỉnh chuông, trò chuyện, Gieo Quẻ 100 quẻ,
xem Bát Tự · Tử Vi, và cuốn thư chúc lành khi có người tặng quà TikTok.

Chạy bằng **Node.js + Express + Socket.io** — cùng bộ sự kiện như trang mẫu
(`move`, `meditate`, `ring_bell`, `offer_incense`, `bow`, `chat_message`,
`set_profile`, `current_users`, `new_user`, `user_moved`, `user_left`),
cộng thêm `tiktok_gift`.

## Chạy trên máy của bạn

```bash
cd chua-online
npm install
npm start
```

Mở http://localhost:3000 — mở thêm 1–2 cửa sổ trình duyệt nữa là thấy
nhau đi lại, thiền, dâng hương và chat trong thời gian thực.

## Đưa lên Render (miễn phí, giống trang mẫu)

1. Đẩy thư mục này lên một repo GitHub (riêng tư hay công khai đều được).
2. Vào https://dashboard.render.com → **New +** → **Web Service** → chọn repo.
3. Render tự đọc `render.yaml` trong repo: Build Command `npm install`,
   Start Command `npm start`. Bấm **Create Web Service** và chờ deploy xong.
4. Mở link `https://<ten-app>.onrender.com` là dùng được. Gửi link này cho
   mọi người là mọi người vào chung một chánh điện.

Lưu ý gói miễn phí của Render: app ngủ sau một lúc không có ai vào, lần vào
đầu tiên sau đó có thể chờ khoảng 30–60 giây để app thức dậy.

## Nối quà TikTok vào cuốn thư chúc lành

Khi có người tặng quà trong phòng live, chương trình cầu nối của bạn chỉ cần
làm **1 trong 3 cách** sau (cách nào cũng được, nhiều quà đến cùng lúc sẽ
hiện lần lượt, không mất lời chúc nào):

**Cách 1 — Gửi qua Socket.io** (từ chương trình cầu nối):

```js
socket.emit("tiktok_gift", { name: "Tên người tặng", gift: "Tên món quà" });
```

**Cách 2 — Gọi API** (không cần giữ kết nối Socket.io):

```bash
curl -X POST https://<ten-app>.onrender.com/api/tiktok-gift \
  -H "Content-Type: application/json" \
  -d '{"name":"Tên người tặng","gift":"Tên món quà"}'
```

**Cách 3 — Ngay trong trang** (nếu cầu nối chạy cùng trang web):

```js
window.hienLoiChucQuaTang({ ten: "Tên người tặng", qua: "Tên món quà" });
// hoặc: window.postMessage({ type: "tiktok_gift", name: "...", gift: "..." }, "*");
```

## Các sự kiện Socket.io

| Sự kiện client → server | Nội dung |
|---|---|
| `set_profile` | `{ name, gender: "nam" \| "nu" }` |
| `move` | `{ x: 0–100, y: 0–100, action, meditating }` |
| `meditate` | `{ meditating: true \| false }` |
| `ring_bell` | `{}` |
| `offer_incense` | `{}` |
| `bow` | `{}` |
| `chat_message` | `{ text }` |
| `tiktok_gift` | `{ name, gift }` (cũng nhận `{ ten, qua }`) |

| Sự kiện server → client | Nội dung |
|---|---|
| `current_users` | Mảng người đang ở chùa (gửi riêng cho người mới vào) |
| `new_user` | Một Phật tử mới vào |
| `user_moved` | Vị trí / hành động mới của một Phật tử |
| `user_meditate` | Một Phật tử bắt đầu / dừng tọa thiền |
| `user_left` | `{ id }` — nhân vật biến mất khỏi chánh điện ngay |
| `user_count` | `{ count }` — số người đang ở chùa |
| `bell_rung` | `{ by, name }` |
| `incense_offered` | `{ by, name }` |
| `user_bowed` | `{ by, name }` |
| `chat_message` | `{ id, name, gender, text, time }` |
| `tiktok_gift` | `{ name, gift }` |

Kiểm tra nhanh server: `GET /health` và `GET /api/users`.

## Sửa nội dung

Bản này xếp phẳng: mọi file đều nằm ở gốc repo, không có thư mục con nào,
để bạn tải từng file lên GitHub bản web được.

- **100 quẻ xăm:** mảng `QUE_TITLES`, `QUE_POEMS`, `QUE_MEANINGS` ở cuối
  file `index.html` (phần "Gieo Quẻ"). Sửa trực tiếp các dòng chữ đó.
- **Nhạc thiền:** tự tổng hợp bằng Web Audio trong file `index.html`
  (nền trầm, hợp âm trôi 18 giây, chuông bát mỗi 14 giây) — không cần file nhạc.
- **Tên chùa / màu sắc:** sửa tiêu đề trong `index.html` và biến màu
  ở đầu khối `<style>`.
- **Mã QR Hòm Công Đức:** file `donate-vietqr.png` (ngay ở gốc repo) — đây là ảnh
  mã QR VietQR của chính user (tên trong ảnh: NHU VAN DAT, ảnh user gửi
  2026-10-31), được sao chép nguyên bản, không vẽ lại, không cắt xén.
  Muốn đổi mã khác thì thay đúng file này bằng ảnh mã QR mới, giữ nguyên tên
  file; không ghi số tài khoản bằng chữ lên trang.

## Lưu ý

- Bát Tự · Tử Vi trong trang tính hoàn toàn trên trình duyệt bằng công thức
  rút gọn, **không lưu** thông tin ngày giờ sinh của ai, chỉ để tham khảo.
- Trang không lưu tên, tin nhắn hay lịch sử chat lên server — đóng trang là hết.
