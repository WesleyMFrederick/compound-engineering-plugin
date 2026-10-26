# Cross-Model Judgment Pass

Runs ce-doc-review's **conditional judgment lenses** through one separately routed model target in read-only, least-privilege processes. Each peer gets the **same** persona brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into synthesis as reviewer `<reviewer-name>-<provider>`, or `<reviewer-name>-<provider>-<model>` when the host pinned the model (the codex lineup in Step 2 always does: `adversarial-codex-luna`, `adversarial-codex-sol`, `adversarial-codex-astra`). It counts as independent corroboration and can promote agreement only when its result file records `independence_verified: true`; otherwise it remains attributed review evidence without a promotion bonus.

The trio is the three **conditional** judgment lenses whose output diverges most across model families: `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer`. The convergent lenses (`coherence`, `scope-guardian`) and the always-on `feasibility` lens do **not** run cross-model. Feasibility is excluded specifically so the pass stays conditional and does not spawn on every review.

The host resolves and approves one concrete route before any document content leaves the machine (this reference calls that egress). The bundled **`scripts/cross-model-doc-review.sh`** enforces that fixed route, composes the prompt, applies least privilege, captures schema-shaped JSON, and normalizes the model-identity records it returns. The pass is non-blocking: a failed route writes no fold-in artifact and never switches recipients internally.

## Condition — run only when this holds

Run the cross-model pass for a given trio lens **only when that lens was activated** for this document by the normal Phase 1 persona-selection logic. No new activation triggers are introduced: a routine plan with validated upstream provenance and no high-stakes domain activates none of the trio, so it gets no cross-model pass. Phase 1's missing-document check already guarantees the document is readable on disk. There is no diff and no remote-scope concern, so no additional scope check is needed.

## Step 1 — Attest host identity, then approve one fixed route

Keep four identities separate: requested **target**, CLI **harness/intermediary**, serving **family/provider**, and served model. `cursor` means `cursor-agent` with its configured default/Auto model and therefore has no `--model` flag. `composer` means an explicit Composer-family model through `cursor-agent`. `grok` prefers the native Grok CLI; Grok through Cursor is a different route and recipient even though the requested target remains Grok. `antigravity` means a Gemini model through Google's Antigravity ACP runtime; a request for a Gemini peer binds target `antigravity`.

Attest both the host harness and its serving family:

```bash
XHOST_SEEN=;
if [ "${CLAUDECODE:-}" = "1" ]; then XHOST_SEEN="$XHOST_SEEN claude"; fi;
if [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then XHOST_SEEN="$XHOST_SEEN codex"; fi;
if [ "${GROK_AGENT:-}" = "1" ] || [ -n "${GROK_SESSION_ID:-}" ]; then XHOST_SEEN="$XHOST_SEEN grok"; fi;
if [ -n "${OMPCODE:-}" ]; then XHOST_HARNESS=omp; XHOST_FAMILY=unknown;
elif [ "$XHOST_SEEN" = " claude" ] || [ "$XHOST_SEEN" = " codex" ] || [ "$XHOST_SEEN" = " grok" ]; then XHOST_HARNESS="${XHOST_SEEN# }"; XHOST_FAMILY="$XHOST_HARNESS";
elif [ -n "$XHOST_SEEN" ]; then XHOST_HARNESS=unknown; XHOST_FAMILY=unknown;
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST_HARNESS=cursor; XHOST_FAMILY=unknown;
elif [ -n "${OPENCODE_TERMINAL:-}" ]; then XHOST_HARNESS=opencode; XHOST_FAMILY=unknown;
else XHOST_HARNESS=unknown; XHOST_FAMILY=unknown; fi
```

Pass `XHOST_HARNESS` as `CROSS_MODEL_HOST_HARNESS`; pass `XHOST_FAMILY` as the first worker argument. The snippet is evidence, not the verdict: it resolves the harnesses whose environment markers it already names, and where it yields `unknown` on a harness you can identify from your own runtime, attest what you know instead. A harness the snippet does not name needs no new branch here. Both tokens come from the peer-key vocabulary the worker accepts, never a provider's corporate name: family `codex`, `claude`, `grok`, `composer`, `gemini`, or `unknown`; harness `codex`, `claude`, `grok`, `cursor`, `opencode`, `antigravity`, `omp`, or `unknown`. A name such as `anthropic`, `openai`, or `xai` in either slot makes the worker stop with no artifact.

