#!/usr/bin/env bash
# Refuses commits and pushes that would put personal data into the repository.
#
# 1. Paths: databases, env files, spreadsheets, exported backups, keys and the private/ and
#    data/ folders never belong in a commit, even if someone forces them past .gitignore.
# 2. Words: if private/denylist.txt exists (git-ignored, stays on the owner's machine), no
#    added line may contain one of its terms as a whole word, ignoring case – names of people,
#    for example. One term per line; list spelling variants separately.
# 3. With --outgoing (pre-push): every commit not yet on a remote is checked the same way,
#    including its message, and must carry GitHub noreply addresses as author and committer;
#    tag messages and taggers too. That catches what the pre-commit check cannot see.
#
# Only file names and commit ids are printed – the terms themselves must not end up in logs.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode=staged
case "${1:-}" in
'') ;;
--outgoing) mode=outgoing ;;
*)
	echo "usage: $0 [--outgoing]" >&2
	exit 2
	;;
esac

forbidden='^(private|data|test-results|playwright-report)/|(^|/)\.env($|\.)|\.(db|db-wal|db-shm|sqlite|sqlite3|csv|xlsx|xls|pem|key|p12|pfx)$|(^|/)(propario|produktvergleich)-.*\.json$'
noreply='@users\.noreply\.github\.com$|^noreply@github\.com$'
denylist=private/denylist.txt
terms=
if [ -e "$denylist" ]; then # present but unreadable: grep fails and so does the check
	terms=$(grep -v -E '^\s*(#|$)' "$denylist") || [ $? -eq 1 ] # 1: only comments
fi

# grep that fails closed: 0 = match, 1 = no match, anything else stops the script. Never call it
# inside a pipeline or $(…) – an exit there would only end a subshell.
matches() {
	local status=0
	grep "$@" || status=$?
	[ "$status" -le 1 ] || exit "$status"
	return "$status"
}

failed=0
fail() {
	echo "repo policy: $*" >&2
	failed=1
}

# Reads "file<TAB>added line" pairs on stdin; prints the files with a denylisted word.
denylisted_files() {
	local out status=0
	if [ -z "$terms" ]; then
		cat >/dev/null
		return 0
	fi
	out=$(grep -i -w -F -f <(printf '%s\n' "$terms")) || status=$?
	[ "$status" -le 1 ] || return "$status"
	if [ -n "$out" ]; then printf '%s\n' "$out" | cut -f1 | sort -u; fi
}

has_term() { [ -n "$terms" ] && matches -q -i -w -F -f <(printf '%s\n' "$terms") <<<"$1"; }
is_noreply() { [[ $1 =~ $noreply ]]; }

# Turns a diff into "file<TAB>added line" pairs.
added_lines() {
	awk '/^\+\+\+ b\//{file=substr($0,7)} /^\+[^+]/{print file "\t" $0}'
}

check_paths() {
	local file
	while IFS= read -r file; do
		[ -n "$file" ] || continue
		[ "$file" = .env.example ] && continue
		if [[ ${file,,} =~ $forbidden ]]; then
			fail "'$file' must not be committed (personal data, database or secret material)$1."
		fi
	done
}

if [ "$mode" = staged ]; then
	staged=$(git diff --cached --name-only --diff-filter=ACMR)
	[ -z "$staged" ] && exit 0
	check_paths '' <<<"$staged"
	hits=$(git diff --cached -U0 --diff-filter=ACMR -- . ':(exclude)package-lock.json' | added_lines | denylisted_files)
	[ -z "$hits" ] || fail "staged changes contain terms from $denylist in: ${hits//$'\n'/ }"
	exit "$failed"
fi

# Outgoing: everything reachable from local branches and tags that no remote has yet.
commits=$(git rev-list --branches --tags --not --remotes)
for commit in $commits; do
	short=$(git rev-parse --short "$commit")
	is_noreply "$(git show -s --format=%ae "$commit")" || fail "commit $short: author address is not a GitHub noreply address."
	is_noreply "$(git show -s --format=%ce "$commit")" || fail "commit $short: committer address is not a GitHub noreply address."
	check_paths " (commit $short)" <<<"$(git diff-tree --no-commit-id --name-only -r --root --diff-filter=ACMR "$commit")"
	hits=$(git diff-tree -p -U0 --root --diff-filter=ACMR "$commit" -- . ':(exclude)package-lock.json' | added_lines | denylisted_files)
	[ -z "$hits" ] || fail "commit $short adds terms from $denylist in: ${hits//$'\n'/ }"
	if has_term "$(git show -s --format=%B "$commit")"; then fail "commit $short has a term from $denylist in its message."; fi
done

tags=$(git for-each-ref refs/tags --format='%(objecttype) %(refname:short)')
while read -r type tag; do
	[ "$type" = tag ] || continue # lightweight tags carry no text
	is_noreply "$(git for-each-ref "refs/tags/$tag" --format='%(taggeremail:trim)')" || fail "tag $tag: tagger address is not a GitHub noreply address."
	if has_term "$(git for-each-ref "refs/tags/$tag" --format='%(contents)')"; then fail "tag $tag has a term from $denylist in its message."; fi
done <<<"$tags"

exit "$failed"
