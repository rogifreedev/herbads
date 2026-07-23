import { describe, expect, it } from "vitest";
import { isLikelyLowValueProductQuestion } from "@/lib/comment-candidate-filter";

describe("isLikelyLowValueProductQuestion", () => {
  it.each([
    "Was kostet das Produkt?",
    "Wie lange dauert der Versand?",
    "Ist das auch in Blau verfügbar?",
    "Quanto costa la spedizione?",
    "How can I order this?"
  ])("filters transactional product question: %s", (message) => {
    expect(isLikelyLowValueProductQuestion(message)).toBe(true);
  });

  it.each([
    "Endlich muss ich mich morgens nicht mehr verstecken.",
    "Funktioniert das wirklich bei empfindlicher Haut?",
    "Der Versand war schnell und die Wirkung ist super.",
    "Meine größte Sorge war immer der künstliche Look."
  ])("keeps comments with potential marketing language: %s", (message) => {
    expect(isLikelyLowValueProductQuestion(message)).toBe(false);
  });
});
