# TaskPilot

Local-first task tracker and next-action planner for Product Management.

> **Bahasa Indonesia:** panduan lengkap fitur dan cara pemakaian ada di [README.id.md](README.id.md).

TaskPilot answers three questions every morning: **what am I working on, what is blocking me, and what should I do next.** It runs entirely on your computer. Your data lives in a SQLite file, there is no cloud, and no internet connection is needed to use it.

> **Version 0.4 (Phases 1-4 combined).** Everything below works. The optional AI assistant (Gemini) is the one planned feature still to come (Phase 5); the app is complete and fully usable without it.

## Quick start

Requirements: **Node.js 20.9 or newer** (22 LTS recommended, see `.nvmrc`) and Git. You only need internet for `npm install`.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. That is all. Before the server starts, `npm run dev` automatically:

1. creates `.env` from `.env.example` if you do not have one,
2. creates the `data/`, `uploads/` and `backups/` folders,
3. creates or updates the SQLite database `data/taskpilot.db` (it applies the migrations in `prisma/migrations/`; it never resets or deletes data).

Run `npm run build && npm start` for the faster production mode (same automatic preparation).

On Windows you can also just double-click **`start-taskpilot.bat`**: it installs what is missing on the first run, starts TaskPilot and opens your browser. (If PowerShell says "running scripts is disabled", use `npm.cmd install` / `npm.cmd run dev`, Command Prompt, or the `.bat` file.)

### Already used an earlier version?

Copy the new files over your project but **keep your `data/`, `uploads/` and `.env`**. If your `prisma/migrations/` folder has your own migrations (for example `init`, `phase2`, `phase3`), keep them too. On the next `npm run dev`, TaskPilot recognises your existing database, registers the bundled baseline migration as already applied, and leaves your data untouched. If your database is older than Phase 3 it stops with instructions instead of guessing. Either way, make a copy of `data/taskpilot.db` first.

## How to use it day to day

1. **Morning (5 min):** open **Dashboard**, then **Today Planner** and add 3-5 things to "My plan for today". Glance at the bell and **Waiting & Blocked** for follow-ups that are due.
2. **During the day:** one small thing, use **Quick add** (type a sentence). Several things at once (meeting notes, a to-do list), paste them into **Brain Dump**, check the preview, save. Finished something, tick it off in **My Tasks**, or use **Mark action complete** in **Next Actions**.
3. **Evening (5 min):** in **Brain Dump** choose **Already done** and type or paste what you did today, one line each. In **Today Planner** log work, push unfinished items to tomorrow (they come back under "Carried over"), and jot a note.
4. **Weekly:** look at **Analytics**, check project health, and make sure a backup exists (**Settings, Data and backup**).

A step-by-step guide to every screen, with the shortcuts, formulas and a troubleshooting table, is in [README.id.md](README.id.md) (Bahasa Indonesia).

## What it does

**Dashboard.** Eight clickable summary cards (each opens the matching filtered list), Today's Focus (top five recommendations), project health, upcoming deadlines, reminders and recent activity. Everything is a live database query. Display name, layout and date format are settings.

**Brain Dump** (`/capture`, in the sidebar). The fast way to enter many activities. Type or paste one line per activity, and TaskPilot reads the details from the words, shows an editable preview, and saves them all at once. Everything beyond the title is optional. Pick "To do", "Doing" or **"Already done"** for the whole batch (ideal for a recap of what you did today), and a default project and priority. Shortcuts you can add to any line:

| Shortcut | Meaning | Example |
| --- | --- | --- |
| `!` `!h` `!!` `!c` `!m` `!l` | Priority (`!` High, `!!` Critical) | `Fix login bug !c` |
| `@project` or `@"UAT Booking"` | Project, by part of its name | `Retest booking @uat` |
| `~30m` `~1.5h` `~2jam` | Time estimate | `Write release notes ~45m` |
| `>Andi` or `>"Backend team"` | Waiting for someone | `API timestamp >Andi` |
| `%75` | Progress | `Draft test plan %75` |
| `=> text` | Next step (the blocker, on a blocked line) | `Prepare slides => collect numbers` |
| `#tag` | Tag | `Vendor call #vendor` |
| `tomorrow`, `next Fri`, `25 Nov`, `besok` | Date (a follow-up date for "follow up..." lines) | `Follow up Budi tomorrow` |
| `[x]` or `done:` | Already finished | `[x] Sent weekly report` |
| `[~]` or `doing:` | In progress | `doing: Review PRD` |
| `[!]` or `blocked:` | Blocked (reason after `=>`) | `blocked: Vendor => timestamp missing` |

**Smart matching (typos are fine).** Brain Dump compares what you type with what already exists:

- **Projects**: `@bokking` finds "UAT Booking". A project mentioned only in the words ("retest bokking cases") is found too, as long as exactly one project has that distinctive word (words like `uat`, `qa` or `test`, and `#tags`, never count). A close-but-unsure name becomes a one-click "Did you mean...?", never a silent guess. A name that matches nothing (`@zeta`) is offered as a **new project**, and the preview says so before anything is created.
- **Existing tasks**: a line that is clearly an existing task (typos and filler words like "the", "with", "untuk" are ignored) is not created again. A status line such as `[x] revew PRD v2` **updates** the real task (marks it done) instead; a plain line that already exists is skipped; a merely similar title is only pointed out ("Looks like TP-0012 ... Update that one instead"). Only the fields you stated are changed, and only if they differ, so **pasting the same text twice changes nothing**.
- **People and tags**: `>andy` becomes the existing "Andi", `>budi` becomes "Budi Santoso" when there is only one Budi, `#bokking` becomes `#booking`. Common Indonesian spelling variants (andy/andi, boedi/budi) count as the same name.
- **Words the parser understands**: `tommorow`, `fridy`, `follw up`, `retst` and similar slips are repaired (and shown as "Typo fixed"), so dates and categories are still picked up.

Every row has an **Action** (create / update an existing task / skip) that you can change before saving. Short words must match exactly (so `api` never becomes `apt`), and plurals are never "fixed".

Bullets, numbering, blank lines and `# headings` are ignored, so you can paste from notes or chat. Lines that cannot be saved (for example a blocked task with no reason) are held back with a clear message, tasks that already exist are skipped unless you tick them, and everything valid is saved in one transaction. Your unsent text survives a refresh. You can also keep a **daily routine** (your regular activities) and add it in one click, and tap "often used" titles. Up to 100 lines at a time.

**Tasks** (`/tasks`). In the full form only the essentials are shown; everything else sits under "More details (all optional)" and opens by itself if something inside needs fixing. Create, edit, delete, duplicate, complete, reopen; status, priority, deadline and progress; subtasks, comments, tags, dependencies (circular links are rejected), file attachments; search, filters, sorting, bulk update; table and card views. Task numbers (TP-0001) are never reused.

**Projects.** Ongoing and completed views, progress, blockers, milestones, task list, UAT features, open issues and an activity timeline.

**Weekly Report** (`/weekly`). Writes your weekly update email from your data: **Done last week** (tasks finished and UAT features signed off), **This week** (open work, with status, progress, your "next action" as `target:` and an expected finish weekday), and **Blocked / At risk** (blocked tasks with their blocker, long waits, overdue work, serious issues). Pick the week (it chooses sensibly by weekday), untick or reword any line, add your own, set To/Cc/greeting and the "Product Dash updated" line, then **Copy email** (bullets survive pasting into Gmail/Outlook). The wording, headings and signature are a template you save once. TaskPilot never sends email.

**Next Actions** (`/next-actions`). Every open task gets a 0-100 priority score, a recommendation type, a concrete action, the reason, estimated duration and execution order. Buttons: Start now, Mark action complete (never completes the task), Postpone, Follow up, Override (optionally pinned), View task. UAT and issue next steps appear here too.

**Today Planner** (`/today`). Must do, Follow up, Recommended focus, Quick wins and Upcoming, plus your own plan for the day with drag-and-drop ordering, "log work", reschedule, a daily progress and workload indicator, autosaved notes, and a Carried over list so unfinished work is never lost.

**Waiting & Blocked** (`/waiting`). Blocker, who you are waiting for, days waiting, follow-up date, latest update, recommended action and automatic flags, with quick actions: follow up, update blocker, resolve/resume, change PIC, reschedule.

**Kanban** (`/kanban`). Seven columns, drag and drop (or a per-card menu), saved immediately and rolled back with an error if the save fails. Moving to Blocked or Waiting asks for the reason first.

**UAT Tracker** (`/uat`). Features with release, environment, owner, dates, status and sign-off. Test cases with steps and results, evidence files, retest, issue links, **CSV import with a preview** (comma, semicolon or tab separated), and manual counts for features without individual cases. Metrics are kept separate: *execution progress* = (passed + failed) / total, *pass rate* = passed / executed, *passed share* = passed / total, *remaining* = not run + blocked. Next actions: execute remaining cases, follow up on blocked ones, report findings, retest after a fix, request sign-off.

**Issues & Escalations** (`/issues`). ISS-0001 style numbers, severity, PIC, expected and actual resolution, an update timeline with screenshots, escalation history, root cause, pending verification, resolved and closed. Each issue shows the next step (collect information, validate, escalate, request an update, verify the fix, confirm with the requester, close).