Claude Code, Codex, and Grok each serve their own model family, so the snippet takes the family from that harness's marker when it is the only such marker present. Another harness can copy one of those markers (oh-my-pi sets `CLAUDECODE=1` whatever model serves it), and a session started from inside another harness inherits that harness's marker. So the snippet leaves family `unknown` under `OMPCODE` or when more than one of those markers is present. Pass a family the snippet names. Where it leaves family `unknown`, set it only from a model id the runtime publishes as the model serving this session, and only when that id maps to `codex`, `claude`, `grok`, `composer`, or `gemini`. A requested model, the model's own claim, and the product name are not that id. Never infer serving family from the Cursor brand. An unknown host family cannot satisfy automatic same-family exclusion, so skip the automatic cross-model pass.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Checkout egress policy — evaluate this first.** Read `cross_model_review_mode:` from the same two repo CE config files under the ordinary-key rule. Valid values are `auto` (default) and `off`; anything else is invalid and continues to the next layer, then `auto`. When it resolves to `off`, skip the automatic cross-model pass here, before peer resolution, disclosure, or any job start, unless the user explicitly asked for a cross-model peer for this run in conversation (a `cross_model_peer` value or a project-instruction preference is not that opt-in). Record the skip reason as **disabled by checkout config**, distinct from an un-attestable host or an unavailable or non-independent route; each trio lens keeps its in-process twin exactly as it does for any peer that never started, and the whole-document sweep does not run. A live user prohibition still overrides `auto`.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` from the two repo CE config files (`config.local.yaml` then `config.yaml`). Apply the ordinary-key rule: first active supported target wins; an invalid value continues to the next layer, then step 3.
3. A preference already in your **project instructions** (the active instructions in your context), taken from context and **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → antigravity`. Cursor default and Composer run only when one of steps 1-3 names them.

Before any content is sent, resolve each selected target to one concrete installed route, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. `CROSS_MODEL_PEERS` is an optional egress restriction, not a required approval: when it is set, every recipient (target and intermediary) must be sanctioned by it under the alias rule below, and an unsanctioned recipient is a named skip; when it is unset or empty, no recipient is filtered and the pass proceeds. In that case this skill invocation plus the pre-egress disclosure is the sanction (in non-interactive mode the invoking skill's request is that sanction and the stderr audit log is the disclosure). Do not inspect the worker source to rediscover this; it implements exactly this contract. `CROSS_MODEL_FIXED_ROUTE` accepts exactly these tokens; the worker stops on anything else (including route-shaped guesses like `codex-cli`):

| Target | Route token(s) | Carried by |
|--------|----------------|------------|
| `codex` | `codex` | omp when `omp` is on PATH, else the codex CLI through acpx |
| `claude` | `claude` | omp when `omp` is on PATH, else the claude CLI through acpx |
| `grok` | `grok-cli` (native CLI) or `grok-cursor` (via Cursor intermediary) | the named CLI through acpx |
| `cursor` | `cursor` | cursor-agent through acpx |
| `composer` | `composer` | cursor-agent through acpx |
| `opencode` | `opencode` | opencode through acpx |
| `antigravity` | `antigravity` | Google's Antigravity ACP runtime through acpx |

The worker picks the carrier, not the host: the route token stays `codex` or `claude` either way. omp sends the document to the same provider through the user's own omp login, tool-less and without a saved session, so it adds no recipient. It needs neither a vendor CLI nor acpx's Node/npx prerequisites. Its run reports tokens and cost, which the worker records in the artifact's `usage` field; the native ACP routes leave `usage` null. Only omp's server-reported `upstreamModel` is accepted as its served-model receipt; a missing receipt stays `unverified`, never the requested model. Announce the selected carrier with the route; the worker's `peer run:` log confirms `via=omp (...)` or `via=native ... CLI` with the acpx version.

The host harness does not choose the Grok route. Target `grok` binds `grok-cli` when that CLI is installed. Bind `grok-cursor` only when the user asked for Grok through Cursor, or when the grok CLI is absent and Cursor is a sanctioned recipient.

A failed dispatched route returns no artifact; it never changes provider or intermediary internally. Retrying the same resolved route retains its existing sanction and disclosure; changing the route or any recipient requires a new resolution, sanction, and disclosure before dispatch. The worker may repeat that same route once for a provider-capacity failure (HTTP 529), keeping the recipient, model, scope, and shared peer deadline fixed. ACP requires the prompt's error kind `overloaded`; today only the Claude adapter reports that form. omp accepts a structured provider status 529 or an explicit HTTP/API 529 overload or capacity error, never a 529 quoted in review content. Account or session quota failures do not qualify.

For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting a Cursor-default voice itself requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor. The Antigravity route is sanctioned only by the literal `antigravity`; `gemini` in `CROSS_MODEL_PEERS` admits nothing.

**Checkout-configured model and effort.** After the target is resolved, read `cross_model_model:` and `cross_model_effort:` from the same two repo CE config files under the ordinary-key rule. When `cross_model_model` is set, pass `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<resolved-target>` and `CROSS_MODEL_MODEL_OVERRIDE=<value>`; when `cross_model_effort` is set, pass `CROSS_MODEL_EFFORT_OVERRIDE=<value>`. Both ride the `env` prefix of the start invocation below. The worker validates each against the route it actually runs. A model must be the resolved target's own family (an alias such as `fable` or a full id such as `claude-opus-5-5` for `claude`; `gpt-*` for `codex`, optionally namespace-qualified such as `openai.gpt-6.1-sol` when that CLI routes through a non-default `model_provider`; `gemini-*` for `antigravity`); an effort must be a level the route's adapter offers, which for `antigravity` is its thinking level, `low`, `medium`, or `high`; and cursor-agent and OpenCode routes accept no effort override. An incompatible value stops the pass with a named skip reason rather than substituting. Unset keys leave the script's editorial mapping unchanged. Announce the configured model and effort in the Step 3 line exactly as requested. A model or effort the user states in conversation outranks the config keys.

Preferred model mappings run first. Only after the preferred ID is observed unavailable, obsolete, or incompatible may the host inspect current CLI capabilities and choose the closest compatible **same-target/same-family** replacement. Bind it with both `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, apply one target's override to another route, silently change an explicit model, or add a recipient.

