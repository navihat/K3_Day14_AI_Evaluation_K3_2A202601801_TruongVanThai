import { useEffect, useState } from "react";
import { runGate } from "../api";
import type { GateResult } from "../types";
import { pct } from "../format";

type Thresholds = { faithfulness: number; relevance: number; completeness: number };

const PRESETS: { name: string; note: string; t: Thresholds }[] = [
  {
    name: "RAGAS-style",
    note: "một ngưỡng chung 0.50",
    t: { faithfulness: 0.5, relevance: 0.5, completeness: 0.5 },
  },
  {
    name: "DeepEval-style",
    note: "ngưỡng riêng từng metric",
    t: { faithfulness: 0.7, relevance: 0.55, completeness: 0.65 },
  },
];

const LABELS: [keyof Thresholds, string][] = [
  ["faithfulness", "Faithfulness"],
  ["relevance", "Relevance"],
  ["completeness", "Completeness"],
];

/** Cells are narrow, so breaches show an abbreviation rather than the full name. */
const SHORT: Record<string, string> = {
  faithfulness: "faith",
  relevance: "relev",
  completeness: "compl",
};

export function GatePanel() {
  const [t, setT] = useState<Thresholds>(PRESETS[0].t);
  const [res, setRes] = useState<GateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    runGate(t)
      .then((r) => !cancelled && (setRes(r), setErr(null)))
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <section className="panel">
      <div className="sechead">
        <h2>Quality gate</h2>
        <p>
          Kéo ngưỡng và xem tập case đạt thay đổi ngay. Điểm số không đổi — chỉ luật quyết
          định đặt lên trên chúng thay đổi. Backend chấm lại bằng đúng evaluation core trong{" "}
          <code>template.py</code>.
        </p>
      </div>

      {err && <p className="notice">{err}</p>}

      <div className="gategrid">
        <div className="card">
          {LABELS.map(([key, label]) => (
            <div className="slider" key={key}>
              <div className="top">
                <span className="nm">{label}</span>
                <span className="val">{t[key].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={t[key]}
                aria-label={`Ngưỡng ${label}`}
                onChange={(e) => setT({ ...t, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className="chip"
                aria-pressed={
                  t.faithfulness === p.t.faithfulness &&
                  t.relevance === p.t.relevance &&
                  t.completeness === p.t.completeness
                }
                title={p.note}
                onClick={() => setT(p.t)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          {res && (
            <>
              <div className="readouts" style={{ marginBottom: 20 }}>
                <div className="readout">
                  <p className="k">Pass rate</p>
                  <p className="v">{pct(res.passRate)}</p>
                  <p className="n">{res.passed} / {res.total} case đạt cả ba ngưỡng</p>
                </div>
                <div className="readout">
                  <p className="k">Bị chặn</p>
                  <p className="v">{res.total - res.passed}</p>
                  <p className="n">case vi phạm ít nhất một ngưỡng</p>
                </div>
              </div>
              <div className="grid20">
                {res.cases.map((c) => (
                  <div
                    key={c.id}
                    className={`gcell ${c.passed ? "pass" : "fail"}`}
                    title={
                      c.passed
                        ? "đạt cả ba ngưỡng"
                        : `vi phạm: ${c.breaches.join(", ")}`
                    }
                  >
                    <span className="gid">{c.id}</span>
                    <span className="gbr">
                      {c.passed ? "pass" : c.breaches.map((b) => SHORT[b] ?? b).join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="thesis">
        Ở ngưỡng chung 0.50 pass rate là 55%; chuyển sang ngưỡng riêng từng metric nó tụt còn
        25%. Tập failure của gate nghiêm là <b>superset thực sự</b> của gate lỏng — không case
        nào fail ở cái này mà pass ở cái kia.
      </p>
    </section>
  );
}