**Calendar** (`/calendar`). Month, week and day views of deadlines, follow-ups, UAT targets, milestones and planned work. Drag an item to another day to reschedule it.

**Reminders.** Overdue, deadline approaching, follow-up due, unresolved blocker, inactive task, UAT target and issue follow-ups, as sidebar badges, a bell menu and a dashboard card. Snooze and dismiss are saved. They are evaluated at startup, on every page load and every minute while TaskPilot is open. **They cannot notify you while the app is closed.**

**Analytics** (`/analytics`). Created, completed, completion rate, overdue, average completion time and blocker duration, with Recharts charts (trend, status, priority, weekly and monthly productivity, categories, projects, project progress, UAT execution), date-range filters and a table view of every chart.

**Search** (`/search`, press `/` anywhere). Tasks, projects, UAT, issues, notes and comments, stakeholders and tags, with matches highlighted.

**Quick Capture (one task).** In Quick add, type a sentence such as "Follow up with engineering about the API issue tomorrow" and press Enter. Title, category, follow-up or due date, priority, tags and next action are filled in. It is rule-based (works offline) and understands relative and absolute dates and basic Indonesian (besok, lusa, minggu depan).

**Activity History** (`/activity`). Every change, filterable by area, text and dates.

**Settings, export and backup** (`/settings`). Display name, date format, theme, default views, scoring weights, reminder rules, automatic backups and the AI toggle, all stored in SQLite. Export tasks, projects, UAT features, test cases, issues and activity as **Excel (.xlsx)**, CSV or JSON, or everything in one multi-sheet Excel workbook. Full backup and restore (below).

## How the Next Action Engine works

Source: `src/lib/engine.ts` (pure functions, fully unit-tested).

**Score (0-100)** is a weighted average of five components, each normalised to 0-1. Default weights are editable in Settings and are normalised, so they need not add up to 100:

| Component | Default | What raises it |
| --- | --- | --- |
| Deadline urgency | 30% | Overdue = 1, today .95, tomorrow .85, then falling; no deadline .1. Uses the earlier of the due date and the next-action deadline |
| Business priority | 25% | 70% task priority (Critical to Low) + 30% business importance (1-5) |
| Follow-up / blocker urgency | 20% | Blocked (rises over a week), waiting with a due or stale follow-up, follow-up date reached, in review, unfinished or overdue dependencies |
| Inactivity | 15% | Days since last update; reaches 1 at twice the inactivity threshold |
| Estimated effort | 10% | Small remaining effort scores higher (15 minutes or less = 1, unknown = .4) |

Adjustments: waiting tasks with no due follow-up x0.55, backlog x0.6, tasks with an unfinished dependency x0.7. A pinned override is always 100. Done and Cancelled tasks are never recommended.

**Recommendation type** (first match): blocked or overdue dependency, Resolve Blocker; waiting, Follow Up; in review, Review; overdue, Do Now; follow-up due, Follow Up; due today, Do Now (High/Critical) or Do Today; due within 2 days, Approaching Deadline; small remaining effort, Quick Win; in progress, Continue Progress; backlog, Review.

**Recommended action** comes from your own "next action" text when the task is actionable, otherwise from the task state. Completing an action records it, refreshes the task's "last updated" time and clears a follow-up date that was due, but never changes the task's status.

### Other definitions

- **Active**: not Done or Cancelled. **Overdue**: active with a deadline before today. **Completed this week**: Done since Monday 00:00.
- **Dashboard completion rate**: Done / (all tasks - cancelled). **Analytics completion rate**: of the tasks created in the selected period, the share that is Done now.
- **Project progress**: average of task progress, Done = 100%, Cancelled ignored. **Project health**: at risk if marked At Risk, any overdue task or 2+ blocked; watch if 1 blocked, anything waiting on others or on hold; otherwise healthy.

## Export to Excel, CSV and JSON

Open **Settings, Data and backup, Export**. Each entity downloads as:

- **Excel (.xlsx)**: a real workbook with a frozen bold header row, filters, sized columns, wrapped text and real Excel dates (not text). Related data comes as extra sheets: Tasks (+ Subtasks, Comments), Projects (+ Milestones), UAT (+ Test cases), Issues (+ Issue updates). **"Everything in one Excel workbook"** has all ten sheets. Text is always stored as text, so a value such as `=1+1` can never run as a formula. Timestamps show your app-timezone time.
- **CSV**: one flat table (UTF-8 with BOM so Excel shows accents correctly; formula-like text is neutralised). The UAT test-case CSV can be imported straight back into a feature.
- **JSON**: every field and nested record.

