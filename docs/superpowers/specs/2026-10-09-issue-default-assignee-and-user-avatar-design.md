# Thiết kế bộ lọc, giao việc nhanh và ảnh đại diện người dùng

## Mục tiêu

1. Các màn hình dùng để duyệt hoặc thao tác từng issue mặc định chỉ hiển thị issue do tài khoản đang đăng nhập thực hiện. Người dùng vẫn có thể chọn xem toàn bộ hoặc issue của người khác.
2. Người dùng có thể thay đổi Người thực hiện trực tiếp trên dòng issue tại Danh sách issue và Kế hoạch chi tiết.
3. Người dùng có thể tự tải, thay thế và xóa ảnh đại diện. Ảnh được hiển thị nhất quán tại mọi vị trí đang hiển thị người dùng.

## Phạm vi

### Bộ lọc Người thực hiện mặc định

- Áp dụng cho Danh sách issue toàn hệ thống, Danh sách issue trong dự án, Kế hoạch chi tiết, Backlog, Board và Roadmap.
- Không tự lọc các biểu đồ, KPI hoặc bảng số liệu tổng hợp trên Dashboard và Báo cáo. Các số liệu đó tiếp tục phản ánh toàn bộ phạm vi dự án; chỉ danh sách issue có thể thao tác mới dùng mặc định “Tôi”.
- Khi URL không có tham số `assignee`, bộ lọc hiệu lực là `assignee=me` và ô chọn hiển thị “Tôi”.
- Lựa chọn “Mọi người thực hiện” dùng giá trị URL tường minh `assignee=all`. Giá trị này chỉ biểu diễn trạng thái giao diện và không được gửi thành điều kiện lọc người thực hiện tới API.
- Các lựa chọn `me`, `none` và ID người dùng tiếp tục dùng giao thức API hiện tại.
- Với các bộ lọc phía client, trạng thái mặc định được tạo sau khi `useMe` có dữ liệu và dùng ID tài khoản hiện tại; không hiển thị thoáng qua danh sách của mọi người trong lúc tải tài khoản.
- “Xóa lọc” quay về trạng thái mặc định của màn hình: người thực hiện là “Tôi”; tại Danh sách issue, nhóm trạng thái cũng quay về “Chưa hoàn thành”.
- Bộ lọc đã lưu giữ nguyên lựa chọn người thực hiện. Bộ lọc đã lưu với `assignee=all` mở lại ở chế độ xem tất cả; bộ lọc không chứa `assignee` dùng mặc định “Tôi”.
- Kế hoạch chi tiết giữ các nhánh cha cần thiết để thể hiện ngữ cảnh của issue khớp bộ lọc, nhưng không coi issue cha đó là kết quả được giao cho người dùng.
- Roadmap giữ Epic làm ngữ cảnh khi có issue con khớp; Epic không có issue khớp bị ẩn, trừ khi chính Epic được giao cho người dùng.

### Thay đổi Người thực hiện trực tiếp

- Áp dụng tại Danh sách issue toàn hệ thống, Danh sách issue trong dự án và Kế hoạch chi tiết.
- Không bổ sung thao tác nhanh này cho Backlog hoặc Board.
- Bấm avatar hoặc tên trong cột Người thực hiện mở bộ chọn; bấm vùng khác của dòng vẫn mở chi tiết issue.
- Chọn một giá trị lưu ngay qua API cập nhật issue hiện có, đóng bộ chọn và cập nhật dữ liệu liên quan.
- Người có quyền `issue.assign` được chọn thành viên dự án hoặc “Chưa giao”.
- Người không có quyền `issue.assign` chỉ được tự nhận một issue đang chưa giao, đúng với quy tắc server hiện có.
- Khi người dùng không có thao tác hợp lệ, ô Người thực hiện chỉ hiển thị thông tin và không có trạng thái tương tác.
- Danh sách issue toàn hệ thống có thể chứa nhiều dự án; bộ chọn lấy thành viên theo dự án của chính issue được chọn.
- Trong lúc lưu, điều khiển bị khóa để tránh gửi lặp. Nếu API báo lỗi, giữ giá trị cũ và hiển thị toast lỗi.

### Ảnh đại diện