Target `antigravity` never takes a host-chosen replacement. Its worker requests Gemini 4 Argon and, when the account does not offer Argon, falls back once to Gemini Flash before any prompt is sent; the run log names the model used. A configured `antigravity` model runs exactly or the pass skips.

## Step 2 — Provider model + reasoning tier (defined in the script)

All activated lenses run on **one model per provider at high reasoning, except Codex and native Grok on extra-high**. The cursor-agent Grok route uses Cursor's high/fast preset, because Cursor offers one preset per model; composer's fast tier is its ceiling, an accepted exception. The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-doc-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER`/`M_ANTIGRAVITY` constants and the `adapter_argv` builder). A checkout may pin the resolved target's model and effort through `cross_model_model` / `cross_model_effort` (Step 1); the script validates and never substitutes. This reference deliberately does **not** restate the IDs; one source of truth prevents the reference and script from drifting. The IDs are the current choice under the tier rule (a single maintenance point), not the contract.

The codex target is the one exception to one model per provider: by default it runs a model lineup, chosen per review by the Astra gate below.

The **persona file** basename and the **reviewer name** are distinct: the script reads the brief from `references/personas/<persona-file>.md` but forces the fold-in `reviewer` field to the peer label — `<reviewer-name>-<provider>`, plus `-<model>` when `CROSS_MODEL_MODEL_OVERRIDE` pins this target's model — so agreement matches the in-process persona's short name and two models on one target never overwrite each other. The script derives the persona file from the allowlisted reviewer name. It is **not** a caller argument, so no caller value reaches the brief-read path.

### Codex model lineup and the Astra gate

When the resolved target is `codex` and neither the user nor `cross_model_model` named a model, every activated lens **and** the whole-doc sweep run once per lineup model, all at extra-high reasoning: `gpt-6-luna` and `gpt-6-sol`, plus `gpt-6-astra` when the Astra gate says so. A model the user or the checkout named runs alone, with no lineup and no gate. Other targets run one model.

The gate runs once per review, after the Step 3 announce and before the first `start`. It sends the **full document** to TypeSafe System One (`api.typesafe.ai`, model `jev-latest`, `TYPESAFE_API_KEY`), so name TypeSafe as a recipient in the announce; when `CROSS_MODEL_PEERS` is set and does not list `typesafe`, run it with `CROSS_MODEL_ASTRA=off` so no call is made. The script asks the questions in `references/astra-gate-questions.json` and decides in code: Astra joins when `auth_security`, `payments`, or `privacy` is at least 0.7, or when `depth` is `deep` and at least two of the six risk questions are at least 0.7. `CROSS_MODEL_ASTRA=on|off` beats the gate. A missing key, failed call, or malformed answer is recorded and the lineup stays Luna + Sol.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
RUN_DIR="<absolute EVIDENCE_DIR printed by scripts/resolve-evidence-dir.sh, per references/dispatch.md>";
"$PY" "$SKILL_DIR/scripts/astra-gate.py" --plan "<full document path>" --out "$RUN_DIR/astra-gate.json" && jq -r '.lineup[]' "$RUN_DIR/astra-gate.json"
```

