import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import data from "./data/quran.json";
import {
  PRAYERS,
  buildCorpus,
  canUndo,
  forecast,
  isValidRange,
  knownRange,
  juzCoverage,
  learnedJuz,
  learnedPages,
  localDate,
  newState,
  planDay,
  recordPrayer,
  rollover,
  undoLast,
  updateKnown,
} from "./planner.js";
import {
  STORAGE_KEY,
  downloadBackup,
  downloadText,
  loadState,
  parseBackup,
  validateState,
} from "./storage.js";
import { sectionFor, sectionsForSurah } from "./sections.js";
import { supabase } from "./supabase.js";
import {
  clearSyncMeta,
  decideFirstSync,
  decideRefresh,
  fetchRemote,
  loadSyncMeta,
  pushRemote,
  saveSyncMeta,
} from "./sync.js";
import { AuthForm, PasswordRecoveryForm, SyncConflictChoice, SYNC_LABELS } from "./account.jsx";
import { Icon } from "./Icon.jsx";
import "./styles.css";

const chapters = data.chapters;
const pageLabel = (n) => ({ 0.25: "¼ page", 0.5: "½ page", 1: "1 page" })[n];
const verseCount = (passages) =>
  passages.reduce((n, p) => n + (p && !p.blocked ? p.to - p.from + 1 : 0), 0);
const navItems = [
  ["today", "list", "Programme"],
  ["prayers", "moon", "Prières"],
  ["memory", "book", "Mémorisation"],
  ["sections", "spark", "Découpage"],
];
const accountNavItem = ["account", "user", "Mes données"];


