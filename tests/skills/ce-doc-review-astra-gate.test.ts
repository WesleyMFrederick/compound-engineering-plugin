import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// The Astra gate decides, in code, whether gpt-6-astra joins the codex lineup.
// These tests replay fixed Jev answers (--answers) so no live call is made.
const GATE = path.join(__dirname, "../../skills/ce-doc-review/scripts/astra-gate.py")

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

type Nouls = {
  auth_security: number
  payments: number
  data_migration: number
  external_api: number
  privacy: number
  multi_surface: number
}

function answers(nouls: Nouls, depth: string, confidence = 0.9) {
  const noulAnswers = Object.fromEntries(
    Object.entries(nouls).map(([k, v]) => [k, { type: "noul", noul: v }]),
  )
  return {
    model: "jev-1",
    answers: {
      ...noulAnswers,
      depth: { type: "choice", choice: depth, probabilities: { [depth]: confidence }, confidence },
    },
    usage: { input_tokens: 15125, output_tokens: 142 },
  }
}

// Probe answers measured against three real plans (2026-10).
const DINNER = answers(
  { auth_security: 0.98, payments: 0.02, data_migration: 0.21, external_api: 0.96, privacy: 0.92, multi_surface: 0.89 },
  "deep", 1.0,
)
const MARKDOWN_CHANGES = answers(
  { auth_security: 0.22, payments: 0.02, data_migration: 0.17, external_api: 0.31, privacy: 0.16, multi_surface: 0.4 },
  "standard", 0.65,
)
const TRANSCRIPT_READER = answers(
  { auth_security: 0.24, payments: 0.02, data_migration: 0.23, external_api: 0.91, privacy: 0.2, multi_surface: 0.26 },
  "deep", 0.95,
)

function runGate(response: unknown | null, env: Record<string, string | undefined> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "astra-gate-"))
  roots.push(root)
  const plan = path.join(root, "plan.md")
  writeFileSync(plan, "# Plan\n")
  const out = path.join(root, "evidence", "astra-gate.json")
  const args = [GATE, "--plan", plan, "--out", out]
  if (response !== null) {
    const answersFile = path.join(root, "answers.json")
    writeFileSync(answersFile, JSON.stringify(response))
    args.push("--answers", answersFile)
  }
  const baseEnv = { ...process.env }
  delete baseEnv.CROSS_MODEL_ASTRA
  delete baseEnv.TYPESAFE_API_KEY
  const r = spawnSync("python3", args, { encoding: "utf8", env: { ...baseEnv, ...env } })
  return { r, record: JSON.parse(readFileSync(out, "utf8")) }
}

describe("astra gate rule", () => {
  test("Given the dinner plan's answers, When the gate runs, Then Astra joins on the high-risk domains", () => {
    // Given security 0.98 and privacy 0.92
    // When the gate applies the rule
    const { r, record } = runGate(DINNER)
    // Then Astra joins and the reason names the triggering questions
    expect(r.status).toBe(0)
    expect(record.astra).toBe(true)
    expect(record.lineup).toEqual(["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"])
    expect(record.reason).toContain("auth_security=0.98")
    expect(record.reason).toContain("privacy=0.92")
    expect(r.stdout).toContain("astra=yes")
  })

  test("Given a standard-depth plan with no strong signals, When the gate runs, Then the lineup stays Luna + Sol", () => {
    // Given markdown-changes answers (all below 0.7, depth standard)
    // When the gate applies the rule
    const { record } = runGate(MARKDOWN_CHANGES)
    // Then Astra stays out
    expect(record.astra).toBe(false)
    expect(record.lineup).toEqual(["gpt-6-luna", "gpt-6-sol"])
  })

  test("Given a deep plan with only one strong question, When the gate runs, Then Astra stays out", () => {
    // Given transcript-reader: depth deep but only external_api at or above 0.7
    // When the gate applies the rule
    const { record } = runGate(TRANSCRIPT_READER)
    // Then one strong question is not enough to add Astra
    expect(record.astra).toBe(false)
    expect(record.reason).toContain("depth=deep")
  })

  test("Given a deep plan with two non-high-risk strong questions, When the gate runs, Then Astra joins via the depth branch", () => {
    // Given depth deep, external_api and multi_surface at or above 0.7, no high-risk domain
    const response = answers(
      { auth_security: 0.1, payments: 0.1, data_migration: 0.1, external_api: 0.7, privacy: 0.1, multi_surface: 0.75 },
      "deep",
    )
    // When the gate applies the rule
    const { record } = runGate(response)
    // Then the depth branch adds Astra
    expect(record.astra).toBe(true)
    expect(record.reason).toContain("depth=deep with 2 questions")
  })

  test("Given a high-risk score exactly at the threshold, When the gate runs, Then Astra joins", () => {
    // Given payments at exactly 0.7 and nothing else
    const response = answers(
      { auth_security: 0.0, payments: 0.7, data_migration: 0.0, external_api: 0.0, privacy: 0.0, multi_surface: 0.0 },
      "lightweight",
    )
    // When the gate applies the rule
    const { record } = runGate(response)
    // Then the threshold is inclusive
    expect(record.astra).toBe(true)
  })

  test("Given two strong questions but standard depth, When the gate runs, Then Astra stays out", () => {
    // Given external_api and multi_surface strong, depth standard
    const response = answers(
      { auth_security: 0.1, payments: 0.1, data_migration: 0.9, external_api: 0.9, privacy: 0.1, multi_surface: 0.9 },
      "standard",
    )
    // When the gate applies the rule
    const { record } = runGate(response)
    // Then the depth branch needs depth=deep
    expect(record.astra).toBe(false)
  })
})