Direct URLs, for example: `/api/export/tasks?format=xlsx`, `/api/export/all` (complete workbook), `/api/export/issues?format=csv`.

## Data, backup and restore

Every change is a server-side Prisma transaction written straight to SQLite; there is no Save button and `localStorage` holds no data. A failed write shows an error and nothing is silently dropped. Your data lives in `data/taskpilot.db` and your files in `uploads/`, both outside `.next`, so rebuilds and restarts never touch them.

Open **Settings, Data and backup**:

- **Back up now** saves a JSON file (or a ZIP that also contains attachments and evidence) to `backups/`, or downloads it. A data-only automatic backup is also made once a day when you open the app (on by default; you choose how many to keep). Keep a copy somewhere else too.
- **Restore** always shows a preview first and changes nothing until you confirm. *Add what is missing* (default) never changes or overwrites anything that already exists; duplicates are skipped, tags are merged by name, clashing task or issue numbers are renumbered. *Replace everything* requires typing `REPLACE` and first saves a `pre-restore-*.json` snapshot. A restore is one transaction: if anything fails, nothing changes. Corrupt files, files from a newer version and non-backups are rejected with a reason.

## Timezone

All dates use one timezone, `Asia/Jakarta` by default. Set `NEXT_PUBLIC_APP_TIMEZONE` in `.env` and restart to change it (supported: Asia/Jakarta, Asia/Makassar, Asia/Jayapura, Asia/Bangkok, Asia/Singapore, UTC). Zones with daylight saving are intentionally not supported, so "today" and "overdue" stay exact.

## Tech stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · hand-written shadcn/ui-style components (Radix primitives) · Lucide · Recharts · SQLite via Prisma 7 (`better-sqlite3` driver adapter) · React Hook Form + Zod · ExcelJS (Excel export) · fflate (ZIP backups) · Vitest + Testing Library.

## Project structure

```
prisma/schema.prisma      Relational schema (21 tables)
prisma/migrations/        Bundled initial migration, applied automatically
scripts/prepare.mjs       Runs before dev/start: .env, folders, migrations
scripts/setup-and-push.*  Optional: verify everything and publish to GitHub
data/                     Your database (git-ignored)
uploads/                  Attachments and evidence (git-ignored)
backups/                  Backups (git-ignored)
src/app/                  Pages and API routes (files, export, backup)
src/actions/              Server actions: every write (Zod-validated, transactional)
src/lib/                  Engine, planner, reminders, UAT, issues, analytics, search, backup, dates
src/components/           UI components
tests/                    Unit and component tests
tests/integration/        Database and file-system tests (throwaway temp database)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Prepares the database, then starts on port 3000 (on Windows: `start-taskpilot.bat`) |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests |
| `npm run test:integration` | Integration tests against a temporary database built from the real migration |
| `npm run db:prepare` | Only the preparation step |
| `npm run db:studio` | Browse the data in Prisma Studio |
| `npm run db:migrate` | After you edit `schema.prisma`: create a new migration |

## Publishing to GitHub

`./scripts/setup-and-push.sh` (or `.ps1` on Windows) installs, prepares the database, runs typecheck, lint, tests and build, and, only if GitHub CLI is installed and logged in as the right user, creates the repository and pushes `main`, then verifies the pushed commit. It stops if the repository already exists. By hand:

```bash
git init -b main && git add -A && git commit -m "TaskPilot"
gh repo create resandadezcaasyam/taskpilot --public --source=. --remote=origin --push
```

`.env`, `data/`, `uploads/` and `backups/` are git-ignored; `.env.example` is committed.

## Troubleshooting

- **`npm install` fails while running `prisma generate`**: Prisma downloads a small engine once during install, so you need internet for that step (some corporate networks block `binaries.prisma.sh`).
- **`better-sqlite3` fails to install or load**: use Node 20 or 22 LTS and run `npm install` again. On unusual platforms install a C++ build toolchain.
- **"Your existing database is from an older TaskPilot version"**: the preparation step stopped on purpose and changed nothing. Follow the instructions it prints (back up `data/taskpilot.db` first).
- **Red banner "database is missing tables"**: stop the server and run `npm run db:prepare`.
- **Port 3000 is busy**: stop the other process, or run `npx next dev -p 3001`.
- **Dates look one day off**: all dates use the app timezone (see Timezone), not your computer's.
- **Start completely fresh**: stop the server, delete `data/taskpilot.db`, run `npm run dev`. This permanently deletes your data, so make a backup first.

## Roadmap

Phase 5: optional Gemini assistant (server-side key; the app always works without it, falling back to the rule-based engine), daily and weekly summaries.