function Modal({ title, subtitle, children, onClose, compact = false }) {
  const ref = useRef(null);
  const opener = useRef(document.activeElement);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      opener.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={compact ? "compact" : undefined}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function SurahPicker({ known, ranges, initialSearch = "", onSave, onClose }) {
  const [selection, setSelection] = useState(new Set(known));
  const [draftRanges, setDraftRanges] = useState(ranges);
  const invalidChapter = chapters.find(
    (c) =>
      selection.has(c.id) &&
      !isValidRange(knownRange(c, draftRanges), c.verses.length),
  );
  const setRange = (chapter, field, value) =>
    setDraftRanges((current) => ({
      ...current,
      [chapter.id]: { ...knownRange(chapter, current), [field]: value },
    }));
  function saveSelection() {
    if (invalidChapter) return;
    const partialRanges = Object.fromEntries(
      [...selection].flatMap((id) => {
        const chapter = chapters[id - 1];
        const range = knownRange(chapter, draftRanges);
        return range.from === 1 && range.to === chapter.verses.length
          ? []
          : [[id, range]];
      }),
    );
    onSave([...selection], partialRanges);
  }
  const [search, setSearch] = useState(initialSearch);
  const normalize = (text) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visible = chapters.filter((c) =>
    normalize(`${c.id} ${c.name} ${c.translation} ${c.arabic}`).includes(
      normalize(search),
    ),
  );
  const toggle = (id) =>
    setSelection((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <Modal
      title="Ce que tu connais déjà"
      subtitle="Coche tes sourates, puis indique les versets que tu connais par cœur."
      onClose={onClose}
    >
      <label className="search-label">
        <span className="sr-only">Rechercher une sourate</span>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une sourate, un numéro…"
          type="search"
        />
      </label>
      <div className="picker-tools">
        <span>
          {selection.size} sourate{selection.size > 1 ? "s" : ""} sélectionnée
          {selection.size > 1 ? "s" : ""}
        </span>
        <button
          className="text-button"
          onClick={() =>
            setSelection(
              new Set(
                chapters
                  .filter((c) => c.id >= 78)
                  .map((c) => c.id)
                  .concat([...selection]),
              ),
            )
          }
        >
          Ajouter Juz ‘Amma
        </button>
      </div>
      <div className="surah-picker">
        {visible.map((c) => {
          const range = knownRange(c, draftRanges);
          const valid = isValidRange(range, c.verses.length);
          const complete = range.from === 1 && range.to === c.verses.length;
          return (
            <div key={c.id} className="surah-entry">
              <label
                className={`surah-option ${selection.has(c.id) ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selection.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="surah-number">{c.id}</span>
                <span className="surah-name">
                  <strong>{c.name}</strong>
                  <small>
                    {c.verses.length} versets · {c.translation}
                  </small>
                </span>
                <span className="arabic" lang="ar" dir="rtl">
                  {c.arabic}
                </span>
              </label>
              {selection.has(c.id) && (
                <div className="surah-range">
                  <div className="range-heading">
                    <span>
                      {complete
                        ? "Sourate entière"
                        : "Sourate en cours d’apprentissage"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        setDraftRanges((current) => ({
                          ...current,
                          [c.id]: { from: 1, to: c.verses.length },
                        }))
                      }
                    >
                      Toute la sourate<span className="sr-only"> {c.name}</span>
                    </button>
                  </div>
                  <div className="range-fields">
                    <label>
                      Du verset
                      <input
                        aria-label={`Premier verset ${c.name}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={c.verses.length}
                        step="1"
                        required
                        value={range.from}
                        aria-invalid={!valid}
                        onChange={(e) =>
                          setRange(
                            c,
                            "from",
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      Au verset
                      <input
                        aria-label={`Dernier verset ${c.name}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={c.verses.length}
                        step="1"
                        required
                        value={range.to}
                        aria-invalid={!valid}
                        onChange={(e) =>
                          setRange(
                            c,
                            "to",
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </label>
                    {valid && (
                      <small>
                        {range.to - range.from + 1} / {c.verses.length} versets
                      </small>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!visible.length && (
          <p className="empty-small">Aucune sourate trouvée.</p>
        )}
      </div>
      {invalidChapter && (
        <p className="range-error" role="alert">
          {invalidChapter.name} : indique un début et une fin entre 1 et{" "}
          {invalidChapter.verses.length}, dans cet ordre.
        </p>
      )}
      <p className="form-note">
        Seuls les versets indiqués entrent dans ta révision. Une plage continue
        par sourate. Al-Fatiha compte dans ta mémorisation, mais pas dans la
        rotation des passages récités après elle.
      </p>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          disabled={!!invalidChapter}
          onClick={saveSelection}
        >
          Enregistrer ma sélection <Icon name="check" size={17} />
        </button>
      </footer>
    </Modal>
  );
}

// Les positions visent toujours une prière activée, sinon l'extra ne
// s'afficherait jamais (les extras s'insèrent après une prière du programme).
function extraPosition(name, enabled) {
  const on = (id) => enabled[id] === true;
  const nightAnchor = on("witr")
    ? "witr"
    : on("chafaa")
      ? "chafaa"
      : on("apres-isha")
        ? "apres-isha"
        : "isha";
  switch (name) {
    case "Fajr":
      return null;
    case "Duha":
      return "subh";
    case "Avant Dhuhr":
      return on("duha") ? "duha" : "subh";
    case "Après Dhuhr":
      return "dhuhr";
    case "Après Maghreb":
      return "maghrib";
    case "Après Isha":
      return "isha";
    case "Chafaa":
      return on("apres-isha") ? "apres-isha" : "isha";
    case "Witr":
      return on("chafaa") ? "chafaa" : on("apres-isha") ? "apres-isha" : "isha";
    case "Qiyam/Tahajjud":
      return nightAnchor;
    default:
      return null;
  }
}

// Une prière déjà au programme via les réglages n'est pas proposée ici ;
// une prière désactivée peut être ajoutée juste pour aujourd'hui.
const EXTRA_GROUPS = [
  {
    cat: "Sunnah mu’akkadah (rawatib)",
    prayers: [
      ["Fajr", "fajr"],
      ["Avant Dhuhr", "avant-dhuhr"],
      ["Après Dhuhr", "apres-dhuhr"],
      ["Après Maghreb", "apres-maghrib"],
      ["Après Isha", "apres-isha"],
    ],
  },
  {
    cat: "Sunnah mu’akkadah",
    prayers: [
      ["Chafaa", "chafaa"],
      ["Witr", "witr"],
    ],
  },
  {
    cat: "Sunnah ghayr mu’akkadah",
    prayers: [
      ["Duha", "duha"],
      ["Qiyam/Tahajjud", "qiyam"],
    ],
  },
];

function extraChoiceGroups(enabled) {
  const on = (id) => enabled[id] === true;
  return EXTRA_GROUPS.map((group) => ({
    cat: group.cat,
    names: group.prayers.filter(([, id]) => !on(id)).map(([name]) => name),
  })).filter((group) => group.names.length);
}

// Rakaat canoniques : seule Qiyam/Tahajjud reste libre (prière de nuit,
// par paires, sans nombre fixe).
const EXTRA_RAKAAT = {
  Fajr: 2,
  Duha: 2,
  "Avant Dhuhr": 4,
  "Après Dhuhr": 2,
  "Après Maghreb": 2,
  "Après Isha": 2,
  Chafaa: 2,
  Witr: 1,
};

function ExtraPicker({ prayersEnabled, onAdd, onClose, onGoSettings }) {
  const groups = extraChoiceGroups(prayersEnabled);
  const choices = groups.flatMap((group) => group.names);
  const [name, setName] = useState(choices[0]);
  const [rakaat, setRakaat] = useState(EXTRA_RAKAAT[choices[0]] ?? 2);
  const [limit, setLimit] = useState(0.5);
  const locked = EXTRA_RAKAAT[name] !== undefined;
  if (!choices.length)
    return (
      <Modal title="Ajouter une prière" onClose={onClose}>
        <p className="form-note">
          Toutes les prières sont déjà au programme. Désactive-en une dans les
          réglages pour l’ajouter juste aujourd’hui.
        </p>
      </Modal>
    );
  return (
    <Modal title="Ajouter une prière" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            id: `extra-${crypto.randomUUID()}`,
            name,
            rakaat,
            after: extraPosition(name, prayersEnabled),
            limit,
          });
        }}
      >
        <div role="radiogroup" aria-label="Prière">
          {groups.map((group) => (
            <div className="extra-group" key={group.cat}>
              <span className="tree-cat">{group.cat}</span>
              <div className="extra-grid">
                {group.names.map((p) => (
                  <label
                    key={p}
                    className={`editor-option extra-option ${name === p ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="extra"
                      aria-label={p}
                      checked={name === p}
                      onChange={() => {
                        setName(p);
                        setRakaat(EXTRA_RAKAAT[p] ?? 2);
                      }}
                    />
                    <strong>{p}</strong>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {!locked && (
          <div className="field">
            Nombre de rakaat
            <QuantityPicker
              value={rakaat}
              onChange={setRakaat}
              label="Nombre de rakaat"
              options={[2, 4, 6, 8, 10, 12]}
              stretch
            />
          </div>
        )}
        <div className="field">
          Nombre de page par rakaat
          <QuantityPicker
            value={limit}
            onChange={setLimit}
            label="Nombre de page par rakaat"
            stretch
          />
        </div>
        <div className="notice">
          <Icon name="spark" />
          <p>
            Ajout exceptionnel, valable aujourd’hui seulement. Pour la prier
            tous les jours, active-la dans{" "}
            <button
              type="button"
              className="text-button link-inline"
              onClick={onGoSettings}
            >
              Prières
            </button>
            .
          </p>
        </div>
        <footer className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" type="submit">
            Ajouter aujourd’hui <Icon name="plus" size={17} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function SectionsDetail({ sections }) {
  return (
    <>
      <div className="theme-list">
        {sections.blocks.map((block) => (
          <section className="theme-block" key={block.from}>
            <div className="theme-heading">
              <h3>{block.title}</h3>
              <span>
                {block.from}–{block.to}
              </span>
            </div>
          </section>
        ))}
      </div>
      <div className="section-sources">
        <h4>Sources</h4>
        <p>
          <a
            href={sections.sources.tafsir.url}
            target="_blank"
            rel="noreferrer"
          >
            Ibn Kathir (Quran.com)
          </a>{" "}
          ·{" "}
          <a href={sections.sources.qsu.url} target="_blank" rel="noreferrer">
            QSU, version 1
          </a>{" "}
          ({sections.sources.qsu.authors.join(", ")},{" "}
          <a
            href={sections.sources.qsu.licenseUrl}
            target="_blank"
            rel="noreferrer"
          >
            licence CC BY-NC 3.0
          </a>
          ). Récupérées le{" "}
          {new Date(sections.retrievedAt).toLocaleDateString("fr-FR")}.
        </p>
      </div>
    </>
  );
}

const RAKAAT_STEPS = [2, 4, 6, 8, 10, 12];
const nextLimitValue = { 0.25: 0.5, 0.5: 1, 1: 0.25 };

function QuantityPicker({
  value,
  onChange,
  label,
  options = [0.25, 0.5, 1],
  stretch = false,
}) {
  const shortLabel = (n) => ({ 0.25: "¼", 0.5: "½", 1: "1" })[n] ?? String(n);
  const longLabel = (n) => pageLabel(n) ?? `${n} rakaat`;
  return (
    <div
      className={`segmented compact${stretch ? " stretch" : ""}`}
      role="group"
      aria-label={label}
    >
      {options.map((n) => (
        <button
          key={n}
          type="button"
          className={value === n ? "selected" : ""}
          aria-pressed={value === n}
          aria-label={longLabel(n)}
          onClick={() => onChange(n)}
        >
          {shortLabel(n)}
        </button>
      ))}
    </div>
  );
}

const WELCOME_PRESETS = [
  {
    id: "juz30",
    title: "Juz 30 complet",
    detail: "D’An-Naba à An-Nas · 37 sourates",
    surahs: Array.from({ length: 37 }, (_, i) => 78 + i),
  },
  {
    id: "last10",
    title: "Les 10 dernières",
    detail: "D’Al-Fil à An-Nas · 10 sourates",
    surahs: Array.from({ length: 10 }, (_, i) => 105 + i),
  },
  {
    id: "qul",
    title: "Al-Fatiha + les Qul",
    detail: "Al-Ikhlas, Al-Falaq, An-Nas",
    surahs: [1, 112, 113, 114],
  },
];

function Welcome({ fatihaOnly, onPreset, onCustom }) {
  return (
    <section className="welcome">
      <span className="eyebrow">
        <span /> MÉMORISER. RÉVISER. RECOMMENCER.
      </span>
      <h1>
        Un peu chaque jour.
        <br />
        <em>pour ne jamais oublier.</em>
      </h1>
      <p className="welcome-lead">
        Wird répartit ce que tu as mémorisé dans tes prières, thème par
        thème, pour tout réviser régulièrement sans y penser.
      </p>
      {fatihaOnly && (
        <p className="welcome-note">
          Al-Fatiha est déjà comptée dans ta mémorisation. Ajoute les
          sourates que tu récites après elle.
        </p>
      )}
      <div className="welcome-steps">
        <div>
          <span className="step-number">1</span>
          <strong>Dis ce que tu sais</strong>
          <p>
            Fatiha, Juz 30 ou n’importe quelles sourates, même en partie.
          </p>
        </div>
        <div>
          <span className="step-number">2</span>
          <strong>On répartit</strong>
          <p>
            Chaque thème trouve sa place dans une prière, au plafond que tu
            choisis.
          </p>
        </div>
        <div>
          <span className="step-number">3</span>
          <strong>Tu valides</strong>
          <p>Après chaque prière, un clic. Le cycle avance tout seul.</p>
        </div>
      </div>
      <span className="eyebrow welcome-presets-label">
        <span /> POUR COMMENCER VITE
      </span>
      <div className="welcome-presets">
        {WELCOME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-card"
            onClick={() => onPreset(preset.surahs)}
          >
            <strong>{preset.title}</strong>
            <small>{preset.detail}</small>
          </button>
        ))}
      </div>
      <p className="welcome-custom">
        Tu préfères choisir toi-même ?{" "}
        <button type="button" className="text-button" onClick={onCustom}>
          Choisir mes sourates
        </button>
      </p>
    </section>
  );
}

function SurahEditor({ chapter, known, range, onSave, onRemove, onClose }) {
  const partial =
    range && (range.from !== 1 || range.to !== chapter.verses.length);
  const [mode, setMode] = useState(partial ? "portion" : "whole");
  const [from, setFrom] = useState(range?.from ?? 1);
  const [to, setTo] = useState(range?.to ?? chapter.verses.length);
  const valid =
    mode === "whole" ||
    (Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 1 &&
      to >= from &&
      to <= chapter.verses.length);
  return (
    <Modal
      title={`Surat ${chapter.name}`}
      subtitle={`${chapter.verses.length} versets · ${chapter.translation}`}
      onClose={onClose}
    >
      <div className="surah-editor">
        <label
          className={`editor-option ${mode === "whole" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="mode"
            checked={mode === "whole"}
            onChange={() => setMode("whole")}
          />
          <span>
            <strong>Toute la sourate</strong>
            <small>{chapter.verses.length} versets</small>
          </span>
        </label>
        <label
          className={`editor-option ${mode === "portion" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="mode"
            checked={mode === "portion"}
            onChange={() => setMode("portion")}
          />
          <span>
            <strong>Une portion</strong>
            <small>Je choisis les versets</small>
          </span>
        </label>
        {mode === "portion" && (
          <div className="editor-range">
            <div className={`range-group ${valid ? "" : "invalid"}`}>
              <label className="range-cell">
                <span>Du verset</span>
                <input
                  aria-label={`Premier verset ${chapter.name}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={chapter.verses.length}
                  step="1"
                  required
                  value={from}
                  aria-invalid={!valid}
                  onChange={(e) =>
                    setFrom(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </label>
              <span className="range-arrow" aria-hidden="true">
                →
              </span>
              <label className="range-cell">
                <span>Au verset</span>
                <input
                  aria-label={`Dernier verset ${chapter.name}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={chapter.verses.length}
                  step="1"
                  required
                  value={to}
                  aria-invalid={!valid}
                  onChange={(e) =>
                    setTo(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </label>
            </div>
            {valid && (
              <span className="range-count">
                {to - from + 1} versets sur {chapter.verses.length}
              </span>
            )}
          </div>
        )}
        {!valid && (
          <p className="range-error" role="alert">
            Indique un début et une fin entre 1 et {chapter.verses.length}, dans
            cet ordre.
          </p>
        )}
      </div>
      <footer className="modal-footer">
        {known && (
          <button className="text-button danger" onClick={onRemove}>
            Retirer
          </button>
        )}
        <button className="button secondary" onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          disabled={!valid}
          onClick={() => onSave(mode === "whole" ? null : { from, to })}
        >
          Enregistrer <Icon name="check" size={17} />
        </button>
      </footer>
    </Modal>
  );
}

function Passage({ passage, index, choices, overrideValue, onOverride }) {
  if (!passage)
    return (
      <div className="passage">
        <span className="rakaat-number">{index + 1}</span>
        <span className="muted">Aucun passage à planifier</span>
      </div>
    );
  const chapter = chapters[passage.surah - 1];
  if (passage.blocked)
    return (
      <div className="passage blocked">
        <span className="rakaat-number">{index + 1}</span>
        <div>
          <strong>
            {chapter.name}, v. {passage.verse}
          </strong>
          <small>
            Verset trop long pour ce plafond. Réservé à une prière plus longue.
          </small>
        </div>
      </div>
    );
  const segmented =
    sectionsForSurah(passage.surah) &&
    passage.segmentation === sectionsForSurah(passage.surah).id;
  const segments = segmented
    ? sectionsForSurah(passage.surah)
        .blocks.filter((b) => b.from <= passage.to && passage.from <= b.to)
        .map((b) => {
          const from = Math.max(b.from, passage.from);
          const to = Math.min(b.to, passage.to);
          return {
            title: b.title,
            from,
            to,
            page: chapter.verses[from - 1][0],
            endPage: chapter.verses[to - 1][2],
          };
        })
    : [];
  return (
    <div className="passage">
      <span className="rakaat-number" title={`Rakaat ${index + 1}`}>
        {index + 1}
      </span>
      <div className="passage-body">
        <div className="passage-main">
          <strong>
            {chapter.name} ·{" "}
            {passage.from === passage.to
              ? `v. ${passage.from}`
              : `v. ${passage.from}–${passage.to}`}{" "}
            <span className="passage-pages">
              (p. {passage.page}
              {passage.page !== passage.endPage ? ` à ${passage.endPage}` : ""})
            </span>
          </strong>
        </div>
        {segments.length > 0 && (
          <div className="passage-themes">
            {(() => {
              const blocks = sectionsForSurah(passage.surah).blocks;
              const whole =
                passage.from === blocks[0].from &&
                passage.to === blocks.at(-1).to;
              return whole ? (
                <small>Surat entière</small>
              ) : (
                segments.map((seg) => (
                  <small key={seg.title}>{seg.title}</small>
                ))
              );
            })()}
          </div>
        )}
        {sectionsForSurah(passage.surah) && !segmented && (
          <small>Ancien découpage, repères non appliqués</small>
        )}
      </div>
      {choices && (
        <div className="stepper">
          <button
            type="button"
            aria-label={`Réduire fin rakaat ${index + 1}`}
            disabled={passage.to <= choices[0]}
            onClick={() => onOverride(index, String(passage.to - 1))}
          >
            −
          </button>
          <input
            aria-label={`Fin rakaat ${index + 1}`}
            inputMode="numeric"
            min={choices[0]}
            max={choices.at(-1)}
            value={overrideValue ?? passage.to}
            onChange={(e) => onOverride(index, e.target.value)}
          />
          <button
            type="button"
            aria-label={`Augmenter fin rakaat ${index + 1}`}
            disabled={passage.to >= choices.at(-1)}
            onClick={() => onOverride(index, String(passage.to + 1))}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function PrayerCard({
  prayer,
  active,
  hasCorpus,
  onRecord,
  onRemove,
  corpus,
  overrides,
  onOverride,
  onUndo,
  onLimit,
}) {
  const done = prayer.result?.status === "done";
  const skipped = prayer.result?.status === "skipped";
  const valid = prayer.passages.some((p) => p && !p.blocked);
  const nextLimit = { 0.25: 0.5, 0.5: 1, 1: 0.25 }[prayer.limit];
  const deferredName = prayer.deferred
    ? chapters[prayer.deferred - 1].name
    : "la sourate suivante";
  return (
    <article
      id={active ? "next-prayer" : undefined}
      tabIndex={active ? -1 : undefined}
      className={`prayer-card ${active && hasCorpus ? "active" : ""} ${done ? "done" : ""}`}
    >
      <div className="prayer-heading">
        <div className={`prayer-icon ${prayer.extra ? "extra" : ""}`}>
          <Icon name={prayer.icon} size={23} />
        </div>
        <div className="prayer-title">
          <h3>{prayer.name}</h3>
          {(prayer.detail || (!done && !skipped && !prayer.extra)) && (
            <p>
              {prayer.detail}
              {!done && !skipped && !prayer.extra && (
                <>
                  {prayer.detail ? " · " : ""}
                  <button
                    type="button"
                    className={`limit-chip ${prayer.customLimit ? "custom" : ""}`}
                    aria-label={`Plafond ${prayer.name} : ${pageLabel(prayer.limit)}${prayer.customLimit ? " (aujourd’hui seulement)" : ""}. Cliquer pour passer à ${pageLabel(nextLimit)}`}
                    title={
                      prayer.customLimit
                        ? "Plafond ajusté pour aujourd’hui seulement"
                        : undefined
                    }
                    onClick={() => onLimit(prayer, nextLimit)}
                  >
                    max {pageLabel(prayer.limit)} par rakaat
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        <span className={`status ${done ? "complete" : ""}`}>
          {done ? (
            <>
              <Icon name="check" size={13} /> Révisé
            </>
          ) : skipped ? (
            "Reporté"
          ) : active && hasCorpus ? (
            "En cours"
          ) : (
            "Prévu"
          )}
        </span>
      </div>
      {!skipped && prayer.passages.length === 0 && (
        <p className="defer-note">
          Prière libre : {deferredName} attend la prochaine prière pour être
          faite en 1 seule prière.
        </p>
      )}
      {!skipped && prayer.passages.length > 0 && (
        <div className="passages">
          {prayer.passages.map((passage, i) => (
            <Passage
              key={i}
              passage={passage}
              index={i}
              choices={
                active && passage && !passage.blocked
                  ? corpus
                      .filter(
                        (v) =>
                          v.surah === passage.surah &&
                          v.verse >= passage.from &&
                          (!sectionFor(passage.surah, passage.from) ||
                            v.verse <=
                              sectionFor(passage.surah, passage.from).to),
                      )
                      .map((v) => v.verse)
                  : undefined
              }
              overrideValue={overrides?.[i]}
              onOverride={onOverride}
            />
          ))}
        </div>
      )}
      {!skipped &&
        prayer.passages.length > 0 &&
        prayer.passages.length < prayer.rakaat && (
          <p className="defer-note">
            <span className="rakaat-number">{prayer.passages.length + 1}</span>
            {prayer.cycleEnd
              ? "Rakaat libre : on vient de finir un cycle."
              : `Rakaat libre : ${deferredName} attend la prochaine prière pour être faite en 1 seule prière.`}
          </p>
        )}
      {skipped && (
        <p className="skip-note">
          Les passages restent dans le cycle. Ils sont repris dans la suite du
          programme.
        </p>
      )}
      {((prayer.extra && !prayer.result) || done || onUndo) && (
        <div className="prayer-footer">
          {prayer.extra && !prayer.result && (
            <button
              className="text-button danger"
              onClick={() => onRemove(prayer.id)}
              aria-label={`Retirer ${prayer.name}`}
            >
              Retirer
            </button>
          )}
          {done && (
            <span className="validated-label">
              {verseCount(prayer.passages)} versets validés
            </span>
          )}
          {onUndo && (
            <button
              className="text-button undo-button alt-action"
              onClick={onUndo}
            >
              Annuler
              <span className="tooltip">
                Annule cette action : les passages redeviennent à réviser et le
                cycle recule.
              </span>
            </button>
          )}
        </div>
      )}
      {active && hasCorpus && (
        <div className="prayer-actions">
          <button
            className="button primary"
            disabled={!valid}
            onClick={() => onRecord(prayer.id, "done")}
          >
            <Icon name="check" size={17} /> J’ai prié avec ces versets
          </button>
          <button
            className="button secondary alt-action"
            onClick={() => onRecord(prayer.id, "skipped")}
          >
            J’ai prié autrement
            <span className="tooltip">
              En groupe, ou seul avec d’autres passages. Le cycle n’avance pas,
              ces passages restent à réviser.
            </span>
          </button>
        </div>
      )}
    </article>
  );
}

function ForecastText({ estimate }) {
  if (!estimate) return <>À définir</>;
  if (estimate.blocked) return <>À ajuster</>;
  return <>{estimate.days === 1 ? "Aujourd’hui" : `${estimate.days} jours`}</>;
}

export default function App() {
  const initial = useMemo(() => {
    try {
      return loadState(localStorage, chapters);
    } catch (error) {
      return { state: newState(), raw: null, error: error.message };
    }
  }, []);
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error || "");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("today");
  const [editingSurah, setEditingSurah] = useState(null);
  const [sectionsSurah, setSectionsSurah] = useState(null);
  const [modal, setModal] = useState(null);
  const lastRaw = useRef(initial.raw);
  const importRef = useRef(null);
  const [session, setSession] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [syncConflict, setSyncConflict] = useState(null);
  const [syncStatus, setSyncStatus] = useState("off");
  const [authModal, setAuthModal] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const syncMeta = useRef(loadSyncMeta(localStorage));
  const stateRef = useRef(state);
  const pushTimer = useRef(null);
  const syncingRef = useRef(false);
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    stateRef.current = state;
  });
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!userId) return;
    void runSync(userId);
    const timer = setInterval(() => void runSync(userId), 60000);
    const onFocus = () => void runSync(userId);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId]);

  async function runSync(uid) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      if (syncMeta.current === null) {
        // Première connexion du compte sur cet appareil.
        setSyncStatus("syncing");
        const remote = await fetchRemote(supabase, uid);
        const decision = decideFirstSync(stateRef.current, remote);
        if (decision === "ask") {
          setSyncConflict(remote);
          setSyncStatus("off");
        } else if (decision === "upload") {
          await pushNow(uid);
        } else if (decision === "download") {
          applyRemote(remote);
        } else {
          // Rien des deux côtés : la meta est initialisée et le premier
          // changement local déclenchera l'envoi.
          const t = new Date().toISOString();
          syncMeta.current = { updatedAt: t, syncedAt: t };
          saveSyncMeta(localStorage, syncMeta.current);
          setSyncStatus("synced");
        }
      } else {
        const remote = await fetchRemote(supabase, uid);
        const decision = decideRefresh(syncMeta.current, remote);
        if (decision === "download") applyRemote(remote);
        else if (decision === "upload") await pushNow(uid);
      }
    } catch {
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }

  async function pushNow(uid) {
    setSyncStatus("syncing");
    try {
      const t = await pushRemote(supabase, uid, stateRef.current);
      const prev = syncMeta.current;
      syncMeta.current = {
        updatedAt: prev && prev.updatedAt > t ? prev.updatedAt : t,
        syncedAt: t,
      };
      saveSyncMeta(localStorage, syncMeta.current);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  function schedulePush() {
    if (!supabase || !session || syncMeta.current === null) return;
    const uid = session.user.id;
    syncMeta.current = {
      ...syncMeta.current,
      updatedAt: new Date().toISOString(),
    };
    saveSyncMeta(localStorage, syncMeta.current);
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void pushNow(uid), 1500);
  }

  function applyRemote(remote) {
    // Le local a changé pendant le téléchargement : le plus récent gagne.
    if (syncMeta.current && syncMeta.current.updatedAt > remote.updated_at) {
      void pushNow(userId);
      return;
    }
    try {
      const validated = rollover(validateState(remote.state, chapters));
      const raw = JSON.stringify(validated);
      localStorage.setItem(STORAGE_KEY, raw);
      lastRaw.current = raw;
      clearTimeout(pushTimer.current);
      setState(validated);
      syncMeta.current = {
        updatedAt: remote.updated_at,
        syncedAt: remote.updated_at,
      };
      saveSyncMeta(localStorage, syncMeta.current);
      setSyncStatus("synced");
      setNotice("Progression synchronisée avec ton compte.");
    } catch (error) {
      setNotice(error.message);
      setSyncStatus("error");
    }
  }

  async function resolveConflict(choice) {
    const remote = syncConflict;
    setSyncConflict(null);
    if (!remote || !userId) return;
    if (choice === "remote") applyRemote(remote);
    else await pushNow(userId);
  }

  async function onSignOut() {
    clearTimeout(pushTimer.current);
    try {
      await supabase.auth.signOut();
    } catch {
      /* La session locale est nettoyée même si l'appel réseau échoue. */
    }
    clearSyncMeta(localStorage);
    syncMeta.current = null;
    setSyncConflict(null);
    setSyncStatus("off");
    setNotice("Déconnecté. Ta progression reste enregistrée sur cet appareil.");
  }
  const corpus = useMemo(
    () => buildCorpus(chapters, state.known, state.ranges),
    [state.known, state.ranges],
  );
  const [overrides, setOverrides] = useState({});
  const parsedOverrides = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(overrides)
          .map(([k, v]) => [k, Number(v)])
          .filter(([, v]) => Number.isInteger(v) && v > 0),
      ),
    [overrides],
  );
  const plan = useMemo(() => {
    try {
      return planDay(state, corpus, parsedOverrides);
    } catch {
      return planDay(state, corpus);
    }
  }, [state, corpus, parsedOverrides]);
  const nextId = plan.find((p) => !p.result && p.passages.some((x) => x))?.id;
  const lastUndoId = canUndo(state) ? state.history.at(-1).prayerId : null;
  useEffect(() => {
    setOverrides({});
  }, [nextId, state.day.date, state.epoch]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  const estimate = useMemo(() => forecast(state, corpus), [state, corpus]);
  const baseline = useMemo(
    () => forecast(state, corpus, false),
    [state, corpus],
  );
  const progress = corpus.length
    ? Math.floor((state.cursor / corpus.length) * 100)
    : 0;
  const knownVerses = state.known.reduce((n, id) => {
    const range = knownRange(chapters[id - 1], state.ranges);
    return n + range.to - range.from + 1;
  }, 0);
  const completeCount = state.known.filter((id) => {
    const chapter = chapters[id - 1];
    const range = knownRange(chapter, state.ranges);
    return range.from === 1 && range.to === chapter.verses.length;
  }).length;
  const partialCount = state.known.length - completeCount;
  const knownPages = useMemo(
    () => learnedPages(chapters, state.known, state.ranges),
    [state.known, state.ranges],
  );
  const pagesPct = (knownPages / 604) * 100;
  const juzCount = useMemo(
    () => learnedJuz(chapters, state.known, state.ranges),
    [state.known, state.ranges],
  );

  function commit(transform) {
    if (storageError) return false;
    let disk;
    try {
      disk = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* In-memory progress remains exportable when storage is unavailable. */
    }
    if (disk !== undefined && disk !== lastRaw.current) {
      if (saveError) {
        setNotice(
          "Exporte tes changements non sauvegardés avant de recharger les données de l’autre onglet.",
        );
        return false;
      }
      try {
        const loaded = loadState(localStorage, chapters);
        lastRaw.current = loaded.raw;
        setState(loaded.state);
        setNotice(
          "La progression a changé dans un autre onglet. Vérifie le programme et recommence ton action.",
        );
      } catch (error) {
        setStorageError(error.message);
      }
      return false;
    }
    let next;
    try {
      next = transform(rollover(state));
    } catch (error) {
      setNotice(error.message);
      return false;
    }
    try {
      const raw = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, raw);
      lastRaw.current = raw;
      setSaveError("");
    } catch {
      setSaveError(
        "La sauvegarde sur cet appareil est indisponible. Exporte tes données avant de fermer cet onglet.",
      );
    }
    setState(next);
    setNotice("");
    schedulePush();
    return true;
  }

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      if (saveError) {
        setNotice(
          "Un autre onglet a changé les données. Exporte tes changements non sauvegardés avant de recharger.",
        );
        return;
      }
      try {
        const loaded = loadState(localStorage, chapters);
        lastRaw.current = loaded.raw;
        setState(loaded.state);
        setStorageError("");
        setNotice("Progression synchronisée avec ton autre onglet.");
      } catch (error) {
        setStorageError(error.message);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [saveError]);

  useEffect(() => {
    const checkDate = () => {
      if (state.day.date !== localDate() && !storageError)
        commit(
          (s) => s,
          "Nouveau jour, nouveau programme. Ton cycle continue là où tu en étais.",
        );
    };
    const timer = setInterval(checkDate, 30000);
    window.addEventListener("focus", checkDate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkDate);
    };
  });

  function saveKnown(known, ranges) {
    const changed = updateKnown(state, known, ranges) !== state;
    if (
      changed &&
      corpus.length &&
      !window.confirm(
        "Modifier les sourates ou leurs versets recommence le tour en cours avec cette sélection. L’historique et les tours déjà terminés sont conservés. Continuer ?",
      )
    )
      return;
    if (commit((s) => updateKnown(s, known, ranges))) setModal(null);
  }

  function onRecord(id, status) {
    if (
      commit((s) => {
        if (s.day.date !== state.day.date)
          throw new Error(
            "La journée a changé. Actualise le programme avant de valider.",
          );
        return recordPrayer(
          s,
          buildCorpus(chapters, s.known, s.ranges),
          id,
          status,
          parsedOverrides,
        );
      })
    )
      setOverrides({});
  }

  function onLimit(prayer, limit) {
    commit((s) => ({ ...s, limits: { ...s.limits, [prayer.id]: limit } }));
  }

  function onQiyamRakaat(n) {
    commit((s) => {
      const rakaatOverrides = { ...s.rakaatOverrides };
      if (n === 2) delete rakaatOverrides.qiyam;
      else rakaatOverrides.qiyam = n;
      return { ...s, rakaatOverrides };
    });
  }

  // Plafond ajusté à la volée sur une carte : vaut pour aujourd'hui
  // seulement, les réglages redeviennent la référence dès demain.
  function onTodayLimit(prayer, limit) {
    commit((s) => {
      const limitOverrides = { ...s.day.limitOverrides };
      if (limit === s.limits[prayer.id]) delete limitOverrides[prayer.id];
      else limitOverrides[prayer.id] = limit;
      return { ...s, day: { ...s.day, limitOverrides } };
    });
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Le fichier dépasse 5 Mo.");
      const imported = rollover(parseBackup(await file.text(), chapters));
      if (
        window.confirm(
          "Remplacer la progression actuelle par cette sauvegarde ? Exporte d’abord tes données si tu veux les conserver.",
        )
      ) {
        if (storageError) {
          const raw = JSON.stringify(imported);
          localStorage.setItem(STORAGE_KEY, raw);
          lastRaw.current = raw;
          setState(imported);
          setStorageError("");
        } else commit(() => imported);
      }
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("today");
          }}
          aria-label="Wird, accueil"
        >
          <span className="brand-symbol">
            <Icon name="book" size={26} />
          </span>
          <span>
            wird<span className="brand-period">.</span>
          </span>
        </a>
        <p className="brand-caption">UN PEU, CHAQUE JOUR</p>
        <nav aria-label="Navigation principale">
          {(supabase ? [...navItems, accountNavItem] : navItems).map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "selected" : ""}`}
              onClick={() => setView(id)}
              aria-label={label}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {view === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="ornament">✧</span>
          <p>
            À ton rythme.
            <br />
            Avec constance.
          </p>
        </div>
        <div className="local-note">
          <Icon name="shield" size={16} />
          <span>{session ? session.user.email : "Personnel. Sans compte."}</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="date-label">
            {new Date(`${state.day.date}T12:00:00`).toLocaleDateString(
              "fr-FR",
              { weekday: "long", day: "numeric", month: "long" },
            )}
          </span>
          {supabase && (
            <button
              className="account-chip"
              onClick={() =>
                session ? setView("account") : setAuthModal(true)
              }
              aria-label={
                session ? `Connecté : ${session.user.email}` : "Se connecter"
              }
            >
              {session ? (
                <>
                  <span className="chip-avatar" aria-hidden="true">
                    {(session.user.email || "?")[0].toUpperCase()}
                  </span>
                  <span className="chip-email">{session.user.email}</span>
                  <span className={`chip-dot ${syncStatus}`} aria-hidden="true" />
                </>
              ) : (
                <>
                  <Icon name="user" size={15} />
                  <span>Se connecter</span>
                </>
              )}
            </button>
          )}
        </header>
        <main id="main" tabIndex="-1">
          <div className="announcement" role="status">
            {notice && (
              <>
                <span>{notice}</span>
                <button
                  className="icon-button"
                  onClick={() => setNotice("")}
                  aria-label="Masquer le message"
                >
                  <Icon name="close" size={16} />
                </button>
              </>
            )}
          </div>
          {saveError && (
            <div className="warning" role="alert">
              {saveError}{" "}
              <button
                className="text-button"
                onClick={() => downloadBackup(state)}
              >
                Exporter maintenant
              </button>
            </div>
          )}
          {storageError ? (
            <section className="panel recovery">
              <Icon name="shield" size={36} />
              <h1>Ta sauvegarde a besoin d’attention</h1>
              <p>{storageError}</p>
              <p>Aucune donnée enregistrée n’a été écrasée.</p>
              <div className="button-row">
                <button
                  className="button primary"
                  onClick={() => importRef.current.click()}
                >
                  Importer une sauvegarde
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    try {
                      downloadText(
                        localStorage.getItem(STORAGE_KEY) || "",
                        "wird-recovery.json",
                      );
                    } catch {
                      setNotice("Le navigateur refuse l’accès au stockage.");
                    }
                  }}
                >
                  Télécharger les données brutes
                </button>
                <button
                  className="text-button danger"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Effacer la sauvegarde locale et repartir de zéro ? Cette action est irréversible.",
                      )
                    )
                      return;
                    try {
                      localStorage.removeItem(STORAGE_KEY);
                      lastRaw.current = null;
                      setState(newState());
                      setStorageError("");
                    } catch {
                      setNotice("Le navigateur refuse l’accès au stockage.");
                    }
                  }}
                >
                  Repartir de zéro
                </button>
              </div>
            </section>
          ) : (
            <>
              {view === "today" && (
                <>
                  {corpus.length > 0 && (
                    <section className="hero">
                      <div className="hero-copy">
                        <span className="eyebrow">
                          <span /> MÉMORISER. RÉVISER. RECOMMENCER.
                        </span>
                        <h1>
                          Un peu chaque jour.
                          <br />
                          <em>pour ne jamais oublier.</em>
                        </h1>
                      </div>
                    <div
                      className="hero-art"
                      aria-label={`Cycle ${state.cycles + 1}, ${progress} % des versets révisés`}
                    >
                      <div className="art-orbit orbit-one" />
                      <div className="art-orbit orbit-two" />
                      <div
                        className="progress-orbit"
                        style={{ "--progress": `${progress}%` }}
                      >
                        <div className="orbit-center">
                          <span
                            className="arabic hero-arabic"
                            lang="ar"
                            dir="rtl"
                          >
                            وِرْد
                          </span>
                          <span>CYCLE {state.cycles + 1}</span>
                          <strong>
                            {progress}
                            <small>%</small>
                          </strong>
                          <span>DES VERSETS RÉVISÉS</span>
                        </div>
                        <span
                          className="orbit-days"
                          title="Estimation au rythme actuel"
                        >
                          ≈ <ForecastText estimate={estimate} />
                        </span>
                      </div>
                      <span className="art-star star-one">✧</span>
                      <span className="art-star star-two">✦</span>
                    </div>
                    </section>
                  )}
                  {!corpus.length ? (
                    <Welcome
                      fatihaOnly={state.known.length > 0}
                      onPreset={(ids) => commit((s) => updateKnown(s, ids))}
                      onCustom={() => setModal("surahs")}
                    />
                  ) : (
                    <>
                      <section className="section-heading">
                        <div>
                          <span className="eyebrow">LE PROGRAMME DU JOUR</span>
                          <h2>Tes prières, ton rythme.</h2>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => setModal("extra")}
                          disabled={state.day.extras.length >= 20}
                        >
                          <Icon name="plus" size={18} /> Ajouter une prière
                        </button>
                      </section>
                      {state.day.extras.length > 0 && (
                        <div className="bonus-strip">
                          <Icon name="spark" />
                          <span>
                            Un effort en plus aujourd’hui.{" "}
                            {baseline &&
                            estimate &&
                            !baseline.blocked &&
                            !estimate.blocked &&
                            baseline.days > estimate.days ? (
                              <strong>
                                Fin prévue {baseline.days - estimate.days}{" "}
                                jour(s) plus tôt si tu valides ce programme.
                              </strong>
                            ) : (
                              "Les passages supplémentaires réduisent ce qu’il reste à réviser."
                            )}
                          </span>
                        </div>
                      )}
                      {estimate?.blocked && (
                        <div className="warning">
                          Le prochain verset ne tient pas dans ton programme
                          habituel. Augmente le plafond d’une prière (maximum 1
                          page). Aucun verset ne sera coupé ou sauté.
                        </div>
                      )}
                      {!nextId && (
                        <div className="day-complete">
                          <Icon name="check" />
                          <div>
                            <strong>Le programme du jour est terminé.</strong>
                            <p>
                              Ton cycle reprendra demain là où tu en es. Tu peux
                              aussi ajouter une nafila.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="prayer-grid">
                        {plan.map((prayer) => (
                          <PrayerCard
                            key={prayer.id}
                            prayer={prayer}
                            active={prayer.id === nextId}
                            hasCorpus={!!corpus.length}
                            onRecord={onRecord}
                            corpus={corpus}
                            overrides={prayer.id === nextId ? overrides : {}}
                            onOverride={(index, verse) =>
                              setOverrides((current) => ({
                                ...current,
                                [index]: verse,
                              }))
                            }
                            onUndo={
                              prayer.id === lastUndoId
                                ? () => commit(undoLast)
                                : undefined
                            }
                            onLimit={onTodayLimit}
                            onRemove={(id) =>
                              commit((s) => ({
                                ...s,
                                day: {
                                  ...s.day,
                                  extras: s.day.extras.filter(
                                    (p) => p.id !== id,
                                  ),
                                },
                              }))
                            }
                          />
                        ))}
                      </div>
                      <div className="under-program">
                        <p>
                          <Icon name="shield" size={16} /> Une prière non
                          validée ne fait pas avancer ton cycle.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
              {view === "memory" && (
                <>
                  <section className="memory-heading">
                    <h1>Mémorisation.</h1>
                    <div className="progress-block panel">
                      <div className="progress-hero">
                        <span
                          className="progress-frame"
                          role="progressbar"
                          aria-valuenow={pagesPct.toFixed(1)}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-label={`${pagesPct.toFixed(1)} % du Quran mémorisé`}
                        >
                          <svg viewBox="0 0 116 68" aria-hidden="true">
                            <rect
                              className="frame-track"
                              x="2"
                              y="2"
                              width="112"
                              height="64"
                              rx="14"
                              pathLength="100"
                            />
                            <rect
                              className="frame-fill"
                              x="2"
                              y="2"
                              width="112"
                              height="64"
                              rx="14"
                              pathLength="100"
                              style={{
                                strokeDasharray: `${pagesPct} 100`,
                                visibility:
                                  pagesPct > 0 ? "visible" : "hidden",
                              }}
                            />
                          </svg>
                          <span className="progress-ring-text">
                            <span className="progress-big">
                              {pagesPct.toFixed(1).replace(".", ",")}{" "}
                              <small>%</small>
                            </span>
                            <span className="progress-label">du Coran</span>
                          </span>
                        </span>
                      </div>
                      <div className="progress-stats">
                        <span>
                          <b>{completeCount}</b>
                          <em>
                            {completeCount > 1
                              ? "surats apprises"
                              : "surat apprise"}
                          </em>
                        </span>
                        <span>
                          <b>{partialCount}</b>
                          <em>
                            {partialCount > 1
                              ? "surats en cours"
                              : "surat en cours"}
                          </em>
                        </span>
                        <span>
                          <b>{juzCount}</b>
                          <em>juz appris</em>
                        </span>
                        <span>
                          <b>≈ {knownPages.toFixed(1).replace(".", ",")}</b>
                          <em>
                            {knownPages > 1 ? "pages apprises" : "page apprise"}
                          </em>
                        </span>
                      </div>
                    </div>
                  </section>
                  <div className="memory-grid">
                    {chapters.map((c) => {
                        const known = state.known.includes(c.id);
                        const range = knownRange(c, state.ranges);
                        const complete =
                          known &&
                          range.from === 1 &&
                          range.to === c.verses.length;
                        const status = !known
                          ? "greyed"
                          : complete
                            ? "learned"
                            : "partial";
                        return (
                          <button
                            type="button"
                            key={c.id}
                            className={`memory-card surah-card ${status}`}
                            onClick={() => setEditingSurah(c.id)}
                            aria-label={`${c.name}, ${
                              !known
                                ? "pas encore apprise"
                                : complete
                                  ? "apprise entièrement"
                                  : `versets ${range.from} à ${range.to} appris`
                            }, modifier`}
                          >
                            <span className="card-top">
                              <span className="surah-number">{c.id}</span>
                              <span className="arabic" lang="ar" dir="rtl">
                                {c.arabic}
                              </span>
                            </span>
                            <h3>{c.name}</h3>
                          </button>
                        );
                      })}
                  </div>
                  {!state.known.length && (
                    <p className="empty-small">
                      Aucune sourate sélectionnée. Ajoute celles que tu connais
                      pour préparer ton premier cycle.
                    </p>
                  )}
                </>
              )}
              {view === "sections" && (
                <>
                  <PageHeading title="Découpage thématique." />
                  <div className="memory-grid">
                    {chapters.map((c) => {
                      const sections = sectionsForSurah(c.id);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          className={`memory-card surah-card ${sections ? "" : "greyed"}`}
                          disabled={!sections}
                          onClick={() => sections && setSectionsSurah(c.id)}
                        >
                          <span className="card-top">
                            <span className="surah-number">{c.id}</span>
                            <span className="arabic" lang="ar" dir="rtl">
                              {c.arabic}
                            </span>
                          </span>
                          <h3>{c.name}</h3>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {view === "prayers" && (
                <>
                  <PageHeading title="Prières du programme." />
                  <section className="panel settings-panel">
                    <div className="prayer-tree">
                      {[
                        {
                          cat: "Fard",
                          ids: ["subh", "dhuhr", "asr", "maghrib", "isha"],
                        },
                        {
                          cat: "Sunnah mu’akkadah (rawatib)",
                          ids: [
                            "fajr",
                            "avant-dhuhr",
                            "apres-dhuhr",
                            "apres-maghrib",
                            "apres-isha",
                          ],
                        },
                        {
                          cat: "Sunnah mu’akkadah",
                          ids: ["chafaa", "witr"],
                        },
                        {
                          cat: "Sunnah ghayr mu’akkadah",
                          ids: ["duha", "qiyam"],
                        },
                      ].map((group) => (
                        <div className="tree-group" key={group.cat}>
                          <span className="tree-cat">{group.cat}</span>
                          <div className="tree-grid">
                            {group.ids.map((id) => {
                              const p = PRAYERS.find((x) => x.id === id);
                              const on =
                                !p.optional || state.prayersEnabled[p.id];
                              const nextLimit = nextLimitValue[state.limits[p.id]];
                              const qiyamCount =
                                state.rakaatOverrides?.qiyam ?? p.rakaat;
                              const nextQiyam =
                                RAKAAT_STEPS[
                                  (RAKAAT_STEPS.indexOf(qiyamCount) + 1) %
                                    RAKAAT_STEPS.length
                                ];
                              return (
                                <div
                                  className={`prayer-cell ${on ? "on" : ""}`}
                                  key={p.id}
                                  {...(p.optional && {
                                    role: "switch",
                                    "aria-checked": on,
                                    "aria-label": `${p.name} dans le programme`,
                                    tabIndex: 0,
                                    onClick: () =>
                                      commit((s) => ({
                                        ...s,
                                        prayersEnabled: {
                                          ...s.prayersEnabled,
                                          [p.id]: !s.prayersEnabled[p.id],
                                        },
                                      })),
                                    onKeyDown: (e) => {
                                      if (e.key !== "Enter" && e.key !== " ")
                                        return;
                                      e.preventDefault();
                                      commit((s) => ({
                                        ...s,
                                        prayersEnabled: {
                                          ...s.prayersEnabled,
                                          [p.id]: !s.prayersEnabled[p.id],
                                        },
                                      }));
                                    },
                                  })}
                                >
                                  <div className="cell-top">
                                    <span className="cell-name">
                                      <strong>
                                        {p.name.replace("/", "/\u200B")}
                                      </strong>
                                      {p.detail && <small>{p.detail}</small>}
                                    </span>
                                  </div>
                                  {on && (
                                    <div
                                      className="cell-chips"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      {p.id === "qiyam" && (
                                        <button
                                          type="button"
                                          className="limit-chip"
                                          aria-label={`Nombre de rakaat Qiyam : ${qiyamCount}. Cliquer pour passer à ${nextQiyam}`}
                                          onClick={() =>
                                            onQiyamRakaat(nextQiyam)
                                          }
                                        >
                                          {qiyamCount} rakaat
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="limit-chip"
                                        aria-label={`Plafond ${p.name} : ${pageLabel(state.limits[p.id])}. Cliquer pour passer à ${pageLabel(nextLimit)}`}
                                        onClick={() => onLimit(p, nextLimit)}
                                      >
                                        max {pageLabel(state.limits[p.id])}{" "}
                                        par rakaat
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  {!supabase && (
                    <DataPanel session={session} state={state} importRef={importRef} />
                  )}
                  <button className="info-link" onClick={() => setInfoModal(true)}>
                    <Icon name="info" size={14} /> Comment le programme est
                    calculé ?
                  </button>
                </>
              )}
              {view === "account" && (
                <>
                  <PageHeading
                    title="Mes données."
                    text={
                      session
                        ? "Ta progression est synchronisée avec ton compte. Tu peux aussi gérer la sauvegarde de cet appareil."
                        : undefined
                    }
                  />
                  {session && (
                    <section className="panel account-summary">
                      <span className="account-avatar" aria-hidden="true">
                        {(session.user.email || "?")[0].toUpperCase()}
                      </span>
                      <div className="account-id">
                        <strong>{session.user.email}</strong>
                        <span className={`sync-badge ${syncStatus}`}>
                          {SYNC_LABELS[syncStatus]}
                        </span>
                      </div>
                    </section>
                  )}
                  <div className="data-list">
                    {!session && (
                      <button
                        className="data-row"
                        onClick={() => setAuthModal(true)}
                      >
                        <Icon name="user" size={16} />
                        <span>Se connecter</span>
                        <Icon name="arrow" size={14} />
                      </button>
                    )}
                    <button
                      className="data-row"
                      onClick={() => downloadBackup(state)}
                    >
                      <Icon name="download" size={16} />
                      <span>Exporter ma sauvegarde</span>
                      <Icon name="arrow" size={14} />
                    </button>
                    <button
                      className="data-row"
                      onClick={() => importRef.current.click()}
                    >
                      <Icon name="upload" size={16} />
                      <span>Importer une sauvegarde</span>
                      <Icon name="arrow" size={14} />
                    </button>
                    {session && (
                      <button
                        className="data-row"
                        onClick={() => void onSignOut()}
                      >
                        <Icon name="logout" size={16} />
                        <span>Se déconnecter</span>
                        <Icon name="arrow" size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span className="footer-brand">wird.</span>
            <span>La régularité commence par un petit pas.</span>
            <span>Mushaf de Médine · 604 pages</span>
          </footer>
        </main>
      </div>
      <input
        className="sr-only"
        type="file"
        accept=".json,application/json"
        ref={importRef}
        onChange={importFile}
        aria-label="Importer un fichier de sauvegarde"
        tabIndex="-1"
      />
      {infoModal && (
        <Modal
          title="Comment le programme est calculé"
          subtitle="Les règles qui répartissent tes révisions dans tes prières."
          onClose={() => setInfoModal(false)}
        >
          <ProgramRules />
        </Modal>
      )}
      {authModal && !session && (
        <Modal
          title="Connexion"
          subtitle="Synchronise ta progression entre tes appareils."
          onClose={() => setAuthModal(false)}
          compact
        >
          <AuthForm />
        </Modal>
      )}
      {syncConflict && (
        <Modal
          title="Quelle version garder ?"
          subtitle="Première connexion du compte sur cet appareil."
          onClose={() => void onSignOut()}
        >
          <SyncConflictChoice
            localState={state}
            remote={syncConflict}
            onChoose={(choice) => void resolveConflict(choice)}
          />
        </Modal>
      )}
      {recoveryMode && (
        <Modal
          title="Nouveau mot de passe"
          subtitle="Choisis un nouveau mot de passe pour ton compte."
          onClose={() => {
            setRecoveryMode(false);
            void supabase.auth.signOut();
          }}
          compact
        >
          <PasswordRecoveryForm
            onDone={(message) => {
              setRecoveryMode(false);
              setNotice(message);
            }}
          />
        </Modal>
      )}
      {modal === "surahs" && (
        <SurahPicker
          known={state.known}
          ranges={state.ranges}
          onSave={saveKnown}
          onClose={() => setModal(null)}
        />
      )}
      {sectionsSurah !== null && (
        <Modal
          title={chapters[sectionsSurah - 1].name}
          subtitle={`${sectionsForSurah(sectionsSurah).blocks.length} thèmes · ${chapters[sectionsSurah - 1].verses.length} versets`}
          onClose={() => setSectionsSurah(null)}
        >
          <SectionsDetail sections={sectionsForSurah(sectionsSurah)} />
        </Modal>
      )}
      {editingSurah !== null && (
        <SurahEditor
          chapter={chapters[editingSurah - 1]}
          known={state.known.includes(editingSurah)}
          range={
            state.known.includes(editingSurah)
              ? knownRange(chapters[editingSurah - 1], state.ranges)
              : null
          }
          onClose={() => setEditingSurah(null)}
          onSave={(range) => {
            const known = state.known.includes(editingSurah)
              ? state.known
              : [...state.known, editingSurah];
            const ranges = { ...state.ranges };
            if (range) ranges[editingSurah] = range;
            else delete ranges[editingSurah];
            saveKnown(known, ranges);
            setEditingSurah(null);
          }}
          onRemove={() => {
            saveKnown(
              state.known.filter((id) => id !== editingSurah),
              state.ranges,
            );
            setEditingSurah(null);
          }}
        />
      )}
      {modal === "extra" && (
        <ExtraPicker
          prayersEnabled={state.prayersEnabled}
          onClose={() => setModal(null)}
          onGoSettings={() => {
            setModal(null);
            setView("prayers");
          }}
          onAdd={(extra) => {
            if (
              commit((s) => {
                if (s.day.extras.length >= 20)
                  throw new Error(
                    "Maximum de 20 prières supplémentaires par jour.",
                  );
                return {
                  ...s,
                  day: { ...s.day, extras: [...s.day.extras, extra] },
                };
              }, "Nafila ajoutée pour aujourd’hui.")
            )
              setModal(null);
          }}
        />
      )}
    </div>
  );
}

function DataPanel({ session, state, importRef }) {
  return (
    <section className="panel settings-panel">
      <h2>Tes données restent chez toi.</h2>
      <p>
        {session
          ? "Ta progression est synchronisée avec ton compte. L’export ci-dessous te donne toujours une copie complète de tes données."
          : "Pas de compte, pas de synchronisation entre appareils. La sauvegarde est liée à ce navigateur et à cette adresse du site. Effacer les données du navigateur efface ta progression."}
      </p>
      <div className="button-row">
        <button className="button primary" onClick={() => downloadBackup(state)}>
          <Icon name="download" size={17} /> Exporter ma sauvegarde
        </button>
        <button
          className="button secondary"
          onClick={() => importRef.current.click()}
        >
          Importer une sauvegarde
        </button>
      </div>
    </section>
  );
}

function ProgramRules() {
  return (
    <>
<ol className="rules-list">
  <li>
    Le programme du jour rassemble les 5 prières
    obligatoires et les nawafil activées dans Prières du
    programme. « Ajouter une prière » n’ajoute une prière
    que pour aujourd’hui.
  </li>
  <li>
    Les versets défilent dans l’ordre du Quran, une seule
    sourate par rakaat, versets entiers uniquement. Seuls
    les versets déclarés appris sont planifiés.
  </li>
  <li>
    Chaque prière a un plafond par rakaat : ¼, ½ ou 1 page
    du mushaf (½ page par défaut). Les longueurs utilisent
    les lignes du mushaf de Médine à 604 pages : une ligne
    entamée compte entière, donc les portions restent
    prudentes.
  </li>
  <li>
    Une rakaat enchaîne les thèmes entiers qui tiennent dans
    son plafond. Un thème trop long est coupé par la
    longueur. Un verset seul plus long que le plafond attend
    une prière au plafond suffisant, il n’est jamais sauté.
  </li>
  <li>
    Si la coupure tombe juste avant la fin d’un thème, la
    rakaat peut dépasser son plafond de 50 % pour le
    terminer. Jamais plus, jamais pour enchaîner au-delà.
  </li>
  <li>
    Une sourate qui tient dans une prière entière n’est
    jamais coupée entre deux prières. Si elle ne peut pas
    finir dans la prière courante, son début est reporté à
    la suivante et la rakaat reste libre.
  </li>
  <li>
    Valide les prières dans l’ordre du programme. « J’ai
    prié autrement » (en groupe, ou seul avec d’autres
    passages) conserve les passages à réviser, sans faire
    avancer le cycle.
  </li>
  <li>
    L’estimation simule les jours à venir au rythme actuel,
    sans nawafil supplémentaires, en supposant que tu
    valides ces passages.
  </li>
  <li>
    Changer les sourates ou leurs portions recommence le
    tour en cours. Les validations et tours terminés restent
    dans l’historique.
  </li>
</ol>
<p className="source-note">
  Références :{" "}
  <a
    href={data.documentation}
    target="_blank"
    rel="noreferrer"
  >
    Quran.com / Quran Foundation
  </a>
  , métadonnées récupérées le{" "}
  {new Date(data.fetchedAt).toLocaleDateString("fr-FR")}.
  Aucun texte coranique n’est généré. Ce site organise tes
  révisions, il ne donne pas d’avis religieux.
</p>
    </>
  );
}

function PageHeading({ eyebrow, title, text, action }) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </section>
  );
}
