# AI Coding Context & Instructions

## Ngôn ngữ giao tiếp
- **Language:** Giao diện ứng dụng chủ yếu bằng tiếng Việt. Cần ưu tiên sinh ra văn bản hiển thị cho người dùng (UI text) bằng tiếng Việt.
- Giữ văn phong chuyên nghiệp và ngắn gọn.

## Thiết kế & Giao diện (UI/UX)
- Ứng dụng sử dụng **Tailwind CSS**.
- **Theme màu:** Đang dùng hệ màu gradient indigo/purple cho các thanh công cụ (Toolbar) tạo cảm giác hiện đại và chuyên nghiệp.
- **Kiến trúc Layout:** Duy trì thiết kế giao diện dạng "Ribbon toolbar" (các nút chức năng nằm dàn ngang ở trên cùng) để hỗ trợ thao tác giống bộ phần mềm văn phòng.

## Công nghệ & Thư viện (Libraries)
- Chỉnh sửa PDF: `pdf-lib` (hỗ trợ đọc, sửa, thêm text/signature, xuất file).
- Hiển thị PDF: `pdfjs-dist` (Hiển thị trang PDF lên thẻ Canvas).
- Icon: `lucide-react`.

## Đặc tả & Lưu ý cốt lõi (Constraints)
- **Hoạt động Offline (Client-side Only):** Ứng dụng KHÔNG được gửi file PDF lên bất kì server/backend nào để đảm bảo bảo mật tài liệu cho người dùng. Mọi thao tác xử lý phải chạy bằng JS trên trình duyệt.
- **Khả năng đóng gói:** Ứng dụng có cơ chế build ra 1 file HTML duy nhất (offline) thông qua lệnh `build`. Các thay đổi không được làm hỏng cơ chế build offline này.
