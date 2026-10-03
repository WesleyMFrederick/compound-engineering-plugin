---
title: "Choose a skill's save path by who reads the output next: research beside the feature, scratch in temp"
date: 2026-10-02
category: skill-design
module: "skills (ce-plan, ce-brainstorm; save-path audit across skills)"
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A skill writes subagent dossiers, research, or grounding files and you are deciding where they go"
  - "A user loses research a plan relied on because it lived in /tmp"
  - "Moving another skill's output out of the scratch root into the repo"
  - "Editing the research-directory rule in ce-plan or ce-brainstorm"
tags: [scratch, save-path, research-dossier, feature-folder, shared-assets, parity, personal-fork]
---

# Choose a skill's save path by who reads the output next: research beside the feature, scratch in temp

## Context

Before this change, ce-plan's Phase 1 researchers and ce-brainstorm's grounding scout wrote their dossiers to `/tmp/compound-engineering-<uid>/ce-plan-research/<hex>/` and `.../ce-brainstorm/<run-id>/`. The plan cited those dossiers, but the files vanished after the session. Anyone later checking why the plan made a choice (a reviewer, a later ce-plan deepening run, the user) had nothing to read. The problem showed up on a real feature: the `agent-dinner-scheduling` dossiers (`research-brief.md`, `repo-research.md`, `agent-native.md`, `best-practices.md`, `framework-docs.md`, `spec-flow.md`, `negotiation-protocols.md`, `hosting-and-key-trust.md`) had to be copied by hand from `/tmp` into the feature folder's `research/` before the plan's links meant anything.

The existing scratch-root guidance (`docs/solutions/developer-experience/always-on-agents-md.md`, "Scratch-root layout") says to default to OS temp and keep durable outputs in tracked locations. It does not say which skill outputs count as durable. Research dossiers looked like intermediate subagent output, so they fell into temp by default.

This change lives on the personal fork branch `wesley/dev` only; it is not proposed upstream.

## Guidance

Classify each file a skill writes by **who reads it next**, then pick the path from that:

| Next reader | Example | Path |
|---|---|---|
| Only this run (orchestrator reads it back, then it is dead) | ce-compound `related.json`, ce-plan deepening artifacts, visual probes, elevation handoff bundles | Private temp: the scratch-root preamble or `mktemp -d "${TMPDIR:-/tmp}/<prefix>-XXXXXX"` |
| A person or later run checking the shipped artifact | ce-plan Phase 1 dossiers, ce-brainstorm `grounding.md` | `<feature folder>/research/<fixed-name>.md` |
| A person checking why a reviewed doc changed | ce-doc-review prompts, slices, raw reviewer findings, peer job folders, the final report | `<feature folder>/evidence/doc-review-<run-id>/` plus `evidence/doc-review-<run-id>.md` |

`research/` holds what a plan rests on; `evidence/` holds what a review of that plan rests on. ce-doc-review's rule lives once, in `skills/ce-doc-review/references/dispatch.md` "Where run files go", so it has no parity fixture; add one only when a second skill copies the block. Its cross-model peer jobs land inside the evidence folder through `CE_PEER_JOBS_ROOT="$RUN_DIR"` and `start --no-sweep`, which leaves the byte-identical `peer-job-runner.py` untouched. A run-id folder under a feature's `evidence/` is never swept by a later run.

For the second row, ce-plan and ce-brainstorm now share one rule block, marked `<!-- ce-research-dir:start -->` / `<!-- ce-research-dir:end -->`:

- **Feature folder**: the folder the user named, or the folder holding this run's input or output doc **only when that folder holds only this work**. Never a shared folder like `<root>/plans/` or the repo root. Without this exclusion, a flat `docs/plans/` layout would collect every plan's `research/repo-research.md` in one folder, and each run would overwrite the last.
- **With a feature folder**: `RESEARCH_DIR="<absolute feature folder>/research"`, `mkdir -p`, fixed file names, and a rerun replaces the file. Fixed names keep the plan's relative links (`research/repo-research.md`) valid across reruns.
- **Without one**: fall back to the old private temp path, still named `RESEARCH_DIR`, and say in one line that the research will not be kept. Keeping one variable name means every downstream `$RESEARCH_DIR/<file>` reference works on both paths.
- **Sources**: `file:line` for repo facts, a URL for outside facts, and inference marked as inference. Dossiers are raw research, not verified evidence. In this workflow, verified evidence cards are a separate later step and do not belong in `research/`.

