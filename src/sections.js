import kahfSections from "./data/al-kahf-sections.json" with { type: "json" };
import mulkSections from "./data/al-mulk-sections.json" with { type: "json" };
import nabaSections from "./data/an-naba-sections.json" with { type: "json" };
import naziatSections from "./data/an-naziat-sections.json" with { type: "json" };
import abasaSections from "./data/an-abasa-sections.json" with { type: "json" };
import takwirSections from "./data/at-takwir-sections.json" with { type: "json" };
import infitarSections from "./data/al-infitar-sections.json" with { type: "json" };
import mutaffifinSections from "./data/al-mutaffifin-sections.json" with { type: "json" };
import inshiqaqSections from "./data/al-inshiqaq-sections.json" with { type: "json" };
import burujSections from "./data/al-buruj-sections.json" with { type: "json" };
import tariqSections from "./data/at-tariq-sections.json" with { type: "json" };
import alaSections from "./data/al-ala-sections.json" with { type: "json" };
import ghashiyahSections from "./data/al-ghashiyah-sections.json" with { type: "json" };

export const LEGACY_SEGMENTATION_IDS = ["naziat-v1", "mulk-v1"];

export const SECTIONS = [
  kahfSections,
  mulkSections,
  nabaSections,
  naziatSections,
  abasaSections,
  takwirSections,
  infitarSections,
  mutaffifinSections,
  inshiqaqSections,
  burujSections,
  tariqSections,
  alaSections,
  ghashiyahSections,
];
export {
  kahfSections,
  mulkSections,
  nabaSections,
  naziatSections,
  abasaSections,
  takwirSections,
  infitarSections,
  mutaffifinSections,
  inshiqaqSections,
  burujSections,
  tariqSections,
  alaSections,
  ghashiyahSections,
};

export function sectionFor(surah, verse) {
  const sections = SECTIONS.find((s) => s.surah === surah);
  if (!sections) return null;
  return (
    sections.blocks.find((block) => block.from <= verse && verse <= block.to) ??
    null
  );
}

export function sectionsForSurah(surah) {
  return SECTIONS.find((s) => s.surah === surah) ?? null;
}
