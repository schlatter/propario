# Glossary

| Interface (EN / DE)                        | Code                        | Meaning                                                                      |
| ------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| Comparison / Vergleich                     | `project`                   | One purchase decision with its products, fields and requirements.            |
| Product / Produkt                          | `product`                   | One candidate.                                                               |
| Field / Feld                               | `property` (`PropertyDef`)  | A column defined per comparison (type, unit).                                |
| Requirement / Anforderung                  | `requirement`               | What a product should meet; optionally checked automatically (`condition`).  |
| Owner, can edit, can view                  | `owner`, `editor`, `viewer` | A person's role on a comparison.                                             |
| Invitation / Einladung                     | `invite`                    | Single-use link that admits a new account.                                   |
| Recovery key / Wiederherstellungsschlüssel | `recovery key`              | One-time key to get back in without a passkey.                               |
| Favourite / Favorit                        | `favorites`                 | A person's own star on a product (old shared stars: `favorite`).             |
| Verdict / Urteil                           | `votes`                     | A person's 👍 · neutral · 👎 on a product.                                   |
| Duel / Duell                               | `rankings` (`duel.ts`)      | Two products side by side; the better one moves up in that person's ranking. |
| —                                          | `change`, `seq`             | A create/patch/delete sent to the server; the counter the browser syncs by.  |