`astra-gate.json` keeps the raw answers, token usage, cost, the gate's decision, the override, and the final `lineup`. Report its stdout line (`astra-gate: astra=<yes|no> reason=...`) in the review output, including any error it names. Launch each lineup model as its own job (Step 4).

## Step 3 — Announce

Pre-dispatch eligibility is based on installed route presence and sanction, not credential state. Do not run authentication probes before the provider-capable launch; authentication is authoritative only after provider-capable dispatch.

- **Interactive host, default interactive mode:** show a **prominent standalone line** that frames it as an **independent cross-model review** of the judgment lenses (say "cross-model" / "independent model", not the internal "peer" jargon). The line names the concrete **model and reasoning level** from the in-script mapping (e.g. GPT-6-luna at extra-high reasoning, Opus at high, Grok 4.7 at extra-high, Composer 2.5-fast). Because two different models can arrive over the *same* `cursor-agent` CLI, it names **the route as well as the model** for cursor-agent routes so Grok-4.7-via-cursor-agent, Composer-via-cursor-agent, and Grok-4.7-via-the-grok-CLI are unambiguous. **It states that full document content is sent to that provider** (third-party egress; for cursor-agent routes the content goes to Cursor *plus* the serving provider). **One disclosure condition governs the announce and every later mention of the peer:** name it by target and requested model, as a request ("requested <model>"), never as a claim that this model served. Add a serving caveat only when a served-model record disagrees with the request, or when the route requested no model (Cursor default/Auto says "serving model unverified"). A receipt-less route with a requested model gets no caveat: `model_actual: unverified` means no record, not an unknown model. Place it with the Phase 2 team announce, not buried after it. Wording is yours; the checkable requirements are: prominent, reads as a **cross-model reviewer** (not a generic persona), names the requested model as requested, names the route when it is cursor-agent, names the egress. Example: `🔀 Cross-model pass — the judgment lenses are also being reviewed by an independent model: requested **Grok 4.7 (high reasoning), via cursor-agent**. Full document content is sent to xAI/Cursor.`
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the served-model record exists.
  - Announce the one fixed route and every recipient before dispatch. A route failure produces no artifact; apply Step 1's retry/disclosure condition before another attempt. Reconcile `cross_model_target`, `cross_model_harness`, `cross_model_route`, `model_requested`, and `model_actual` from the artifact; never infer a serving model from the requested ID. The disclosure condition above decides how the peer is named in the report.
- **Interactive host, no peer resolved** (host un-attestable, no different-provider route installed, or disabled by checkout config): one quiet line that the cross-model pass was skipped and why; name the checkout policy when that is the reason. Never an error.
- **Non-interactive mode:** do not announce the pass. The script still emits a one-line stderr audit log per send that document content was sent cross-model to the named provider, so the third-party data egress is auditable even though the pass does not announce to the user. Non-interactive applies the same conditions as interactive: an installed, sanctioned, attested-different route runs under the Step 1 contract, unset allowlist included. When a trio lens was activated, the structured result still records whether a peer artifact was folded, in the form `references/synthesis-and-presentation.md` defines.

## Step 4 — Run the bundled script (one call per activated trio lens, in parallel with the persona reviewers)

Each call is a CLI shell-out, not a subagent. Resolve one target and one fixed route once per document review, then launch every activated lens against that same sanctioned target/route. Launch each call as a detached job through `scripts/peer-job-runner.py` in the same dispatch wave as the in-process reviewers. A failed route does not fall through inside the worker.

**Two modes — slice the trio, sweep the whole doc (R20, KTD6):**

- **Trio peers, sliced.** On **unified artifacts**, pass each activated trio lens the *same reviewer-specific slice its in-process twin got* as `<document-path>` (write that slice to `$EVIDENCE_DIR/slice-<reviewer-name>.md` — e.g. product-lens/adversarial get the Product Contract), not the full document, so the peer is a true corroborating twin rather than an off-lens reviewer. On legacy docs the peer gets the same full document the twin does.
- **One whole-doc sweep.** In the **same wave**, also launch **one** call with reviewer-name **`whole-doc`**, the **full** document (never sliced), and the same resolved provider — a broad different-model read of the entire doc. It runs **once per document and lineup model** (not per lens), writes `whole-doc-<provider>.json` (`whole-doc-codex-<model>.json` for a lineup model), and folds in as an independent reviewer that corroborates against *any* in-process finding 3.3 merged it with (it has no in-process twin). Same gate, isolation, and non-blocking rules as the trio calls. A model following this contract MUST issue this `whole-doc` invocation whenever the pass runs, or the broad coverage the sweep exists to provide is silently skipped.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host; shell state does not persist between Bash calls, so set it inline in every runner call):

