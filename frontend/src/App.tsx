import { useEffect, useState } from "react";
import "./App.css";
import { getDataset } from "./api";
import type { Dataset } from "./types";
import { f3, pct } from "./format";
import { Meter } from "./components/Meter";
import { Ledger } from "./components/Ledger";
import { GatePanel } from "./components/GatePanel";
import { RerankPanel } from "./components/RerankPanel";
import { Playground } from "./components/Playground";

const TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "ledger", label: "Sổ điểm 20 case" },
  { key: "gate", label: "Quality gate" },
  { key: "rerank", label: "Reranking" },
  { key: "playground", label: "Chấm thử" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const isTab = (v: string): v is TabKey => TABS.some((t) => t.key === v);

/** Tab lives in the URL hash so a demo can be deep-linked and survives reload. */
const tabFromHash = (): TabKey => {
  const h = window.location.hash.replace(/^#/, "");
  return isTab(h) ? h : "overview";
};

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(tabFromHash);

  useEffect(() => {
    getDataset().then(setData).catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const selectTab = (key: TabKey) => {
    setTab(key);
    window.location.hash = key;
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <p className="eyebrow">AICB-P1 · Phase 1 · Ngày 14</p>
        <h1>Hiệu chuẩn một thước đo đánh giá RAG</h1>
        <p className="standfirst">
          20 câu hỏi tự viết từ corpus Northstar University Student Services, chấm bằng năm
          metrics lấy cảm hứng từ RAGAS. Mọi con số trên trang này do backend tính trực tiếp
          bằng evaluation core trong <code>template.py</code> — không có số liệu nào chép cứng.
        </p>
        <p className="runmeta">
          <span>model <b>gpt-4o-mini</b></span>
          <span>retriever <b>BM25 top-5</b></span>
          <span>temperature <b>0</b></span>
          <span>corpus <b>52 chunks / 10 docs</b></span>
          <span>tests <b>42 passed</b></span>
        </p>
      </header>

      {err && (
        <p className="notice" style={{ marginTop: 24 }}>
          Không gọi được API: {err}
          <br />
          Chạy backend trước: <code>uvicorn api.server:app --port 8000</code>
        </p>
      )}

      {!data && !err && <p className="muted" style={{ marginTop: 24 }}>Đang tải…</p>}

      {data && (
        <>
          <nav className="tabs" role="tablist" style={{ marginTop: 24 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className="tab"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "overview" && <Overview data={data} />}

          {tab === "ledger" && (
            <section className="panel">
              <div className="sechead">
                <h2>Sổ điểm 20 case</h2>
                <p>Nhấn vào một dòng để xem câu hỏi đầy đủ, đáp án chuẩn, câu trả lời thật và các chunk đã retrieve.</p>
              </div>
              <Ledger cases={data.cases} />
            </section>
          )}

          {tab === "gate" && <GatePanel />}
          {tab === "rerank" && <RerankPanel />}
          {tab === "playground" && <Playground cases={data.cases} />}
        </>
      )}

      <footer className="foot">
        <span>Northstar University Student Services · corpus hư cấu dùng cho lab</span>
        <span>template.py · 42 tests</span>
        <span>golden_dataset.json · validator PASS · coverage 10/10</span>
      </footer>
    </div>
  );
}

function Overview({ data }: { data: Dataset }) {
  const s = data.summary;
  const lowCompleteness = data.cases.filter((c) => c.completeness < 0.6).length;
  const perfectRecall = data.cases.filter((c) => c.contextRecall === 1).length;
  const retrievalAvg =
    ((s.avg_context_recall ?? 0) + (s.avg_context_precision ?? 0)) / 2;

  return (
    <section className="panel">
      <div className="readouts">
        <div className="readout">
          <p className="k">Pass rate</p>
          <p className="v">{pct(s.pass_rate)}</p>
          <p className="n">{s.passed} / {s.total} case đạt cả ba answer metrics</p>
        </div>
        <div className="readout">
          <p className="k">Metric yếu nhất</p>
          <p className="v">{f3(s.avg_completeness)}</p>
          <p className="n">Completeness — {lowCompleteness}/{s.total} case dưới 0.6</p>
        </div>
        <div className="readout">
          <p className="k">Retrieval trung bình</p>
          <p className="v">{f3(retrievalAvg)}</p>
          <p className="n">
            Recall {f3(s.avg_context_recall)} · Precision {f3(s.avg_context_precision)}
          </p>
        </div>
        <div className="readout">
          <p className="k">Failure thật</p>
          <p className="v">{s.total - s.passed - 2}</p>
          <p className="n">sau khi trừ A02 và E04 là lỗi thước đo</p>
        </div>
      </div>

      <div className="sechead" style={{ marginTop: 40 }}>
        <h2>Khoảng cách 0.30</h2>
      </div>
      <p className="thesis" style={{ margin: "0 0 26px" }}>
        Hai metric đo retriever đứng ở vùng Good. Ba metric đo câu trả lời tụt gần một phần ba
        điểm phía dưới. Đó là bằng chứng đầu tiên cho kết luận: nút thắt nằm ở generation,
        không phải retrieval.
      </p>

      <div className="split">
        <div className="card mgroup">
          <h3>Retrieval-side</h3>
          <p className="sub">Chẩn đoán retriever. Cố ý không đưa vào điểm tổng.</p>
          <Meter
            label="Context Recall"
            value={s.avg_context_recall ?? 0}
            note={`${perfectRecall}/${s.total} case đạt 1.000`}
          />
          <Meter
            label="Context Precision"
            value={s.avg_context_precision ?? 0}
            note="rank-aware Average Precision@K"
          />
        </div>
        <div className="card mgroup">
          <h3>Answer-side</h3>
          <p className="sub">Quyết định pass/fail và <code>overall_score()</code>.</p>
          <Meter label="Faithfulness" value={s.avg_faithfulness} note="token answer có mặt trong context" />
          <Meter label="Relevance" value={s.avg_relevance} note="token question được answer nhắc lại" />
          <Meter label="Completeness" value={s.avg_completeness} note="token expected được answer phủ" />
        </div>
      </div>

      <div className="sechead" style={{ marginTop: 44 }}>
        <h2>Điều đáng nhớ</h2>
      </div>
      <div className="takeaways">
        <div className="tk">
          <h4>Thước đo hỏng không báo lỗi</h4>
          <p>
            Nó báo một con số trông rất thuyết phục. A02 đạt 0.000 và bị dán nhãn hallucination
            trong khi hành vi hoàn toàn đúng — mở tab <b>Chấm thử</b> để tự tái tạo.
          </p>
        </div>
        <div className="tk">
          <h4>Độ khó với người ≠ độ khó với retriever</h4>
          <p>
            H01 — bẫy effective date thiết kế công phu nhất — đạt Context Precision 1.000 và trả
            lời đúng. A01 — câu hỏi ngây thơ nhất — đạt recall 0.176.{" "}
            <b>Hai thang độ khó gần như không liên quan.</b>
          </p>
        </div>
        <div className="tk">
          <h4>Một fix, ba case</h4>
          <p>
            A01 và A03 cùng một root cause: <code>00_system_scope.md</code> phải cạnh tranh BM25
            thay vì luôn có mặt. <b>Ghim nó vào prompt là fix rẻ nhất và chạm cả ba case adversarial.</b>
          </p>
        </div>
        <div className="tk">
          <h4>Taxonomy có nhánh “còn lại” quá rộng</h4>
          <p>
            <code>off_topic</code> nuốt {data.failureAnalysis.counts["off_topic"] ?? 0}/
            {s.total - s.passed} failures mà không case nào lạc đề thật — đó là nhánh fallback khi
            không metric nào dưới 0.3.
          </p>
        </div>
      </div>
    </section>
  );
}
