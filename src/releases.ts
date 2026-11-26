/**
 * What people see once after an update ("What's new"), at most four short lines per release,
 * in every language. Newest first. The full list is CHANGELOG.md.
 */
import type { Locale } from './i18n'

export interface Release {
  version: string
  notes: Record<Locale, string[]>
}

export const RELEASES: Release[] = [
  {
    version: '0.23.0',
    notes: {
      en: [
        'A new comparison starts with its name and your own words instead of an empty table.',
        'Optional with AI: let it propose requirements and up to ten candidates, check everything first.',
        'Requirements like “Width at most 60 cm” are checked for you; common ones take one click.',
        'Products taken from a table fetch their picture and details from the shop page.',
      ],
      de: [
        'Ein neuer Vergleich startet mit Name und deinen eigenen Worten statt mit einer leeren Tabelle.',
        'Optional mit KI: Anforderungen und bis zu zehn Kandidaten vorschlagen lassen, alles vorher prüfen.',
        'Anforderungen wie „Breite max. 60 cm“ prüft Propario selbst; häufige gibt es mit einem Klick.',
        'Aus einer Tabelle übernommene Produkte holen Bild und Details von ihrer Shopseite.',
      ],
    },
  },
  {
    version: '0.22.0',
    notes: {
      en: [
        'On a phone, scroll the table sideways and the product column keeps just the pictures.',
        'Selected products have their own ⋯: update, load pictures, export or delete just them.',
        'Export as .xlsx, .ods, .csv or .json. Comparing is a balance now, a duel crossed swords.',
        'Side by side fits the screen: no empty space below, the size comparison opens when you want it.',
      ],
      de: [
        'Am Handy behält die Produktspalte beim seitlichen Wischen nur die Bilder.',
        'Ausgewählte Produkte haben ihr eigenes ⋯: nur sie aktualisieren, Bilder laden, exportieren oder löschen.',
        'Export als .xlsx, .ods, .csv oder .json. Vergleichen ist jetzt eine Waage, das Duell zwei Schwerter.',
        'Der Vergleich passt auf den Bildschirm: kein leerer Platz mehr, der Größenvergleich öffnet sich auf Klick.',
      ],
    },
  },
  {
    version: '0.21.0',
    notes: {
      en: [
        'The selection is a symbol now: a circle for open, a tick for checked, a cross for excluded.',
        'Against a price reference the note is short too: “Ref.” and the difference, like +€70.',
        'Rank, selection and price take less room.',
      ],
      de: [
        'Die Auswahl ist jetzt ein Symbol: Kreis für offen, Haken für geprüft, Kreuz für ausgeschlossen.',
        'Mit Preisreferenz ist die Notiz auch kurz: „Ref.“ und die Differenz, etwa +70 €.',
        'Platz, Auswahl und Preis brauchen weniger Raum.',
      ],
    },
  },
  {
    version: '0.20.0',
    notes: {
      en: [
        'More room for the data on a phone: a narrower product column and one row of tools.',
        'The stage is now the coloured dot before the name; tap it to change the stage.',
        '“+ Product” sits next to the filter, and “Load images” is in the ⋯ menu.',
        'Under the price, the difference to the budget is short now: −€500.01*.',
      ],
      de: [
        'Mehr Platz für die Daten am Handy: eine schmalere Produktspalte und eine Zeile für die Werkzeuge.',
        'Der Stand ist jetzt der farbige Punkt vor dem Namen, ein Tipp darauf ändert ihn.',
        '„+ Produkt“ steht neben dem Filter, „Bilder laden“ ist im ⋯-Menü.',
        'Unter dem Preis steht der Abstand zum Budget jetzt kurz: −500,01 €*.',
      ],
    },
  },
  {
    version: '0.19.0',
    notes: {
      en: [
        'New: “Find and ask” bottom right – find more products in shops, used and on deals.',
        'Ask your AI: copy the comparison into ChatGPT or Claude, paste the answer back – any subscription.',
        'Products from the answer come in with picture, price and dimensions read from the shop.',
        'With an API key your AI answers right here – off until you switch it on in Settings.',
      ],
      de: [
        'Neu: „Finden und fragen“ unten rechts – mehr Produkte finden, in Shops, gebraucht, als Schnäppchen.',
        'KI fragen: Vergleich in ChatGPT oder Claude kopieren, Antwort zurück einfügen – mit jedem Abo.',
        'Produkte aus der Antwort kommen mit Bild, Preis und Maßen direkt aus dem Shop.',
        'Mit API-Schlüssel antwortet deine KI direkt hier – aus, bis du sie in den Einstellungen einschaltest.',
      ],
    },
  },
  {
    version: '0.18.0',
    notes: {
      en: ['Settings and the start page link to the user guide and the source code.', 'A new line on the start page: “Compare faster, decide better.”'],
      de: [
        'Einstellungen und Startseite verlinken jetzt die Anleitung und den Quellcode.',
        'Neue Zeile auf der Startseite: „Schneller vergleichen, besser entscheiden.“',
      ],
    },
  },
  {
    version: '0.17.3',
    notes: {
      en: ['In your room, a tap sets the product down right where you tap.'],
      de: ['Im Raum stellt ein Tipp das Produkt genau dort ab, wo du hintippst.'],
    },
  },
  {
    version: '0.17.2',
    notes: {
      en: ['3D view tidied up: "Edit 3D model" opens the parts, and the ⓘ explains on a tap.'],
      de: ['3D-Ansicht aufgeräumt: „3D-Modell bearbeiten“ öffnet die Teile, das ⓘ erklärt beim Antippen.'],
    },
  },
  {
    version: '0.17.1',
    notes: {
      en: ['3D: arrow symbols to turn; shorter hints. In the room, one finger turns the product again.'],
      de: ['3D: Pfeilsymbole zum Drehen, kürzere Hinweise. Im Raum dreht wieder ein Finger das Produkt.'],
    },
  },
  {
    version: '0.17.0',
    notes: {
      en: [
        'In your room by AR, on phones that support it: set the product down, turn it, compare in place.',
        'Set a dimension drawing for 3D: views and form are read by themselves, e.g. from IKEA.',
        'Photos taken from an angle are straightened onto the front by their four corners.',
        'Fixed: turning in 3D or dragging corners no longer jumps to the next product.',
      ],
      de: [
        'Per AR im eigenen Raum, auf Handys, die das können: Produkt abstellen, drehen, vor Ort vergleichen.',
        'Maßzeichnung für 3D festlegen: Ansichten und Form werden selbst gelesen, z. B. von IKEA.',
        'Schräg fotografierte Fotos werden über vier Ecken gerade auf die Front gelegt.',
        'Behoben: Drehen in 3D oder Ecken ziehen springt nicht mehr zum nächsten Produkt.',
      ],
    },
  },
  {
    version: '0.16.0',
    notes: {
      en: [
        'Sizes to scale side by side and in duels – next to or over each other, with the space you have.',
        'Set a picture as front, side or back: a dimension drawing then stands to scale.',
        'The products in 3D, also from their details – a buffet’s base and top as parts.',
        'A shorter start page that leads straight into the demo.',
      ],
      de: [
        'Größen maßstabsgetreu, auch im Duell – neben- oder übereinander, mit dem Platz, den ihr habt.',
        'Bilder als Vorder-, Seiten- oder Rückansicht festlegen: Maßzeichnungen stehen dann im Maßstab.',
        'Die Produkte in 3D, auch aus den Details – Unterteil und Aufsatz eines Buffets als Teile.',
        'Eine kürzere Startseite, die direkt in die Demo führt.',
      ],
    },
  },
  {
    version: '0.15.3',
    notes: {
      en: ['Duels only between favourites and what everyone likes – the decision comes faster.'],
      de: ['Duelle nur zwischen Favoriten und dem, was allen gefällt – die Entscheidung kommt schneller.'],
    },
  },
  {
    version: '0.15.2',
    notes: {
      en: ['Duels: larger pictures; star and verdicts on each product, as in the table.'],
      de: ['Duelle: größere Bilder; Stern und Urteile an jedem Produkt, wie in der Tabelle.'],
    },
  },
  {
    version: '0.15.1',
    notes: {
      en: ['Duels: shorter texts, a progress bar, ✓ to choose and "Later" in the middle.'],
      de: ['Duelle: kürzere Texte, ein Fortschrittsbalken, ✓ zum Wählen und „Später“ in der Mitte.'],
    },
  },
  {
    version: '0.15.0',
    notes: {
      en: [
        'The demo has three comparisons – sideboard, headphones, robot vacuum – with new pictures.',
        'Filtered, the product tab shows how many of all ("14/66").',
        '"Reviews" is a new kind of exclusion reason.',
        'Same action, same name everywhere; a shorter start page.',
      ],
      de: [
        'Die Demo hat drei Vergleiche – Sideboard, Kopfhörer, Saugroboter – mit neuen Bildern.',
        'Gefiltert zeigt der Produkte-Reiter, wie viele von allen („14/66“).',
        '„Bewertung“ ist eine neue Art von Ausschlussgrund.',
        'Gleiche Aktion, gleicher Name überall; eine kürzere Startseite.',
      ],
    },
  },
  {
    version: '0.14.2',
    notes: {
      en: ['Not judged yet shows a question mark – no longer the neutral symbol.'],
      de: ['Noch nicht beurteilt zeigt ein Fragezeichen – nicht mehr das Neutral-Symbol.'],
    },
  },
  {
    version: '0.14.1',
    notes: {
      en: [
        'Duels only between your starred and liked products; "Later" puts one off.',
        'The table is sorted by the place from the duels.',
        'Verdicts: agreement as a number, a different verdict as its symbol.',
        'Swiping fits one screen, without the others’ verdicts.',
      ],
      de: [
        'Duelle nur zwischen deinen Favoriten und Gefällt-mir; „Später“ schiebt eins auf.',
        'Die Tabelle ist nach dem Platz aus den Duellen sortiert.',
        'Urteile: Übereinstimmung als Zahl, ein anderes Urteil als Symbol.',
        'Swipen passt auf einen Bildschirm, ohne die Urteile der anderen.',
      ],
    },
  },
  {
    version: '0.14.0',
    notes: {
      en: [
        'Duels: two side by side, the better one moves up – your first place after a few taps.',
        'Favourites are personal now; star right while swiping.',
        'Swiping: a larger picture, all pictures on a tap, and what the others said.',
        'Side by side: a bar and the difference for every number.',
      ],
      de: [
        'Duelle: zwei nebeneinander, das bessere steigt auf – dein Platz 1 nach wenigen Tipps.',
        'Favoriten sind jetzt persönlich; Stern direkt beim Swipen.',
        'Swipen: größeres Bild, alle Bilder auf Tipp, und was die anderen sagen.',
        'Vergleich: Balken und Differenz für jede Zahl.',
      ],
    },
  },
  {
    version: '0.13.3',
    notes: {
      en: ['After an update the app no longer hangs at the start when another window of it is frozen in the background.'],
      de: ['Kein Hängen mehr beim Start nach einem Update, wenn ein anderes App-Fenster im Hintergrund eingefroren ist.'],
    },
  },
  {
    version: '0.13.2',
    notes: {
      en: ['Pictures: pasting, dropping or choosing always adds a picture – none is replaced any more.', 'Ctrl+V adds a picture anywhere in the details.'],
      de: [
        'Bilder: Einfügen, Hineinziehen oder Wählen fügt immer ein Bild hinzu – keins wird mehr ersetzt.',
        'Strg+V fügt überall in den Details ein Bild hinzu.',
      ],
    },
  },
  {
    version: '0.13.1',
    notes: {
      en: ['Details: the shop link stands out; with a mouse, arrows at the picture’s edges step through the pictures.'],
      de: ['Details: Der Shop-Link fällt mehr auf; mit der Maus blättern Pfeile am Bildrand durch die Bilder.'],
    },
  },
  {
    version: '0.13.0',
    notes: {
      en: [
        'Details: large pictures you swipe through, price and dimensions on one line each.',
        'One “Pictures” menu and one ⋮ menu instead of many buttons; the verdict works like in the table.',
        'Export is one entry with Excel, JSON and “Copy for my AI”.',
      ],
      de: [
        'Details: große Bilder zum Durchwischen, Preis und Maße je in einer Zeile.',
        'Ein Menü „Bilder“ und ein ⋮-Menü statt vieler Knöpfe; das Urteil funktioniert wie in der Tabelle.',
        'Exportieren ist ein Eintrag mit Excel, JSON und „Für meine KI kopieren“.',
      ],
    },
  },
  {
    version: '0.12.2',
    notes: {
      en: ['The table shows only your verdict – neutral until you give one; a tap changes it.'],
      de: ['Die Tabelle zeigt nur dein Urteil – neutral, bis du eins gibst; ein Tipp ändert es.'],
    },
  },
  {
    version: '0.12.1',
    notes: {
      en: ['Fit and verdicts have their own columns again – compact rows.', 'Set your verdict right in the table: 👍 ⊖ 👎.'],
      de: ['Eignung und Urteile wieder in eigenen Spalten – kompakte Zeilen.', 'Dein Urteil direkt in der Tabelle setzen: 👍 ⊖ 👎.'],
    },
  },
  {
    version: '0.12.0',
    notes: {
      en: [
        'One way to judge: Open, Checked or Excluded, a star for favourites, and 👍 · neutral · 👎 from everyone.',
        'The fit sits under the requirements – and says “Must not met” where a must fails.',
        'Details: shop link under the picture, price in €, explanations behind a quiet ⓘ.',
        'Shops that refuse automated access say so; name and size come from the link instead.',
      ],
      de: [
        'Ein Bewertungssystem: Offen, Geprüft oder Ausgeschlossen, ★ für Favoriten, 👍 · neutral · 👎 von allen.',
        'Die Eignung steht unter den Anforderungen – und sagt „Muss nicht erfüllt“, wo ein Muss fehlt.',
        'Details: Shop-Link unter dem Bild, Preis in €, Erklärungen hinter einem dezenten ⓘ.',
        'Shops, die automatische Abrufe ablehnen, sagen das; Name und Maße kommen dann aus dem Link.',
      ],
    },
  },
  {
    version: '0.11.0',
    notes: {
      en: [
        'Changes show at once and are saved in the background – no more waiting after each tap.',
        'Your verdict in the details: like or not, also to put a wrong swipe right.',
        'Fields as a table like the requirements; every text field says what belongs in it.',
        'No more hanging start; Settings → Troubleshooting for a log and a support package.',
      ],
      de: [
        'Änderungen erscheinen sofort und werden im Hintergrund gespeichert – kein Warten mehr nach jedem Tippen.',
        'Dein Urteil in den Details: gefällt mir oder nicht, auch um einen falschen Wisch zu korrigieren.',
        'Felder als Tabelle wie die Anforderungen; jedes Textfeld sagt, was hineingehört.',
        'Kein hängender Start mehr; Einstellungen → Fehlersuche für Protokoll und Support-Paket.',
      ],
    },
  },
  {
    version: '0.10.0',
    notes: {
      en: [
        'New: “What Propario can do” in the menu – and as the start page for visitors.',
        'A demo with an invented comparison to try everything – nothing is saved.',
      ],
      de: [
        'Neu: „Was Propario kann“ im Menü – und als Startseite für Besucher.',
        'Eine Demo mit erfundenem Vergleich zum Ausprobieren – nichts wird gespeichert.',
      ],
    },
  },
  {
    version: '0.9.3',
    notes: {
      en: ['Upright pictures fit the gallery whole; the magnifier enlarges where you tap.', '“Reset this browser” now says clearly whether it worked.'],
      de: [
        'Hochformatige Bilder passen ganz in die Galerie; die Lupe vergrößert dort, wo du tippst.',
        '„Browser zurücksetzen“ sagt jetzt klar, ob es geklappt hat.',
      ],
    },
  },
  {
    version: '0.9.2',
    notes: {
      en: [
        'If Propario does not start, it now says why after a few seconds instead of staying blank.',
        '“Reset this browser” fixes a stuck start; you stay signed in.',
      ],
      de: [
        'Startet Propario nicht, sagt es nach wenigen Sekunden warum, statt weiß zu bleiben.',
        '„Browser zurücksetzen“ behebt einen hängenden Start; du bleibst angemeldet.',
      ],
    },
  },
  {
    version: '0.9.1',
    notes: {
      en: [
        'No more blank page in the installed app after an update: it reloads by itself.',
        'The logo’s magnifying glass now has its handle right at the ring.',
      ],
      de: [
        'Kein weißer Bildschirm mehr in der installierten App nach einem Update: Sie lädt sich selbst neu.',
        'Beim Logo sitzt der Lupengriff jetzt direkt am Ring.',
      ],
    },
  },
  {
    version: '0.9.0',
    notes: {
      en: [
        'New look: a new logo, and petrol and amber across the app.',
        'Add or update products from a pasted table or a file – also your AI’s answer.',
        '“Copy for my AI” now ends with a table the AI can answer in.',
        'Imports read CSV, Markdown, text and JSON as well as Excel.',
      ],
      de: [
        'Neuer Auftritt: neues Logo, Petrol und Bernstein in der ganzen App.',
        'Produkte aus einer eingefügten Tabelle oder Datei ergänzen oder aktualisieren – auch die Antwort deiner KI.',
        '„Für meine KI kopieren“ endet jetzt mit einer Tabelle, in der die KI antworten kann.',
        'Importe lesen neben Excel auch CSV, Markdown, Text und JSON.',
      ],
    },
  },
  {
    version: '0.8.0',
    notes: {
      en: [
        'Several pictures per product – a dimension drawing is found on the shop page where possible.',
        'Tap the picture: a full-screen gallery; the star marks the main picture.',
        'Step through products in the details with ‹ ›, the arrow keys or a swipe.',
        'By default only products still in the running are shown.',
      ],
      de: [
        'Mehrere Bilder pro Produkt – eine Maßzeichnung wird auf der Shopseite gesucht.',
        'Bild antippen: Galerie im Vollbild; der Stern markiert das Hauptbild.',
        'In den Details mit ‹ ›, Pfeiltasten oder Wischen von Produkt zu Produkt.',
        'Standardmäßig sind nur noch infrage kommende Produkte zu sehen.',
      ],
    },
  },
  {
    version: '0.7.0',
    notes: {
      en: [
        'Requirements as a compact table – with each one’s weight in the fit.',
        'Budget with at most and at least, each with its own priority.',
        'Own price rules move into the budget with one click.',
        'Missing fields are created from the requirement; rows move by dragging.',
      ],
      de: [
        'Anforderungen als kompakte Tabelle – mit dem Gewicht jeder einzelnen.',
        'Budget mit Höchst- und Mindestbetrag, jeweils mit eigener Priorität.',
        'Eigene Preisregeln wandern mit einem Klick ins Budget.',
        'Fehlende Felder entstehen aus der Anforderung; Zeilen verschiebt man per Ziehen.',
      ],
    },
  },
  {
    version: '0.6.0',
    notes: {
      en: [
        'Install Propario as an app – and share product links to it from other apps.',
        'On phones the filters fold away and more columns fit on screen.',
        'Copy a comparison for your own AI, with a question to answer.',
        'Selection as coloured pills; excluded products stand out in red.',
      ],
      de: [
        'Propario als App installieren – und Produktlinks aus anderen Apps hineinteilen.',
        'Auf dem Handy klappen die Filter weg, und mehr Spalten passen auf den Bildschirm.',
        'Einen Vergleich für die eigene KI kopieren, samt Frage.',
        'Auswahl als farbige Pillen; Ausgeschlossene fallen rot auf.',
      ],
    },
  },
  {
    version: '0.5.0',
    notes: {
      en: [
        'Every comparison has a budget – a must for every product.',
        'Prices are shown against the budget or a reference product of your choice.',
        'Side by side: best values green, worst red, with the distance to the best.',
        'Excluded products in italics; more products join the side-by-side view.',
      ],
      de: [
        'Jeder Vergleich hat ein Budget – ein Muss für jedes Produkt.',
        'Preise erscheinen im Verhältnis zum Budget oder zu einem Referenzprodukt deiner Wahl.',
        'Gegenüberstellung: beste Werte grün, schlechteste rot, mit Abstand zum besten.',
        'Ausgeschlossene kursiv; weitere Produkte lassen sich zur Gegenüberstellung hinzufügen.',
      ],
    },
  },
  {
    version: '0.4.1',
    notes: {
      en: [
        'New in the details: “Update from shop page” – shows what is new and asks first.',
        'The same link twice makes no second entry.',
        'Selected products: update them from their shop pages or delete them.',
      ],
      de: [
        'Neu in den Details: „Von der Shopseite aktualisieren“ – zeigt, was neu ist, und fragt vorher.',
        'Derselbe Link zweimal ergibt keinen zweiten Eintrag.',
        'Markierte Produkte: von den Shopseiten aktualisieren oder löschen.',
      ],
    },
  },
  {
    version: '0.4.0',
    notes: {
      en: [
        'Add by link: name, brand, dimensions and data sheet come from the shop page.',
        'Filters: quick chips, and an advanced query for any field.',
        'Requirements show right in their column – green or red.',
        'Exclusion reasons, “found on” and a larger picture in the details.',
      ],
      de: [
        'Per Link hinzufügen: Name, Marke, Maße und Datenblatt kommen von der Shopseite.',
        'Filter: Schnellfilter-Chips und eine erweiterte Abfrage über jedes Feld.',
        'Anforderungen erscheinen direkt in ihrer Spalte – grün oder rot.',
        'Ausschlussgründe, Funddatum und ein größeres Bild in den Details.',
      ],
    },
  },
  {
    version: '0.3.0',
    notes: {
      en: [
        'Check elsewhere: price comparisons, Amazon and Stiftung Warentest – without tracking.',
        'Offers from several shops; the cheapest becomes the price.',
        'Ratings from tests and reviews, and a weighted fit per product.',
        'Swipe mode: decide one product at a time.',
      ],
      de: [
        'Woanders prüfen: Preisvergleiche, Amazon und Stiftung Warentest – ohne Tracking.',
        'Angebote mehrerer Shops; das günstigste wird zum Preis.',
        'Bewertungen aus Tests und Erfahrungen, dazu eine gewichtete Eignung.',
        'Swipe-Modus: Produkt für Produkt entscheiden.',
      ],
    },
  },
  {
    version: '0.2.0',
    notes: {
      en: [
        'Propario now lives on a server: sign in with a passkey, no password.',
        'Share a comparison with others – to view or to edit.',
        'Product pictures: fetched from the shop link, pasted or dropped.',
        'Comparisons from this browser can be moved to your account under Backup.',
      ],
      de: [
        'Propario läuft jetzt auf einem Server: Anmeldung per Passkey, ohne Passwort.',
        'Vergleiche mit anderen teilen – zum Ansehen oder Bearbeiten.',
        'Produktbilder: aus dem Shop-Link geladen, eingefügt oder hineingezogen.',
        'Vergleiche aus diesem Browser lassen sich unter Sicherung ins Konto verschieben.',
      ],
    },
  },
]

/** The release part of a version like 0.2.0+4d837a1. */
export const releaseOf = (version: string) => version.split('+')[0]

export const notesFor = (version: string) => RELEASES.find((r) => r.version === releaseOf(version))
