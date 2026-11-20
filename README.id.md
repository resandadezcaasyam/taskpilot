# TaskPilot: Panduan Penggunaan (Bahasa Indonesia)

TaskPilot adalah aplikasi pribadi untuk Product Manager yang membantu Anda menjawab tiga pertanyaan setiap pagi: **apa yang sedang saya kerjakan, apa yang menghambat, dan apa yang harus saya lakukan berikutnya.**

Semua berjalan **di komputer Anda sendiri**. Data disimpan di satu file SQLite (`data/taskpilot.db`), tidak ada cloud, dan tidak perlu internet untuk memakainya. (Internet hanya dibutuhkan saat `npm install` pertama kali.)

> English version and technical details: [README.md](README.md)

## Daftar isi

1. [Menjalankan aplikasi](#1-menjalankan-aplikasi)
2. [Peta aplikasi](#2-peta-aplikasi)
3. [Alur kerja harian yang disarankan](#3-alur-kerja-harian-yang-disarankan)
4. [Panduan per fitur](#4-panduan-per-fitur)
5. [Rumus dan istilah](#5-rumus-dan-istilah)
6. [Tips agar cepat](#6-tips-agar-cepat)
7. [Masalah umum](#7-masalah-umum)
8. [Data, privasi, dan cadangan](#8-data-privasi-dan-cadangan)

---

## 1. Menjalankan aplikasi

**Kebutuhan:** Node.js 20.9 atau lebih baru (disarankan 22 LTS, unduh di https://nodejs.org).

### Cara tercepat di Windows

Klik dua kali **`start-taskpilot.bat`**. Pada pemakaian pertama file ini memasang yang dibutuhkan (perlu internet, beberapa menit), lalu menjalankan TaskPilot dan membuka browser di http://localhost:3000. Biarkan jendela hitamnya terbuka selama Anda memakai TaskPilot. Menutupnya berarti menghentikan aplikasi, **data Anda tetap aman**.

### Lewat terminal

Buka terminal di folder proyek, lalu:

```bash
npm install
npm run dev
```

Buka http://localhost:3000. Saat `npm run dev` jalan, TaskPilot otomatis membuat file `.env`, folder `data/`, `uploads/`, `backups/`, dan database (tanpa pernah menghapus data yang sudah ada).

**Catatan Windows PowerShell:** jika muncul error "running scripts is disabled", gunakan `npm.cmd install` dan `npm.cmd run dev` (atau pakai Command Prompt, atau klik `start-taskpilot.bat`).

### Menghentikan dan menjalankan lagi

Tekan `Ctrl+C` di terminal (atau tutup jendelanya) untuk berhenti. Besok jalankan lagi dengan cara yang sama: semua task, proyek, dan catatan Anda ada seperti terakhir disimpan. Skor prioritas, status terlambat, dan rekomendasi dihitung ulang otomatis berdasarkan tanggal hari ini.

### Mode lebih cepat (opsional)

```bash
npm run build
npm start
```

### Memperbarui ke versi baru

Salin file versi baru ke folder proyek dengan **tetap menjaga** `data/`, `uploads/`, `backups/`, dan `.env`, lalu jalankan `npm install` dan `npm run dev`. Salin dulu `data/taskpilot.db` sebagai cadangan.

---

## 2. Peta aplikasi

**Menu samping (sidebar):**

| Menu | Alamat | Untuk apa |
| --- | --- | --- |
| Dashboard | `/` | Ringkasan hari ini: angka penting, 5 rekomendasi teratas, kesehatan proyek, reminder |
| My Tasks | `/tasks` | Semua task: cari, filter, ubah status, aksi massal |
| Brain Dump | `/capture` | **Cara tercepat** memasukkan banyak kegiatan sekaligus dari teks |
| Next Actions | `/next-actions` | "Apa yang sebaiknya saya kerjakan sekarang?" lengkap dengan alasannya |
| Weekly Report | `/weekly` | **Email update mingguan otomatis**: apa yang selesai minggu lalu, rencana minggu ini, dan yang terhambat |
| Today Planner | `/today` | Rencana hari ini: pilih, urutkan, catat kerja, catatan harian |
| Projects | `/projects` | Proyek, progres, milestone, UAT dan issue terkait |
| Kanban Board | `/kanban` | Papan kolom status, geser kartu untuk mengubah status |
| UAT Tracker | `/uat` | Fitur UAT, test case, hasil, bukti, sign-off |
| Issue & Escalation | `/issues` | Pelacakan issue dari dilaporkan sampai ditutup, termasuk eskalasi |
| Waiting & Blocked | `/waiting` | Semua yang tertahan: menunggu siapa, sudah berapa hari, kapan follow-up |
| Calendar | `/calendar` | Bulan/minggu/hari: deadline, follow-up, target UAT, milestone |
| Analytics | `/analytics` | Grafik produktivitas dan tren dari data Anda |
| Activity History | `/activity` | Riwayat semua perubahan |
| Settings | `/settings` | Preferensi, bobot skor, reminder, backup, ekspor/restore |

**Bilah atas (header):** kotak **pencarian** (tekan `/` di mana saja untuk langsung mengetik), ikon **lonceng** (reminder aktif), tombol **tema** terang/gelap, dan tombol **Quick add**.

**Badge merah di sidebar** menunjukkan jumlah reminder yang perlu perhatian di Today Planner, Waiting & Blocked, UAT Tracker, dan Issue & Escalation.

---

## 3. Alur kerja harian yang disarankan

**Pagi (sekitar 5 menit)**
1. Buka **Dashboard**: lihat kartu angka (terlambat, jatuh tempo hari ini, blocked) dan **Today's focus**.
2. Buka **Today Planner**: tambahkan 3-5 hal yang benar-benar akan Anda kerjakan ke "My plan for today" dengan tombol **Add to plan**. Urutkan dengan drag atau tombol panah.
3. Cek **lonceng** dan **Waiting & Blocked** untuk follow-up yang jatuh tempo.

**Siang (kapan saja ada kegiatan baru)**
- Satu hal kecil: tombol **Quick add** di kanan atas, ketik satu kalimat.
- Banyak hal sekaligus (misalnya hasil rapat): buka **Brain Dump**, tempel, cek preview, simpan.
- Selesai mengerjakan sesuatu: centang lingkaran di **My Tasks** atau tombol **Mark action complete** di **Next Actions**.

**Sore (sekitar 5 menit)**
1. Di **Brain Dump** pilih **Already done**, ketik atau tempel apa saja yang sudah Anda kerjakan hari ini (satu baris per kegiatan), lalu simpan. Ini membuat riwayat pekerjaan tanpa mengisi formulir satu per satu.
2. Di **Today Planner** catat kerja dengan ikon jam (**Log work**), pindahkan yang belum selesai ke besok (ikon kalender). Yang tidak selesai **tidak hilang**: besok muncul di "Carried over".
3. Tulis catatan hari ini di kotak **Notes for today** (tersimpan otomatis).

**Mingguan**
- Buka **Weekly Report** (Senin atau Selasa pagi, atau Jumat sore untuk minggu depan): periksa isinya, klik **Copy email**, tempel ke email Anda.
- **Analytics** untuk melihat tren, **Projects** untuk kesehatan proyek, **Settings, Data and backup** untuk memastikan cadangan ada.

---

## 4. Panduan per fitur

### 4.1 Dashboard

- **8 kartu angka** (Active tasks, Due today, Overdue, In progress, Waiting for others, Blocked, Completed this week, Completion rate). Setiap kartu bisa diklik dan membuka daftar task yang sudah terfilter.
- **Today's focus**: 5 rekomendasi teratas dari Next Action Engine, lengkap dengan aksi yang disarankan, alasan, estimasi, dan tombol cepat.
- **Reminders**, **Project health** (progres, jumlah blocked, issue terbuka), **Upcoming deadlines** (7 hari ke depan), dan **Recent activity**.
- Nama tampilan, tata letak, dan format tanggal bisa diubah di **Settings**.

### 4.2 My Tasks

**Membuat task:** tombol **New task**. Formulir hanya meminta hal penting (judul, proyek, kategori, prioritas, status, deadline, tanggal follow-up, langkah berikutnya). Semua yang lain ada di **More details (all optional)** dan terbuka sendiri jika ada isian di dalamnya yang perlu diperbaiki.

**Status** yang tersedia: Backlog, To Do, In Progress, Waiting for Others, Blocked, In Review, Done, Cancelled.
- **Blocked** wajib diisi *alasannya*, **Waiting for Others** wajib diisi *menunggu siapa*.
- Memilih **Done** otomatis mengisi tanggal selesai dan progres 100%.

**Di daftar:**
- Ubah status langsung lewat dropdown di baris. Klik lingkaran di kiri judul untuk menyelesaikan atau membuka kembali.
- Menu titik tiga: **Edit**, **Mark as done / Reopen**, **Duplicate**, **Delete** (selalu minta konfirmasi).
- Centang beberapa task untuk **aksi massal** (ubah status, ubah prioritas, hapus).
- Cari, filter (status, prioritas, proyek, kategori), urutkan, dan pilih tampilan **tabel** atau **kartu**. Tampilan bawaan bisa diatur di Settings.

**Halaman detail task** (klik judulnya): progres (slider), **subtask**, **komentar**, **dependensi** (task ini menunggu task lain; hubungan melingkar ditolak), **lampiran file**, dan **History** perubahan.

Semua perubahan **langsung tersimpan**. Jika gagal tersimpan Anda akan melihat pesan error, bukan hilang diam-diam.

### 4.3 Brain Dump (input cepat)

Untuk mengisi banyak kegiatan tanpa mengisi formulir.

1. Buka **Brain Dump**.
2. Pilih di atas: **To do / Doing / Already done** (berlaku untuk semua baris), proyek bawaan, dan prioritas bawaan.
3. Ketik atau tempel **satu baris per kegiatan**. Contoh:

```
Follow up Andi soal API timestamp besok !h @booking ~15m
[x] Kirim laporan mingguan ke Budi
doing: Review PRD %40
blocked: Vendor compliance => timestamp backend belum ada
Siapkan slide Jumat ~1h => kumpulkan angka dulu
```

4. Tabel **Preview** muncul. Periksa dan ubah apa saja (judul, proyek, prioritas, status, tanggal, estimasi). Tiap baris punya **Action**: *Create new task*, *Update TP-xxxx*, atau *Skip*.
5. Klik tombol simpan (atau `Ctrl+Enter`). Baris yang berhasil disimpan hilang dari kotak teks; baris yang gagal tetap ada beserta alasannya.

**Semuanya opsional.** Anda boleh menulis judul saja. Singkatan di bawah hanya untuk mempercepat:

| Singkatan | Arti | Contoh |
| --- | --- | --- |
| `!` `!h` `!!` `!c` `!m` `!l` | Prioritas (`!` = High, `!!` = Critical) | `Fix login bug !c` |
| `@proyek` | Proyek (cukup sebagian nama) | `Retest booking @uat` |
| `~30m` `~1.5h` `~2jam` | Estimasi waktu | `Write release notes ~45m` |
| `>Nama` | Menunggu seseorang | `API timestamp >Andi` |
| `%75` | Progres | `Draft test plan %75` |
| `=> teks` | Langkah berikutnya (untuk baris blocked: alasan blocker) | `Prepare slides => collect numbers` |
| `#tag` | Tag | `Vendor call #vendor` |
| `tomorrow`, `next Fri`, `25 Nov`, `besok` | Tanggal (untuk baris "follow up..." jadi tanggal follow-up) | `Follow up Budi tomorrow` |
| `[x]` atau `done:` | Sudah selesai | `[x] Sent weekly report` |
| `[~]` atau `doing:` | Sedang dikerjakan | `doing: Review PRD` |
| `[!]` atau `blocked:` | Terhambat (alasan setelah `=>`) | `blocked: Vendor compliance => timestamp missing` |

Aturan penting:
- Tulis **`=>` paling akhir** di baris, karena teks setelahnya dianggap satu kesatuan.
- Bullet, nomor, baris kosong, dan `# judul` diabaikan, jadi Anda bisa menempel langsung dari catatan atau chat.
- Maksimal 100 baris sekali simpan.
- Kata tanggal Indonesia dipahami: `besok`, `lusa`, `minggu depan`, nama hari, dan bulan.

**Pencocokan pintar (typo tidak masalah):**
- `@bokking` dikenali sebagai proyek "UAT Booking". Proyek yang hanya disebut di dalam kalimat ("retest bokking cases") juga ditebak, dan ditandai di preview. Kata umum seperti `uat` atau `qa` tidak dipakai untuk menebak.
- Jika nama mirip tapi belum pasti, muncul **"Did you mean...? Use it"**. Jika proyek memang belum ada (`@zeta`), preview menulis bahwa **proyek baru akan dibuat**.
- Baris yang jelas merujuk **task yang sudah ada** tidak dibuat dobel. `[x] revew PRD v2` otomatis **mengupdate** task "Review PRD v2" menjadi Done. Baris biasa yang sudah ada dilewati. Judul yang hanya mirip cuma ditunjukkan ("Looks like TP-0012...").
- **Menempel teks yang sama dua kali tidak mengubah apa pun.**
- `>andy` menjadi "Andi" yang sudah ada, `#bokking` menjadi `#booking`. Salah ketik pada kata tanggal dan kata kunci (`tommorow`, `follw up`) juga diperbaiki dan diberi keterangan "Typo fixed".

**Rutinitas harian:** klik **Set up a daily routine**, tulis kegiatan yang Anda lakukan hampir setiap hari (satu baris per kegiatan, boleh pakai singkatan), lalu setiap hari cukup klik **Add my daily routine**. Judul yang sering Anda pakai juga muncul sebagai tombol kecil di **Often used**. Teks yang belum disimpan tidak hilang saat halaman di-refresh.

### 4.4 Quick add (satu task cepat)

Tombol **Quick add** di kanan atas. Ketik satu kalimat di kolom **Describe it in one sentence**, mis. `Follow up dengan engineering soal API besok`, tekan Enter, dan judul, kategori, tanggal follow-up, serta langkah berikutnya terisi otomatis. Periksa lalu **Create task**. Untuk banyak task sekaligus gunakan Brain Dump (ada tautannya di kotak itu).

### 4.5 Next Actions

Halaman ini menjawab "kerjakan apa sekarang?". Setiap task terbuka mendapat **skor 0-100**, **jenis rekomendasi**, **aksi yang konkret**, **alasan**, estimasi durasi, dan urutan pengerjaan. Klik "Score breakdown" untuk melihat kontribusi tiap faktor.

Jenis rekomendasi: Do Now, Do Today, Follow Up, Resolve Blocker, Continue Progress, Review, Approaching Deadline, Quick Win. Gunakan chip di atas untuk memfilter.

Tombol pada setiap rekomendasi:
- **Start now**: ubah ke In Progress (jika belum) dan masukkan ke rencana hari ini.
- **Mark action complete**: menandai *aksinya* selesai. **Tidak menyelesaikan task-nya.**
- **Follow up**: catat apa yang Anda tanyakan dan tanggal follow-up berikutnya.
- **Postpone**: sembunyikan sampai besok, 3 hari, atau seminggu; kembali otomatis.
- **Override**: tulis sendiri aksinya, dan boleh "pin" ke posisi teratas.
- **View task**: buka detail.

Di bawahnya ada rekomendasi UAT dan Issue, daftar **Postponed**, dan **Recently completed actions**. Bobot skor bisa diubah di **Settings**.

### 4.6 Today Planner

- **Bagian saran**: *Must do today* (jatuh tempo/terlambat/critical), *Follow up today*, *Recommended focus*, *Quick wins*, dan *Upcoming*. Tiap task muncul di satu bagian saja. Tombol **Add to plan** memasukkannya ke rencana.
- **My plan for today**: urutkan dengan drag (atau tombol panah), centang untuk menandai *pekerjaan hari ini* selesai (ini tidak menyelesaikan task), **Log work** (menit kerja, progres baru, catatan), pindahkan ke besok, atau hapus dari rencana.
- **Indikator**: progres harian dan estimasi beban kerja dibanding panjang hari kerja (atur di Settings).
- **Notes for today**: catatan bebas, tersimpan otomatis (ada status "Saving…/Saved").
- **Carried over**: rencana hari sebelumnya yang belum selesai. Pilih **Add to today** atau **Drop**.

### 4.6a Weekly Report (email update mingguan)

Halaman `/weekly` menyusun email update mingguan dari data task Anda, dengan format seperti ini:

```
Hi Mas Hizky, Mas Ari,

Berikut update saya untuk week 2 kemarin, dan plan untuk week 3.

Done last week:
- Add DG Validation during TO Audit — signed off (100%)

This week:
- New linehaul booking & charging scheme — in progress (80%), target: clear overdue milestone, ekspektasi selesai Rabu

Blocked / At risk:
- New linehaul booking & charging scheme — ada bug di create price SLS, perlu adjustment dari engineer

Product Dash updated: Yes

Regards,
Nama Anda
```

**Isi tiap bagian dibuat otomatis:**
- **Done last week**: task yang selesai (Done) minggu lalu, ditambah fitur UAT yang di-**sign off** minggu lalu (ditulis "signed off (100%)"). Task yang sama dengan fitur yang sudah di-sign off tidak ditulis dua kali. Issue yang selesai minggu lalu tersedia tetapi tidak dicentang.
- **This week**: task yang In Progress atau In Review, serta task To Do, Waiting, atau Blocked yang jatuh tempo paling lambat akhir minggu itu atau berprioritas High/Critical. Backlog tidak ikut. Setiap baris berisi status dan progres, **langkah berikutnya** (Next action) ditulis sebagai `target: ...`, dan `ekspektasi selesai {hari}` bila deadline-nya jatuh di minggu itu. Task Blocked dengan progres di atas 0 tetap ditulis "in progress", karena pekerjaannya jalan terus dan hambatannya ditulis di bagian bawah.
- **Blocked / At risk**: task Blocked (beserta alasan blocker-nya), task Waiting for Others (**menunggu siapa**, dan berapa hari bila 3 hari atau lebih), task yang melewati target, issue High/Critical atau yang sudah di-eskalasi, dan proyek berstatus At Risk. Yang tidak mendesak ada di daftar tetapi tidak dicentang.

**Cara memakainya:**
1. Buka **Weekly Report**. Minggu dipilih otomatis: Senin sampai Rabu melaporkan minggu lalu dan merencanakan minggu ini, Kamis sampai Minggu melaporkan minggu ini dan merencanakan minggu depan. Ganti dengan **Previous week** / **Next week**, atau **Auto** untuk kembali.
2. Di kiri, **centang atau hilangkan centang** pada setiap baris, ubah kalimatnya sesukanya, atau tambahkan baris sendiri dengan **Add a line**. Kolom kecil di bawah baris menunjukkan task asalnya (misalnya TP-0012), dan itu tidak ikut ke email.
3. Isi **To**, **Cc**, dan **Greet (names)** (misalnya `Mas Hizky, Mas Ari`), lalu pilih **Product Dash updated**: Yes, No, N/A, atau tidak ditulis. Subjek otomatis (`Weekly Plan Resanda — Aug Week 3`) dan bisa diubah.
4. Di kanan ada **Preview** yang langsung berubah. Klik **Copy email** (daftar poin ikut terbawa saat ditempel ke Gmail atau Outlook), atau **Copy as plain text**, **Copy subject**, atau **Open in email app**.
5. Buka **Template settings** untuk mengatur sapaan, kalimat pembuka, judul bagian, teks untuk daftar kosong, tanda tangan, dan nama pengirim. Klik **Save as my default** supaya minggu depan semuanya sudah siap. Tanda yang bisa dipakai: `{names}`, `{name}`, `{month}`, `{week}`, `{lastWeek}`, `{thisWeek}`.

Penomoran minggu mengikuti kebiasaan Anda: Senin sampai Minggu, dan minggu itu milik bulan tempat hari Kamisnya berada. Jadi 17 sampai 23 Agustus 2026 adalah **Aug Week 3**.

TaskPilot **tidak mengirim email**. Anda menyalinnya ke aplikasi email sendiri. Perubahan pada baris (centang dan kata-kata) berlaku untuk minggu itu saja, sedangkan yang disimpan lewat **Save as my default** adalah templatenya. **Open in email app** hanya mengisi penerima bila Anda mengetik alamat email.

### 4.7 Waiting & Blocked

Daftar semua task yang tertahan, yang paling mendesak di atas. Kolom: blocker, menunggu siapa, sejak kapan, berapa hari, tanggal follow-up, update terakhir, dan aksi yang disarankan. Tanda otomatis muncul untuk follow-up yang lewat, task tidak aktif, blocker belum selesai, deadline dekat, atau dependensi terlambat.

Menu titik tiga: **Follow up**, **Update blocker**, **Change PIC**, **Reschedule follow-up**, dan **Resolve blocker / Resume task** (mengembalikan ke In Progress).

### 4.8 Projects

- Tab **Ongoing** dan **Completed**. Kartu menampilkan progres dan kesehatan (Healthy / Watch / At risk).
- **Halaman proyek**: progres, jumlah task, blocker, overdue, issue terbuka, daftar task terbuka dan selesai, **milestone** (tambah, centang, hapus), **UAT features**, **Open issues**, deskripsi/risiko/catatan, dan timeline aktivitas. Tombol **Add task** langsung mengisi proyeknya.
- Menghapus proyek **tidak menghapus task-nya**; task hanya menjadi tanpa proyek.

### 4.9 Kanban Board

Tujuh kolom: Backlog, To Do, In Progress, Waiting, Blocked, In Review, Done. **Geser kartu** ke kolom lain untuk mengubah status (langsung tersimpan; jika gagal, kartu kembali dan muncul pesan). Memindahkan ke **Blocked** atau **Waiting** akan menanyakan alasan atau menunggu siapa. Di layar sentuh atau tanpa mouse, pakai dropdown **Move ... to** di kartu.

Filter proyek, prioritas, kategori, dan pencarian ada di atas. Klik judul kartu untuk panel detail. Kolom Done menampilkan 30 hari terakhir.

### 4.10 UAT Tracker

1. **New UAT feature**: isi nama, proyek, versi rilis, environment, owner, tanggal, status, dan status sign-off.
2. Buka fitur itu, lalu tambahkan **test case**:
   - **Add test case** satu per satu (judul, prasyarat, langkah, hasil yang diharapkan, hasil aktual, hasil, catatan), atau
   - **Import CSV** dari spreadsheet. Kolom yang dikenali: `Title` (wajib), `Prerequisites`, `Steps`, `Expected Result`, `Actual Result`, `Result` (Pass / Fail / Blocked / Not Run), `Remarks`, `Bug`. Pemisah koma, titik koma, atau tab semuanya bisa. Ada **Download template**. Anda akan melihat **preview dulu**, dan judul yang sudah ada dilewati sehingga aman diimpor ulang.
   - Tidak mau mengelola per test case? Di form fitur buka **Track counts without individual test cases** dan isi total/pass/fail/blocked.
3. **Ubah hasil** langsung lewat dropdown di setiap test case. Metrik langsung ikut berubah.
4. Menu titik tiga pada test case: **Edit**, **Attach evidence** (screenshot/PDF, maks 15 MB), **Link issue...**, **Create issue from this case** (membuat issue dengan langkah dan hasilnya), **Delete**.
5. Saat ada yang gagal dan perbaikan sudah dirilis: **Mark fix deployed**, lalu **Retest failed cases** (mengembalikan yang gagal ke Not Run untuk diuji ulang).
6. Jika semua lulus: **Request sign-off**, lalu **Mark signed off** (status menjadi Completed) atau **Rejected**.

Halaman fitur juga menampilkan **What to do next** (mis. "Execute the remaining 5 test cases", "Follow up with the responsible engineering team", "All test cases passed. Request sign-off") dan, bila datanya menyarankan status lain, tombol **Apply** untuk menerapkannya.

### 4.11 Issue & Escalation

1. **Report issue**: judul, deskripsi, proyek, kategori, severity, pelapor, PIC, tanggal, dampak, workaround, perkiraan selesai, dan tanggal follow-up.
2. Di halaman issue: kotak **Recommended next step** memberi tahu langkah berikutnya (kumpulkan info, validasi, eskalasi, minta update, verifikasi fix, konfirmasi ke pelapor, tutup).
3. **Post an update**: tulis temuan terbaru, boleh lampirkan screenshot dan atur follow-up berikutnya.
4. **Escalate**: isi eskalasi ke siapa dan alasannya; status menjadi Escalated dan tercatat di riwayat.
5. **Record fix**: isi root cause dan apa yang dilakukan. Centang "still needs to be verified" untuk status **Pending Verification**, atau biarkan kosong untuk langsung **Resolved**.
6. Setelah Resolved, **Close issue**. Dropdown status juga bisa dipakai untuk mengubah status kapan saja (membuka ulang issue menghapus tanggal selesai).

### 4.12 Calendar

Tampilan **month / week / day** (zona waktu mengikuti pengaturan, bawaan Asia/Jakarta). Menampilkan deadline task, follow-up task dan issue, target UAT, milestone, dan rencana hari. Tombol jenis di atas bisa menyembunyikan atau menampilkan tiap kategori.

**Geser** sebuah item ke hari lain untuk mengubah tanggalnya (perubahan ditulis ke itemnya sendiri), atau klik item lalu ubah tanggal di dialog dan pilih **Reschedule**. Tombol **Open** membuka item aslinya.

### 4.13 Reminders

Jenis reminder: terlambat, deadline mendekat, follow-up jatuh tempo, blocker belum selesai, task tidak aktif, target UAT, dan follow-up issue. Lihat lewat ikon **lonceng**, kartu di Dashboard, dan badge sidebar. Setiap reminder bisa di-**Snooze** (1 jam, sampai besok 09:00, atau 3 hari) atau di-**dismiss**.

**Penting:** reminder dievaluasi saat aplikasi dibuka, setiap kali halaman dimuat, dan tiap menit selama TaskPilot terbuka. TaskPilot **tidak bisa memberi notifikasi saat aplikasi atau komputer mati**.

### 4.14 Analytics

Pilih rentang: 7 hari, 30 hari, 90 hari, tahun ini, semua, atau rentang kustom. Kartu: task dibuat, task selesai, completion rate, overdue sekarang, rata-rata waktu selesai, dan rata-rata durasi blocker. Grafik: tren penyelesaian, produktivitas mingguan dan bulanan, distribusi status, prioritas, kategori, proyek, progres proyek, dan eksekusi UAT. Setiap grafik punya **View as table**. Definisi tiap angka tertulis di bawah halaman.

### 4.15 Search

Ketik di kotak atas atau tekan `/` (halamannya `/search`). Minimal 2 karakter. Mencari di task, proyek, UAT (termasuk langkah test case), issue, catatan dan komentar, stakeholder, dan tag, dengan kata yang cocok disorot. Karakter seperti `%` dan `_` dicari apa adanya.

### 4.16 Activity History

Setiap perubahan tercatat dan **tetap ada setelah aplikasi ditutup**. Filter per area (Tasks, Projects, UAT, Issues), kata kunci, dan tanggal; dikelompokkan per hari; tombol **Load 100 more**.

### 4.17 Settings

**General and scoring:**
- **Profile and display**: nama tampilan (untuk sapaan di Dashboard), format tanggal, tema, tampilan task bawaan, tata letak Dashboard. Zona waktu hanya tampil (read-only); ubah lewat `NEXT_PUBLIC_APP_TIMEZONE` di `.env`, lalu jalankan ulang.
- **Priority scoring weights**: bobot lima faktor skor (deadline, prioritas bisnis, follow-up/blocker, inaktivitas, usaha). Bobot bersifat relatif, tidak harus berjumlah 100.
- **Engine and reminders**: batas task dianggap tidak aktif, batas quick win, lead time reminder, jarak follow-up bawaan, panjang hari kerja.
- **Database backup**: backup otomatis harian dan berapa yang disimpan.
- **AI integration**: tombol aktif/nonaktif untuk asisten AI (fitur ini belum tersedia). Kunci API tidak pernah disimpan di database atau dikirim ke browser.

**Data and backup** (lihat 4.18).

### 4.18 Export, Backup, dan Restore

Buka **Settings, lalu tab Data and backup** (`/settings/data`).

**Export** (Tasks, Projects, UAT features, UAT test cases, Issues, Activity History):
- **Excel (.xlsx)**: file Excel asli dengan header terkunci, filter, dan tanggal sungguhan. Sheet terkait ikut (subtask, komentar, milestone, test case, update issue). Baris **"Everything in one Excel workbook"** berisi semua data dalam satu file.
- **CSV**: satu tabel datar yang terbuka benar di Excel.
- **JSON**: semua field.

**Backup:**
- **Back up now (data)** menyimpan file JSON ke folder `backups/`. **Back up now with files (ZIP)** juga menyertakan lampiran dan bukti.
- Backup otomatis harian (hanya data) dibuat saat Anda membuka aplikasi, dan yang lama dihapus sesuai jumlah yang Anda atur.
- Simpan **satu salinan di tempat lain** (flashdisk, folder cloud), karena cadangan di komputer yang sama tidak melindungi dari disk rusak.

**Restore (memulihkan):**
1. Pilih file backup (`.json` atau `.zip`).
2. Pilih mode: **Add what is missing** (aman, bawaan: tidak mengubah apa pun yang sudah ada, duplikat dilewati) atau **Replace everything** (menghapus semua lalu memuat backup; wajib mengetik `REPLACE`, dan salinan pengaman otomatis disimpan lebih dulu).
3. Klik **Preview what will happen** dan baca laporannya (berapa yang ditambah, sudah ada, berbeda, dilewati).
4. Baru klik tombol restore. Restore berjalan sebagai satu transaksi: jika gagal, tidak ada yang berubah. File yang rusak, dari versi lebih baru, atau bukan backup TaskPilot ditolak beserta alasannya.

---

## 5. Rumus dan istilah

**Skor prioritas (0-100)** adalah rata-rata berbobot lima komponen, masing-masing 0 sampai 1. Bobot bawaan:

| Komponen | Bobot | Naik jika |
| --- | --- | --- |
| Deadline | 30% | Sudah lewat, hari ini, besok, dan seterusnya |
| Prioritas bisnis | 25% | Prioritas task tinggi dan kepentingan bisnis (1-5) tinggi |
| Follow-up / blocker | 20% | Blocked makin lama, menunggu orang lain dan follow-up jatuh tempo, in review |
| Inaktivitas | 15% | Lama tidak ada pembaruan |
| Usaha | 10% | Sisa pekerjaan kecil (quick win) |

Task Done atau Cancelled tidak pernah direkomendasikan.

**Progres proyek:** rata-rata progres semua task (Done dihitung 100%, Cancelled diabaikan).

**Kesehatan proyek:** *At risk* jika ditandai At Risk, ada task terlambat, atau 2 atau lebih blocked. *Watch* jika 1 blocked, ada yang menunggu orang lain, atau proyek ditunda. Selain itu *Healthy*.

**Metrik UAT** (dua hal berbeda, jangan tertukar):
- **Execution progress** = (Pass + Fail) dibagi Total: seberapa banyak yang sudah dicoba.
- **Pass rate** = Pass dibagi (Pass + Fail): seberapa baik hasil dari yang sudah dicoba.
- **Passed of total** = Pass dibagi Total. **Remaining** = Not Run + Blocked.
- Sign-off baru bisa diminta jika semua test case lulus.

**Completion rate:** di Dashboard = Done dibagi semua task (Cancelled tidak dihitung). Di Analytics = dari task yang dibuat pada rentang terpilih, berapa persen yang kini Done.

---

## 6. Tips agar cepat

- Gunakan **Brain Dump** untuk apa pun yang lebih dari satu task, dan pilih **Already done** untuk rekap sore hari.
- Simpan kegiatan rutin di **daily routine** supaya tidak mengetik ulang.
- Tulis hanya **judul**; tambahkan `!h`, `@proyek`, `~30m`, atau `besok` hanya jika memang terpikir.
- Isi **estimasi** (`~30m`) pada task kecil agar muncul di **Quick wins**.
- Selalu isi **langkah berikutnya** (`=> ...`) pada task penting; Next Actions memakainya sebagai aksi yang disarankan.
- Gunakan tombol **Follow up** setiap kali Anda menghubungi seseorang, supaya tanggal follow-up berikutnya tercatat dan reminder muncul tepat waktu.
- Tekan `/` untuk mencari, `Ctrl+Enter` untuk menyimpan di Brain Dump.

---

## 7. Masalah umum

| Masalah | Penyelesaian |
| --- | --- |
| PowerShell: "running scripts is disabled" | Pakai `npm.cmd install` dan `npm.cmd run dev`, atau Command Prompt, atau klik `start-taskpilot.bat` |
| Banner merah "database is missing tables" | Hentikan aplikasi, jalankan `npm run db:prepare`, lalu jalankan lagi. Data tidak hilang |
| "Port 3000 is busy" | Tutup aplikasi lain yang memakai port itu, atau jalankan `npx next dev -p 3001` |
| Tanggal terlihat bergeser satu hari | Semua tanggal memakai zona waktu aplikasi (bawaan Asia/Jakarta), bukan zona komputer. Lihat Settings |
| Reminder tidak muncul saat aplikasi mati | Memang tidak bisa; reminder dievaluasi saat TaskPilot terbuka |
| Pesan error saat `npm install` terkait Prisma | Langkah itu perlu internet sekali; sebagian jaringan kantor memblokir `binaries.prisma.sh` |
| Ingin mengulang dari nol | Hentikan aplikasi, **buat backup dulu**, hapus `data/taskpilot.db`, lalu jalankan lagi. Ini menghapus data secara permanen |

---

## 8. Data, privasi, dan cadangan

- Semua data ada di komputer Anda: `data/taskpilot.db` (database), `uploads/` (lampiran dan bukti), `backups/` (cadangan). Tidak ada yang dikirim ke server mana pun.
- Folder tersebut dan `.env` tidak ikut di Git (sudah diatur di `.gitignore`).
- Cara paling sederhana mencadangkan semuanya: hentikan aplikasi, lalu salin `data/` dan `uploads/` ke tempat aman.
