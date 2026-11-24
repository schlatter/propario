# Glossary

The interface's words (English, the source language) and the code's. Translations use their own
words for the same things, in their language file (`src/i18n/de.ts`).

| Interface                 | Code                        | Meaning                                                                      |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Comparison                | `project`                   | One purchase decision with its products, fields and requirements.            |
| Product                   | `product`                   | One candidate.                                                               |
| Field                     | `property` (`PropertyDef`)  | A column defined per comparison (type, unit).                                |
| Requirement               | `requirement`               | What a product should meet; optionally checked automatically (`condition`).  |
| Owner, can edit, can view | `owner`, `editor`, `viewer` | A person's role on a comparison.                                             |
| Invitation                | `invite`                    | Single-use link that admits a new account.                                   |
| Recovery key              | `recovery key`              | One-time key to get back in without a passkey.                               |
| Favourite                 | `favorites`                 | A person's own star on a product (old shared stars: `favorite`).             |
| Verdict                   | `votes`                     | A person's 👍 · neutral · 👎 on a product.                                   |
| Duel                      | `rankings` (`duel.ts`)      | Two products side by side; the better one moves up in that person's ranking. |
| —                         | `change`, `seq`             | A create/patch/delete sent to the server; the counter the browser syncs by.  |
