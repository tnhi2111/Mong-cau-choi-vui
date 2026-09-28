# For you — a little 3D love story 🎁

Một website sinh nhật tương tác dành riêng cho một người: một trải nghiệm 3D nhỏ,
đi từ QR code → trái tim bí ẩn → mật khẩu → căn phòng quà → từng kỷ niệm → lá thư → màn cuối.

```
QR  →  trái tim 3D (chạm 3 lần)  →  "Only someone special can enter"
    →  lời chào  →  căn phòng với 5 món quà 3D  →  mỗi món quà = một kỷ niệm
    →  lá thư  →  mọi mảnh ký ức bay về tạo thành một trái tim lớn  →  "One more thing…"
```

## Chạy thử

```bash
npm install
npm run dev          # mở http://localhost:5173
npm run build        # xuất bản vào thư mục dist/
npm run preview      # xem bản build tại http://localhost:4173
```

Mẹo khi thử: thêm `?reset` vào URL để bắt đầu lại từ đầu (xóa tiến trình đã lưu).

## Thay nội dung (không cần biết code)

Chỉ cần sửa **2 file**. Mọi chữ có dạng `[NHƯ_THẾ_NÀY]` là chỗ để bạn điền.

### 1. `src/config/birthday.ts` — tên, mật khẩu, URL, lời nhắn, thư, nhạc

| Mục | Ý nghĩa |
| --- | --- |
| `recipientName` | Tên / biệt danh của cô ấy |
| `senderName` | Tên của bạn (ký cuối thư) |
| `birthdayPassword` | Ngày sinh, viết `DD/MM/YYYY`. Cô ấy có thể gõ `DDMMYYYY`, `DD/MM/YYYY`, `D/M/YYYY`, `DD-MM-YYYY`… |
| `siteUrl` | Địa chỉ website sau khi đăng lên mạng — QR code được tạo từ đây, **chỉ viết ở một chỗ này** |
| `togetherSince` | Ngày bắt đầu yêu nhau (`YYYY-MM-DD`) để đếm số ngày bên nhau; để `''` nếu muốn ẩn |
| `welcome`, `letter`, `final` | Lời chào, lá thư, lời nhắn cuối và bí mật sau "One more thing…" |

Trong các đoạn chữ có thể viết `{name}` và `{sender}` — chúng tự thay bằng hai cái tên ở trên.

### 2. `src/data/gifts.ts` — các món quà / kỷ niệm

Mỗi món quà là một khối dữ liệu: tiêu đề, ngày, địa điểm, ảnh bìa, lời nhắn, timeline,
ảnh polaroid, ghi chú viết tay. Thêm quà = copy một khối; xóa quà = xóa khối đó.

- `shape`: hình dạng 3D — `'box'`, `'capsule'`, `'star'`, `'orb'`, `'envelope'`
- `kind: 'letter'`: món quà này mở ra lá thư (nội dung thư nằm trong `birthday.ts`)
- `tint`: màu ánh sáng nhẹ của món quà

### Ảnh và nhạc

- Ảnh: bỏ vào `public/memories/`, rồi sửa đường dẫn trong `gifts.ts`.
  Nên thu nhỏ còn ~1600px cạnh dài, xuất `.webp` hoặc `.jpg` chất lượng ~80.
  Ảnh chỉ được tải khi món quà được mở (không làm chậm lúc vào trang).
- Nhạc: bỏ file vào `public/audio/our-song.mp3` (hoặc đổi tên trong `music.src`).
  Nhạc **không bao giờ tự phát** — cô ấy bấm nút "Turn on music ♫" góc trên.

## QR code

Mở `/qr.html` (ví dụ `http://localhost:5173/qr.html`). Có nút **Download PNG**, **Download SVG**
và **Print**. QR nằm trong khung trái tim nhưng vẫn giữ nền sáng, vùng trống và mức sửa lỗi cao,
nên điện thoại quét được dễ dàng — `npm run qa:qr` tự kiểm tra điều này.

## Đăng lên mạng (GitHub Pages)

Website tự động được build và đăng mỗi khi có thay đổi trên nhánh `main`
(workflow `.github/workflows/deploy.yml`). Địa chỉ:

**https://tnhi2111.github.io/Mong-chi-choi-vui/** — QR: **https://tnhi2111.github.io/Mong-chi-choi-vui/qr.html**

Chỉ cần bật **một lần**: repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Sau đó vào tab **Actions → Deploy to GitHub Pages → Run workflow** (hoặc push một thay đổi bất kỳ lên `main`).

Muốn đăng ở nơi khác (Netlify, Vercel…): `npm run build` tạo thư mục `dist/` là một trang tĩnh
hoàn chỉnh; nhớ đổi `siteUrl` cho khớp để QR trỏ đúng chỗ.

## Riêng tư

- Mật khẩu chỉ là một "cánh cổng" dễ thương, **không phải bảo mật thật**: ai đọc mã JavaScript
  đều có thể tìm thấy. Đừng để thông tin nhạy cảm sau nó.
- Website không gửi ảnh hay dữ liệu đi đâu cả; không có analytics. Tiến trình (đã mở quà nào)
  chỉ lưu trong trình duyệt của cô ấy.
- Trang có `noindex` để không bị Google đánh chỉ mục.

## Kỹ thuật

- **Vite + React + TypeScript**, 3D bằng **three.js / React Three Fiber / drei**.
- Chất lượng tự điều chỉnh theo thiết bị (`PerformanceMonitor`): giảm độ phân giải, số hạt,
  tắt hiệu ứng thủy tinh trên máy yếu. Không có WebGL → tự chuyển sang bản 2D (CSS) cùng câu chuyện.
- Phần 3D, trang kỷ niệm, lá thư và màn cuối đều được tải lười (lazy-load).
- Hỗ trợ bàn phím (Tab / Enter / Esc), focus rõ ràng, `prefers-reduced-motion`.
- Thử nhanh: `?quality=low|medium|high` để ép chất lượng, `?nogl` để xem bản 2D.

```
src/
├── config/birthday.ts        ← chữ, mật khẩu, URL, nhạc
├── data/gifts.ts             ← các món quà / kỷ niệm
├── components/
│   ├── 3d/                   Heart3D, Gift3D, ParticleField, IntroWorld, RoomWorld, FinalWorld…
│   ├── experience/           IntroOverlay, PasswordGate, Welcome, RoomUI, MemoryView,
│   │                         Timeline, LoveLetter, FinalReveal, FallbackScene
│   └── ui/                   MusicToggle, Reveal, useDialog, ErrorBoundary
├── lib/                      password, audio, quality, storage, text
├── qr/                       trang QR
└── styles/                   design tokens + styles từng màn
```

### Kiểm thử

```bash
npm test                                   # logic mật khẩu
npm run build && npm run preview           # rồi ở terminal khác:
npm run qa -- --size=1440x900              # đi hết câu chuyện bằng Playwright, chụp màn hình
npm run qa -- --size=390x844 --mobile      # bản điện thoại (cảm ứng)
npm run qa -- --size=1280x800 --reduced    # giảm chuyển động
npm run qa -- --size=390x844 --mobile --nogl   # bản 2D không WebGL
npm run qa:keyboard                        # chỉ dùng bàn phím
npm run qa:qr                              # QR quét được và đúng URL
```

Ảnh chụp nằm trong `qa-output/` (không commit).
