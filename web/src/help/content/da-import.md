---
title: Import kế hoạch từ Excel/CSV
section: project
module: Công việc
order: 100
summary: Nhập hàng loạt Epic, Story, Task, Bug, Sub-task từ file Excel mẫu, file kế hoạch đánh số WBS hoặc CSV xuất từ Jira.
need: issue.import, issue.create
keywords: import, nhập excel, nhập csv, file mẫu, kế hoạch excel, wbs, stt, jira, nhập hàng loạt, xlsx
---

## Màn hình này dùng để làm gì

Đưa cả kế hoạch dự án từ Excel vào tool trong một lần, thay vì tạo từng issue. Nút **Nhập từ Excel** có ở tab **Backlog** và tab **Danh sách issue** của dự án.

![Nhập issue từ Excel](/help/img/da-import.webp)

1. **Chuẩn bị file** — nút **Tải file mẫu Excel** (có sẵn ô chọn Loại, Độ ưu tiên, Người thực hiện, Sprint, Trạng thái theo đúng dự án, kèm sheet **Hướng dẫn**).
2. **Chọn hoặc kéo thả file** — `.xlsx` hoặc `.csv`, tối đa 1000 dòng.

## Thao tác

:::perm issue.import, issue.create
### Nhập file
1. Bấm **Nhập từ Excel**.
2. Bấm **Tải file mẫu Excel**, điền ở sheet **Issue** (mỗi dòng một issue), lưu lại. Hoặc dùng file kế hoạch sẵn có / CSV xuất từ Jira.
3. Kéo thả file vào ô số 2. File có nhiều sheet thì chọn **Sheet cần nhập**.
4. Xem bảng kiểm tra: mỗi dòng hiện hợp lệ, cảnh báo hoặc lỗi kèm lý do.
5. Có dòng lỗi: sửa file rồi chọn lại, hoặc tick **Bỏ qua … dòng lỗi, chỉ nhập … dòng hợp lệ** để chỉ nhập các dòng hợp lệ.
6. Bấm **Nhập N issue**. Xong, tool hiện danh sách mã issue vừa tạo.
:::

## Các cột trong file

Tool nhận dòng tiêu đề cột có **Tiêu đề** (hoặc **Đầu việc**, hoặc **Summary** với file Jira). Thứ tự cột và thứ tự dòng không quan trọng — issue cha luôn được tạo trước issue con.

| Cột | Cách nhập |
|---|---|
| **Mã dòng** | Không bắt buộc. Mã tự đặt (VD `E1`, `S1`) để dòng khác trỏ tới làm issue cha. |
| **Loại** | Epic, Story, Task, Bug, Sub-task. Bỏ trống = Task. |
| **Tiêu đề** | Bắt buộc, tối đa 255 ký tự. |
| **Mô tả** | Xuống dòng trong ô bằng **Alt + Enter**. |
| **Issue cha** | Story / Task / Bug: Epic chứa nó. Sub-task (bắt buộc): Story / Task / Bug chứa nó. Ghi **Mã dòng**, mã issue đã có (VD `DEMO-12`) hoặc đúng tiêu đề. |
| **Độ ưu tiên** | Khẩn cấp, Cao, Trung bình, Thấp, Rất thấp. Bỏ trống = Trung bình. |
| **Người thực hiện** | Tên đăng nhập, email hoặc họ tên của thành viên dự án. |
| **Điểm ước lượng** | Số. |
| **Sprint** | Tên sprint chưa đóng. Bỏ trống = Backlog. Không áp dụng cho Epic, Sub-task. |
| **Trạng thái** | Tên trạng thái của dự án. Bỏ trống = trạng thái đầu tiên. |
| **Mô-đun** | Tên mô-đun đã có của dự án. |
| **Nhãn** | Nhiều nhãn cách nhau bằng dấu phẩy. |
| **Ngày bắt đầu**, **Hạn hoàn thành** | Dạng ngày/tháng/năm, VD `01/10/2026`. |
| **Ước lượng thời gian** | VD `2d`, `4h`, `3h 30m`. |

Cột **Người phối hợp** (nếu có) được ghi thêm vào cuối mô tả.

## File kế hoạch đánh số (WBS)

Nếu file không có cột **Loại** và **Issue cha** nhưng có cột **STT** đánh số kiểu kế hoạch, tool tự hiểu cấp:

| STT | Thành |
|---|---|
| `I`, `II`, `III`… | Epic (giai đoạn) |
| `1`, `2`, `3`… | Story thuộc Epic ngay trên |
| `1.1`, `1.2`… | Sub-task thuộc Story có cùng số đầu (VD `1.2` → Story `1`) trong Epic đó |
| `M1`, `M2`… | Task mốc, gắn nhãn `mốc` |

## File CSV xuất từ Jira

Trong Jira: **Filters → Export → CSV**. Tool nhận các cột Summary, Issue key, Issue Type, Parent, Epic Link, Priority, Story points…; liên kết cha – con được giữ.

## Lưu ý

- Không bỏ qua dòng lỗi thì **có lỗi là không nhập dòng nào**.
- File `.xls` (Excel 97-2003) chưa hỗ trợ: mở bằng Excel, lưu lại dạng `.xlsx`.
- Cột **Người thực hiện** cần quyền **Giao việc**, cột **Sprint** cần **Backlog – Sửa**, cột **Trạng thái** (khác trạng thái đầu tiên) cần **Chuyển trạng thái**; thiếu quyền thì dòng vẫn được nhập nhưng bỏ trống ô đó (có cảnh báo).
- Người thực hiện phải là thành viên dự án — thêm họ ở [Thông tin dự án](/help/da-thong-tin) trước.

## Câu hỏi thường gặp

**Báo "Không tìm thấy dòng tiêu đề cột"?**
File cần một dòng tiêu đề có cột **Tiêu đề** hoặc **Đầu việc** (file Jira: **Summary**).

**Không thấy nút Nhập từ Excel?**
Cần cả hai quyền **Issue – Import** và **Issue – Thêm**. Xem [Quyền của tôi](/help/quyen-cua-toi).
