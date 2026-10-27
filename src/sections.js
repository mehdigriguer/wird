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
import fajrSections from "./data/al-fajr-sections.json" with { type: "json" };
import baladSections from "./data/al-balad-sections.json" with { type: "json" };
import shamsSections from "./data/ash-shams-sections.json" with { type: "json" };
import laylSections from "./data/al-layl-sections.json" with { type: "json" };
import duhaSections from "./data/ad-duha-sections.json" with { type: "json" };
import sharhSections from "./data/ash-sharh-sections.json" with { type: "json" };
import tinSections from "./data/at-tin-sections.json" with { type: "json" };
import alaqSections from "./data/al-alaq-sections.json" with { type: "json" };
import qadrSections from "./data/al-qadr-sections.json" with { type: "json" };
import bayyinahSections from "./data/al-bayyinah-sections.json" with { type: "json" };
import zalzalahSections from "./data/az-zalzalah-sections.json" with { type: "json" };
import adiyatSections from "./data/al-adiyat-sections.json" with { type: "json" };
import qariahSections from "./data/al-qariah-sections.json" with { type: "json" };
import takathurSections from "./data/at-takathur-sections.json" with { type: "json" };
import asrSections from "./data/al-asr-sections.json" with { type: "json" };
import humazahSections from "./data/al-humazah-sections.json" with { type: "json" };
import filSections from "./data/al-fil-sections.json" with { type: "json" };
import qurayshSections from "./data/quraysh-sections.json" with { type: "json" };
import maunSections from "./data/al-maun-sections.json" with { type: "json" };
import kawtharSections from "./data/al-kawthar-sections.json" with { type: "json" };
import kafirunSections from "./data/al-kafirun-sections.json" with { type: "json" };
import nasrSections from "./data/an-nasr-sections.json" with { type: "json" };
import masadSections from "./data/al-masad-sections.json" with { type: "json" };
import ikhlasSections from "./data/al-ikhlas-sections.json" with { type: "json" };
import falaqSections from "./data/al-falaq-sections.json" with { type: "json" };
import nasSections from "./data/an-nas-sections.json" with { type: "json" };

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
  fajrSections,
  baladSections,
  shamsSections,
  laylSections,
  duhaSections,
  sharhSections,
  tinSections,
  alaqSections,
  qadrSections,
  bayyinahSections,
  zalzalahSections,
  adiyatSections,
  qariahSections,
  takathurSections,
  asrSections,
  humazahSections,
  filSections,
  qurayshSections,
  maunSections,
  kawtharSections,
  kafirunSections,
  nasrSections,
  masadSections,
  ikhlasSections,
  falaqSections,
  nasSections,
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
  fajrSections,
  baladSections,
  shamsSections,
  laylSections,
  duhaSections,
  sharhSections,
  tinSections,
  alaqSections,
  qadrSections,
  bayyinahSections,
  zalzalahSections,
  adiyatSections,
  qariahSections,
  takathurSections,
  asrSections,
  humazahSections,
  filSections,
  qurayshSections,
  maunSections,
  kawtharSections,
  kafirunSections,
  nasrSections,
  masadSections,
  ikhlasSections,
  falaqSections,
  nasSections,
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
