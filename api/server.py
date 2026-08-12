"""FastAPI service backing the demo frontend.

Every endpoint runs the real evaluation core from ``template.py``. Nothing is
recomputed with a second implementation, so what the browser shows is exactly
what ``pytest`` and ``evaluate_answers.py`` produce.

No OpenAI key is needed: the saved answers in ``artifacts/actual_answers.json``
are replayed through the core rather than regenerated.

    uvicorn api.server:app --reload --port 8000
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DAY = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(DAY))

from evaluate_answers import load_evaluation_inputs  # noqa: E402
from template import (  # noqa: E402
    BenchmarkRunner,
    FailureAnalyzer,
    RAGASEvaluator,
    rerank_by_overlap,
)

GOLDEN = DAY / "golden_dataset.json"
ACTUAL = DAY / "artifacts" / "actual_answers.json"

app = FastAPI(title="Northstar Evaluation API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Shared loading
# ---------------------------------------------------------------------------

def _load() -> tuple[list, dict[str, str], dict[str, dict[str, Any]]]:
    """QA pairs (with retrieved contexts), recorded answers, raw actual records."""
    if not ACTUAL.exists():
        raise HTTPException(
            status_code=503,
            detail="artifacts/actual_answers.json is missing — run domain_assistant.py first",
        )
    try:
        qa_pairs, answers_by_question = load_evaluation_inputs(GOLDEN, ACTUAL)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    raw = {a["id"]: a for a in json.loads(ACTUAL.read_text(encoding="utf-8"))["answers"]}
    return qa_pairs, answers_by_question, raw


def _run() -> tuple[list, list]:
    """Execute the benchmark over the recorded answers. Returns (pairs, results)."""
    qa_pairs, answers_by_question, _ = _load()
    evaluator = RAGASEvaluator()
    results = BenchmarkRunner().run(
        qa_pairs, lambda q: answers_by_question[q], evaluator
    )
    return qa_pairs, results


# ---------------------------------------------------------------------------
# GET /api/dataset — everything the overview and ledger screens need
# ---------------------------------------------------------------------------

@app.get("/api/dataset")
def dataset() -> dict[str, Any]:
    qa_pairs, answers_by_question, raw = _load()
    evaluator = RAGASEvaluator()
    runner = BenchmarkRunner()
    results = runner.run(qa_pairs, lambda q: answers_by_question[q], evaluator)
    report = runner.generate_report(results)

    golden = {p["id"]: p for p in json.loads(GOLDEN.read_text(encoding="utf-8"))["qa_pairs"]}
    cases = []
    for r in results:
        case_id = r.qa_pair.metadata.get("id", "")
        g = golden[case_id]
        cases.append({
            "id": case_id,
            "difficulty": r.qa_pair.metadata.get("difficulty", ""),
            "attack": g.get("attack_type"),
            "question": r.qa_pair.question,
            "expected": r.qa_pair.expected_answer,
            "actual": r.actual_answer,
            "contextRecall": r.context_recall,
            "contextPrecision": r.context_precision,
            "faithfulness": r.faithfulness,
            "relevance": r.relevance,
            "completeness": r.completeness,
            "overall": r.overall_score(),
            "passed": r.passed,
            "failureType": r.failure_type,
            "chunks": [c["chunk_id"] for c in raw[case_id]["retrieved_contexts"]],
            "goldDocs": sorted({c["source_doc"] for c in g["contexts"]}),
        })

    failures = runner.identify_failures(results)
    analyzer = FailureAnalyzer()
    suggestions = analyzer.generate_improvement_suggestions(failures)

    return {
        "summary": report,
        "cases": cases,
        "failureAnalysis": {
            "counts": analyzer.categorize_failures(failures),
            "suggestions": suggestions,
            "improvementLog": analyzer.generate_improvement_log(failures, suggestions),
            "rootCauses": {
                f.qa_pair.metadata.get("id", ""): analyzer.find_root_cause(f)
                for f in failures
            },
        },
    }


# ---------------------------------------------------------------------------
# POST /api/gate — re-apply per-metric thresholds without re-running the agent
# ---------------------------------------------------------------------------

class GateRequest(BaseModel):
    faithfulness: float = Field(0.5, ge=0.0, le=1.0)
    relevance: float = Field(0.5, ge=0.0, le=1.0)
    completeness: float = Field(0.5, ge=0.0, le=1.0)


@app.post("/api/gate")
def gate(req: GateRequest) -> dict[str, Any]:
    _, results = _run()
    rows = []
    for r in results:
        breaches = [
            name for name, score, limit in (
                ("faithfulness", r.faithfulness, req.faithfulness),
                ("relevance", r.relevance, req.relevance),
                ("completeness", r.completeness, req.completeness),
            ) if score < limit
        ]
        rows.append({
            "id": r.qa_pair.metadata.get("id", ""),
            "passed": not breaches,
            "breaches": breaches,
        })
    passed = sum(1 for row in rows if row["passed"])
    return {
        "total": len(rows),
        "passed": passed,
        "passRate": passed / len(rows) if rows else 0.0,
        "cases": rows,
    }


# ---------------------------------------------------------------------------
# POST /api/rerank — Exercise 3.5, run live against either ranking signal
# ---------------------------------------------------------------------------

class RerankRequest(BaseModel):
    strategy: Literal["question", "expected"] = "question"


@app.post("/api/rerank")
def rerank(req: RerankRequest) -> dict[str, Any]:
    qa_pairs, _, _ = _load()
    evaluator = RAGASEvaluator()

    rows = []
    for pair in qa_pairs:
        chunks = pair.retrieved_contexts
        expected = pair.expected_answer
        query = pair.question if req.strategy == "question" else expected

        before_p = evaluator.evaluate_context_precision(chunks, expected)
        before_r = evaluator.evaluate_context_recall(chunks, expected)
        reordered = rerank_by_overlap(chunks, query)
        after_p = evaluator.evaluate_context_precision(reordered, expected)
        after_r = evaluator.evaluate_context_recall(reordered, expected)

        rows.append({
            "id": pair.metadata.get("id", ""),
            "recallBefore": before_r,
            "recallAfter": after_r,
            "precisionBefore": before_p,
            "precisionAfter": after_p,
            "delta": after_p - before_p,
            # proves reranking permutes rather than changes the retrieved set
            "sameSet": sorted(chunks) == sorted(reordered),
        })

    n = len(rows) or 1
    return {
        "strategy": req.strategy,
        "cases": rows,
        "avgRecallBefore": sum(r["recallBefore"] for r in rows) / n,
        "avgRecallAfter": sum(r["recallAfter"] for r in rows) / n,
        "avgPrecisionBefore": sum(r["precisionBefore"] for r in rows) / n,
        "avgPrecisionAfter": sum(r["precisionAfter"] for r in rows) / n,
        "changed": [r["id"] for r in rows if abs(r["delta"]) > 1e-9],
        "recallChanged": [
            r["id"] for r in rows if abs(r["recallAfter"] - r["recallBefore"]) > 1e-9
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/score — score any answer against the same five metrics
# ---------------------------------------------------------------------------

class ScoreRequest(BaseModel):
    question: str = ""
    answer: str = ""
    context: str = ""
    expected: str = ""
    contexts: list[str] | None = None


@app.post("/api/score")
def score(req: ScoreRequest) -> dict[str, Any]:
    result = RAGASEvaluator().run_full_eval(
        answer=req.answer,
        question=req.question,
        context=req.context,
        expected=req.expected,
        contexts=req.contexts,
    )
    return {
        "faithfulness": result.faithfulness,
        "relevance": result.relevance,
        "completeness": result.completeness,
        "contextRecall": result.context_recall,
        "contextPrecision": result.context_precision,
        "overall": result.overall_score(),
        "passed": result.passed,
        "failureType": result.failure_type,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "artifactsPresent": ACTUAL.exists()}


# Serve the built frontend last so /api/* keeps priority.
DIST = DAY / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="frontend")
