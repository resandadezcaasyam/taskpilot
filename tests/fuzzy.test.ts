import { describe, expect, it } from "vitest";
import { closeEnough, distance, fixTypos, normalize, phoneticKey, similarity, snapName, titleSimilarity, tokens } from "@/lib/fuzzy";

describe("fuzzy basics", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normalize("  Café-Bar_Naïve!! ")).toBe("cafe bar naive");
    expect(tokens("Follow up with the API, dan untuk Andi")).toEqual(["follow", "up", "api", "andi"]);
  });
  it("edit distance counts a swapped pair as one mistake", () => {
    expect(distance("booking", "bokking")).toBe(1);
    expect(distance("teh", "the")).toBe(1);
    expect(distance("abc", "")).toBe(3);
    expect(similarity("abc", "abc")).toBe(1);
  });
  it("words match through typos, but short words must be exact", () => {
    expect(closeEnough("bokking", "booking")).toBe(true);
    expect(closeEnough("tommorow", "tomorrow")).toBe(true);
    expect(closeEnough("api", "apt")).toBe(false); // too short to guess
    expect(closeEnough("uat", "uar")).toBe(false);
    expect(closeEnough("review", "preview")).toBe(true);
    expect(closeEnough("report", "resorts")).toBe(false); // two edits apart
    expect(closeEnough("compliance", "complience")).toBe(true);
  });
  it("Indonesian name spellings sound alike", () => {
    expect(phoneticKey("Boedi")).toBe(phoneticKey("Budi"));
    expect(closeEnough("andy", "andi")).toBe(true);
    expect(closeEnough("djaja", "jaja")).toBe(true);
    expect(closeEnough("budi", "bagus")).toBe(false);
  });
});

describe("title similarity ignores filler words and tolerates typos", () => {
  it("same task, different wording", () => {
    expect(titleSimilarity("Follow up Andi about API timestamp", "Follow up with Andi on API timestamp").dice).toBe(1);
    expect(titleSimilarity("Revew PRD v2", "Review PRD v2").dice).toBe(1);
    expect(titleSimilarity("Kirim laporan untuk Budi", "Kirim laporan Budi").dice).toBe(1);
  });
  it("different tasks stay apart", () => {
    expect(titleSimilarity("Review PRD", "Review contract").dice).toBeLessThan(0.6);
    expect(titleSimilarity("Follow up Andi about API", "Follow up Budi about API").dice).toBe(0.75);
    expect(titleSimilarity("", "x").dice).toBe(0);
  });
});

describe("snapName", () => {
  const people = ["Andi", "Budi Santoso", "Sari Wulandari", "Budi Hartono"];
  it("fixes typos and sound-alikes", () => {
    expect(snapName("andy", people)).toBe("Andi");
    expect(snapName("ANDI", people)).toBe("Andi");
    expect(snapName("sary", people)).toBe("Sari Wulandari");
  });
  it("expands a unique first name; leaves ambiguous or unknown names alone", () => {
    expect(snapName("sari", people)).toBe("Sari Wulandari");
    expect(snapName("budi", people)).toBe("budi"); // two Budis
    expect(snapName("Zed", people)).toBe("Zed");
    expect(snapName("Backend team", people)).toBe("Backend team");
  });
});

describe("fixTypos", () => {
  it("repairs date and keyword words and says what it changed", () => {
    expect(fixTypos("Call vendor tommorow")).toEqual({ text: "Call vendor tomorrow", fixes: [["tommorow", "tomorrow"]] });
    expect(fixTypos("Meet on Fridy").text).toBe("Meet on Friday");
    expect(fixTypos("Fridy").text).toBe("Friday"); // keeps the capital
    expect(fixTypos("follw up Andi").text).toBe("follow up Andi");
    expect(fixTypos("retst the booking").text).toBe("retest the booking");
    expect(fixTypos("Nvember 25").text).toBe("November 25");
  });
  it("never rewrites ordinary words, plurals or short words", () => {
    for (const t of ["Review the documents", "Meetings tomorrow", "released notes", "Send the report", "Get an api key", "May is busy", "Monday"]) {
      expect(fixTypos(t).fixes, t).toEqual([]);
      expect(fixTypos(t).text).toBe(t);
    }
  });
});
