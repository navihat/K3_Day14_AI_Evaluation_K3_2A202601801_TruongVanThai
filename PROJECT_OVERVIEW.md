# Tổng quan dự án — Day 14: AI Evaluation & Benchmarking

> Tài liệu này để đọc lại và nắm nhanh dự án: đề bài là gì, đã làm được gì, kết
> quả ra sao, và phát hiện nào đáng nhớ. Chi tiết đầy đủ nằm trong
> [`exercises.md`](exercises.md) và [`reflection.md`](reflection.md).

---

## 1. Đề bài là gì

Xây dựng một **pipeline đánh giá tự động** cho AI agent, rồi dùng nó để chấm một
hệ thống RAG thật.

Điểm dễ nhầm nhất của lab này: **có hai hệ thống, không phải một.**

| Vai trò | File | Nhiệm vụ |
|---|---|---|
| **System under evaluation** | `domain_assistant.py` | Hệ RAG trả lời câu hỏi sinh viên. Đã được cung cấp sẵn, không phải sửa. |
| **Evaluation engine** | `template.py` | Bộ máy chấm điểm. **Đây là phần phải code.** |

Domain: **Northstar University Student Services** — một trường đại học hư cấu với
10 tài liệu chính sách (lịch học vụ, đăng ký môn, học phí, học bổng, điểm danh,
nghỉ phép, tốt nghiệp, khiếu nại, quyền riêng tư).

## 2. Luồng end-to-end

```text
data/student_services/*.md            10 tài liệu chính sách (corpus nguồn)
         │
         ├─ tự viết tay ────────────>  golden_dataset.json        20 câu hỏi + đáp án chuẩn + evidence
         │                                      │
         └─ domain_assistant.py <── question ───┘
                    │   BM25 top-5 → OpenAI gpt-4o-mini
                    v
         artifacts/actual_answers.json          20 câu trả lời thật + chunks đã retrieve
                    │
         evaluate_answers.py
                    │   gọi vào template.py
                    v
         artifacts/benchmark_results.json       điểm 5 metrics từng case + failure analysis
                    │
                    v
         exercises.md + reflection.md           phân tích, 5 Whys, improvement log
```

Lưu ý quan trọng: `domain_assistant.py` **chỉ đọc `id` và `question`**. Nó không
bao giờ nhìn thấy `expected_answer` hay gold context — nếu nhìn thấy thì đó là
data leakage và benchmark mất hết ý nghĩa.

## 3. Năm metrics được implement

Tất cả đều là **heuristic word-overlap** (không gọi LLM), lấy cảm hứng từ RAGAS.

| Metric | Đo cái gì | Công thức |
|---|---|---|
| **Faithfulness** | Câu trả lời có bám vào context không? | `\|answer ∩ context\| / \|answer\|` |
| **Relevance** | Có trả lời đúng câu hỏi không? | `\|answer ∩ question\| / \|question\|` |
| **Completeness** | Có phủ hết đáp án chuẩn không? | `\|answer ∩ expected\| / \|expected\|` |
| **Context Recall** | Retriever có lấy đủ evidence không? | `\|expected ∩ ⋃chunks\| / \|expected\|` |
| **Context Precision** | Chunk đúng có xếp trước noise không? | Average Precision@K (rank-aware) |

Ba metric đầu là **answer-side** — chúng quyết định `passed` và `overall_score()`.
Hai metric sau là **retrieval-side** — chúng chỉ để **chẩn đoán**, cố ý không được
đưa vào điểm tổng. Đây là chỗ phân biệt "generator hỏng" với "retriever hỏng".

## 4. Đã làm được gì

### Part 2 — Evaluation core (`template.py`)

Hoàn thiện toàn bộ 5 Task, **42/42 tests pass, 0 skip**:

| Task | Nội dung |
|---|---|
| 1 | `QAPair`, `EvalResult` dataclasses, `overall_score()` |
| 2 | 3 answer metrics + Context Recall + Context Precision (AP@K rank-aware) + `run_full_eval` với tham số `contexts` tuỳ chọn |
| 3 | `LLMJudge`: build prompt, parse JSON scores (fallback 0.5), phát hiện positional/leniency/severity bias |
| 4 | `BenchmarkRunner`: `run`, `generate_report`, `run_regression` (drop > 0.05), `identify_failures` |
| 5 | `FailureAnalyzer`: phân loại, tìm root cause, đề xuất cải tiến, sinh improvement log dạng Markdown |
| Bonus | `rerank_by_overlap()` cho Exercise 3.5 |

### Part 3 — Golden dataset + benchmark thật

- **20 QA viết tay** từ corpus: 5 easy, 7 medium, 5 hard, 3 adversarial.
- Validator **PASS**, phủ **10/10** tài liệu, mọi evidence là **substring nguyên văn**.
- Chạy RAG thật: **20/20 câu trả lời**, không case nào lỗi.
- Chạy evaluation → `artifacts/benchmark_results.json`.

### Part 4 + Bonus

- `reflection.md`: đủ 7 mục, 3 phân tích 5 Whys, failure clustering, regression strategy.
- **Bonus 3.4**: so sánh RAGAS-style aggregate gate với DeepEval-style assertion gate.
- **Bonus 3.5**: đo reranking trước/sau trên cả 20 case.

## 5. Kết quả benchmark

Cấu hình: `gpt-4o-mini`, `top_k=5`, `temperature=0`, 52 chunks / 10 documents.

```text
Pass rate            55.0%  (11/20)

Context Recall       0.884  ← retrieval khoẻ
Context Precision    0.925  ← retrieval khoẻ
─────────────────────────
Faithfulness         0.628
Relevance            0.639
Completeness         0.577  ← yếu nhất
```

Khoảng cách **~0.30** giữa hai nhóm chính là câu chuyện của cả dự án.

**Phân bố lỗi:** `off_topic` 6, `hallucination` 2, `incomplete` 1.

## 6. Bốn phát hiện đáng nhớ

### 6.1 — Case tệ nhất lại là case hệ thống làm đúng nhất

**A02** (prompt injection) đạt **0.000 trên cả ba answer metrics** — thấp nhất
benchmark — và bị dán nhãn `hallucination`.

Nhưng kiểm tra trace thì: hệ thống **từ chối đúng**, retrieval lấy đúng chunk
`NU-00-P04` (recall 0.974), không bịa một chữ nào. Câu trả lời là *"I'm unable to
provide that information."* — 6 từ, sau khi bỏ stopword thì không chia sẻ một
content token nào với context hay expected answer.

> **Đây là lỗi của thước đo, không phải lỗi của hệ thống.** Một câu từ chối đúng,
> theo định nghĩa, cố tình không nhắc lại nội dung nó từ chối tiết lộ — nên nó bị
> phạt vì chính hành vi đúng của mình.

Bài học không phải về RAG mà về evaluation: **một thước đo hỏng không báo lỗi, nó
báo một con số trông rất thuyết phục.**

### 6.2 — Độ khó với người và độ khó với retriever không liên quan gì nhau

- **H01** — câu tôi cố tình thiết kế khó nhất (bẫy effective date: hỏi về late-add
  đã bàn từ tháng 7 nhưng nộp ngày 20/08, phải chọn đúng policy v2.0 chứ không phải
  v1.0) → Context Precision **1.000**, trả lời đúng cả version, phí, lẫn hai cấp phê duyệt.
- **A01** — câu ngây thơ nhất ("nên mua cổ phiếu nào?") → Context Recall **0.176**,
  Precision **0.000**.

Nguyên nhân: BM25 bám vào từ "scholarship" (dày đặc trong NU-03/NU-04) thay vì ý
định thật, trong khi `00_system_scope.md` chỉ chứa cụm "investment advice" **một
lần duy nhất** giữa một câu liệt kê dài.

### 6.3 — Một root cause chung cho cả cụm adversarial

A01 và A03 cùng thất bại vì **`00_system_scope.md` phải cạnh tranh BM25 như một
chunk bình thường** thay vì luôn có mặt. Khi nó vắng, hệ thống mất quy tắc phạm vi
và thẩm quyền.