**Interpreter.** The commands below run a bundled Python script. Resolve the
interpreter in the *same* shell call as the command -- each tool call is a fresh
shell, so a `$PY` set in an earlier call does not persist. Do not hardcode
`python3`: on native Windows it resolves to a Microsoft Store stub that exits
without running Python, and that stub still satisfies `command -v`, so probe
execution rather than presence.

```bash
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
```

**Host command-sandbox boundary.** The detached worker inherits the permission context of the `start` call that launches it. Before executing that exact call, treat `CODEX_SANDBOX_NETWORK_DISABLED` as a positive signal that the current Codex command sandbox cannot reach the provider; unsetting it does not change the sandbox policy. A DNS or authentication failure alone is not proof of that condition. Use the narrowest host permission that restores the fixed route's provider connection. When Codex exposes only full command escalation, attach this request to the exact `peer-job-runner.py start ...` tool call after the existing egress disclosure:

```json
{
  "sandbox_permissions": "require_escalated",
  "justification": "Allow the disclosed read-only cross-model review to send the reviewed document to the fixed external provider."
}
```

Disclose that this is not launcher-only isolation: the detached worker inherits that launch context for its lifetime, so the adapter's declared read-only/tool restrictions — not the Codex command sandbox — bound the peer while the reviewed material egresses. If the grant is denied or unavailable, do not execute `start`; create no peer job and retain the in-process reviewers as coverage. After `start` returns a job id, any network, authentication, or provider failure is a started-job outcome and follows the ordinary terminal/recovery rules; keep `status`, `wait`, `result`, and `reap` sandboxed because they need no provider connection.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
RUN_DIR="<absolute EVIDENCE_DIR printed by scripts/resolve-evidence-dir.sh, per references/dispatch.md>"; [ -d "$RUN_DIR" ] && [ ! -L "$RUN_DIR" ] && [ -O "$RUN_DIR" ] || { echo "evidence dir missing or not owned: $RUN_DIR" >&2; exit 1; };
echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
CE_PEER_JOBS_ROOT="$RUN_DIR" CE_PEER_HARD_SECS= CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-doc-review --run-id "<run-id>" --label "<reviewer-name>" --no-sweep -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-doc-review.sh" "<host-serving-family>" "<target>" "<reviewer-name>" "<document-path>" "<document-type>" "<origin>" "$RUN_DIR"
```

`CE_PEER_JOBS_ROOT="$RUN_DIR"` puts each job folder at `$RUN_DIR/ce-doc-review/<run-id>/jobs/<job-id>/`, inside the evidence folder. Every later `wait`, `status`, `result`, and `reap` call must carry the same `CE_PEER_JOBS_ROOT="<run-dir>"` prefix, or a bare job id will not resolve. The runner refuses to start a ce-doc-review job without `CE_PEER_JOBS_ROOT`, and the peer script refuses a run dir under temp. Only when the resolver ran with `--temp-ok` add `CE_DOC_REVIEW_TEMP_EVIDENCE=1` to the worker's `env`; each peer artifact then records `"evidence_kept": false`.

When Step 1 resolved a configured model or effort, add `CROSS_MODEL_MODEL_OVERRIDE_TARGET="<target>" CROSS_MODEL_MODEL_OVERRIDE="<model>"` and/or `CROSS_MODEL_EFFORT_OVERRIDE="<effort>"` to the `env` prefix after `CROSS_MODEL_FIXED_ROUTE`; omit them when unset.

For the codex lineup (Step 2), issue one `start` per lens per lineup model, with `CROSS_MODEL_MODEL_OVERRIDE_TARGET="codex" CROSS_MODEL_MODEL_OVERRIDE="<lineup-model>"` in the `env` prefix and `--label "<reviewer-name>-<model-short>"` (`luna`, `sol`, `astra`), so each job and fold-in file is distinct.

Every call also carries the review round and the decisions the in-process twin sees, in the `env` prefix: `CROSS_MODEL_REVIEW_ROUND="<n>"` (default 1); on round 2+, `CROSS_MODEL_PRIOR_DECISIONS_FILE="$RUN_DIR/peer-prior-decisions.md"` holding the `{decision_primer}` block rendered per `references/decision-primer.md` (the script skips a round 2+ call without it); and, when `{settled_ktds}` is not `none`, `CROSS_MODEL_SETTLED_DECISIONS_FILE="$RUN_DIR/peer-settled-decisions.md"` holding that slot's text. Write both files once before the first `start`.

The nested windows are one budget with one knob, `CROSS_MODEL_HARD_SECS`. The runner derives its supervisor hard window from that ambient knob automatically (`max(1230, knob + 30)`). Clear `CE_PEER_HARD_SECS` on the start prefix (`CE_PEER_HARD_SECS=`) so a stale ambient value from an earlier session or harness export cannot undercut that derivation. An explicit numeric `CE_PEER_HARD_SECS` still wins when a skill deliberately sets one (ce-work / elevation), which this path must not do. Print the orchestrator deadline as `knob + 10` in the same shell as `start` (as above) and use that printed `peer-deadline-secs=<n>` below (all legs share the one value; re-use the first leg's number rather than re-deriving per leg); never hardcode it, because a literal survives a knob change and then reaps a healthy peer.

**Do not forward `CROSS_MODEL_HARD_SECS` to the worker.** The runner already passes the ambient environment through, so a knob the user actually set reaches the worker on its own. Re-exporting the orchestrator's *resolved* value would turn a fallback into an explicit override and strip the worker of its own default.

Omit `--result-path`; `done` means only that the worker exited. The fixed target determines the expected `<reviewer-name>-<target>.json` filename (`<reviewer-name>-<target>-<model-short>.json` for a pinned model).

- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, `gemini`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, `opencode`, `antigravity`, `omp`, or `unknown`.
- `<target>` is exactly one of `codex`, `claude`, `grok`, `cursor`, `composer`, `opencode`, or `antigravity`; `<fixed-route>` is its already-sanctioned concrete route token from the Step 1 table (`codex`, `claude`, `grok-cli`, `grok-cursor`, `cursor`, `composer`, `opencode`, or `antigravity`).
- `<reviewer-name>` = the activated lens (`security-lens`, `adversarial`, or `product-lens`), or `whole-doc`. The script derives the persona-brief filename and (per provider) model from this allowlisted value — the brief path is never caller-controlled.
- `<document-path>` = the document under review.
- `<document-type>` = the Phase 1 classification (`requirements` / `plan` / `unified-requirements` / `unified-plan`).
- `<origin>` = the same `{origin_path}` slot the in-process personas receive.
- `<run-dir>` = the absolute `$RUN_DIR` resolved above. The script writes `<reviewer-name>-<provider>[-<model-short>].json` there per resolved peer **only after** forcing `reviewer` to that label and downgrading peer `safe_auto` → `gated_auto`. It also keeps the exact prompt it sent as `prompt-<label>.md`; omp routes send the persona brief, output contract, and schema as the system prompt, kept as `prompt-<label>.system.md`, and the review context and document on stdin.

Every runner call is bounded: no tool call ever spans a worker's runtime, on any host. Between dispatch waves, poll outstanding jobs (it returns early when the watched jobs settle):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
CE_PEER_JOBS_ROOT="<run-dir>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-ids...>
```

