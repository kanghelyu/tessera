/* LaTeX rendering for card text.
 *
 * Math is compiled with the KaTeX vendored in ui/vendor/katex, so the window renders
 * offline and needs nothing else installed. If KaTeX is missing the
 * module degrades to a readable plain-text transcription and says so -- it never
 * silently shows raw source, and it never hides a formula it could not compile.
 *
 * Card statements carry `<<ref:key>>` / `<<cite:key>>` where the paper had \ref and
 * \cite. Those markers are how the dependency graph is built, so they stay in storage;
 * here they are restored to something readable -- and, when the target card is in the
 * library, to a clickable reference -- instead of leaking into the rendered text.
 *
 * Exposed as window.TESSERA.tex for the app and for the standalone test harness.
 */
(function (global) {
  "use strict";

  // Environments a paper writes as bare display math, mapped onto what KaTeX accepts.
  const DISPLAY_ENVS = {
    align: "aligned", "align*": "aligned", alignat: "aligned", "alignat*": "aligned",
    eqnarray: "aligned", "eqnarray*": "aligned", split: "aligned",
    gather: "gathered", "gather*": "gathered",
    multline: "aligned", "multline*": "aligned",
    array: "array", cases: "cases", matrix: "matrix", pmatrix: "pmatrix",
    bmatrix: "bmatrix", vmatrix: "vmatrix", smallmatrix: "smallmatrix",
    equation: "aligned", "equation*": "aligned", displaymath: "aligned",
  };

  // How far an inline `$...$` may reach for its closing `$`. A card keeps the source's line
  // breaks, so a wrapped formula is normal; a runaway match is not, and this bounds it.
  const MAX_INLINE_MATH = 400;

  /** LaTeX that KaTeX does not have, translated into what it does.
   *
   * This is not the paper's notation -- that travels with the card -- it is the *renderer*
   * translating the language it was handed. Each entry is here because the library was
   * measured: `tests/measure_render.py` renders every card and reports the command that
   * broke each fragment, and these are the ones that showed up. Nothing is guessed; a
   * mapping that is only approximate says so.
   *
   * The paper's own definitions always win, because this table is merged *under* them: a
   * paper that defines `\mbox` means its own `\mbox`.
   */
  const COMPAT = {
    // Structural commands that carry no content: TeX's own "do nothing here".
    "\\ignorespaces": "", "\\allowdisplaybreaks": "",
    // Text commands used inside mathematics, which KaTeX only knows in text mode.
    "\\ensuremath": "#1", "\\mbox": "\\text{#1}",
    "\\textsuperscript": "^{#1}", "\\textsubscript": "_{#1}",
    // The text-symbol set. KaTeX defines several of these for text mode only, so an author
    // writing `\textendash` in a formula gets "Undefined control sequence" -- 214 fragments
    // of arXiv:1611.04937 did exactly that.
    //
    // The replacement is the *character*, not `\text{\textendash}`: a macro that names itself
    // expands forever, and KaTeX answers that with "Maximum call stack size exceeded" rather
    // than a parse error, so the whole page dies rather than one formula. Each value is the
    // character the command stands for.
    "\\textendash": "\\text{\u2013}",             // en dash
    "\\textemdash": "\\text{\u2014}",             // em dash
    "\\textquoteleft": "\\text{\u2018}",          // left single quote
    "\\textquoteright": "\\text{\u2019}",         // right single quote
    "\\textquotedblleft": "\\text{\u201c}",       // left double quote
    "\\textquotedblright": "\\text{\u201d}",      // right double quote
    "\\textdagger": "\\text{\u2020}",             // dagger
    "\\textdaggerdbl": "\\text{\u2021}",          // double dagger
    "\\textdegree": "\\text{\u00b0}",             // degree sign
    "\\textsterling": "\\text{\u00a3}",           // pound sign
    "\\textsection": "\\text{\u00a7}",            // section sign
    "\\textparagraph": "\\text{\u00b6}",          // pilcrow
    // KaTeX has no text bullet or centered dot at all, so these go to their math twins.
    "\\textbullet": "\\bullet", "\\textperiodcentered": "\\cdot",
    // Text-mode *letters* used in mathematics -- the same class as the symbols above, and the
    // same failure: KaTeX knows them only in text mode, so `\O` in a formula is "Undefined
    // control sequence". Measured on arXiv:1801.06071, whose `\neq \O` failed a fragment.
    // `\th` and `\aa`/`\AA` are deliberately absent: KaTeX already has them, and a paper that
    // redefines `\th` (arXiv:1506.06417 does, to mean θ) wins over this table anyway.
    "\\O": "\\text{\u00d8}", "\\o": "\\text{\u00f8}",          // O-slash
    "\\L": "\\text{\u0141}", "\\l": "\\text{\u0142}",          // L-stroke
    "\\ss": "\\text{\u00df}",                                   // sharp s
    "\\ae": "\\text{\u00e6}", "\\AE": "\\text{\u00c6}",        // ae
    "\\oe": "\\text{\u0153}", "\\OE": "\\text{\u0152}",        // oe
    "\\i": "\\text{\u0131}", "\\j": "\\text{\u0237}",          // dotless i, j
    "\\TH": "\\text{\u00de}", "\\dh": "\\text{\u00f0}",        // thorn, eth
    "\\DH": "\\text{\u00d0}",                                   // capital eth
    "\\ng": "\\text{\u014b}", "\\NG": "\\text{\u014a}",        // eng
    // mathtools. `\accentset` is `\overset` under another name; `\prescript` is the standard
    // left-superscript construction, written out.
    "\\accentset": "\\overset{#1}{#2}", "\\underaccent": "\\underset{#1}{#2}",
    "\\prescript": "{}^{#1}_{#2}#3",
    "\\intertext": "\\text{#1}",
    // Another package's spelling of something KaTeX has.
    "\\mathds": "\\mathbb{#1}",
    // `euscript`'s Euler script. KaTeX has no `\EuScript` and the meaning is fixed, so this is
    // a translation rather than the paper's notation. Measured: 233 fragments of the papers
    // added on 2026-09-28, the largest single offender in the library at the time.
    "\\EuScript": "\\mathscr{#1}",
  };

  const SYMBOLS = {
    subset: "⊂", subseteq: "⊆", supset: "⊃", in: "∈", notin: "∉", leq: "≤", le: "≤",
    geq: "≥", ge: "≥", neq: "≠", ne: "≠", equiv: "≡", cong: "≅", sim: "∼", simeq: "≃",
    to: "→", mapsto: "↦", leftarrow: "←", rightarrow: "→", implies: "⟹", iff: "⟺",
    times: "×", otimes: "⊗", oplus: "⊕", wedge: "∧", vee: "∨", cup: "∪", cap: "∩",
    infty: "∞", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", sqrt: "√",
    pm: "±", mp: "∓", cdot: "·", ldots: "…", dots: "…", cdots: "⋯", circ: "∘",
    dagger: "†", langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", zeta: "ζ",
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
    eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
    nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
    phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ",
    Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ",
    Omega: "Ω", hbar: "ℏ", ell: "ℓ", varphi: "φ",
  };
  // commands whose single argument is the text itself: unwrap, keep the argument
  const TRANSPARENT = ["mathfrak", "mathbb", "mathcal", "mathrm", "mathbf", "mathsf",
                       "mathtt", "boldsymbol", "operatorname", "text", "textrm",
                       "textbf", "textit", "emph", "mbox", "begin", "end", "rm", "bf"];
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
                "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ" };
  const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆",
                "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", i: "ᵢ", j: "ⱼ",
                k: "ₖ", n: "ₙ", m: "ₘ", t: "ₜ", r: "ᵣ", s: "ₛ", a: "ₐ" };

  const PLACEHOLDER = /\u0001(\d+)\u0001/g;
  //: How KaTeX marks a fragment it could not compile. Both spellings appear: a parse error
  //: gets the class, an unsupported command gets the colour and no class.
  const RENDER_ERROR = /katex-error|#cc0000/;
  const state = { katex: null, failures: 0, compiled: 0, missing: [], failed: [], refs: 0,
                  macros: {}, own: {}, macroSource: null };

  function detect() {
    state.katex = global.katex && typeof global.katex.renderToString === "function"
      ? global.katex : null;
    return !!state.katex;
  }

  /** Does the renderer have a *working* definition of this command?
   *
   * This is the other half of LaTeX's own rule: `\newcommand` is skipped when the name is
   * already defined, which is why papers write `\newcommand{\mathcal}{\cal}` under an
   * `\@ifundefined` guard. KaTeX is the authority on what KaTeX knows, so we ask it rather
   * than guessing -- and never override the renderer's own vocabulary.
   *
   * "Knows" has to mean *renders it cleanly*, not *does not throw*. `\Z` is undefined in
   * KaTeX and does **not** throw: it comes back as an inline error span containing the
   * literal `\Z`. Asking only whether it threw said yes, so a paper's
   * `\newcommand{\Z}{\mathbb Z}` was discarded and every `\Z` in the library rendered as an
   * error instead of the integers. A name whose only rendering is an error is not a
   * definition to defer to.
   */
  function katexKnows(name) {
    try {
      const html = state.katex.renderToString("\\" + name + "{}",
                                             { throwOnError: true, strict: false });
      return !RENDER_ERROR.test(html);
    } catch (error) {
      return !/Undefined control sequence/.test(String(error && error.message));
    }
  }

  const macroCache = {};   // source id -> the filtered table, built once per paper

  /** Install a paper's own macros (from its preamble) for subsequent renders.
   *
   * KaTeX's `macros` option keys carry the backslash (`{"\\cT": "\\mathcal T"}`). Passing
   * them bare looks right and does nothing at all: every command stays "undefined" while
   * the status line cheerfully reports how many macros were installed.
   *
   * Filtering is cached per paper, because a list of sixty rows spans a dozen papers and
   * the `katexKnows` test is a render per command. The compatibility table is merged in
   * *under* the result and is never filtered: it is the renderer's own translation, and the
   * paper's definition of the same name is the more specific one.
   */
  function setMacros(table, sourceId, overrides) {
    const key = String(sourceId || "");
    if (!macroCache[key]) {
      const forced = {};
      (overrides || []).forEach((name) => { forced[name] = true; });
      const filtered = {};
      Object.keys(table || {}).forEach((name) => {
        if (!/^[A-Za-z]+$/.test(name)) return;
        // "只用原始的": where the renderer already has a definition, that one is used -- UNLESS
        // the paper redefined the name with `\renewcommand`, which LaTeX applies unconditionally.
        // arXiv:1801.06071 redefines `\H` to mean cohomology; KaTeX's `\H` is an accent, so
        // filtering it left every `\H^*` in the paper broken.
        if (katexKnows(name) && !forced[name]) return;
        filtered["\\" + name] = table[name];
      });
      macroCache[key] = { own: filtered, all: Object.assign({}, COMPAT, filtered) };
    }
    state.own = macroCache[key].own;
    state.macros = state.katex ? macroCache[key].all : {};
    state.macroSource = key;
    return Object.keys(state.own).length;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  /** `\color[rgb]{1,0,0}` -> `\color{#ff0000}`.
   *
   * The bracket form is the color/xcolor package's, and KaTeX takes only a name or a hex
   * value -- it answers the bracket with "Invalid color: '['". Measured on 41 fragments of
   * the papers added on 2026-09-28, all of them highlighting one symbol in a formula.
   * The other models (`cmyk`, `gray`, `HTML`) are left alone rather than guessed at.
   */
  function hexColor(component) {
    const value = Math.max(0, Math.min(255, Math.round(Number(component) * 255)));
    return value.toString(16).padStart(2, "0");
  }

  function translateColors(body) {
    return String(body).replace(
      /\\color\[rgb\]\s*\{\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\}/g,
      (whole, red, green, blue) =>
        "\\color{#" + hexColor(red) + hexColor(green) + hexColor(blue) + "}");
  }

  /** Replace dependency markers by placeholders, collecting what they mean. */
  function substitute(text, options, refs) {
    const table = (options && options.refs) || {};
    let out = String(text == null ? "" : text);
    out = out.replace(/<<ref:([^>]*)>>/g, (whole, key) => {
      const hit = table[key];
      refs.push(hit
        ? { key: key, cardId: hit.card_id || "", label: hit.label || key }
        : { key: key, cardId: "", label: key });
      state.refs += 1;
      return "\u0001" + (refs.length - 1) + "\u0001";
    });
    // A bibliography key is rendered as the key itself. Brackets are the *style's* doing in
    // LaTeX, and papers that write `[\cite{X}]` by hand then came out as `[[X]]` -- the
    // renderer inventing punctuation the source does not have.
    return out.replace(/<<cite:([^>]*)>>/g, (whole, key) => key);
  }

  function placeholderText(body, refs) {
    return String(body).replace(PLACEHOLDER, (whole, index) => {
      const ref = refs[Number(index)];
      if (!ref) return whole;
      return "\\text{" + String(ref.label).replace(/[\\{}]/g, "") + "}";
    });
  }

  /** Split card text into text and math parts. Faithful: nothing is dropped. */
  function segments(text) {
    const source = String(text == null ? "" : text);
    const out = [];
    let buffer = "";
    let index = 0;
    const flush = () => { if (buffer) { out.push({ math: false, body: buffer }); buffer = ""; } };

    while (index < source.length) {
      const char = source[index];

      if (char === "\\" && source.startsWith("\\begin{", index)) {
        const nameEnd = source.indexOf("}", index + 7);
        if (nameEnd > 0) {
          const name = source.slice(index + 7, nameEnd);
          if (Object.prototype.hasOwnProperty.call(DISPLAY_ENVS, name)) {
            const closer = "\\end{" + name + "}";
            const closeAt = source.indexOf(closer, nameEnd);
            if (closeAt > nameEnd) {
              const inner = source.slice(nameEnd + 1, closeAt);
              flush();
              out.push({ math: true, display: true, env: name,
                         body: "\\begin{" + DISPLAY_ENVS[name] + "}" + inner +
                               "\\end{" + DISPLAY_ENVS[name] + "}" });
              index = closeAt + closer.length;
              continue;
            }
          }
        }
      }

      if (char === "\\" && (source[index + 1] === "[" || source[index + 1] === "(")) {
        const display = source[index + 1] === "[";
        const closer = display ? "\\]" : "\\)";
        const closeAt = source.indexOf(closer, index + 2);
        if (closeAt > index) {
          flush();
          out.push({ math: true, display: display, body: source.slice(index + 2, closeAt) });
          index = closeAt + 2;
          continue;
        }
      }

      if (char === "$") {
        const doubled = source[index + 1] === "$";
        const marker = doubled ? "$$" : "$";
        const closeAt = source.indexOf(marker, index + marker.length);
        if (closeAt > index) {
          const body = source.slice(index + marker.length, closeAt);
          // Inline math may wrap across a line break: the washer keeps the source's line
          // breaks verbatim, so `$T =\n\CC^\times$` is one formula and not two. Requiring
          // the pair to sit on one line desynchronised the *rest* of the statement -- every
          // later `$` then paired one off, and a stray `$` appeared in the text. What still
          // must not be accepted is a stray `$` matching far ahead, so the search is bounded
          // by a blank line and by length instead.
          const bounded = !/\n\s*\n/.test(body) && body.length <= MAX_INLINE_MATH;
          if ((doubled || bounded) && body.trim()) {
            flush();
            out.push({ math: true, display: doubled, body: body });
            index = closeAt + marker.length;
            continue;
          }
        }
      }

      buffer += char;
      index += 1;
    }
    flush();
    return out;
  }

  function renderFragment(fragment, refs) {
    state.compiled += 1;
    // A bare `$` inside a math fragment is always an artefact: TeX does not allow it either
    // (an escaped `\$` is a dollar sign and is kept). Two papers in the library write
    // `\begin{cases} … & if $\xi(\lambda) < … \end{cases}`, which is invalid in the source
    // and made the whole formula fail to compile.
    const body = translateColors(placeholderText(fragment.body, refs)
      .replace(/\\\$/g, "\u0002").replace(/\$/g, "").replace(/\u0002/g, "\\$")
      // A bare `#` is an artefact for the same reason a bare `$` is: TeX allows neither
      // outside a macro definition, and KaTeX answers both with "Expected 'EOF'". The purifier
      // turns `\#` into `#` -- the escape is about *prose*, where a bare `#` is harmless -- so
      // the escape is restored here. Measured on arXiv:1801.06071, whose `m_i=#\{a^n(i)\}`
      // failed the whole fragment, and on a `\text{a#b}` elsewhere in the library.
      .replace(/(?<!\\)#/g, "\\#"));
    const base = { displayMode: !!fragment.display, throwOnError: false, strict: false,
                   trust: true, output: "html" };
    // Try strictly first, because that is the only way a failure is *knowable*: with
    // `throwOnError: false` KaTeX renders the error inline and never throws, so the old
    // code counted nothing and the window reported "0 failed" while showing red raw
    // commands. The paper's macros are tried before the bare renderer, so a formula that
    // would have rendered without them is not lost because of one bad macro.
    const strict = [];
    if (Object.keys(state.macros).length) {
      strict.push(Object.assign({}, base, { macros: state.macros, throwOnError: true }));
    }
    strict.push(Object.assign({}, base, { throwOnError: true }));
    let lastError = null;
    let firstError = null;
    for (const options of strict) {
      try {
        const html = state.katex.renderToString(body, options);
        // A strict render that comes back *marked* is still a failure. `\Z` does not throw
        // and is not compiled, so counting only thrown errors reported a clean page while the
        // reader saw red -- the third time this check has been the bug.
        if (RENDER_ERROR.test(html)) {
          throw new Error("KaTeX marked the fragment as an error");
        }
        return html;
      } catch (error) {
        // The *first* attempt is the faithful one -- it carries the paper's own macros. The
        // bare retry exists so a formula that would have rendered without a bad macro is not
        // lost, but its error is about the missing macro, not about the formula, so reporting
        // it would blame the paper for a failure the macro table caused.
        if (!firstError) firstError = error;
        lastError = error;
      }
    }
    state.failures += 1;
    state.missing.push(String(fragment.body).slice(0, 60));
    // Keep the offending fragment *and* KaTeX's own sentence about it. The census that
    // decides what to fix needs the text, not a count: "still not compiling" was answered by
    // looking at the window for three rounds, and the cause of 2015 of 2126 failures was not
    // visible that way at all. Bounded, because this is a diagnostic and not a log.
    if (state.failed.length < 200) {
      state.failed.push({ body: String(fragment.body).slice(0, 400),
                          message: String((firstError || lastError || {}).message || "")
                            .slice(0, 200) });
    }
    try {
      // show what KaTeX can, with the un-compilable part marked, rather than dropping it
      return state.katex.renderToString(body, base);
    } catch (error) {
      return '<span class="tex-fail" title="' +
             escapeHtml((lastError || error).message || "") + '">' +
             escapeHtml(fragment.body) + "</span>";
    }
  }

  /** The label without its kind word, when the sentence already says the kind.
   *
   * A card keeps the paper's `\ref` as `<<ref:key>>`, and we render it as the target's label
   * ("Proposition 1") because that is what makes the link findable. But LaTeX's `\ref` renders
   * the *number*, and a paper writes "the embedding of Proposition \ref{x}" -- so substituting
   * the whole label reads "the embedding of Proposition Proposition 1". Measured on
   * arXiv:1505.03619, whose Theorem 3 says exactly that, twice.
   */
  function shortLabel(label, before) {
    const text = String(label || "");
    const parts = /^([A-Za-z]+)\s+(\S.*)$/.exec(text);
    if (!parts) return text;
    const tail = String(before || "").replace(/<[^>]*>/g, "").replace(/\s+$/, "");
    return new RegExp("\\b" + parts[1] + "$", "i").test(tail) ? parts[2] : text;
  }

  function restorePlaceholders(html, refs) {
    return html.replace(PLACEHOLDER, (whole, index, offset, source) => {
      const ref = refs[Number(index)];
      if (!ref) return whole;
      const label = shortLabel(ref.label, source.slice(0, offset));
      if (ref.cardId) {
        return '<a class="cardref" href="#" data-card="' + escapeHtml(ref.cardId) +
               '" title="' + escapeHtml(ref.key) + '">' + escapeHtml(label) + "</a>";
      }
      return '<span class="cardref unresolved" title="未解析：' + escapeHtml(ref.key) + '">' +
             escapeHtml(label) + "</span>";
    });
  }

  /** HTML for a card text: real compiled math where possible, plain where not.
   *
   * `options.math` says the text *is* mathematics. Some sources write an equation with no
   * delimiter at all -- no `$`, no `\[`, no environment -- so nothing in the text says so,
   * but the card's `kind` does, and a formula must not be shown as LaTeX source because of
   * a missing `$`.
   */
  /** Wrap the query's words in the **prose** of a fragment, so a hit shows why it matched.
   *
   * This is SQLite FTS5's `highlight()`. It lives here, rather than as a pass over the finished
   * HTML, for one reason: only the non-math parts are marked. Inside a KaTeX fragment a `<mark>`
   * would land in the middle of a glyph's layout -- a background rectangle across half a
   * fraction -- so the math is rendered and the prose around it is marked, and the split is
   * already made here.
   *
   * The negative lookbehind keeps `amp` from matching inside `&amp;`: the text is escaped
   * before this runs, and a mark inside an entity would break the entity.
   */
  function markTerms(escaped, terms) {
    if (!terms || !terms.length) return escaped;
    const pattern = terms.map((term) => String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .filter(Boolean).sort((a, b) => b.length - a.length).join("|");
    if (!pattern) return escaped;
    return escaped.replace(new RegExp("(?<!&)\\b(" + pattern + ")\\b(?!;)", "gi"),
                           "<mark>$1</mark>");
  }

  function toHtml(text, options) {
    state.failures = 0;
    state.compiled = 0;
    state.refs = 0;
    state.missing = [];
    state.failed = [];
    const refs = [];
    const prepared = substitute(text, options, refs);
    const marks = (options && options.mark) || null;
    if (!state.katex) {
      return escapeHtml(toPlain(prepared, { placeholders: refs })).replace(/\n/g, "<br>");
    }
    let parts = segments(prepared);
    if (options && options.math && prepared.trim() && !parts.some((part) => part.math)) {
      parts = [{ math: true, display: true, body: prepared }];
    }
    return parts.map((part) => (part.math
      ? renderFragment(part, refs)
      : restorePlaceholders(markTerms(escapeHtml(part.body), marks).replace(/\n/g, "<br>"),
                            refs))).join("");
  }

  /** Plain-text transcription, used when KaTeX is unavailable and in list snippets. */
  function toPlain(source, options) {
    let text = String(source == null ? "" : source);
    const refs = (options && options.placeholders) || null;
    if (refs) {
      text = text.replace(PLACEHOLDER, (whole, index) => {
        const ref = refs[Number(index)];
        return ref ? String(ref.label) : whole;
      });
    }
    text = text.replace(/<<cite:([^>]*)>>/g, "$1");
    text = text.replace(/<<ref:([^>]*)>>/g, "$1");
    text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1⁄$2");
    text = text.replace(/\\([A-Za-z]+)\s*\{([^{}]*)\}/g, (whole, name, inner) => {
      if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "binom") {
        return whole;
      }
      if (TRANSPARENT.indexOf(name) >= 0) return inner;
      if (name in SYMBOLS) return SYMBOLS[name] + inner;
      return whole;
    });
    text = text.replace(/\\([A-Za-z]+)/g, (whole, name) => {
      if (name in SYMBOLS) return SYMBOLS[name];
      if (TRANSPARENT.indexOf(name) >= 0) return "";
      return whole;
    });
    text = text.replace(/\^\{([^{}]{1,8})\}/g, (whole, inner) => mapEach(inner, SUP, whole));
    text = text.replace(/\^([A-Za-z0-9])/g, (whole, char) => SUP[char] || whole);
    text = text.replace(/_\{([^{}]{1,8})\}/g, (whole, inner) => mapEach(inner, SUB, whole));
    text = text.replace(/_([A-Za-z0-9])/g, (whole, char) => SUB[char] || whole);
    text = text.replace(/\{([^{}]*)\}/g, (whole, inner) =>
      (inner in DISPLAY_ENVS || inner.replace(/\*$/, "") in DISPLAY_ENVS) ? " " : whole);
    text = text.replace(/[{}]/g, "").replace(/\$/g, "");
    return text.replace(/[ \t]{2,}/g, " ").replace(/ *\n */g, "\n").trim();
  }

  function mapEach(inner, table, fallback) {
    if (/^[A-Za-z0-9+\-]+$/.test(inner) && [].every.call(inner, (char) => char in table)) {
      return [].map.call(inner, (char) => table[char]).join("");
    }
    return inner;
  }

  function refsFor(card) {
    const table = {};
    (card && card.deps ? card.deps : []).forEach((dep) => {
      if (dep && dep.ref) table[dep.ref] = { card_id: dep.card_id || "", label: dep.label || "" };
    });
    return table;
  }

  function status() {
    return { katex: !!state.katex, compiled: state.compiled, failures: state.failures,
             refs: state.refs, macros: Object.keys(state.own).length,
             compat: Object.keys(COMPAT).length,
             missing: state.missing.slice(0, 4), failed: state.failed.slice(0, 200) };
  }

  global.TESSERA = global.TESSERA || {};
  global.TESSERA.tex = { detect: detect, segments: segments, toHtml: toHtml, toPlain: toPlain,
                     refsFor: refsFor, setMacros: setMacros, status: status, compat: COMPAT,
                     escapeHtml: escapeHtml };
})(window);
