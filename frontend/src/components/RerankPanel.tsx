import { useEffect, useState } from "react";
import { runRerank } from "../api";
import type { RerankResult } from "../types";
import { f3, signed } from "../format";

const STRATEGIES: { key: "question" | "expected"; label: string; note: string }[] = [
  {
    key: "question",
    label: "Theo câu hỏi",
    note: "Tín hiệu có thật lúc inference — hệ thống chỉ biết câu hỏi.",
  },
  {
    key: "expected",
    label: "Theo đáp án chuẩn",
    note: "Oracle: chỉ để so sánh, không dùng được trong production vì đáp án chưa tồn tại.",
  },
];

export function RerankPanel() {
  const [strategy, setStrategy] = useState<"question" | "expected">("question");
  const [res, setRes] = useState<RerankResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    runRerank(strategy)
      .then((r) => !cancelled && (setRes(r), setErr(null)))
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [strategy]);

  const moved = res?.cases.filter((c) => Math.abs(c.delta) > 1e-9) ?? [];
  const active = STRATEGIES.find((s) => s.key === strategy)!;

  return (
    <section className="panel">
      <div className="sechead">
        <h2>Reranking</h2>
        <p>
          Sắp xếp lại đúng tập 5 chunk đã lấy về, không thêm và không bỏ chunk nào. Đổi tín
          hiệu xếp hạng để thấy vì sao một reranker từ vựng chỉ tốt khi query và đáp án dùng
          chung từ vựng.
        </p>
      </div>

      <div className="filters">
        <span className="fl">Tín hiệu xếp hạng</span>
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            className="chip"
            aria-pressed={strategy === s.key}
            title={s.note}
            onClick={() => setStrategy(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 18 }}>{active.note}</p>

      {err && <p className="notice">{err}</p>}

      {res && (
        <>
          <div className="readouts" style={{ marginBottom: 22 }}>
            <div className="readout">
              <p className="k">Context Precision</p>
              <p className="v">{f3(res.avgPrecisionAfter)}</p>
              <p className="n">
                từ {f3(res.avgPrecisionBefore)} · {signed(res.avgPrecisionAfter - res.avgPrecisionBefore)}
              </p>
            </div>
            <div className="readout">
              <p className="k">Context Recall</p>
              <p className="v">{f3(res.avgRecallAfter)}</p>
              <p className="n">
                {res.recallChanged.length === 0
                  ? "không đổi ở cả 20 case"
                  : `${res.recallChanged.length} case thay đổi`}
              </p>
            </div>
            <div className="readout">
              <p className="k">Case đổi thứ hạng</p>
              <p className="v">{moved.length}</p>
              <p className="n">trên tổng {res.cases.length} case</p>
            </div>
          </div>

          <div className="card">
            <div className="legend">
              <span><i className="dot" style={{ background: "var(--accent)" }} />Trước rerank</span>
              <span><i className="dot" style={{ background: "var(--second)" }} />Sau rerank</span>
            </div>

            {moved.length === 0 ? (
              <p className="muted">Không case nào đổi Context Precision với tín hiệu này.</p>
            ) : (
              moved.map((c) => {
                const lo = Math.min(c.precisionBefore, c.precisionAfter) * 100;
                const hi = Math.max(c.precisionBefore, c.precisionAfter) * 100;
                const cls = c.delta > 0 ? "up" : c.delta < 0 ? "down" : "flat";
                return (
                  <div className="drow" key={c.id}>
                    <span className="did">{c.id}</span>
                    <span className="dtrack">
                      <span className="axis" />
                      <span className="link" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                      <span
                        className="pt"
                        style={{ left: `${c.precisionBefore * 100}%`, background: "var(--accent)" }}
                        title={`trước ${f3(c.precisionBefore)}`}
                      />
                      <span
                        className="pt"
                        style={{ left: `${c.precisionAfter * 100}%`, background: "var(--second)" }}
                        title={`sau ${f3(c.precisionAfter)}`}
                      />
                    </span>
                    <span className={`ddelta ${cls}`}>{signed(c.delta)}</span>
                  </div>
                );
              })
            )}
            <p className="axlabels">
              <span>Context Precision 0.0</span>
              <span>1.0</span>
            </p>
          </div>

          <p className="thesis">
            Recall không đổi ở <b>{res.cases.length - res.recallChanged.length}/{res.cases.length}</b> case,
            vì union token của tập chunk không phụ thuộc thứ tự — mọi case đều xác nhận{" "}
            <code>sameSet</code>. Chỉ Context Precision phản ứng, vì nó là rank-aware
            Average Precision@K.
          </p>
        </>
      )}
    </section>
  );
}
