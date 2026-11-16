#!/usr/bin/env bash
# Refuses commits that would put personal data into the repository.
#
# 1. Paths: databases, env files, spreadsheets, exported backups, keys and the private/ and
#    data/ folders never belong in a commit, even if someone forces them past .gitignore.
# 2. Words: if private/denylist.txt exists (git-ignored, stays on the owner's machine), no
#    added line may contain one of its terms – names of people, for example. One term per line.
#
# Run by pre-commit; can also be run by hand before a commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

failed=0
staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$staged" ] && exit 0

forbidden='^(private|data|test-results|playwright-report)/|(^|/)\.env($|\.)|\.(db|db-wal|db-shm|sqlite|sqlite3|csv|xlsx|xls|pem|key|p12|pfx)$|(^|/)(propario|produktvergleich)-.*\.json$'
while IFS= read -r file; do
	case "$file" in .env.example) continue ;; esac
	if printf '%s\n' "$file" | grep -Eiq "$forbidden"; then
		echo "repo policy: '$file' must not be committed (personal data, database or secret material)." >&2
		failed=1
	fi
done <<<"$staged"

denylist=private/denylist.txt
if [ -f "$denylist" ]; then
	terms=$(grep -v -E '^\s*(#|$)' "$denylist" || true)
	if [ -n "$terms" ]; then
		# Only added lines are checked, and only file names are printed – the terms themselves
		# must not end up in terminal logs either.
		hits=$(git diff --cached -U0 --diff-filter=ACMR -- . ':(exclude)package-lock.json' |
			awk '/^\+\+\+ b\//{file=substr($0,7)} /^\+[^+]/{print file "\t" $0}' |
			grep -i -F -f <(printf '%s\n' "$terms") | cut -f1 | sort -u || true)
		if [ -n "$hits" ]; then
			echo "repo policy: staged changes contain terms from private/denylist.txt in:" >&2
			printf '  %s\n' $hits >&2
			failed=1
		fi
	fi
fi

exit "$failed"
