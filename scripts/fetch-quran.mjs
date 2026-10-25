import { mkdir, writeFile } from "node:fs/promises";

const base = "https://api.quran.com/api/v4";
async function get(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

const { chapters } = await get("/chapters?language=fr");
const result = [];
for (let offset = 0; offset < chapters.length; offset += 4) {
  const batch = await Promise.all(
    chapters.slice(offset, offset + 4).map(async (chapter) => {
      const verses = [];
      let page = 1;
      do {
        const data = await get(
          `/verses/by_chapter/${chapter.id}?words=true&word_fields=page_number,line_number&per_page=50&page=${page}`,
        );
        for (const verse of data.verses) {
          if (verse.verse_number !== verses.length + 1)
            throw new Error(`Missing verse in ${chapter.id}`);
          const first = verse.words[0];
          const last = verse.words.at(-1);
          const span = [
            first.page_number,
            first.line_number,
            last.page_number,
            last.line_number,
          ];
          if (
            span.some((n) => !Number.isInteger(n)) ||
            span[0] < 1 ||
            span[2] > 604 ||
            span[1] < 1 ||
            span[3] > 15
          ) {
            throw new Error(`Invalid location ${verse.verse_key}`);
          }
          verses.push(span);
        }
        page = data.pagination.next_page;
      } while (page);
      if (verses.length !== chapter.verses_count)
        throw new Error(`Incomplete chapter ${chapter.id}`);
      console.log(
        `${chapter.id}/114 ${chapter.name_simple}: ${verses.length} verses`,
      );
      return {
        id: chapter.id,
        name: chapter.name_simple,
        arabic: chapter.name_arabic,
        translation: chapter.translated_name.name,
        pages: chapter.pages,
        verses,
      };
    }),
  );
  result.push(...batch);
}
if (
  result.length !== 114 ||
  result.reduce((sum, c) => sum + c.verses.length, 0) !== 6236
) {
  throw new Error("Incomplete Quran metadata");
}
const data = {
  source: base,
  documentation:
    "https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/verses-by-chapter-number/",
  fetchedAt: new Date().toISOString(),
  edition: "Mushaf de Médine, 604 pages, Hafs",
  verseFormat: "[startPage, startLine, endPage, endLine]",
  chapters: result,
};
await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/data/quran.json", import.meta.url),
  `${JSON.stringify(data)}\n`,
);
