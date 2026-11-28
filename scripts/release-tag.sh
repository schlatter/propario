#!/usr/bin/env bash
# Publishes the release that was just merged: switches to main and brings it up to origin/main,
# checks that the version in package.json has no tag yet and a dated CHANGELOG entry, shows the
# notes, asks, then pushes the annotated tag. The tag runs .github/workflows/release.yml (image
# and GitHub release); with the GitHub CLI the script waits for it and prints the release.
# Only admins may push version tags (ruleset "release tags"). Usage: scripts/release-tag.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() {
	echo "release-tag: $*" >&2
	exit 1
}

git fetch --quiet origin main --tags
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes; commit or stash them first"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || git switch --quiet main
git merge --quiet --ff-only origin/main 2>/dev/null || fail "main has commits that are not on origin/main; push or drop them first"

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

command -v gh >/dev/null || exit 0
commit=$(git rev-parse "$tag^{commit}")
run=
for _ in $(seq 12); do
	run=$(gh run list --workflow release.yml --commit "$commit" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
	[ -n "$run" ] && break
	sleep 5
done
[ -n "$run" ] || fail "the release run has not started after a minute; see the repository's Actions tab"
echo "Waiting for the release run …"
gh run watch "$run" --exit-status || fail "the release run failed: gh run view $run --log-failed"
gh release view "$tag" --json url --jq .url
