# Roadmap – ideas, not promises

A loose collection of what might come next, sorted by how soon it seems sensible. Nothing here is
a commitment, and anything may move, change or be dropped. What is decided goes into an issue;
what is done goes into [CHANGELOG.md](../CHANGELOG.md). The rule for anything with AI stays the
one in [AGENTS.md](../AGENTS.md): Propario works without it, and AI only proposes.

## Now

Nothing at the moment; the next pick comes from _Next_.

## Next

- **Test the path with a connected AI end to end** – asking, the answer, ticking its links,
  taking its table – with the server's answers faked in the browser, so it costs no tokens. The
  provider side is already tested with a stand-in (`server/ai.test.ts`).
- **A price limit for more shops** in "Find and ask", once a shop's search address for it is
  documented or stable (today: eBay and Kleinanzeigen).
- **Tests and best lists** – Stiftung Warentest and similar – as a source in "Find and ask".
- **From a question to a filter:** the AI turns "less than 40 cm deep" into the Advanced filter's
  query; only the field names go to it, the filtering stays Propario's.

## Later

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
