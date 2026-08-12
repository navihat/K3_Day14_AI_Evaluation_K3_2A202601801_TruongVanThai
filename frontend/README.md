# Demo frontend

React + Vite + TypeScript. Mọi con số hiển thị đều do backend tính trực tiếp bằng
evaluation core trong [`template.py`](../template.py) — không có số liệu nào chép cứng
vào frontend.

## Chạy

Cần hai tiến trình khi phát triển. Không cần `OPENAI_API_KEY`: backend phát lại các
câu trả lời đã lưu trong `artifacts/actual_answers.json` chứ không gọi lại LLM.

```powershell
# terminal 1 — API (chạy từ thư mục gốc của lab)
.\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt      # lần đầu
uvicorn api.server:app --reload --port 8000

# terminal 2 — dev server
cd frontend
npm install                              # lần đầu
npm run dev                              # http://localhost:5173
```

Vite proxy chuyển `/api` sang cổng 8000, nên frontend và backend dùng chung đường dẫn
tương đối ở cả dev lẫn production.

## Bản build một cổng — dùng khi demo

```powershell
cd frontend
npm run build                            # sinh frontend/dist
cd ..
uvicorn api.server:app --port 8000       # mở http://127.0.0.1:8000
```

`api/server.py` mount `frontend/dist` ở `/` **sau** khi đã đăng ký các route `/api/*`,
nên một cổng duy nhất phục vụ cả giao diện lẫn API. Đây là cách nên dùng lúc demo vì
chỉ phải khởi động một tiến trình.

> `frontend/dist` không được commit. Sau khi clone repo phải chạy `npm run build` một
> lần thì FastAPI mới có gì để phục vụ; nếu chưa build, `/api/*` vẫn chạy bình thường.

## Các tab

| Tab | Nội dung | Gọi API |
|---|---|---|
| Tổng quan | Readouts, khoảng cách retrieval–answer, điều đáng nhớ | `GET /api/dataset` |
| Sổ điểm 20 case | Bảng đầy đủ, lọc theo độ khó/kết quả, mở từng dòng xem chunk đã retrieve | `GET /api/dataset` |
| Quality gate | Kéo ngưỡng từng metric, tập case đạt đổi ngay | `POST /api/gate` |
| Reranking | Đổi tín hiệu xếp hạng, xem Recall/Precision trước–sau | `POST /api/rerank` |
| Chấm thử | Gõ answer bất kỳ, chấm bằng đúng năm metrics | `POST /api/score` |

Tab nằm trong URL hash (`#gate`, `#rerank`, …) nên deep-link được và không mất chỗ khi reload.

## Ba điểm đáng nhấn khi demo

1. **Tab Chấm thử** đã nạp sẵn ví dụ refusal của case A02. Bấm *Chấm điểm*: hệ thống
   hành xử hoàn toàn đúng nhưng cả ba metrics về `0.000` và nhãn tự động là
   `hallucination`. Đây là phát hiện chính của cả dự án.
2. **Tab Quality gate**: chuyển giữa hai preset. Cùng một bộ điểm, pass rate nhảy từ
   55% xuống 25% — chỉ vì luật quyết định đổi, không phải vì hệ thống tệ đi.
3. **Tab Reranking**: đổi tín hiệu xếp hạng sang *Theo đáp án chuẩn* và so với
   *Theo câu hỏi*. Recall giữ nguyên ở cả hai vì union token không phụ thuộc thứ tự.