Hậu quả ở A03 rất tinh vi: hệ thống kết luận **đúng** (không miễn được phí) nhưng
viện **lý do sai** ("vì học bổng không chi trả late fees" — lý do thật là trợ lý
không có thẩm quyền miễn phí). Faithfulness không hề báo động vì mọi token đều có
nguồn hợp lệ trong corpus.

> **Fix ưu tiên số 1:** ghim `00_system_scope.md` vào mọi prompt. Sửa vài dòng,
> chạm cả 3 case adversarial — cũng chính là 3 case điểm thấp nhất.

### 6.4 — Reranking gần như vô dụng ở đây, và có thể gây hại

Đo trên cả 20 case:

- **Recall: 0/20 case thay đổi.** Đúng như lý thuyết — union token của tập chunk
  không phụ thuộc thứ tự.
- **Precision: chỉ +0.013 trung bình.** Vì 19/20 case đã có precision ≥ 0.804,
  không còn chỗ cải thiện.
- **M02 giảm 0.083.** Reranker sắp theo từ vựng *câu hỏi*, trong khi metric chấm
  theo từ vựng *câu trả lời chuẩn*.

Nguyên tắc rút ra: rerank chỉ cứu được khi **recall cao + precision thấp**. Ở A01
(recall thấp) nó giữ nguyên 0.000 — hoán vị của một tập không chứa evidence thì
vẫn không có evidence.

## 7. Hai điểm yếu tự phát hiện trong chính code mình viết

1. **`off_topic` là nhánh fallback nuốt 6/9 failures** mà không case nào lạc đề thật.
   Một taxonomy có nhánh "còn lại" quá rộng thì không còn là taxonomy.
2. **`find_root_cause()` mù với retrieval scores** — nó chỉ nhận ba con số answer-side,
   nên luôn dừng ở mức *mô tả* ("multiple issues") mà không chỉ được *vị trí*
   (retrieval hay generation).

## 8. Bản đồ file

```text
template.py                    ← evaluation core (phần phải code)
solution/solution.py           ← bản nộp, copy của template.py
golden_dataset.json            ← 20 QA tự viết
domain_assistant.py            ← hệ RAG (được cung cấp)
evaluate_answers.py            ← adapter artifact → core
validate_golden_dataset.py     ← kiểm tra schema + evidence provenance
data/student_services/         ← 10 tài liệu chính sách
artifacts/                     ← output thật của lần chạy
exercises.md                   ← worksheet Part 1 + 3.1–3.5
reflection.md                  ← báo cáo đánh giá + failure analysis
api/server.py                  ← FastAPI phục vụ demo, gọi thẳng vào template.py
frontend/                      ← React + Vite + TypeScript, xem frontend/README.md
```

> **Bẫy cần nhớ:** `tests/test_solution.py` **ưu tiên `solution/solution.py`** hơn
> `template.py` nếu file đó tồn tại. Nếu copy sang solution rồi vẫn sửa tiếp
> `template.py`, pytest sẽ âm thầm chạy bản cũ. Vì vậy bước copy phải làm **cuối cùng**.

## 9. Chạy lại

```powershell
.\.venv\Scripts\Activate.ps1
pytest tests/ -v                    # 42 passed
python validate_golden_dataset.py   # PASS
python domain_assistant.py          # cần OPENAI_API_KEY trong .env
python evaluate_answers.py
```

Chỉ `domain_assistant.py` cần API key. Ba lệnh còn lại chạy offline.

## 10. Demo

```powershell
pip install -r api\requirements.txt
cd frontend; npm install; npm run build; cd ..
uvicorn api.server:app --port 8000      # mở http://127.0.0.1:8000
```

Một cổng phục vụ cả giao diện lẫn API, không cần API key vì backend phát lại các câu
trả lời đã lưu. Năm tab: Tổng quan, Sổ điểm 20 case, Quality gate (kéo ngưỡng, xem tập
case đạt đổi ngay), Reranking (đổi tín hiệu xếp hạng), và Chấm thử (gõ answer bất kỳ để
chấm live). Chi tiết trong [`frontend/README.md`](frontend/README.md).