Where the rule lives (current tree):
- Canonical text: `tests/fixtures/research-dir-rule.md`.
- Consumers: `skills/ce-plan/references/research.md:38` and `skills/ce-brainstorm/references/dialogue.md:25`. Each places the private temp fallback directly after the block (`research.md:48`, `dialogue.md:35`).
- Parity check: `tests/research-dir-rule-parity.test.ts` asserts that each consumer contains the fixture block verbatim, exactly once. This copies the pattern of `tests/interview-recorder-rule-parity.test.ts`.

## Why This Matters

A plan that cites research nobody can open is no easier to audit than a plan with no research. The temp default was right for the scratch-root's original purpose (subagents return a path instead of long inline text). It was wrong for files whose value is that someone reads them after the session ends.

The rename touches more files than the two consumers, and each of these fails quietly or late if missed:
- `skills/ce-plan/references/reasoning-elevation.md` and `skills/ce-brainstorm/references/reasoning-elevation.md` both describe where ce-plan's researchers write ("the research directory", line 40). `tests/reasoning-elevation-parity.test.ts` requires the two files to be byte-identical, so edit both in the same way or neither.
- `tests/skills/ce-plan-behavior-trace.test.ts` pinned the old `SCRATCH_DIR="$SCRATCH_ROOT/ce-plan-research/` string and the `$SCRATCH_DIR/<file>` list. It now pins `RESEARCH_DIR` for both the feature-folder path and the fallback.
- ce-brainstorm hands the grounding path to ce-plan (`skills/ce-brainstorm/references/handoff.md`), and its no-subagent degradation (`skills/ce-brainstorm/references/model-tiers.md`) also names the path. Both used to say "scratch".
- The fallback still runs the scratch-root preamble, so `tests/scratch-root-preamble-executes.test.ts` must keep passing (it did after this change).

## When to Apply

- When you change any skill's output path, run the next-reader test before moving anything. "It's an intermediate file" is not enough to justify temp; "nothing reads it after this run" is.
- Deliberately left in temp in this pass: ce-ideate (`skills/ce-ideate/references/grounding.md:20`), ce-pov (`skills/ce-pov/references/grounding.md:26`), ce-explain (`skills/ce-explain/SKILL.md:52`). These still resolve their grounding or run directories under the private scratch root. Each needs its own next-reader check before it moves. ce-ideate already keeps its directory after the run as a cache. ce-explain already separates archived artifacts from scratch-only runs. Move one only when it starts producing a doc that someone checks later, and then add the file to `CONSUMER_FILES` in the parity test instead of writing a second rule.
- ce-plan deepening (`skills/ce-plan/references/deepening-workflow.md:175`, `mktemp ... ce-plan-deepen`) stays in temp. Its orchestrator reads the artifacts back in the same run. It does not clean them up (`deepening-workflow.md:221`) and leaves rejected-agent artifacts for debugging until the OS removes them. A debug leftover with no planned reader still belongs in temp.

## Examples

Before (`skills/ce-plan/references/research.md`):

```bash
SCRATCH_DIR="$SCRATCH_ROOT/ce-plan-research/$(openssl rand -hex 4)"
# researcher writes $SCRATCH_DIR/repo-research.md — gone after the session
```

After, with a feature folder (this example lives in the separate cc-workflows-plugin repo) `design-docs/features/20261002T090600-agent-dinner-scheduling/`:

```
agent-dinner-scheduling-plan.md      -> links research/repo-research.md
research/
  repo-research.md  best-practices.md  framework-docs.md  spec-flow.md ...
```

After, with no feature folder: same `RESEARCH_DIR` variable, pointing at `$SCRATCH_ROOT/ce-plan-research/<hex>`, plus a one-line notice that the research will not be kept.

## Related

- `docs/solutions/developer-experience/always-on-agents-md.md`: the scratch-root layout this narrows. Temp is still the default; research dossiers are now named as a durable output.
- `docs/solutions/skill-design/multi-surface-output-needs-a-shared-rendering-floor.md`: the shared rule block plus parity test pattern.
- `docs/solutions/workflow/reviewing-byte-duplicated-shared-assets.md`: review shared blocks against the canonical copy.
- `docs/solutions/skill-design/pass-paths-not-content-to-subagents.md`: why dossiers are files with paths at all.
