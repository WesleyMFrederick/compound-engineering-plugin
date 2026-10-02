import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const REPO_ROOT = path.join(import.meta.dir, "..")
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "interview-recorder-rule.md")

// Personal-fork rule (wesley/dev): every skill that interviews the user turns on
// the interview recorder before its first question. The canonical text lives once
// in the fixture; each consumer reference must contain it verbatim, so the copies
// cannot drift. Each consumer file is the one its skill requires before the first
// question.
const CONSUMER_FILES = [
  "skills/ce-brainstorm/references/interaction-rules.md",
  "skills/ce-strategy/references/interview.md",
  "skills/ce-product-pulse/references/interview.md",
]

const START = "<!-- ce-interview-recorder:start -->"
const END = "<!-- ce-interview-recorder:end -->"

async function canonicalBlock(): Promise<string> {
  const fixture = await readFile(FIXTURE, "utf8")
  const start = fixture.indexOf(START)
  const end = fixture.indexOf(END)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return fixture.slice(start, end + END.length)
}

describe("interview-recorder rule shared-asset parity", () => {
  test("every interviewing skill contains the canonical block verbatim, once", async () => {
    // Given the canonical block
    const block = await canonicalBlock()
    for (const file of CONSUMER_FILES) {
      // When the consumer reference is read
      const content = await readFile(path.join(REPO_ROOT, file), "utf8")
      // Then it holds the block exactly once
      expect(content, `${file} is missing the interview-recorder block`).toContain(block)
      expect(content.split(START).length, `${file} has more than one block`).toBe(2)
    }
  })
})
