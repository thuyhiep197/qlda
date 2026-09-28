# Hướng dẫn triển khai QLDA lên server (dành cho dev/IT)

## Yêu cầu

- Linux (khuyến nghị Ubuntu 22.04/24.04), 1–2 vCPU, 2 GB RAM, ổ trống từ 20 GB
- Docker Engine và Docker Compose plugin
- Mở cổng 3001, hoặc 80/443 nếu đặt sau reverse proxy

## Các bước

```bash
# 1. Giải nén mã nguồn (hoặc git clone) vào ~/qlda
cd ~/qlda

# 2. Cấu hình
cp .env.example .env
nano .env
#   ADMIN_USERNAME=hiepntt
#   ADMIN_FULLNAME=Nguyễn Thị Thúy Hiệp
#   ADMIN_PASSWORD=<mật khẩu tạm, bắt buộc đổi khi đăng nhập lần đầu>
#   COOKIE_SECURE=true nếu chạy sau HTTPS

# 3. Build và chạy
docker compose up -d --build
docker compose ps              # chờ trạng thái healthy
docker compose logs -f qlda    # xem log khi có lỗi

# 4. Kiểm tra
curl http://localhost:3001/api/health    # {"ok":true}
```

Truy cập `http://<ip-server>:3001`. Tài khoản admin chỉ được tạo từ `.env` khi CSDL còn trống.

## Kiến trúc

- 1 container Node.js 24: API Express phục vụ luôn giao diện React đã build sẵn trong image
- CSDL SQLite dùng module `node:sqlite` có sẵn của Node, không cần container CSDL riêng
- Toàn bộ dữ liệu nằm ở volume `./data` trên host:
  - `qlda.db`: CSDL (chế độ WAL)
  - `uploads/`: tệp đính kèm
  - `backups/`: bản sao lưu CSDL tự động mỗi ngày, giữ 14 bản (biến `BACKUP_KEEP`)
- Schema tự nâng cấp khi khởi động (migrations trong `server/src/db.ts`)

## Chuyển dữ liệu từ máy khác (nếu có)

Dừng tool ở máy nguồn, chép thư mục `data/` vào `~/qlda/data` trên server, rồi `docker compose up -d`.
Khi đó tài khoản sẵn có trong dữ liệu được giữ nguyên, và các biến `ADMIN_*` trong `.env` bị bỏ qua.

## HTTPS với tên miền (khuyến nghị)

Ví dụ dùng Caddy (tự cấp chứng chỉ Let's Encrypt), file `/etc/caddy/Caddyfile`:

```
qlda.congty.vn {
    reverse_proxy localhost:3001
}
```

- Đặt `COOKIE_SECURE=true` trong `.env`
- Trong `docker-compose.yml`, đổi cổng thành `"127.0.0.1:3001:3001"` để chỉ truy cập được qua proxy

Nếu dùng Nginx thì chỉ cần `proxy_pass http://127.0.0.1:3001;` và `client_max_body_size 30m;` để tải được tệp đính kèm lớn.

## Vận hành

| Việc | Lệnh |
|---|---|
| Cập nhật phiên bản | chép mã mới đè lên (giữ nguyên `data/` và `.env`), hoặc `git pull`; sau đó `docker compose up -d --build` |
| Sao lưu thủ công | `docker exec qlda node --import tsx server/src/backup.ts` |
| Khôi phục | `docker compose down`, chép bản trong `data/backups/` thành `data/qlda.db`, xóa `qlda.db-wal` và `qlda.db-shm`, rồi `docker compose up -d` |
| Khởi động lại | `docker compose restart` |

**Quan trọng:** đặt lịch cron chép thư mục `data/` sang máy khác hoặc NAS mỗi đêm. Bản sao lưu tự động chỉ nằm trên cùng server.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3001 | Cổng HTTP |
| `ADMIN_USERNAME` / `ADMIN_FULLNAME` / `ADMIN_PASSWORD` | admin / Quản trị hệ thống / Admin@123 | Tài khoản quản trị tạo khi CSDL còn trống |
| `COOKIE_SECURE` | false | `true` khi chạy qua HTTPS |
| `MAX_UPLOAD_MB` | 25 | Dung lượng tối đa mỗi tệp đính kèm |
| `BACKUP_KEEP` | 14 | Số bản sao lưu giữ lại; `0` để tắt |
| `JWT_SECRET` | tự sinh, lưu trong CSDL | Khóa ký phiên đăng nhập |
| `TZ` | Asia/Ho_Chi_Minh | Múi giờ |
