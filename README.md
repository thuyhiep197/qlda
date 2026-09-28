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

## 2. Triển khai lên server bằng Docker (có tên miền + HTTPS)

Xem hướng dẫn đầy đủ trong **[TRIEN-KHAI.md](TRIEN-KHAI.md)**. Tóm tắt:

```bash
cp .env.example .env      # điền DOMAIN, ADMIN_USERNAME, ADMIN_FULLNAME, ADMIN_PASSWORD
docker compose up -d --build
```

- Gói Docker gồm ứng dụng và Caddy. Caddy tự cấp chứng chỉ HTTPS cho `DOMAIN`, với điều kiện DNS đã trỏ về server và đã mở cổng 80/443.
- Toàn bộ dữ liệu nằm trong `./data` trên server. **Chỉ cần sao lưu thư mục này.**
- Cập nhật phiên bản: `docker compose up -d --build`. CSDL tự nâng cấp schema khi khởi động.

## 3. Sao lưu

- Hệ thống **tự sao lưu CSDL mỗi ngày** vào `data/backups/` và giữ 14 bản gần nhất (đổi bằng `BACKUP_KEEP`).
- Sao lưu thủ công: `npm run backup -w server` (máy cá nhân) hoặc `docker exec qlda node --import tsx server/src/backup.ts`.
- Khôi phục: tắt tool, thay `data/qlda.db` bằng bản sao lưu (đổi tên thành `qlda.db`), xóa các file `qlda.db-wal`, `qlda.db-shm` nếu có, rồi khởi động lại.
- Tệp đính kèm nằm trong `data/uploads/`. Hãy sao lưu thư mục này cùng với CSDL.

## 4. Chức năng

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Admin tạo tài khoản, cấp mật khẩu tạm; bắt buộc đổi mật khẩu lần đầu; đặt lại mật khẩu; khóa/mở khóa; chống dò mật khẩu (khóa 15 phút sau 10 lần sai) |
| Phân quyền | Mỗi tài khoản có **một vai trò** (BA Lead, BA, Techlead, Dev, Người xem) quyết định quyền trên mọi dự án người đó tham gia; **thành viên dự án** quyết định ai được vào dự án. Quản trị hệ thống có toàn quyền. Tạo thêm vai trò và tick chọn 12 quyền trên ma trận |
| Dự án | Scrum hoặc Kanban, mã dự án (VD `QLVB` → issue `QLVB-12`), trưởng dự án, thành viên, lưu trữ/khôi phục |
| Issue | Epic, Story, Task, Bug, Sub-task; mô tả Markdown; độ ưu tiên; story point; nhãn; hạn hoàn thành; người thực hiện; issue cha; liên kết (chặn / liên quan / trùng); bình luận; tệp đính kèm (kéo thả, xem trước ảnh); lịch sử thay đổi đầy đủ |
| Trao đổi | Bình luận Markdown; gõ **@** để nhắc thành viên dự án; **dán ảnh (Ctrl+V)** hoặc kéo thả ảnh/tệp vào bình luận, mô tả (ảnh hiện ngay trong nội dung, tự lưu vào tệp đính kèm); **Người theo dõi** (tự thêm người tạo, người được giao, người bình luận, người được @nhắc; ai cũng tự Theo dõi/Bỏ theo dõi) |
| Thông báo | Chuông trên thanh trên cùng (tự làm mới 30 giây): được @nhắc, được giao việc, issue đang theo dõi có bình luận mới hoặc đổi trạng thái. Bấm để mở đúng issue; đánh dấu đã đọc. Thông báo đã đọc tự xóa sau 90 ngày |
| Scrum | Backlog kéo thả để xếp thứ tự và đưa vào sprint; tạo, bắt đầu, sửa, hoàn thành sprint (chuyển issue chưa xong sang backlog hoặc sprint sau); board sprint đang chạy |
| Kanban | Board liên tục, giới hạn việc đang thực hiện (WIP) theo cột, tự ẩn issue đã xong quá 14 ngày |
| Board | Kéo thả đổi trạng thái; lọc theo người, epic, loại, nhãn; phân làn theo người thực hiện hoặc epic |
| Workflow | Dự án → Cài đặt → **Trạng thái & quy trình**: (1) kho trạng thái — thêm, sửa, sắp xếp, xóa, nhóm Cần làm / Đang thực hiện / Hoàn thành, giới hạn việc đang thực hiện; (2) **trạng thái theo loại issue** — mỗi loại (Epic, Story, Task, Bug, Sub-task) chọn các trạng thái được dùng, issue đang ở trạng thái bị bỏ được chuyển sang trạng thái cùng nhóm sau khi xác nhận; (3) **luồng chuyển** — bật kiểm soát, ma trận Từ → Tới cho luồng chung và luồng riêng từng loại. Áp dụng khi tạo issue, đổi trạng thái, đổi loại, kéo thả trên bảng và nhập Excel |
| Nhập từ Excel | Tab Backlog / Danh sách issue → **Nhập từ Excel**: tải file mẫu (có sẵn ô chọn), nhập file .xlsx hoặc CSV xuất từ Jira; xem trước kết quả kiểm tra từng dòng, nhập theo nguyên tắc tất cả hoặc không (có thể bỏ qua dòng lỗi); tự nối Epic → Story/Task/Bug → Sub-task; tối đa 1000 dòng/lần. Quyền: Nhập issue hàng loạt |
| Tìm kiếm | Lọc theo dự án, loại, trạng thái, người, ưu tiên, sprint, nhãn, từ khóa; bộ lọc lưu trên URL để chia sẻ; xuất CSV mở bằng Excel |
| Lộ trình (Roadmap) | Timeline các epic theo tháng, tiến độ từng epic |
| Báo cáo | Biểu đồ khối lượng còn lại (burndown) theo điểm ước lượng hoặc số issue, Năng suất sprint (velocity), tổng quan (theo trạng thái, loại, ưu tiên, người thực hiện), xu hướng tạo mới/hoàn thành, danh sách quá hạn |
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
| Nhập issue hàng loạt từ Excel/CSV | ✔ | ✔ | ✔ | | |
| Sửa/xóa bình luận, xóa tệp của người khác | ✔ | | | | |

Vai trò chọn khi tạo tài khoản (mục **Người dùng**). Đổi vai trò thì quyền thay đổi ngay trên mọi dự án. Trong mỗi dự án chỉ cần thêm hoặc bỏ thành viên. Tài khoản BA Lead được bật **Quản trị hệ thống**, nên có toàn quyền trên mọi dự án, kể cả khi không được thêm làm thành viên. Người xem dành cho khách hàng hoặc lãnh đạo.

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
