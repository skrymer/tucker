#!/usr/bin/env bash
# Run a command inside a memory-bounded systemd user scope.
#
# Why this exists: systemd-oomd kills on *user-slice* memory pressure, not on any
# one process's size — so an unbounded mutation sweep does not die alone, it takes
# the terminal (and the Claude Code session inside it) with it. Measured: a
# 30-mutant StrykerJS sweep peaked at 21 GB of a 30 GB machine, and oomd killed
# the GNOME Terminal scope twice.
#
# A scope confines the blast radius. Over the cap the kernel reclaims and, failing
# that, OOM-kills inside this cgroup only; everything else in the session survives
# and the failure reads as a killed worker rather than a vanished terminal.
#
# Usage:  scripts/bounded-run.sh [--cap 8G] [--log <new-file>] -- <command> [args...]
#
# --log tees the run's output into a file that must not exist yet: a re-run is a new
# log, never the old one overwritten (#498 lost two reds that way). The HEAD +
# `git status --short` stamp below is its first lines.
#
# Linux + systemd only. Anywhere else it warns and runs the command unbounded, so
# it is never the reason a command cannot run — but it is also not protecting
# anything there, and the sweep's own memory settings are the only guard.
set -euo pipefail

CAP="${BOUNDED_RUN_CAP:-8G}"
LOG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cap)
      [ $# -ge 2 ] || { echo "bounded-run: --cap needs a value (e.g. --cap 8G)" >&2; exit 2; }
      CAP="$2"; shift 2 ;;
    --log)
      [ $# -ge 2 ] || { echo "bounded-run: --log needs a path" >&2; exit 2; }
      LOG="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "usage: $0 [--cap 8G] [--log <new-file>] -- <command> [args...]" >&2
  exit 2
fi

if [ -n "$LOG" ]; then
  # noclobber makes the existence check and the create one step.
  if ! (set -o noclobber; : > "$LOG") 2>/dev/null; then
    echo "bounded-run: refusing --log $LOG — it exists or cannot be created; a re-run gets a new file" >&2
    exit 2
  fi
  exec > >(tee -a "$LOG") 2>&1
fi

# Stamp the tree the sweep ran on, so a saved log names its commit and any
# uncommitted change without anyone remembering to.
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "bounded-run: HEAD $(git rev-parse HEAD)"
  git status --short | sed 's/^/bounded-run: /'
fi

# The binary existing is not the same as a systemd *user* manager being reachable: in a
# container or a bus-less CI shell `--user` fails to connect, and since the real command is
# exec'd it would never run at all. Probe once, and fall back rather than take the command
# down with us.
if ! command -v systemd-run >/dev/null 2>&1 ||
   ! systemd-run --user --scope --quiet -- true >/dev/null 2>&1; then
  echo "bounded-run: no usable systemd user scope — running unbounded" >&2
  exec "$@"
fi

# MemorySwapMax=0: swapping is what produces the sustained reclaim pressure oomd
# watches, so a sweep that would swap should fail here instead.
exec systemd-run --user --scope --quiet \
  -p MemoryMax="$CAP" -p MemorySwapMax=0 \
  -- "$@"
