# Excel import – how sheets are read

Derived from analysing two real, hand-maintained workbooks (about 50 comparison sheets plus one
workbook with separate product and requirement sheets). No data from them is stored in this repo;
tests use synthetic workbooks with the same layouts.

## Layouts seen

1. **One sheet per comparison.** Header in row 1, one product per row. Common columns:
   `Anbieter`/`Hersteller`, `System`/`Modell`, `Auswahl` (ja/nein), `Preis`, `Gekauft` (date or free
   text), `Kommentar`, `Punkte`, a column named after a person (comments by that person), `Link`.
   Everything else is category specific (dimensions, RAM, energy class …). Below the products,
   free blocks such as `Anforderungen` (sometimes with `Must Have` / `Should have` / `Nice to have`,
   a budget like `500€`, limits like `Tiefe max.: 63`, or one column per person),
   `Aktuelles System`, `Ehemaliges System`, `Links`.
   Product links are often hyperlinks on the model cell, not a separate URL.
2. **Products and requirements on separate sheets.** Title rows above the header, an `ID` column,
   `Einschätzung` (Favorit / Kompromiss / Ausgeschieden / Ungeklärt), `Favoritenrang`,
   `Gefunden von`, units in headers (`Breite (cm)`), links as `=HYPERLINK("url";"text")` formulas.
   Requirement sheet with `Kategorie | Anforderung | Priorität | Details` and priorities
   MUSS, WICHTIG, WUNSCH, BONUS, VERMEIDEN, OPTION, OFFEN, INFO, POSITIV, FAVORIT.

## Rules

| Step                       | Rule                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header row                 | Best of the first 20 rows by number of recognised column names (German and English synonyms, see `src/import/synonyms.ts`). A row containing _Anforderung_ + _Priorität_ marks a requirement sheet.                                                                                                                        |
| End of products            | First row whose first cell starts a section (`Anforderungen`, `… Anforderungen`, `Aktuelles System`, `Ehemaliges System`, `Links`, `Notizen`).                                                                                                                                                                             |
| Product rows               | Rows with a brand or model, or at least two mapped values.                                                                                                                                                                                                                                                                 |
| Unknown columns            | Become custom fields. Type is inferred: number (≥60 % numeric, unit from header or values), yes/no, date, link, choice (few repeated short values), otherwise text.                                                                                                                                                        |
| Values that do not fit     | Stored as raw text (shown in italics), never dropped.                                                                                                                                                                                                                                                                      |
| GTIN / EAN, MPN            | `EAN`, `GTIN`, `Herstellernummer`, `MPN` columns fill the product's identifiers. A GTIN is taken only as a clean digit string (Excel's scientific notation such as `4.00638E+12` is kept as raw text instead); a part number up to 64 characters.                                                                          |
| Price                      | Number when unambiguous (`1,500 €`, `1.234,50`), otherwise leading number plus the original text as price note (`830 – 900 €`).                                                                                                                                                                                            |
| `Gekauft`                  | Any value except “nein” marks the product as bought; dates become the purchase date, other text the purchase note. Projects with bought products get status _Purchased_.                                                                                                                                                   |
| `Auswahl` / `Einschätzung` | ja/Favorit → favourite, nein/Ausgeschieden → excluded, anything else stays open and is kept under “Imported extras”.                                                                                                                                                                                                       |
| Person columns             | A column whose header is a known person (Settings → People) becomes that person's rating note (or stars for 1–5).                                                                                                                                                                                                          |
| Requirements               | Section rows become requirements. Priority words are mapped; free lines default to _Important_. Budget lines become `Price ≤ x`. A limit (“max”, “bis”, “mindestens”, “min.”) plus a number becomes an automatic check when a numeric field with a matching name exists (`Maximale Tiefe – Maximal 45 cm` → `Tiefe ≤ 45`). |
| Notes                      | All other section content (current system, links, availability) goes into the comparison's notes.                                                                                                                                                                                                                          |
| Separate requirement sheet | Attached to the workbook's product sheet; the comparison is named after the file.                                                                                                                                                                                                                                          |

Every decision above is visible and changeable in the import wizard before anything is saved.

**Pasted into an existing comparison** (_Add or update products_, also an AI's answer to the start
request): the first product table updates and adds products as above; the first requirement table
(`Priority | Requirement | Rule | Description`, German headers too) adds the requirements the
comparison does not have in the same words. A rule names a field with its unit in brackets, a
comparison and a number; it checks the field of that name, or a new number field, and `Price`
checks the price. Without a rule, a limit and a number in the requirement's words do the same.

## Known limits

- Cells that Excel stored as dates by mistake (e.g. `5.4` typed into a date-formatted cell) arrive
  as dates; change the field type in the wizard if needed.
- Combined dimensions such as `60 x 185 x 60,5` stay text; add separate width/height/depth
  fields if you want automatic checks on them.
- Requirement text without a matching numeric field stays a manual check (click the mark to set it).
