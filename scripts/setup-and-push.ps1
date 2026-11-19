# TaskPilot (Windows PowerShell): install, create the local database, verify, optionally publish to GitHub.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$GhUser = "resandadezcaasyam"; $Repo = "taskpilot"
$Desc = "Local-first AI-powered task tracker and next action planner for Product Management."

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Run($cmd) { Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" } }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 20.9+ from https://nodejs.org" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Install Git from https://git-scm.com" }
if ([int](node -p "process.versions.node.split('.')[0]") -lt 20) { throw "Node.js is too old. Install 20.9 or newer." }

Step "1/5 Install dependencies"
if (-not (Test-Path .env)) { Copy-Item .env.example .env; "Created .env from .env.example" }
Run "npm install"

Step "2/5 Create or update the local SQLite database (data/taskpilot.db)"
Run "node scripts/prepare.mjs"

Step "3/5 Verify: typecheck, lint, tests, production build"
Run "npm run typecheck"; Run "npm run lint"; Run "npm test"; Run "npm run build"

Step "4/5 GitHub"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI (gh) is not installed, so nothing was pushed. Install from https://cli.github.com, run 'gh auth login', then re-run this script."
  exit 0
}
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Not logged in to GitHub. Run 'gh auth login' and re-run. Nothing was pushed."; exit 0 }
$login = gh api user --jq .login
if ($login -ne $GhUser) { throw "Logged in as '$login' but the repository belongs to '$GhUser'." }
gh repo view "$GhUser/$Repo" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "Repository $GhUser/$Repo already exists. Not overwriting it."; exit 0 }

Step "5/5 Commit and push"
if (-not (Test-Path .git)) { Run "git init -b main" }
Run "git add -A"
$bad = git diff --cached --name-only | Select-String -Pattern '(^|/)\.env($|\.local)|\.db($|-)|^uploads/.+|^backups/|node_modules/|^\.next/' | Where-Object { $_ -notmatch '\.env\.example' }
if ($bad) { throw "Refusing to commit private or generated files:`n$bad" }
git diff --cached --quiet; if ($LASTEXITCODE -ne 0) { Run 'git commit -m "feat: TaskPilot phase 2 (next action engine, planner, reminders)"' }
$ok = Read-Host "Create PUBLIC repo $GhUser/$Repo and push 'main'? [y/N]"
if ($ok -ne "y") { Write-Host "Cancelled. Nothing was pushed."; exit 0 }
Run "gh repo create $GhUser/$Repo --public --description `"$Desc`" --source=. --remote=origin --push"
$local = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/main) -split "`t" | Select-Object -First 1
if ($local -eq $remote) { Write-Host "`nPushed and verified.`n  URL:    https://github.com/$GhUser/$Repo`n  Commit: $local" -ForegroundColor Green }
else { throw "Push could not be verified (local $local, remote $remote)." }
