#!/usr/bin/env bash
# Publishes the release that was just merged: checks that this is the current main, that the
# version in package.json has no tag yet and a dated CHANGELOG entry, shows the notes, asks, then
# pushes the annotated tag. The tag runs .github/workflows/release.yml (image and GitHub release).
# Only admins may push version tags (ruleset "release tags"). Usage: scripts/release-tag.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() {
	echo "release-tag: $*" >&2
	exit 1
}

git fetch --quiet origin main --tags
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || fail "switch to main first"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes; commit or stash them first"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "main is not origin/main; run git pull first"

tag="v$(node -p 'require("./package.json").version')"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then fail "$tag exists already: raise the version in a release pull request first"; fi
# Fails without a dated "## x.y.z — YYYY-MM-DD" entry, as the release workflow would.
notes=$(scripts/release-notes.sh "$tag")

printf 'Release %s from %s\n\n%s\n\n' "$tag" "$(git log -1 --format='%h %s')" "$notes"
read -r -p "Publish $tag? [y/N] " answer
[ "$answer" = y ] || [ "$answer" = Y ] || fail "nothing published"

git tag -a "$tag" -m "$tag"
git push origin "$tag"
echo "$tag pushed: the release workflow builds the image and publishes the release."
