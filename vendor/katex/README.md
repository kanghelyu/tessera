# Vendored: KaTeX 0.18.7

A copy of [KaTeX](https://katex.org/) so the card window renders mathematics without
needing anything else installed on the machine.

    katex.min.js          272 KB
    katex.min.css          25 KB
    fonts/*.woff2         20 files, 367 KB

Taken from the OmniFlow install on this machine
(`~/.omni-flow/studio/vendor/katex`), which is the same build the project used to read
from that path. **Fonts are woff2 only**: KaTeX's stylesheet lists
`woff2, woff, ttf` in that order for every face, and every browser that can run this UI
supports woff2, so the other two formats were dropped rather than shipped. The stylesheet
itself is unmodified, so it can still be diffed against upstream.

KaTeX is MIT licensed; the licence text is in `LICENSE`.

Nothing else here is vendored, and nothing here is a *runtime* dependency in the sense the
README means: the project's Python is standard-library only. This is a static asset served
to the browser, and it is the one third-party artefact in the repository.
