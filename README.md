# tessera

A read-only window on a library of **cards**: atomic mathematical statements — a theorem, a
definition, a displayed equation — each one lifted verbatim out of the paper it came from, with
its dependencies and its related papers drawn as a graph.

The site is static: no server, no API, no build step at runtime. Open `index.html`.

* **Search** — relevance ranking (coverage, spelling, proximity, then BM25), with
  `author:`, `year:`, `cluster:`, `kind:`, `paper:` filters, and a sort by publication date.
* **A card** — its statement rendered with the paper's own macros, its abstract, the paper it
  came from, and a link to the source.
* **The graph** — the focus card, what it depends on, what depends on it, its similar
  neighbours inside the paper, and the related papers elsewhere in the library.

## Provenance

Every card points back at the paper it came from (`provenance` carries the source id and the
line in the source file), and the papers are linked at arXiv. The statements are short excerpts,
quoted with attribution; the abstracts are the papers' own text, reproduced so a card can be read
in context. Copyright in that text remains with the authors.

## This repository

This is the published site and nothing else. The pipeline that produces it — harvesting papers,
washing them into cards, indexing, searching — lives in a separate, private repository, and the
files here are its output.