- Người dùng chỉ quản lý ảnh đại diện của chính mình tại tab Hồ sơ.
- Ảnh xuất hiện ở mọi nơi component `Avatar` được sử dụng: thanh điều hướng, hồ sơ, danh sách và chi tiết issue, board, backlog, bình luận, lịch sử, thông báo, thành viên dự án, quản trị người dùng, báo cáo và bộ lọc.
- Khi không có ảnh hoặc ảnh không tải được, giao diện dùng avatar chữ cái hiện tại.

## Thiết kế dữ liệu

- Thêm migration mới với cột nullable `users.avatar` chứa tên tệp nội bộ, không chứa đường dẫn do người dùng cung cấp.
- Tệp ảnh được lưu trong thư mục con dành riêng cho avatar bên dưới thư mục upload hiện có trong `data`.
- Tên tệp lưu trữ do server sinh ngẫu nhiên; tên tệp gốc không được dùng làm đường dẫn.
- Khi thay hoặc xóa avatar, dữ liệu CSDL được cập nhật trước khi dọn tệp cũ. Lỗi dọn tệp cũ không làm mất tham chiếu tới ảnh mới và được ghi log.
- Tệp avatar nằm trong phạm vi sao lưu dữ liệu hiện tại của ứng dụng.

## API và bảo mật

- `POST /api/auth/avatar`: nhận một tệp multipart của tài khoản đã đăng nhập, tối đa 2 MB.
- `DELETE /api/auth/avatar`: bỏ ảnh đại diện hiện tại và dọn tệp tương ứng.
- `GET /api/auth/avatars/:filename`: trả tệp ảnh hợp lệ. Tên tệp phải đúng mẫu do server sinh và không được phép thoát khỏi thư mục avatar.
- Chỉ chấp nhận JPEG, PNG và WebP. Server kiểm tra cả MIME type và chữ ký nội dung tệp; không chấp nhận SVG.
- Upload sai định dạng hoặc quá dung lượng trả lỗi 400 với thông báo tiếng Việt rõ ràng; lỗi xác thực giữ nguyên cơ chế 401 hiện có.
- Response người dùng bổ sung `avatar_url`. Server tự dựng URL từ tên tệp nội bộ; client không nhận đường dẫn vật lý.
- Các truy vấn trả người dùng, thành viên, người thực hiện, tác giả bình luận/lịch sử và tác nhân thông báo bổ sung URL avatar tương ứng.
- Thao tác giao việc nhanh tái sử dụng API `PATCH /api/issues/:key` với trường `assignee_id`; không tạo endpoint và không thay đổi quy tắc phân quyền hiện có.

## Giao diện

- Component `Avatar` nhận thêm `src?: string | null`. Khi `src` tồn tại, component hiển thị ảnh vuông bo tròn với `object-fit: cover`.
- Nếu sự kiện tải ảnh báo lỗi, component ẩn ảnh lỗi và hiển thị chữ cái dự phòng.
- Tab Hồ sơ hiển thị avatar lớn, nút “Đổi ảnh”, hướng dẫn định dạng/dung lượng và nút “Xóa ảnh” khi đã có ảnh.
- Sau khi chọn tệp, client kiểm tra sơ bộ loại và dung lượng, hiển thị bản xem trước cục bộ và chỉ upload khi người dùng xác nhận lưu.
- Sau upload hoặc xóa thành công, client thu hồi URL xem trước và làm mới các query liên quan để ảnh cập nhật ngay mà không cần tải lại trang.
- Lỗi upload được hiển thị bằng hệ thống toast hiện tại; avatar cũ vẫn được giữ nếu upload thất bại.
- Tạo component bộ chọn Người thực hiện dùng chung cho Danh sách issue và Kế hoạch chi tiết. Component chịu trách nhiệm chặn sự kiện mở issue, tải thành viên đúng dự án, áp dụng quyền và gọi callback sau khi lưu.
- Sau khi giao việc thành công, làm mới cache issue/dự án cần thiết. Nếu danh sách đang mặc định lọc theo “Tôi” và issue được giao sang người khác, issue đó tự biến mất khỏi danh sách theo kết quả mới.

## Luồng dữ liệu

