import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const SCRIPTS = path.join(process.cwd(), "skills/ce-doc-review/scripts")
const RESOLVER = path.join(SCRIPTS, "resolve-evidence-dir.sh")
const RUNNER = path.join(SCRIPTS, "peer-job-runner.py")

// Feature folders must sit outside every temp root, so they live in the checkout.
const roots: string[] = []
function mkRoot(base: string): string {
  const dir = mkdtempSync(path.join(base, ".evidence-dir-test-"))
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function docIn(folder: string): string {
  mkdirSync(folder, { recursive: true })
  const doc = path.join(folder, "plan.md")
  writeFileSync(doc, "# plan\n")
  return doc
}

function resolve(...args: string[]) {
  const r = spawnSync("bash", [RESOLVER, ...args], { encoding: "utf8" })
  return { code: r.status ?? -1, stdout: r.stdout.trim(), stderr: r.stderr }
}

describe("resolve-evidence-dir.sh", () => {
  test("Given a document in its own feature folder, When resolved, Then it creates a private evidence folder there", () => {
    // Given
    const feature = path.join(mkRoot(process.cwd()), "20261002-dinner")
    const doc = docIn(feature)
    // When
    const r = resolve(doc, "round-1")
    // Then
    expect(r.code).toBe(0)
    expect(r.stdout).toBe(path.join(realpathSync(feature), "evidence", "doc-review-round-1"))
    expect(statSync(r.stdout).mode & 0o777).toBe(0o700)
  })

  test("Given a run id already used, When resolved again, Then it refuses", () => {
    // Given
    const doc = docIn(path.join(mkRoot(process.cwd()), "feature"))
    expect(resolve(doc, "round-1").code).toBe(0)
    // When
    const r = resolve(doc, "round-1")
    // Then
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("run id 'round-1' is already used")
  })

  test("Given a document under a temp root, When resolved, Then it refuses and names --temp-ok", () => {
    // Given
    const doc = docIn(path.join(mkRoot(tmpdir()), "feature"))
    // When
    const r = resolve(doc, "round-1")
    // Then
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("is under a temp root, so the run files would be lost")
    expect(r.stderr).toContain("--temp-ok")
    expect(r.stdout).toBe("")
  })

  test("Given a document at the repo root, When resolved, Then it refuses", () => {
    // Given / When
    const r = resolve(path.join(process.cwd(), "README.md"), "round-1")
    // Then
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("is the repo root, not a feature folder")
  })

  test.each(["plans", "docs", "design-docs", "features"])(
    "Given a document directly in a shared %s folder, When resolved, Then it refuses",
    (shared) => {
      // Given
      const doc = docIn(path.join(mkRoot(process.cwd()), shared))
      // When
      const r = resolve(doc, "round-1")
      // Then
      expect(r.code).toBe(1)
      expect(r.stderr).toContain(`is a shared '${shared}' folder`)
    },
  )

  test("Given a run id with a path separator, When resolved, Then it refuses before creating anything", () => {
    // Given
    const feature = path.join(mkRoot(process.cwd()), "feature")
    const doc = docIn(feature)
    // When
    const r = resolve(doc, "../escape")
    // Then
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("may use only letters, digits")
    expect(spawnSync("test", ["-e", path.join(feature, "evidence")]).status).not.toBe(0)
  })

  test("Given --temp-ok and no feature folder, When resolved, Then it prints a private temp run folder and says it is not kept", () => {
    // Given
    const doc = docIn(path.join(mkRoot(tmpdir()), "feature"))
    const runId = `temp-ok-${process.pid}-${Date.now()}`
    // When
    const r = resolve("--temp-ok", doc, runId)
    // Then
    try {
      expect(r.code).toBe(0)
      expect(r.stdout.endsWith(path.join("ce-doc-review", runId))).toBe(true)
      expect(statSync(r.stdout).mode & 0o777).toBe(0o700)
      expect(r.stderr).toContain("run files will not be kept")
    } finally {
      if (r.stdout) rmSync(r.stdout, { recursive: true, force: true })
    }
  })
})

describe("peer-job-runner.py jobs root for ce-doc-review", () => {
  test("Given no CE_PEER_JOBS_ROOT, When a ce-doc-review job starts, Then the runner refuses instead of defaulting to temp", () => {
    // Given
    const env = { ...process.env }
    delete env.CE_PEER_JOBS_ROOT
    // When
    const r = spawnSync(
      "python3",
      [RUNNER, "start", "--skill", "ce-doc-review", "--run-id", "r1", "--label", "x", "--no-sweep", "--", "true"],
      { encoding: "utf8", env },
    )
    // Then
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain("ce-doc-review needs CE_PEER_JOBS_ROOT set to the review's evidence folder")
  })
})
