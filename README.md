# QLDA – Công cụ quản lý dự án nội bộ

Công cụ quản lý dự án dạng Jira, tự vận hành nội bộ: tài khoản, phân quyền theo vai trò và theo dự án, Scrum (backlog, sprint, board), Kanban, workflow tùy chỉnh, báo cáo và dashboard.

## 1. Chạy trên máy cá nhân (giai đoạn dựng & nghiệm thu)

Yêu cầu: **Node.js 24** trở lên.

- **Cách nhanh:** nhấp đúp `chay-tool.bat`. Lần đầu script tự cài thư viện và build giao diện, sau đó mở trình duyệt tại http://localhost:3001.
- **Dòng lệnh:**
  ```bash
  npm install
  npm run build        # build giao diện
  npm start            # chạy tại http://localhost:3001
  ```
- **Chế độ phát triển** (sửa code thì tự tải lại): `npm run dev`, mở http://localhost:5173
- **Nạp dữ liệu mẫu** (dự án DEMO và 4 người dùng mẫu, mật khẩu `Demo@123`): `npm run seed:demo`

Đăng nhập lần đầu bằng tài khoản quản trị khai báo trong `.env` (`ADMIN_USERNAME`, `ADMIN_FULLNAME`, `ADMIN_PASSWORD`; mặc định **admin / Admin@123**). Tài khoản này chỉ được tạo khi CSDL còn trống. Hệ thống bắt buộc đổi mật khẩu ngay lần đăng nhập đầu tiên.

Sau khi sửa mã nguồn giao diện, chạy `build-lai.bat` (hoặc `npm run build`) rồi khởi động lại.

## 2. Triển khai lên server bằng Docker

```bash
cp .env.example .env      # sửa ADMIN_PASSWORD, COOKIE_SECURE...
docker compose up -d --build
```

- Truy cập: `http://<ip-server>:3001`
- Toàn bộ dữ liệu nằm trong thư mục `./data` trên server (CSDL `qlda.db`, `uploads/`, `backups/`). **Chỉ cần sao lưu thư mục này.**
- Cập nhật phiên bản: chép mã nguồn mới lên server rồi chạy `docker compose up -d --build`. CSDL tự nâng cấp schema khi khởi động.
- Chuyển dữ liệu đã nhập thử từ máy cá nhân lên server: tắt tool, chép thư mục `data/` lên server, rồi khởi động container.
- Nếu truy cập qua HTTPS (Nginx/Caddy làm reverse proxy), đặt `COOKIE_SECURE=true`.

## 3. Sao lưu

- Hệ thống **tự sao lưu CSDL mỗi ngày** vào `data/backups/` và giữ 14 bản gần nhất (đổi bằng `BACKUP_KEEP`).
- Sao lưu thủ công: `npm run backup -w server` (máy cá nhân) hoặc `docker exec qlda node --import tsx server/src/backup.ts`.
- Khôi phục: tắt tool, thay `data/qlda.db` bằng bản sao lưu (đổi tên thành `qlda.db`), xóa các file `qlda.db-wal`, `qlda.db-shm` nếu có, rồi khởi động lại.
- Tệp đính kèm nằm trong `data/uploads/`. Hãy sao lưu thư mục này cùng với CSDL.