1. Người dùng chọn ảnh trong tab Hồ sơ.
2. Client kiểm tra sơ bộ và tạo URL xem trước.
3. Người dùng xác nhận; client gửi multipart tới API.
4. Server kiểm tra xác thực, dung lượng, MIME và chữ ký tệp, sau đó lưu bằng tên nội bộ.
5. Server cập nhật `users.avatar`, trả hồ sơ có `avatar_url`, rồi dọn ảnh cũ nếu có.
6. Client làm mới cache; mọi vị trí dùng `Avatar` nhận URL mới.
7. Nếu ảnh không đọc được, `Avatar` tự hiển thị chữ cái dự phòng.

Luồng giao việc nhanh:

1. Người dùng bấm ô Người thực hiện trên dòng issue.
2. Client xác định dự án và quyền hiệu lực của issue, rồi hiển thị các lựa chọn hợp lệ.
3. Người dùng chọn thành viên, “Chưa giao” hoặc “Giao cho tôi” tùy quyền.
4. Client gửi `PATCH /api/issues/:key` với `assignee_id` mới.
5. Khi thành công, client đóng bộ chọn và làm mới cache; khi thất bại, giữ nguyên dữ liệu cũ và báo lỗi.

## Xử lý lỗi và vòng đời tệp

- Nếu kiểm tra hoặc ghi tệp mới thất bại, không thay đổi avatar trong CSDL.
- Nếu cập nhật CSDL thất bại sau khi ghi tệp mới, server xóa tệp mới để tránh tệp rác.
- Nếu xóa tệp cũ thất bại sau khi CSDL đã trỏ sang ảnh mới hoặc null, request vẫn thành công và server ghi cảnh báo; tệp không còn được phục vụ qua dữ liệu tài khoản.
- Việc xóa hoặc khóa tài khoản nằm ngoài phạm vi thay đổi này; ảnh của tài khoản vẫn được giữ cùng dữ liệu tài khoản.

## Kiểm thử

- Test logic dựng bộ lọc Danh sách issue:
  - thiếu `assignee` tạo điều kiện API `me` và trạng thái chọn “Tôi”;
  - `assignee=all` không tạo điều kiện API;
  - `me`, `none` và ID được giữ nguyên;
  - xóa lọc quay về mặc định “Tôi”.
- Test bộ lọc dùng chung trên Backlog và Board khởi tạo bằng ID tài khoản hiện tại, cho phép chuyển sang tất cả/người khác và xóa lọc quay về “Tôi”.
- Test Kế hoạch chi tiết và Roadmap chỉ hiện issue khớp cùng các nhánh Epic/issue cha cần thiết để giữ ngữ cảnh.
- Test Dashboard và Báo cáo không bị áp dụng ngầm bộ lọc “Tôi” vào KPI hoặc số liệu tổng hợp.
- Test kiểm tra avatar:
  - chấp nhận chữ ký JPEG, PNG và WebP;
  - từ chối sai định dạng, MIME không khớp và tệp quá 2 MB;
  - thay ảnh cập nhật tham chiếu và dọn ảnh cũ;
  - xóa ảnh trả hồ sơ về trạng thái không có ảnh;
  - endpoint không chấp nhận tên tệp không hợp lệ.
- Test UI/pure behavior của `Avatar`: có URL thì hiển thị ảnh; ảnh lỗi hoặc không có URL thì hiển thị chữ cái.
- Test bộ chọn Người thực hiện:
  - ngăn click lan sang hành vi mở chi tiết issue;
  - người có `issue.assign` thấy thành viên và lựa chọn bỏ giao;
  - người không có quyền chỉ có thể tự nhận issue chưa giao;
  - gửi đúng `assignee_id`, khóa khi đang lưu và giữ giá trị cũ khi lỗi;
  - Danh sách issue toàn hệ thống tải thành viên theo đúng dự án của issue.
- Chạy toàn bộ test, typecheck và production build trước khi hoàn tất.

## Ngoài phạm vi

- Cắt, xoay hoặc chỉnh sửa ảnh trên server.
- Ảnh động, SVG và ảnh lấy từ URL bên ngoài.
- Quản trị viên đổi avatar thay người dùng.
- Đồng bộ ảnh với dịch vụ danh tính bên ngoài.
