<!-- ce-research-dir:start -->
**Save research dossiers beside the work, not in temp.** A later reader checking the plan needs the research it rests on, so it lives with the feature and survives the session.

- **Feature folder:** the folder the user named for this work, or the folder that holds this run's input or output document when that folder holds only this work. Never use a shared folder such as `<root>/plans/` or the repo root.
- **With a feature folder:** set `RESEARCH_DIR="<absolute feature folder>/research"` and run `mkdir -p "$RESEARCH_DIR"`. Each researcher writes its fixed file name there; a rerun replaces that file.
- **Without one** (no repo, or no folder holds only this work): use this skill's private temp fallback below, still naming the path `RESEARCH_DIR`, and say in one line that this run's research will not be kept.
- **Sources:** each dossier cites `file:line` for repo facts and a URL for outside facts, and marks anything it did not read in a source as inference. Dossiers are raw research, not verified evidence.
- **Link them:** the written plan or requirements doc links each dossier it relied on by relative path, such as `research/repo-research.md`.
<!-- ce-research-dir:end -->
