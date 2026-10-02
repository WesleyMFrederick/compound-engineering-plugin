<!-- ce-interview-recorder:start -->
**Turn on the interview recorder before the first question.** It saves the user's decisions to the feature folder, so they survive the session.

- **Skip** when the `interview-system` command is not on `PATH` or the host cannot return its session file. Say so in one line and continue.
- **Feature folder:** the folder the user named for this work, or the folder that will hold this run's output when that folder holds only this work. Never use a shared folder such as `<root>/plans/` or the repo root. With no feature folder, skip and say so in one line.
- **Enable:** get the session file (in OMP, `xd://session_info` returns `sessionFile`), then run `interview-system enable --session-file <session-file> --feature <feature-folder>`. It reads the session from its first line, so decisions made before this skill started are also captured into `<feature-folder>/interviews/interview-<session8>.md`.
- **Once per session.** If this session is already linked to the same folder, do nothing. If `enable` reports a link to a different folder, keep that link and say so in one line.
<!-- ce-interview-recorder:end -->