Capture the epoch time right after the final `start` (`date +%s`). That timestamp is how you know when the deadline passes, since nothing else tracks wall clock across tool calls. Before synthesis or any return, bring every started job to a terminal outcome. While its result is still needed, loop bounded `wait` calls until the job is terminal **or the shared peer deadline (`peer-deadline-secs`) has elapsed since the final `start`**. Compare `date +%s` against that timestamp before each wait; do not begin a wait that would extend past the deadline. Reap unfinished jobs whose results are no longer needed or whose deadline is exhausted, then run one final bounded `wait --max-secs 10` pass (reap is asynchronous; the terminal record lands a grace period after it returns). Collect and classify each started job under Step 5. The detached script still self-bounds (idle-timeout default 480s on every route; hard backstop `CROSS_MODEL_HARD_SECS` default 1200s) and exits cleanly; the runner's supervisor windows sit outside those caps as the backstop. The script needs no prompt or schema passed in — it reads the persona brief, `findings-schema.json`, and the document itself from disk.

Any started job whose terminal state is not `done` (`failed` / `timeout` / `died-without-result`), or that is `done` but leaves no fold-in artifact, is reported twice. First, as soon as you classify it under Step 5, tell the user in one line, naming the lens, the reason read from its `out.log`, and that the in-process reviewers continue without it (e.g. "Cross-model security-lens peer failed: codex returned HTTP 400, model not supported; continuing with in-process reviewers only."). In non-interactive mode, list it under the result's `Failed reviewers` section instead. Second, name it in the Coverage line with its lens and terminal state (e.g. "cross-model security-lens peer: timeout"). A job reaped at the deadline records `timeout`, with the reap noted in its reason.

