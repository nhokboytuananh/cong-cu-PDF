# Công cụ PDF - Trình chỉnh sửa PDF Offline

## 1. Project này là gì?
Đây là một công cụ chỉnh sửa file PDF cho phép người dùng thêm chữ ký, chèn văn bản (text fields), và ghi chú vào các tài liệu PDF trực tiếp trên trình duyệt. 
Ứng dụng được thiết kế dưới dạng Single Page Application (SPA), hoạt động hoàn toàn ở phía client (trình duyệt), đảm bảo tính bảo mật và riêng tư do không cần tải tài liệu lên máy chủ. Project còn hỗ trợ đóng gói thành một file tĩnh (HTML) duy nhất để có thể chạy offline ở bất kỳ đâu.

*Author:* Tuấn Anh-KH-QNPC

## 2. Mục tiêu của project
- Cung cấp một bộ công cụ xử lý PDF gọn nhẹ, dễ sử dụng với giao diện thanh công cụ Ribbon trực quan (tương tự như Word hay Excel).
- Thao tác chèn Text, Checkbox, và vùng điền Chữ ký (Signature Fields) tiện lợi vào file PDF một cách nhanh chóng.
- Xử lý hoàn toàn mọi tài liệu trên máy tính nội bộ của người dùng.

## 3. Cách chạy project

### Yêu cầu môi trường:
- Node.js bản mới nhất.
- Trình duyệt web hiện đại (Chrome, Edge, Firefox, Safari, v.v).

### Dành cho nhà phát triển (Development):
1. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```
2. **Khởi chạy mô trường dev:**
   ```bash
   npm run dev
   ```
3. Mở trình duyệt và truy cập vào địa chỉ localhost được hiển thị trong terminal.

### Đóng gói công cụ offline (Production):
Để xuất ra phiên bản chỉ gồm 1 file chạy trực tiếp không cần mạng:
```bash
npm run build
```
Sau quá trình build thành công, một tệp hợp nhất `CongCuTaoChuKySo.html` sẽ được tạo ra trong thư mục `public` hoặc `dist` giúp bạn có thể tải về và đem đi sử dụng ở bất kì máy tính nào. 
Bạn có thể mở tệp này bằng bất kỳ trình duyệt nào (Chrome, Edge, Safari) và "Allow" (Cho phép) nếu có cảnh báo chạy mã JavaScript.

## 4. Công nghệ sử dụng
- **React.js 18** (Vite): Thư viện cốt lõi để xây dựng giao diện người dùng.
- **Tailwind CSS**: Quản lý CSS tiện lợi với các class utility linh hoạt.
- **pdf-lib**: Chịu trách nhiệm ghi đè, thêm các element (văn bản) và tạo file PDF mới tải xuống.
- **pdfjs-dist**: Chịu trách nhiệm đọc cấu trúc file PDF và render hình ảnh các trang ra thẻ `<canvas>` của trình duyệt.
- **lucide-react**: Thư viện chứa các biểu tượng công cụ.

## 5. Ghi chú quan trọng
- Ứng dụng chạy độc lập ở chế độ **Server-less / Client-Side**, do đó nếu bạn mở một tài liệu quá lớn thì trình duyệt sẽ tốn khá nhiều RAM để render hình ảnh PDF.
- Các chức năng gõ kí tự Tiếng Việt đã được thiết lập lọc bỏ các dấu ở mức độ cơ bản nhằm giảm thiểu việc lỗi font chữ mã hóa đối với phông chữ mặc định của PDF (Standard Fonts).
- Hoàn toàn yên tâm khi ký tài liệu công ty vì file sẽ không bao giờ được tải lên mạng. Mọi thay đổi đều được máy tính của bạn trực tiếp biên dịch và tải tệp xuống.