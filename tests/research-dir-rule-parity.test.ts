import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "research-dir-rule.md")

// Personal-fork rule (wesley/dev): skills that dispatch researchers save their
// dossiers to `<feature folder>/research/` instead of throwaway temp. The
// canonical text lives once in the fixture; each consumer reference must contain
// it verbatim, so the copies cannot drift. Each consumer file is the one its
// skill reads before dispatching researchers.
const CONSUMER_FILES = [
  "skills/ce-plan/references/research.md",
  "skills/ce-brainstorm/references/dialogue.md",
]

const START = "<!-- ce-research-dir:start -->"
const END = "<!-- ce-research-dir:end -->"

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("research-dir rule shared-asset parity", () => {
  test("every researching skill contains the canonical block verbatim, once", async () => {
    // Given the canonical block
    const block = await canonicalBlock()
    for (const file of CONSUMER_FILES) {
      // When the consumer reference is read
      const content = await readFile(path.join(REPO_ROOT, file), "utf8")
      // Then it holds the block exactly once
      expect(content, `${file} is missing the research-dir block`).toContain(block)
      expect(content.split(START).length, `${file} has more than one block`).toBe(2)
    }
  })
})
