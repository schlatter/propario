#!/usr/bin/env bash
# Prints the release notes for a tag such as v0.18.0: its dated entry in CHANGELOG.md. Refuses a
# tag that is not a plain version, a package.json with another version, and a missing entry.
# The release workflow calls it; run it before tagging to see what people will read.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

tag=${1:?usage: $0 v0.x.y}
if ! [[ $tag =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
	echo "release: '$tag' is not a version tag like v0.18.0" >&2
	exit 1
fi
version=${BASH_REMATCH[1]}

package=$(node -p 'require("./package.json").version')
if [ "$package" != "$version" ]; then
	echo "release: package.json says $package, the tag says $version" >&2
	exit 1
fi

# From "## 0.18.0 — 2026-12-20" up to the next "## ", without the blank lines around it.
notes=$(awk -v heading="## $version — " '
	/^## / { if (found) exit; if (index($0, heading) == 1 && $0 ~ /[0-9]{4}-[0-9]{2}-[0-9]{2}$/) { found = 1; next } }
	found && (started || NF) { started = 1; print }
' CHANGELOG.md)
if [ -z "$notes" ]; then
	echo "release: CHANGELOG.md has no dated entry '## $version — YYYY-MM-DD'" >&2
	exit 1
fi
printf '%s\n' "$notes"