A preflight failure never yields a job id. A genuine condition-not-met skip is the `never-started` case, but a dispatch-infrastructure crash before any job starts is not a clean skip and triggers the hand-recovery rule in Step 5. A never-started pass does not get a started-job terminal-state line and does not fail the review. In non-interactive mode, the structured result records every owed lens that did not fold, whether its job started or not, in the form `references/synthesis-and-presentation.md` defines. A missing fold-in file is still "the pass didn't run for that lens," never a review failure, except when a dispatch-infrastructure crash voided the whole pass at once, which Step 5 handles as named whole-pass loss (the whole-doc broad read especially), not per-lens "not run."

The peer gets the same `Settled decisions:` slot and `<prior-decisions>` block as its in-process twin, from the env files above, so on round 2+ it honors the user's earlier decisions instead of re-raising them. Synthesis's own R29/R30 suppression still drops anything re-raised.

## Step 5 — Collect outcomes and clean up

Every started job must be collected and classified before return. Fold usable findings into synthesis only when the review proceeds to synthesis; an incomplete review reports peer outcomes without applying findings. When `<run-dir>` is a feature folder's evidence directory, keep the job dirs: they are the record of what each peer was sent and returned. Only when `<run-dir>` is the temp fallback, delete the consumed job dirs under `<run-dir>/ce-doc-review/<run-id>/jobs` after collection and classification, using the environment's preferred deletion command. If collection or cleanup cannot complete, preserve the remaining evidence and report the unresolved jobs and blocker; never claim they were cleaned up.

- Read each fold-in artifact through the runner's verified read (resolve `$PY` in the same tool call — shells do not persist):

  ```bash
  SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
  PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
  CE_PEER_JOBS_ROOT="<run-dir>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" result "<job-id>" --path <run-dir>/<reviewer-name>-<target>.json
  ```

  For a pinned model, the path is `<run-dir>/<reviewer-name>-<target>-<model-short>.json`.

  The read checks file ownership and is bounded. Exit 0 emits the artifact; treat it as one reviewer return. Exit 2 means the job is still running, so the deadline loop above was left early; return to it rather than classifying. Exit 3 is the only outcome that means the peer produced nothing; it names that lens's job state, which selects the matching branch below. Any other exit means the runner could not complete the read: a trust failure on the artifact or on the job's own state, or a job id that did not resolve. None of those has a branch below: name the failure in Coverage as a degraded cross-model pass, and never fold it into the silent skip.
