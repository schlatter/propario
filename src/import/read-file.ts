/**
 * A table file into grids, one per sheet: Excel workbooks through SheetJS, everything else as
 * text (CSV, TSV, Markdown, an AI's answer saved as .txt or .md, JSON). Imports SheetJS, so only
 * the import pages load it.
 */
import { readWorkbook, sheetToGrid, type Grid } from './excel'
import { textToGrids } from './table-text'

/** For a file input's `accept`. */
export const TABLE_FILES =
  '.xlsx,.xlsm,.xls,.csv,.tsv,.md,.markdown,.txt,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain,text/markdown,application/json'

export async function readTableFile(file: File): Promise<Record<string, Grid>> {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    const wb = readWorkbook(await file.arrayBuffer())
    return Object.fromEntries(wb.SheetNames.map((name) => [name, sheetToGrid(wb.Sheets[name])]))
  }
  const base = file.name.replace(/\.[^.]+$/, '') || 'Import'
  const grids = textToGrids(await file.text())
  return Object.fromEntries(grids.map((g, i) => [grids.length > 1 ? `${base} ${i + 1}` : base, g]))
}
