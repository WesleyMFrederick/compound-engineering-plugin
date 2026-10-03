#!/usr/bin/env bash
# Resolve and create this review's private evidence folder: the one place that
# decides where ce-doc-review run files go. The agent calls it; it does not judge.
#
#   resolve-evidence-dir.sh [--temp-ok] <document-path> <run-id>
#     stdout: the absolute evidence folder, created mode 700.
#     The feature folder is the document's parent directory. It is refused when
#     it is under a temp root, is the repo root, or is a shared folder (plans,
#     docs, design-docs, features). With --temp-ok a refused feature folder falls
#     back to this skill's private temp run folder, and stderr says the run files
#     will not be kept. A reused run id is always refused.
#
#   resolve-evidence-dir.sh --is-temp <dir>
#     exit 0 when <dir> is under a temp root, 1 otherwise. The peer worker uses
#     this so the temp-root list lives only here.
set -u

SHARED_FOLDER_NAMES="plans docs design-docs features"

say() { printf 'resolve-evidence-dir: %s\n' "$*" >&2; }
refuse() { say "refused: $*"; exit 1; }
usage() { say "usage: resolve-evidence-dir.sh [--temp-ok] <document-path> <run-id> | --is-temp <dir>"; exit 2; }

physical() {   # <dir> -> physical absolute path, or nothing when it does not exist
  (cd "$1" 2>/dev/null && pwd -P)
}

is_temp() {   # <physical-dir>; true when under a temp root
  local dir="$1" root real
  for root in /tmp /private/tmp "${TMPDIR:-}" /var/folders /private/var/folders; do
    [ -n "$root" ] || continue
    root="${root%/}"
    for real in "$root" "$(physical "$root")"; do
      [ -n "$real" ] || continue
      case "$dir" in "$real"|"$real"/*) return 0 ;; esac
    done
  done
  return 1
}

if [ "${1:-}" = "--is-temp" ]; then
  [ $# -eq 2 ] || usage
  dir="$(physical "$2")" || exit 1
  [ -n "$dir" ] || exit 1
  is_temp "$dir"
  exit $?
fi

TEMP_OK=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --temp-ok) TEMP_OK=true ;;
    -*) usage ;;
    *) ARGS+=("$arg") ;;
  esac
done
[ "${#ARGS[@]}" -eq 2 ] || usage
DOC_PATH="${ARGS[0]}"
RUN_ID="${ARGS[1]}"

case "$RUN_ID" in
  ''|*[!A-Za-z0-9._-]*) refuse "run id '$RUN_ID' may use only letters, digits, '.', '_' and '-'" ;;
esac
[ -n "${RUN_ID//./}" ] || refuse "run id '$RUN_ID' must not be all dots"
[ -f "$DOC_PATH" ] || refuse "document '$DOC_PATH' is not a readable file"

FEATURE="$(physical "$(dirname "$DOC_PATH")")"
[ -n "$FEATURE" ] || refuse "cannot resolve the folder of '$DOC_PATH'"

# Why the document's folder cannot hold this review's run files, or nothing.
reason=""
if is_temp "$FEATURE"; then
  reason="'$FEATURE' is under a temp root, so the run files would be lost"
else
  repo_root="$(git -C "$FEATURE" rev-parse --show-toplevel 2>/dev/null)" && repo_root="$(physical "$repo_root")"
  if [ -n "${repo_root:-}" ] && [ "$FEATURE" = "$repo_root" ]; then
    reason="'$FEATURE' is the repo root, not a feature folder"
  else
    for name in $SHARED_FOLDER_NAMES; do
      [ "$(basename "$FEATURE")" = "$name" ] && reason="'$FEATURE' is a shared '$name' folder, not a feature folder"
    done
  fi
fi

if [ -z "$reason" ]; then
  EVIDENCE_DIR="$FEATURE/evidence/doc-review-$RUN_ID"
  [ ! -e "$EVIDENCE_DIR" ] || refuse "run id '$RUN_ID' is already used: '$EVIDENCE_DIR' exists; pick a new run id"
  (umask 077; mkdir -p "$FEATURE/evidence") || refuse "cannot create '$FEATURE/evidence'"
  # mkdir without -p: a concurrent run with the same id fails here instead of sharing the folder.
  (umask 077; mkdir "$EVIDENCE_DIR") 2>/dev/null || refuse "cannot create '$EVIDENCE_DIR' (already used or not writable)"
  chmod 700 "$EVIDENCE_DIR" || refuse "cannot make '$EVIDENCE_DIR' private"
  printf '%s\n' "$EVIDENCE_DIR"
  exit 0
fi

[ "$TEMP_OK" = true ] || refuse "$reason. Move the document into its own feature folder, or pass --temp-ok to keep this run in temp (run files will not be kept)."

SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then refuse "unsafe scratch root symlink: $SCRATCH_ROOT"; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then refuse "scratch root is not owned by the current user: $SCRATCH_ROOT"; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
[ ! -e "$SCRATCH_ROOT/ce-doc-review/$RUN_ID" ] || refuse "run id '$RUN_ID' is already used in temp; pick a new run id"
RUN_DIR="$SCRATCH_ROOT/ce-doc-review/$RUN_ID"; (umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
say "$reason; using temp: run files will not be kept"
printf '%s\n' "$RUN_DIR"
