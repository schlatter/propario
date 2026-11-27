# Roadmap – ideas, not promises

A loose collection of what might come next, sorted by how soon it seems sensible. Nothing here is
a commitment, and anything may move, change or be dropped. What is decided goes into an issue;
what is done goes into [CHANGELOG.md](../CHANGELOG.md). The rule for anything with AI stays the
one in [AGENTS.md](../AGENTS.md): Propario works without it, and AI only proposes.

## Now

- **One link, everything there:** the shop-page reader for the shops people use most. Amazon is
  done: picture, gallery, price, name, brand and GTIN from its own markup, all on the one
  product page. Next eBay, then the untested ones from `scripts/check-shop-pages.ts`. Where a page
  holds too little, a documented interface or a maintained open-source reader of shop pages may
  help, as long as it needs no affiliate account and adds no service to run. Each shop gets a test
  with a saved page of invented content. Open question, decided per shop: whether reading more
  than the one page behind a link helps (a spec or variant page of the same product) and is
  lawful; Amazon does not need it. What stays: Propario's own name, no disguised client, no way
  around a bot wall; a shop that refuses gets its "copy the picture" hint.

## Next

- **What you have now, as a yardstick:** a product can be marked as the one to be replaced (the
  bulky tripod, the old sideboard). It stands in the comparison for orientation, with its values
  and picture, but it is no candidate: no verdict, no duel, no fit, never the decision. Side by
  side and in the size comparison it is the line the candidates are measured against (lighter,
  smaller, cheaper than ours). The start card offers it for each link in the goal: _add as
  product_ or _this is what we have_. Optional, as everything at the start.
- **Test the path with a connected AI end to end** – asking, the answer, ticking its links,
  taking its table – with the server's answers faked in the browser, so it costs no tokens. The
  provider side is already tested with a stand-in (`server/ai.test.ts`).
- **A price limit for more shops** in "Find and ask", once a shop's search address for it is
  documented or stable (today: eBay and Kleinanzeigen).
- **Tests and best lists** – Stiftung Warentest and similar – as a source in "Find and ask".
- **From a question to a filter:** the AI turns "less than 40 cm deep" into the Advanced filter's
  query; only the field names go to it, the filtering stays Propario's.

## Later

- **Colours and other variants of one product:** today each colour is its own product with all
  its data copied. Better: one product with a variant picker above its picture, each variant
  with its own pictures, colour, price and link where they differ, and everything else shared.
  Open: whether a variant can be judged, excluded or chosen on its own (one colour fits the room,
  the other does not), or whether that needs real copies after all; and how the table, swipe
  and duel show a product with variants.
- **What you bought, as a small inventory:** every decided comparison already holds the product,
  its price, shop, date and return deadline, the links and the pictures. Two ways to use that,
  to be weighed when the time comes: a view of everything bought (warranty and return dates,
  receipts, what replaced what), or an export in a format that existing self-hosted inventory
  tools read, so Propario stays a tool for deciding. Check first what they import (Homebox,
  Snipe-IT, Grocy and similar) and prefer their format over a new one.
- **Units in the profile:** metric or inches and pounds, chosen once per person; fields, checks,
  the size comparison and the shop-page reader convert to it.
- **Polish the app's texts**, in the voice of the start page: shorter, plainer, more like a
  person talks ([docs/brand.md](brand.md), Voice).
- **A compact card view on phones**: small product cards one below the other, far smaller than
  in the swipe view. Either the phone's only view of the products or an extra one next to the
  table; first see whether the table that folds to its pictures is enough.
- **A short video in the README** – 10–15 seconds from a link to a decision: paste, swipe, duel,
  decide; what it should show best is still open.
- **A local AI** (Ollama, LM Studio …) for the whole instance, its address set by whoever runs
  it – not typed in by people, so the server cannot be pointed elsewhere.
- **Propario as a connector in ChatGPT or Claude** (MCP), so a chat subscription can work with a
  comparison – needs the instance reachable from the internet and a sign-in for the connector.
- **"Sign in with ChatGPT"** with one's subscription, should OpenAI open it beyond selected
  partners.
- **Exploring with an agent before a release**, writing what it finds as ordinary Playwright
  tests that then run without any AI (the idea behind
  [explore-compile-replay](https://github.com/pierridotite/explore-compile-replay)).