## 4. Chức năng

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Admin tạo tài khoản, cấp mật khẩu tạm; bắt buộc đổi mật khẩu lần đầu; đặt lại mật khẩu; khóa/mở khóa; chống dò mật khẩu (khóa 15 phút sau 10 lần sai) |
| Phân quyền | Quản trị hệ thống (toàn quyền) + **vai trò theo từng dự án**. 5 vai trò mặc định (BA Lead, BA, Techlead, Dev, Người xem); tạo thêm vai trò và tick chọn 12 quyền trên ma trận |
| Dự án | Scrum hoặc Kanban, mã dự án (VD `QLVB` → issue `QLVB-12`), trưởng dự án, thành viên, lưu trữ/khôi phục |
| Issue | Epic, Story, Task, Bug, Sub-task; mô tả Markdown; độ ưu tiên; story point; nhãn; hạn hoàn thành; người thực hiện; issue cha; liên kết (chặn / liên quan / trùng); bình luận; tệp đính kèm (kéo thả, xem trước ảnh); lịch sử thay đổi đầy đủ |
| Scrum | Backlog kéo thả để xếp thứ tự và đưa vào sprint; tạo, bắt đầu, sửa, hoàn thành sprint (chuyển issue chưa xong sang backlog hoặc sprint sau); board sprint đang chạy |
| Kanban | Board liên tục, giới hạn WIP theo cột, tự ẩn issue đã xong quá 14 ngày |
| Board | Kéo thả đổi trạng thái; lọc theo người, epic, loại, nhãn; phân làn theo người thực hiện hoặc epic |
| Workflow | Thêm, sửa, xóa, sắp xếp trạng thái; nhóm trạng thái (Cần làm / Đang thực hiện / Hoàn thành); bật kiểm soát luồng chuyển bằng ma trận Từ → Tới |
| Tìm kiếm | Lọc theo dự án, loại, trạng thái, người, ưu tiên, sprint, nhãn, từ khóa; bộ lọc lưu trên URL để chia sẻ; xuất CSV mở bằng Excel |
| Roadmap | Timeline các epic theo tháng, tiến độ từng epic |
| Báo cáo | Burndown sprint (theo point hoặc số issue), Velocity, tổng quan (theo trạng thái, loại, ưu tiên, người thực hiện), xu hướng tạo mới/hoàn thành, danh sách quá hạn |
| Trang chủ | Việc của tôi, số liệu cá nhân, hoạt động gần đây, dự án của tôi |

### Ma trận quyền mặc định

| Quyền | BA Lead | BA (kiêm PM, Tester) | Techlead | Dev | Người xem |
|---|:-:|:-:|:-:|:-:|:-:|
| Xem dự án, bình luận | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tạo issue, chuyển trạng thái, đính kèm tệp | ✔ | ✔ | ✔ | ✔ | |
| Sửa issue do mình tạo hoặc được giao | ✔ | ✔ | ✔ | ✔ | |
| Sửa mọi issue | ✔ | ✔ | ✔ | | |
| Giao việc cho người khác | ✔ | ✔ | ✔ | | |
| Quản lý sprint, sắp xếp backlog | ✔ | ✔ | ✔ | | |
| Quản trị dự án (thông tin, thành viên, workflow) | ✔ | | | | |
| Xóa issue | ✔ | | | | |
| Sửa/xóa bình luận, xóa tệp của người khác | ✔ | | | | |

Tài khoản BA Lead được bật **Quản trị hệ thống**, nên có toàn quyền trên mọi dự án, kể cả khi không được thêm làm thành viên. Người xem dành cho khách hàng hoặc lãnh đạo.

Quản trị hệ thống sửa được ma trận này tại **Vai trò & quyền**. Mọi quyền được kiểm tra ở phía server, không chỉ ẩn nút trên giao diện.

## 5. Cấu trúc mã nguồn

```
server/src/
  index.ts            khởi động Express, định tuyến, phục vụ giao diện đã build
  db.ts               kết nối SQLite (node:sqlite), migrations theo phiên bản
  auth.ts             băm mật khẩu (scrypt), JWT cookie, middleware đăng nhập
  permissions.ts      danh mục quyền, vai trò mặc định, kiểm tra quyền theo dự án
  issues.ts           nghiệp vụ issue: tạo, sửa (kèm lịch sử), xếp hạng, xóa
  backup.ts           sao lưu CSDL
  routes/             auth, admin (users/roles), projects (thành viên, workflow, sprint), issues, reports
web/src/
  pages/              Dashboard, Backlog, Board, IssueList, Roadmap, Reports, ProjectSettings, Admin...
  components/         IssueDetail, CreateIssueModal, FilterBar, ui...
```

Thay đổi cấu trúc CSDL: **thêm** một phần tử mới vào cuối mảng `migrations` trong `server/src/db.ts`, không sửa các phần tử đã có.
