import { DEFAULT_WEEKLY_CONFIG, type WeeklyConfig } from "@/lib/weekly";

/** The email exactly as it was written by hand (week 3 of August 2026). */
export const EXAMPLE_TEXT = `Hi Mas Hizky, Mas Ari,

Berikut update saya untuk week 2 kemarin, dan plan untuk week 3.

Done last week:
- Add DG Validation during TO Audit — signed off (100%)
- TO Allocation: Ad-hoc Rule Improvement — signed off (100%)

This week:
- New linehaul booking & charging scheme for By Month/Dedicated truck — in progress (80%), target: clear overdue milestone, ekspektasi selesai Rabu
- Vendor Loading Allocation (TO Allocation Phase 2) — in progress (85%), ekspektasi selesai Rabu
- Fleet Maintenance: Work Orders, Scheduled Servicing & Parts Registry — in progress (83%), ekspektasi selesai Jumat

Blocked / At risk:
- New linehaul booking & charging scheme for By Month/Dedicated truck — ada bug di create price SLS, perlu adjustment dari engineer dan menunggu generate backend dari Eng Regional untuk create Billing Order
- Vendor Loading Allocation (TO Allocation Phase 2) — ada settingan backend yang bug sehingga belum bisa create allocation

Product Dash updated: Yes

Regards,
Resanda Dezca Asyam
SPX Express | Product | ID Product Support`;

export const EXAMPLE_CONFIG: WeeklyConfig = {
  ...DEFAULT_WEEKLY_CONFIG,
  to: "Hizky, Adhyan",
  greetingNames: "Mas Hizky, Mas Ari",
  senderName: "Resanda",
  signature: "Regards,\nResanda Dezca Asyam\nSPX Express | Product | ID Product Support",
};
export const EXAMPLE_SECTIONS = {
  done: ["Add DG Validation during TO Audit — signed off (100%)", "TO Allocation: Ad-hoc Rule Improvement — signed off (100%)"],
  plan: [
    "New linehaul booking & charging scheme for By Month/Dedicated truck — in progress (80%), target: clear overdue milestone, ekspektasi selesai Rabu",
    "Vendor Loading Allocation (TO Allocation Phase 2) — in progress (85%), ekspektasi selesai Rabu",
    "Fleet Maintenance: Work Orders, Scheduled Servicing & Parts Registry — in progress (83%), ekspektasi selesai Jumat",
  ],
  blocked: [
    "New linehaul booking & charging scheme for By Month/Dedicated truck — ada bug di create price SLS, perlu adjustment dari engineer dan menunggu generate backend dari Eng Regional untuk create Billing Order",
    "Vendor Loading Allocation (TO Allocation Phase 2) — ada settingan backend yang bug sehingga belum bisa create allocation",
  ],
};