- **No file, clean skip** (script skipped before starting real work: host un-attestable, no different-provider route installed, CLI missing, or lens not activated) → the pass simply didn't run for that lens. Note "cross-model pass: not run" in Coverage on an interactive host in default mode, or "cross-model pass: disabled by checkout config" when Step 1's egress policy was the reason. In non-interactive mode, do not announce the skip; the structured result records it as `references/synthesis-and-presentation.md` defines. A lens that was not activated is not an eligible pass. Never fail the review. Ignore any `*.raw.json` leftovers; they are not fold-in artifacts.
- **Dispatch-infrastructure failure vs. clean skip.** The clean skip above is a script that *chose* not to start real work. A dispatch-infrastructure crash is different: the runner or worker itself failed, through a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. Because every leg shares one runner, route, and `$SKILL_DIR`, such a crash typically drops the **whole** cross-model pass at once, not one lens. Do not fold it into the clean skip on the first error. Re-run the **same resolved route** by hand, re-issuing the affected `start` calls with the target/model, the route's least-privilege empty-workspace isolation, and the embedded-document read scope all held fixed. Do this while the review can still proceed to synthesis, each failure is a new and plausibly recoverable one, and the shared peer deadline holds. This recovery applies only to dispatch infrastructure, never to a provider no-review outcome. Stop and drop the cross-model pass once a failure repeats or the deadline is spent. Each trio lens is still covered by its in-process twin; what an infra crash silently voids is the **whole-doc broad read** (the sweep leg has no twin) plus cross-model corroboration. Name that loss in the Coverage line rather than letting it disappear as "not run." A hand recovery may not substitute a different target or provider, widen the read scope beyond the embedded document, or relax the route's isolation.
- **Transport unavailable before egress.** A worker line `transport unavailable (pre-egress, <scope>): <reason>` means the peer did not run and no document content reached the provider; report that lens as not run with the reason. For ACP routes, scope `shared` (Node, `npx`, or the npm fetch of acpx) fails every ACP route the same way. Scope `route` (that route's CLI is missing, an acpx config file replaces its launch command, or the adapter rejected the model, with the available models listed) affects only that route. omp needs neither Node nor acpx; any replacement follows Step 1's new resolution, sanction, and disclosure rule.
- **Started but no fold-in** (the job's final state is `failed` / `timeout` / `died-without-result`, or it is `done` but the peer's output was unusable) → still non-blocking, but never silent: give the user the immediate one-line notice and the Coverage naming per Step 4.
- **Classify the skip reason before telling the user.** When a peer produced no usable output or ended non-`done`, read its `out.log`, including bounded lines prefixed `peer skip evidence:`. Name observed quota, authentication, or capability failure specifically. Attribute an account authentication failure only after provider-capable dispatch is positively established by the launch context or provider response; then report the observed failure and login or credential-refresh remediation. Without that proof, authentication-shaped peer text describes only the peer's execution context: a sandboxed host can produce the same signal as a genuine logout, so never report it as the user's account being logged out or prompt a login command. The cross-model pass is additive and the in-process reviewers still covered their lenses; obtaining it requires a context where the peer CLI can reach the network. The worker exclusively owns the one same-route retry under Step 1's exact-overload condition. Once a provider no-review outcome reaches the host, the host never restarts that peer. After the same quota or usage-limit evidence appears more than once in this session, do not retry that route automatically; never silently continue to another recipient.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- A finding that 3.3 merged with its in-process twin (`<reviewer-name>`) promotes by one anchor step only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch. Whether the two describe one problem is 3.3's one-fix test, not a string match on section or title.

## Trust boundary (maintainers)

The script embeds the **full document content** into the peer prompt and sends it to an external model provider (OpenAI, Anthropic, xAI, Google, or Cursor, depending on the resolved peer). This is a wider egress than a diff-only review. `CROSS_MODEL_PEERS` restricts which providers may receive content.

omp carries codex and claude tool-less, sessionless, and without user extensions, skills, rules, or MCP servers. It needs the user's omp provider login, not Node or acpx. Every native route runs through acpx (an Agent Client Protocol client), which needs Node 22.13 or newer with `npx`, plus the route's own agent CLI. The first run fetches a pinned acpx version from npm; later runs reuse the npm cache. The peer runs from an empty per-peer workspace with no project context and no MCP servers, and native Claude starts in safe mode so project settings and hooks do not apply. acpx denies every permission request the peer makes, and each adapter runs in its read-only mode where it has one. That removes a tool only where the agent asks permission before using it, so the native routes differ in what the peer can still do.

For native ACP routes, asked to read a file outside the empty workspace and to write one inside it, the routes split into two tiers. The Antigravity read has not been tested yet:

| Route | Reads outside the empty workspace | Tools still usable without permission |
|---|---|---|
| `claude` | Denied | Reads inside the empty workspace |
| `grok-cli` | Refused | Reads inside the empty workspace; web fetch and web search, which its ACP server cannot disable |
| `opencode` | Denied | Reads inside the empty workspace (web, edits, and subagents are denied in its config) |
| `codex` | **Allowed** | Reads anywhere and shell commands, including writes: its adapter does not enforce read-only mode |
| `grok-cursor`, `cursor`, `composer` | **Allowed** | Reads and searches anywhere |
| `antigravity` | Not yet tested | Write, edit, and shell requests are denied. It loads skills and settings only from its private per-run home and the empty workspace, never from the user's own Antigravity or Gemini setup |

**Accepted read residual (native ACP codex + cursor-agent routes):** neither adapter can be made tool-less over ACP, so their isolation is weaker than omp and the native claude, grok-cli, and opencode routes. This is an **accepted** risk for ce-doc-review's own-document threat model. The reviewed documents are the maintainer's own planning docs (low injection surface), and the host agent already runs in-repo with strictly more privilege than any peer, so a peer that can read a file the host could already read (and send it to a provider the document already goes to) adds no materially new exposure. The routes are kept rather than refused; the script's stderr audit log records each send so the egress is auditable even in non-interactive mode.
