#!/usr/bin/env bash
# TaskPilot: install, create the local database, verify, and (optionally) publish the source to GitHub.
# Works on macOS, Linux, WSL and Git Bash. Windows PowerShell users: see scripts/setup-and-push.ps1.
set -euo pipefail
cd "$(dirname "$0")/.."

GH_USER="resandadezcaasyam"
REPO="taskpilot"
DESCRIPTION="Local-first AI-powered task tracker and next action planner for Product Management."

say()  { printf "\n\033[1m==> %s\033[0m\n" "$*"; }
fail() { printf "\n\033[31mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

command -v node >/dev/null || fail "Node.js is not installed (need 20.9 or newer): https://nodejs.org"
command -v git  >/dev/null || fail "Git is not installed: https://git-scm.com"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js $NODE_MAJOR is too old. Install Node.js 20.9 or newer."

say "1/5 Install dependencies"
[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example"; }
npm install

say "2/5 Create or update the local SQLite database (data/taskpilot.db)"
node scripts/prepare.mjs        # applies pending migrations only; never resets your data

say "3/5 Verify: typecheck, lint, tests, production build"
npm run typecheck
npm run lint
npm test
npm run build

say "4/5 GitHub"
if ! command -v gh >/dev/null; then
  cat <<MSG
GitHub CLI (gh) is not installed, so nothing was pushed.
Install it from https://cli.github.com, run 'gh auth login', then run this script again.
Or push manually:
  git init -b main && git add -A && git commit -m "feat: TaskPilot phase 2"
  git remote add origin https://github.com/$GH_USER/$REPO.git && git push -u origin main
MSG
  exit 0
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "You are not logged in to GitHub. Run 'gh auth login' and re-run this script. Nothing was pushed."
  exit 0
fi
LOGIN=$(gh api user --jq .login)
[ "$LOGIN" = "$GH_USER" ] || fail "Logged in as '$LOGIN' but the repository belongs to '$GH_USER'. Run 'gh auth login' with the right account."

if gh repo view "$GH_USER/$REPO" >/dev/null 2>&1; then
  echo "Repository $GH_USER/$REPO already exists. Not overwriting it."
  echo "Review it at https://github.com/$GH_USER/$REPO and push manually if you really want to add to it."
  exit 0
fi

say "5/5 Commit and push"
[ -d .git ] || git init -b main
git add -A
BAD=$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.local)|\.db($|-)|^uploads/.+|^backups/|node_modules/|^\.next/' | grep -v '\.env\.example' || true)
[ -z "$BAD" ] || fail "Refusing to commit private or generated files:\n$BAD"
git diff --cached --quiet || git commit -m "feat: TaskPilot phase 2 (next action engine, planner, reminders)"

read -r -p "Create PUBLIC repo $GH_USER/$REPO and push 'main'? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled. Nothing was pushed."; exit 0; }
gh repo create "$GH_USER/$REPO" --public --description "$DESCRIPTION" --source=. --remote=origin --push

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git ls-remote origin refs/heads/main | cut -f1)
if [ "$LOCAL" = "$REMOTE" ]; then
  printf "\n\033[32mPushed and verified.\033[0m\n  URL:    https://github.com/%s/%s\n  Commit: %s\n" "$GH_USER" "$REPO" "$LOCAL"
else
  fail "Push could not be verified (local $LOCAL, remote ${REMOTE:-none}). Check 'git remote -v' and your login."
fi
