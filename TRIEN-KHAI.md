# Hướng dẫn triển khai QLDA lên server (dành cho dev/IT)

Mục tiêu: người dùng truy cập được từ mọi nơi qua `https://<tên-miền>`.
Gói Docker gồm 2 container:
- `qlda`: ứng dụng
- `caddy`: reverse proxy, tự xin và gia hạn chứng chỉ SSL Let's Encrypt

## 1. Chuẩn bị

| Hạng mục | Yêu cầu |
|---|---|
| Server | Linux (khuyến nghị Ubuntu 22.04/24.04), 1–2 vCPU, 2 GB RAM, ổ trống từ 20 GB, **có IP public** |
| Phần mềm | Docker Engine và Docker Compose plugin |
| Tên miền | Tên miền con, ví dụ `qlda.tencongty.vn`: tạo **bản ghi DNS A** trỏ về IP public của server. Nếu dùng Cloudflare, để chế độ **DNS only** (mây xám) trong lần chạy đầu để Caddy xin được chứng chỉ |
| Firewall | Mở **80/tcp, 443/tcp, 443/udp** từ Internet. **Không** mở 3001 ra ngoài |

Kiểm tra DNS trước khi chạy: `nslookup qlda.tencongty.vn` phải trả về đúng IP của server.

## 2. Triển khai

```bash
# Giải nén mã nguồn (hoặc git clone) vào ~/qlda
cd ~/qlda

cp .env.example .env
nano .env
#   DOMAIN=qlda.tencongty.vn
#   ADMIN_USERNAME=hiepntt
#   ADMIN_FULLNAME=Nguyễn Thị Thúy Hiệp
#   ADMIN_PASSWORD=<mật khẩu tạm, bắt buộc đổi khi đăng nhập lần đầu>

docker compose up -d --build
docker compose ps                  # qlda: healthy, qlda-caddy: running
docker compose logs -f caddy       # xem Caddy xin chứng chỉ ("certificate obtained successfully")
```

Kiểm tra:
- `curl http://localhost:3001/api/health` trên server trả về `{"ok":true}`
- Trình duyệt mở `https://qlda.tencongty.vn` hiện trang đăng nhập, có ổ khóa HTTPS

Tài khoản admin chỉ được tạo từ `.env` khi CSDL còn trống.

### Server đã có sẵn Nginx/Apache chiếm cổng 80/443?

Bỏ service `caddy` trong `docker-compose.yml`. Cấu hình web server sẵn có proxy về `http://127.0.0.1:3001` với các điểm sau:
- Nginx: `proxy_pass http://127.0.0.1:3001;` và `client_max_body_size 30m;`
- Truyền header `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`. Tool dựa vào IP thật của người dùng để chống dò mật khẩu
- Bắt buộc có HTTPS: cookie đăng nhập được đặt cờ `Secure`, nên truy cập qua `http://` sẽ không đăng nhập được

## 3. Kiến trúc & dữ liệu

- Container `qlda`: Node.js 24, API Express phục vụ luôn giao diện React đã build sẵn
- CSDL SQLite dùng module `node:sqlite` có sẵn của Node, không cần container CSDL riêng
- Toàn bộ dữ liệu nằm ở `./data` trên host:
  - `qlda.db`: CSDL
  - `uploads/`: tệp đính kèm
  - `backups/`: bản sao lưu CSDL tự động mỗi ngày, giữ 14 bản
- Chứng chỉ SSL lưu trong volume Docker `caddy_data`
- Schema CSDL tự nâng cấp khi khởi động

## 4. Bảo mật đã có sẵn trong tool

- Mật khẩu băm bằng scrypt. Bắt buộc đổi mật khẩu ở lần đăng nhập đầu và sau khi admin cấp lại
- Chống dò mật khẩu: khóa 15 phút khi sai 10 lần/tài khoản hoặc 50 lần/IP
- Đổi hoặc cấp lại mật khẩu sẽ đăng xuất mọi phiên cũ. Khóa tài khoản có hiệu lực ngay lập tức
- Cookie `HttpOnly`, `Secure`, `SameSite=Lax`
- Header bảo mật: CSP, HSTS, `X-Frame-Options` và các header liên quan
- Tệp đính kèm luôn được tải về (trừ ảnh), chạy trong sandbox nên không thực thi được mã
- Phân quyền kiểm tra ở server cho mọi API

## 5. Vận hành

| Việc | Lệnh |
|---|---|
| Cập nhật phiên bản | chép mã mới đè lên (giữ nguyên `data/` và `.env`), hoặc `git pull`; sau đó `docker compose up -d --build` |
| Sao lưu thủ công | `docker exec qlda node --import tsx server/src/backup.ts` |
| Khôi phục | `docker compose down`, chép bản trong `data/backups/` thành `data/qlda.db`, xóa `qlda.db-wal` và `qlda.db-shm`, rồi `docker compose up -d` |
| Khởi động lại | `docker compose restart` |
| Xem log | `docker compose logs -f qlda` |

**Quan trọng:** đặt cron chép thư mục `~/qlda/data` sang máy khác hoặc NAS mỗi đêm, ví dụ:
```bash
0 2 * * * rsync -a ~/qlda/data/ backup@nas:/backup/qlda/
```

## 6. Biến môi trường (`.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DOMAIN` | — | Tên miền truy cập, Caddy dùng để xin chứng chỉ |
| `ADMIN_USERNAME` / `ADMIN_FULLNAME` / `ADMIN_PASSWORD` | admin / Quản trị hệ thống / Admin@123 | Tài khoản quản trị tạo khi CSDL còn trống |
| `MAX_UPLOAD_MB` | 25 | Dung lượng tối đa mỗi tệp đính kèm |
| `BACKUP_KEEP` | 14 | Số bản sao lưu giữ lại; `0` để tắt |
| `LOGIN_LOCKOUT` | (bật) | Khóa tạm 15 phút khi đăng nhập sai 5 lần/tài khoản hoặc 30 lần/IP. Đặt `off` để tắt (không khuyến nghị) |
| `JWT_SECRET` | tự sinh, lưu trong CSDL | Khóa ký phiên đăng nhập |
| `TZ` | Asia/Ho_Chi_Minh | Múi giờ |

`COOKIE_SECURE` luôn được `docker-compose.yml` đặt là `true` trên server.

## Cứu hộ khẩn cấp khi tài khoản quản trị bị chiếm hoặc bị khóa

Chạy trực tiếp trên server (không cần đăng nhập web). Mọi thao tác được ghi vào **Nhật ký bảo mật**.

```bash
# Liệt kê các tài khoản Quản trị hệ thống và lần đăng nhập gần nhất
docker compose exec qlda node --import tsx server/src/emergency.ts admins

# Khóa ngay một tài khoản bị lộ (VD: admin) và thu hồi mọi phiên của nó
docker compose exec qlda node --import tsx server/src/emergency.ts lock admin

# Mở khóa + cấp lại quyền Quản trị + mật khẩu tạm cho chủ hệ thống (in mật khẩu tạm ra màn hình)
docker compose exec qlda node --import tsx server/src/emergency.ts restore hiepntt

# Thu hồi phiên đăng nhập của tất cả mọi người
docker compose exec qlda node --import tsx server/src/emergency.ts logout-all
```

Sau khi cứu hộ: đăng nhập bằng mật khẩu tạm, đổi mật khẩu mạnh, kiểm tra **Nhật ký bảo mật** và danh sách **Người dùng**.
