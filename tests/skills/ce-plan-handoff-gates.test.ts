import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLAN = path.join(process.cwd(), "skills/ce-plan")
const read = (file: string) => readFileSync(path.join(PLAN, file), "utf8")
const section = (text: string, start: string, end: string) => {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from + start.length)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return text.slice(from, to)
}

describe("ce-plan cannot reach review or the menu without a confidence record", () => {
  const finalReview = read("references/final-review.md")
  const handoff = read("references/plan-handoff.md")

  test("Given a new 5.3 pass, When it starts, Then it mints one run id that both records must name", () => {
    // Given / When
    const entry = section(finalReview, "#### 5.3 Confidence Check and Deepening", "##### 5.3.1")
    // Then
    expect(entry).toContain('PLAN_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"')
    expect(entry).toContain("a record left by another run cannot pass the handoff gates")
  })

  test("Given the 5.3.2 decision, When either branch is taken, Then a run-bound record is written before the branch", () => {
    // Given
    const gate = section(finalReview, "##### 5.3.2", "##### 5.3.3")
    // When
    const record = gate.indexOf("evidence/plan-confidence.md")
    const passBranch = gate.indexOf("Confidence check passed")
    // Then
    expect(record).toBeGreaterThanOrEqual(0)
    expect(record).toBeLessThan(passBranch)
    expect(gate).toContain("Its first two lines are `run: <PLAN_RUN_ID>` and `plan-sha256: <checksum>`")
    expect(gate).toContain(`openssl dgst -sha256 -r "<plan path>" | cut -d' ' -f1`)
    expect(gate).toContain("each section scored with its score")
    expect(gate).toContain("deepen the named sections, or no deepening and why")
  })

  test("Given deepening rewrites the plan, When synthesis ends, Then the record's checksum moves to the plan review receives", () => {
    const deepening = read("references/deepening-workflow.md")
    const synth = deepening.slice(deepening.indexOf("## 5.3.7"))
    expect(synth).toContain("set `plan-sha256:` in `evidence/plan-confidence.md` to the checksum of the plan as synthesized")
  })

  test("Given document review is next, When the record is missing, Then the run stops before invoking ce-doc-review", () => {
    // Given
    const review = section(handoff, "## 5.3.8 Document Review", "## 5.3.9")
    // When
    const gate = review.indexOf("**Gate: the confidence check ran for this plan.**")
    const invoke = review.indexOf("Invoke the `ce-doc-review` skill")
    // Then
    expect(gate).toBeGreaterThanOrEqual(0)
    expect(gate).toBeLessThan(invoke)
    expect(review).toContain("its `run:` line equals this run's `PLAN_RUN_ID`")
    expect(review).toContain("its `plan-sha256:` line equals the plan file's current checksum")
    expect(review).toContain("A run with no `PLAN_RUN_ID` never started the confidence check")
    expect(review).toContain("`status: blocked` with `phase: 5.3.2`")
  })

  test("Given a stale or foreign confidence record, When the gate rejects it, Then it names why", () => {
    const review = section(handoff, "## 5.3.8 Document Review", "## 5.3.9")
    expect(review).toContain("it belongs to another run (name both run ids)")
    expect(review).toContain("the plan changed after the check (name both checksums)")
  })

  test("Given review settles or cannot start, When the review record is written, Then it names this run and the plan as reviewed", () => {
    const review = section(handoff, "## 5.3.8 Document Review", "## 5.3.9")
    expect(review).toContain("record a stand-in structured review result (the shape `ce-doc-review` would normally return) in the review record below")
    expect(review).toContain("Save `evidence/plan-review-record.md` beside `plan-confidence.md`")
    expect(review).toContain("the checksum of the plan file as reviewed, after review fixes")
    expect(review.indexOf("**Write the review record")).toBeLessThan(review.indexOf("**Pipeline mode:**"))
  })

  test("Given the handoff menu, When a record is missing, foreign, or stale, Then the gate stops before the summary, menu, or authorized action and says why", () => {
    // Given
    const menu = section(handoff, "## 5.4 Post-Generation Options", "**Summary line above the menu")
    // When
    const gate = menu.indexOf("**Gate: both records belong to this run and this plan.**")
    const authorized = menu.indexOf("**Already-authorized next action:**")
    // Then
    expect(gate).toBeGreaterThanOrEqual(0)
    expect(gate).toBeLessThan(authorized)
    expect(menu).toContain("`evidence/plan-review-record.md` must exist, name this run, carry the current checksum")
    expect(menu).toContain("which step was skipped (the confidence check or document review)")
    expect(menu).toContain("which record belongs to another run (name both run ids)")
    expect(menu).toContain("the plan changed after review (name both checksums)")
  })

  test("Given the interactive no-findings path skips review, When it reaches 5.4, Then the record carries the exemption the gate accepts", () => {
    const deepening = read("references/deepening-workflow.md")
    const menu = section(handoff, "## 5.4 Post-Generation Options", "**Summary line above the menu")
    const exemption = "No findings accepted — plan unchanged"
    expect(deepening).toContain(`"${exemption}." and add that line to \`evidence/plan-confidence.md\``)
    expect(menu).toContain(`records "${exemption}"`)
    expect(menu).toContain("then `plan-confidence.md` must carry the current checksum instead")
  })
})

describe("ce-plan research failures stop the run when they happen", () => {
  const research = read("references/research.md")
  const deepening = read("references/deepening-workflow.md")

  test("Given any phase 1 researcher, When it fails or returns nothing, Then the user chooses retry, skip, or abort before the run moves on", () => {
    // Given / When
    const rule = research.indexOf("**A researcher that fails or returns nothing stops the run at that moment.**")
    const firstDispatch = research.indexOf("Run these agents in parallel:")
    // Then
    expect(rule).toBeGreaterThanOrEqual(0)
    expect(rule).toBeLessThan(firstDispatch)
    expect(research).toContain("retry it, skip it and carry the gap, or abort the plan")
    expect(research).toContain("do not save the failure for the final report")
  })

  test("Given web research is unavailable, When the researcher reports it, Then it follows the stop rule instead of warn-and-proceed", () => {
    expect(research).toContain("that report is a failed researcher, handled by the stop-and-ask rule above")
    expect(research).not.toContain("warn and proceed")
  })

  test("Given a deepening agent fails, When its artifact is missing or empty, Then the same stop rule applies", () => {
    const run = section(deepening, "## 5.3.6 Run Targeted Research", "## 5.3.6b")
    expect(run).toContain("is a failed researcher: stop at that moment")
    expect(run).not.toContain("re-run that prompt-seeded subagent or fall back")
  })

  test("Given a research subagent finishes, When usage is recorded, Then unknown carries a reason and nothing is estimated", () => {
    expect(research).toContain("`$RESEARCH_DIR/usage.md`")
    expect(research).toContain("write `unknown` and the reason")
    expect(research).toContain("Never estimate.")
    const run = section(deepening, "## 5.3.6 Run Targeted Research", "## 5.3.6b")
    expect(run).toContain("Record each agent's tokens and cost in `evidence/plan-confidence.md`")
  })
})