describe("astra gate record and fallbacks", () => {
  test("Given Jev answers with usage, When the gate writes its record, Then raw answers, usage and input-token cost are kept", () => {
    // Given the dinner response with 15,125 input tokens
    // When the gate writes astra-gate.json
    const { record } = runGate(DINNER)
    // Then the record carries the evidence and prices only input tokens
    expect(record.answers.auth_security).toEqual({ type: "noul", noul: 0.98 })
    expect(record.usage).toEqual({ input_tokens: 15125, output_tokens: 142 })
    expect(record.cost_usd).toBeCloseTo(0.00063525, 8)
    expect(record.override_used).toBe(false)
  })

  test("Given CROSS_MODEL_ASTRA=off, When the gate would add Astra, Then the override wins and is recorded", () => {
    // Given dinner answers that trigger Astra, and the override off
    // When the gate runs
    const { record } = runGate(DINNER, { CROSS_MODEL_ASTRA: "off" })
    // Then Astra is out, the gate's own answer is still recorded
    expect(record.astra).toBe(false)
    expect(record.gate_decision).toBe(true)
    expect(record.override_used).toBe(true)
    expect(record.reason).toContain("CROSS_MODEL_ASTRA=off overrides the gate")
  })

  test("Given CROSS_MODEL_ASTRA=on, When the gate would leave Astra out, Then Astra joins", () => {
    // Given markdown-changes answers and the override on
    // When the gate runs
    const { record } = runGate(MARKDOWN_CHANGES, { CROSS_MODEL_ASTRA: "on" })
    // Then the override adds Astra
    expect(record.astra).toBe(true)
    expect(record.gate_decision).toBe(false)
  })

  test("Given no TYPESAFE_API_KEY, When the gate runs live, Then it records why and continues with Luna + Sol", () => {
    // Given no saved answers and no API key
    // When the gate runs
    const { r, record } = runGate(null)
    // Then the record names the missing key, the run still succeeds, and Astra is out
    expect(r.status).toBe(0)
    expect(record.status).toBe("unavailable")
    expect(record.error).toBe("TYPESAFE_API_KEY is not set")
    expect(record.astra).toBe(false)
    expect(record.reason).toContain("gate unavailable")
  })

  test("Given no API key but CROSS_MODEL_ASTRA=on, When the gate runs, Then the override still adds Astra", () => {
    // Given the gate cannot run and the override is on
    // When the gate runs
    const { record } = runGate(null, { CROSS_MODEL_ASTRA: "on" })
    // Then the override decides and the unavailability is still recorded
    expect(record.astra).toBe(true)
    expect(record.error).toBe("TYPESAFE_API_KEY is not set")
  })

  test("Given an answer missing a question, When the gate validates it, Then the gate is unavailable rather than guessing", () => {
    // Given a response without the depth answer
    const broken = structuredClone(DINNER) as { answers: Record<string, unknown> }
    delete broken.answers.depth
    // When the gate runs
    const { record } = runGate(broken)
    // Then nothing is decided from partial answers
    expect(record.status).toBe("unavailable")
    expect(record.error).toContain("depth")
    expect(record.astra).toBe(false)
  })
})
