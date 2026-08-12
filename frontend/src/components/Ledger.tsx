import { Fragment, useMemo, useState } from "react";
import type { Case, Difficulty } from "../types";
import { band, bandVar, f3 } from "../format";

/** Cases where the score alone misleads, so the demo can say why out loud. */
const NOTES: Record<string, string> = {
  A02:
    "Hệ thống từ chối đúng và retrieval lấy đúng chunk NU-00-P04. Điểm 0.000 là lỗi của thước đo, không phải của hệ thống — nhãn hallucination ở đây sai.",
  E04:
    "Câu trả lời chính xác tuyệt đối. Relevance 0.417 chỉ vì heuristic không stemming: câu hỏi dùng cover/exclude, câu trả lời dùng covers/excludes.",
  A01:
    "Không chunk nào thuộc 00_system_scope.md — guardrail phạm vi không bao giờ tới được generator.",
  A03:
    "Bác được tiền đề sai nhưng viện lý do sai; NU-00 không được retrieve nên thẩm quyền thật không có trong context.",
  H03:
    "Câu trả lời tự thú nhận “not detailed in the retrieved contexts” — đoạn NU-04-P05 về quyền khiếu nại bị bỏ sót.",
  H02:
    "Khẳng định “scholarship will remain intact”, mâu thuẫn với quy tắc withdrawal sau census trong NU-04.",
  H01:
    "Trả lời đúng cả version, phí lẫn hai cấp phê duyệt. Completeness thấp phần lớn vì đáp án chuẩn viết dài hơn.",
};

const DIFFS: (Difficulty | "all")[] = ["all", "easy", "medium", "hard", "adversarial"];
const STATUSES = ["all", "pass", "fail"] as const;

/** "04_scholarships.md" → "NU-04", so gold docs can be matched against chunk ids. */
const docPrefix = (doc: string) => `NU-${doc.slice(0, 2)}`;

export function Ledger({ cases }: { cases: Case[] }) {
  const [diff, setDiff] = useState<Difficulty | "all">("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      cases.filter(
        (c) =>
          (diff === "all" || c.difficulty === diff) &&
          (status === "all" || (status === "pass") === c.passed),
      ),
    [cases, diff, status],
  );

  return (
    <>
      <div className="filters">
        <span className="fl">Độ khó</span>
        {DIFFS.map((d) => (
          <button
            key={d}
            className="chip"
            aria-pressed={diff === d}
            onClick={() => setDiff(d)}
          >
            {d === "all" ? "Tất cả" : d}
          </button>
        ))}
        <span className="fl" style={{ marginLeft: 12 }}>
          Kết quả
        </span>
        {STATUSES.map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? "Tất cả" : s === "pass" ? "Pass" : "Fail"}
          </button>
        ))}
      </div>

      <div className="ledgerwrap">
        <table className="ledger">
          <thead>
            <tr>
              <th className="l" scope="col">ID</th>
              <th className="l" scope="col">Độ khó</th>
              <th className="l" scope="col">Câu hỏi</th>
              <th scope="col">C·Rec</th>
              <th scope="col">C·Prec</th>
              <th scope="col">Faith</th>
              <th scope="col">Rel</th>
              <th scope="col">Compl</th>
              <th scope="col">Overall</th>
              <th className="l" scope="col">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isOpen = open === c.id;
              const metrics: (number | null)[] = [
                c.contextRecall,
                c.contextPrecision,
                c.faithfulness,
                c.relevance,
                c.completeness,
              ];
              return (
                <Fragment key={c.id}>
                  <tr
                    className={`caserow${isOpen ? " open" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(isOpen ? null : c.id);
                      }
                    }}
                  >
                    <td className="l"><span className="cid">{c.id}</span></td>
                    <td className="l"><span className="diff">{c.difficulty}</span></td>
                    <td className="l">
                      <span className="qtext" title={c.question}>{c.question}</span>
                    </td>
                    {metrics.map((m, i) => (
                      <td key={i} className={m !== null && m < 0.5 ? "lo" : undefined}>
                        {f3(m)}
                      </td>
                    ))}
                    <td>
                      <span className="ovcell">
                        <span className="ovbar">
                          <i
                            style={{
                              width: `${(c.overall * 100).toFixed(1)}%`,
                              background: bandVar(band(c.overall)),
                            }}
                          />
                        </span>
                        {f3(c.overall)}
                      </span>
                    </td>
                    <td className="l">
                      <span className={`pill ${c.passed ? "ok" : "no"}`}>
                        {c.passed ? "Pass" : c.failureType ?? "Fail"}
                      </span>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="detailrow">
                      <td colSpan={10}>
                        <div className="detail-inner">
                          <div className="dblock">
                            <p className="dh">Câu hỏi</p>
                            <p>{c.question}</p>
                          </div>
                          <div className="dblock">
                            <p className="dh">Chunks đã retrieve · theo thứ hạng</p>
                            <div className="chunks">
                              {c.chunks.map((id) => (
                                <span
                                  key={id}
                                  className={
                                    c.goldDocs.some((d) => id.startsWith(docPrefix(d)))
                                      ? "hit"
                                      : undefined
                                  }
                                >
                                  {id}
                                </span>
                              ))}
                            </div>
                            <p className="dh" style={{ marginTop: 12 }}>Gold evidence</p>
                            <div className="chunks">
                              {c.goldDocs.map((d) => (
                                <span key={d}>{d}</span>
                              ))}
                            </div>
                          </div>
                          <div className="dblock">
                            <p className="dh">Đáp án chuẩn</p>
                            <p>{c.expected}</p>
                          </div>
                          <div className="dblock">
                            <p className="dh">Câu trả lời thật</p>
                            <p>{c.actual}</p>
                          </div>
                          {NOTES[c.id] && (
                            <div className="flag">
                              <b>{c.id}</b> — {NOTES[c.id]}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="axlabels" style={{ padding: "10px 0 0" }}>
        <span>hiển thị {rows.length} / {cases.length} case</span>
        <span>ngưỡng pass: cả ba answer metrics ≥ 0.50</span>
      </p>
    </>
  );
}
