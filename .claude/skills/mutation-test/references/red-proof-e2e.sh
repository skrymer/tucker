#!/usr/bin/env bash
# Red proofs for mutants only a Playwright e2e can kill (see SKILL.md, "Killed by an
# out-of-scope layer"). Copy this into the sign-off pack, fill in `mutants`, and run it
# through scripts/bounded-run.sh. One mutated copy of frontend/ per line, each running
# the e2e test that must go red. Written for #522, whose first run reported 12 false
# REDs: the copies could not build, because nothing ran `nuxt prepare`.
set -u
here=$(cd "$(dirname "$0")" && pwd)
src=/path/to/worktree/frontend          # the frontend under test
# Copies land here, one at a time. On the repo's filesystem (~/.cache), never the /tmp
# scratchpad: `cp -al node_modules` cannot hard-link across mounts (#524's first run).
work=~/.cache/tucker-red-proof
mkdir -p "$work"
echo "HEAD $(git -C "$src" rev-parse HEAD)" > "$here/red-proof.log"
git -C "$src" status --short >> "$here/red-proof.log"

# name|file|old|new|grep of the test that must fail. `old` must match exactly once.
# The control mutates nothing and must pass every grep after it: a copy that cannot
# build reads as red to every other line. Escape every `"` inside an entry, as the
# example does: an unescaped one ends the bash string, `old` never matches, and the line
# reads MUTATION NOT APPLIED (#548's three template mutants cost a second run).
mutants=(
  "control|app/components/Chart.vue|const x = 1|const x = 1|first test|second test"
  "example|app/components/Chart.vue|:x-domain=\"xDomain\"||first test"
)

for m in "${mutants[@]}"; do
  IFS='|' read -r name file old new grep <<< "$m"
  [ "$name" = control ] && grep=${m#*|*|*|*|}
  copy="$work/$name"
  rm -rf "$copy"; mkdir -p "$copy"
  tar -C "$src" --exclude=./node_modules --exclude=./.nuxt --exclude=./.output \
    --exclude=./reports --exclude=./test-results --exclude=./.stryker-tmp -cf - . | tar -C "$copy" -xf -
  cp -al "$src/node_modules" "$copy/node_modules"
  if ! node -e '
    const fs = require("fs"); const [f, o, n] = process.argv.slice(1)
    const s = fs.readFileSync(f, "utf8"); const k = s.split(o).length - 1
    if (k !== 1) { console.error(`expected one match, found ${k}`); process.exit(1) }
    fs.writeFileSync(f, s.replace(o, n))' "$copy/$file" "$old" "$new"; then
    echo "$name: MUTATION NOT APPLIED" | tee -a "$here/red-proof.log"; continue
  fi
  diff -u "$src/$file" "$copy/$file" > "$here/red-proof-$name.diff"
  (cd "$copy" && pnpm exec nuxt prepare > /dev/null 2>&1 &&
    pnpm exec playwright test e2e/<spec>.spec.ts -g "$grep" --project="Desktop Chrome" --reporter=list) \
    > "$here/red-proof-$name.log" 2>&1
  failed=$(grep -cE '^\s+✘' "$here/red-proof-$name.log")
  passed=$(grep -cE '^\s+✓' "$here/red-proof-$name.log")
  # Red only when a named test ran and failed; nothing run is a broken copy.
  if [ "$failed" -gt 0 ]; then verdict=RED
  elif [ "$passed" -gt 0 ]; then verdict=GREEN
  else verdict="NOTHING RAN (broken copy)"; fi
  echo "$name: $verdict — failed $failed, passed $passed: $(grep -E '^\s+✘' "$here/red-proof-$name.log" | sed 's/.*› //' | paste -sd';')" \
    | tee -a "$here/red-proof.log"
  rm -rf "$copy"
done
