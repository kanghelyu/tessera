/* Read-only card window. No editors, no mode switch: it is always the fluid path.
 * Math is compiled by ui/texrender.js against the KaTeX vendored in ui/vendor/katex. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const TEX = window.TESSERA && window.TESSERA.tex ? window.TESSERA.tex : null;
  const state = { papers: [], rows: [], focus: -1, card: null, related: null, tree: {},
                  facets: null };

  /* ---------------- language: English first, Chinese on request ----------------
   * One table and one lookup. The window is English by default and the switch is a button in
   * the header; nothing else picks a language, so a missing string is a missing *key* and
   * shows up as itself rather than as a half-translated page. */
  const T = {
    en: {
      brand: "Tessera cards",
      "search.ph": "Search a paper, a theorem, a concept",
      "search.hint": "↑ ↓ focus · ↵ open",
      "meta.loading": "loading…",
      "meta.papers": "{n} papers",
      "meta.searching": "searching…",
      "meta.hits": "{n} hits",
      "meta.indexed": "{n} cards indexed",
      "meta.ms": "{n} ms",
      "meta.miss": "nothing in the library",
      "meta.corrected": "searched as: {list}",
      "meta.author": "author: {name}",
      "meta.unmatched": "no card has: {list}",
      "meta.partial": "closest matches (no card has every word)",
      "filter.anyfield": "Any field",
      "filter.anykind": "Any kind",
      "filter.author": "author",
      "filter.year": "year or 2015-2018",
      "filter.clear": "Clear",
      "sort.relevance": "Relevance",
      "sort.newest": "Newest first",
      "sort.oldest": "Oldest first",
      "row.matched": "matched: {list}",
      "side.papers": "Papers",
      "empty.title": "Type a keyword or a paper title",
      "empty.body": "A paper the library does not hold is fetched, washed into cards and " +
                    "stored, and its related cards come back below.",
      "block.statement": "Statement",
      "block.abstract": "Abstract (read-only)",
      "abstract.close": "Close the abstract",
      "abstract.open": "Open the abstract",
      "block.source": "Source",
      "action.related": "Relations →",
      "rel.title": "Graph",
      "rel.up": "Upstream",
      "rel.down": "Downstream",
      "rel.cross": "Related papers",
      "rel.deps.up": "Depends on",
      "rel.deps.down": "Depended on by",
      "rel.noup": "(this card cites no other card in the library)",
      "rel.nodown": "(no card in the library cites this one yet)",
      "rel.none": "(none)",
      "rel.similar": "similar in this paper",
      "stale": "The window was updated — reload this page (⌘⇧R).",
      "rel.computing": "computing…",
      "rel.cached": "cached",
      "rel.computed": "computed",
      "rel.budget": "daily relation budget spent",
      "rel.method": "pool {pool} · kept {keep}",
      "rel.dependents": "{n} cards in this paper depend on it",
      "graph.empty": "(nothing to draw)",
      "graph.paper": "related paper · {score}",
      "graph.tip": "{title}\nrelated {score}",
      "graph.legend": "blue = upstream · green = downstream · violet = related paper　·　" +
                      "drag to pan, wheel to zoom, click to highlight",
      "graph.notdrawn": "　·　{n} more cards in this paper not drawn",
      "source.line": "line {n}",
      "source.link": "original ↗",
      "rel.nocross": "(no related paper above the threshold)",
      "rel.score": "related {score}",
      "rel.bridge": "bridged {label}",
      "meta.ver": "{version} · {papers} papers / {cards} cards",
      "tex.none": "KaTeX not loaded: formulas are shown as plain text " +
                  "(ui/vendor/katex should hold katex.min.js and katex.min.css).",
      "tex.compiled": "{n} formulas compiled (KaTeX)",
      "tex.inferred": "{n} rendered by convention",
      "tex.macros": "{n} of the paper's own macros",
      "tex.refs": "{n} cross-references resolved",
      "tex.failed": "{n} could not be compiled (shown as-is, not dropped): {list}",
      "node.loading": "loading…",
      "node.close": "Close this panel",
      "node.noabstract": "(no abstract harvested)",
      "node.open": "Open card →",
      "node.openfirst": "Open card · {label} →",
      "paper.meta": "{year} · {cards} cards",
      "paper.meta.hits": "{year} · {cards} cards · {hits} matching",
      "author.filter": "Every paper by {name}",
      "author.more": "+{n} more",
      "card.nolabel": "(unlabelled)",
      "depth": "depth {n}",
      "role.focus": "focus",
      "role.upstream": "upstream",
      "role.downstream": "downstream",
      "role.other": "other",
      "error": "Error: ",
    },
    zh: {
      brand: "Tessera 卡片",
      "search.ph": "搜索一篇论文、一个定理、一个概念",
      "search.hint": "↑ ↓ 聚焦 · ↵ 打开",
      "meta.loading": "加载中…",
      "meta.papers": "共 {n} 篇",
      "meta.searching": "检索中…",
      "meta.hits": "{n} 命中",
      "meta.indexed": "{n} 张卡",
      "meta.ms": "{n} ms",
      "meta.miss": "库内未命中",
      "meta.corrected": "按词形匹配：{list}",
      "meta.author": "作者：{name}",
      "meta.unmatched": "库内没有这些词：{list}",
      "meta.partial": "最接近的结果（没有卡片包含全部词）",
      "filter.anyfield": "任意领域",
      "filter.anykind": "任意类型",
      "filter.author": "作者",
      "filter.year": "年份或 2015-2018",
      "filter.clear": "清除",
      "sort.relevance": "相关度",
      "sort.newest": "最新优先",
      "sort.oldest": "最早优先",
      "row.matched": "命中：{list}",
      "side.papers": "论文",
      "empty.title": "搜索框输入关键词或论文标题",
      "empty.body": "库里没有的论文会自动抓取、清洗成卡片并入库，然后在下面返回它的关联卡片。",
      "block.statement": "卡片陈述",
      "block.abstract": "论文摘要（只读）",
      "abstract.close": "收起摘要",
      "abstract.open": "展开摘要",
      "block.source": "来源",
      "action.related": "查看关联 →",
      "rel.title": "关联图",
      "rel.up": "上游",
      "rel.down": "下游",
      "rel.cross": "关联文章",
      "rel.deps.up": "上游 · 本卡依赖",
      "rel.deps.down": "下游 · 依赖本卡",
      "rel.noup": "（本卡未引用库内其他卡片）",
      "rel.nodown": "（库里还没有卡片引用本卡）",
      "rel.none": "（无）",
      "rel.similar": "同篇相似",
      "stale": "界面已更新 —— 刷新本页（⌘⇧R）。",
      "rel.computing": "计算中…",
      "rel.cached": "缓存",
      "rel.computed": "已计算",
      "rel.budget": "已达当日关联计算预算",
      "rel.method": "候选池 {pool} · 保留 {keep}",
      "rel.dependents": "本篇内有 {n} 张卡片依赖它",
      "graph.empty": "（没有可画的邻域）",
      "graph.paper": "关联文章 · {score}",
      "graph.tip": "{title}\n关联 {score}",
      "graph.legend": "蓝 = 上游 · 绿 = 下游 · 紫 = 关联文章　·　拖动平移，滚轮缩放，点击高亮",
      "graph.notdrawn": "　·　同篇其余 {n} 张未画",
      "source.line": "第 {n} 行",
      "source.link": "原文链接",
      "rel.nocross": "（没有达到阈值的关联文章）",
      "rel.score": "关联 {score}",
      "rel.bridge": "桥接 {label}",
      "meta.ver": "{version} · {papers} 篇 / {cards} 卡",
      "tex.none": "KaTeX 未加载：公式以纯文本近似显示（ui/vendor/katex 里应有 katex.min.js 与 katex.min.css）。",
      "tex.compiled": "{n} 个公式已编译（KaTeX）",
      "tex.inferred": "{n} 个按惯例推断渲染",
      "tex.macros": "本文自定义宏 {n} 个",
      "tex.refs": "{n} 处交叉引用已解析",
      "tex.failed": "{n} 个无法编译（原样显示，未丢弃）：{list}",
      "node.loading": "读取中…",
      "node.close": "关闭此面板",
      "node.noabstract": "（未收录摘要）",
      "node.open": "打开卡片 →",
      "node.openfirst": "打开卡片 · {label} →",
      "paper.meta": "{year} · {cards} 张",
      "paper.meta.hits": "{year} · {cards} 张 · 命中 {hits} 张",
      "author.filter": "查看 {name} 的全部论文",
      "author.more": "另有 {n} 位",
      "card.nolabel": "（无标号）",
      "depth": "深度 {n}",
      "role.focus": "焦点",
      "role.upstream": "上游",
      "role.downstream": "下游",
      "role.other": "其它",
      "error": "出错：",
    },
  };
  let LANG = localStorage.getItem("tessera-lang") || "en";

  /** Look a string up, filling `{name}` holes. A missing key returns the key, which is
   * visible in the page rather than silent. */
  function t(key, values) {
    const table = T[LANG] || T.en;
    let text = table[key];
    if (text === undefined) text = (T.en[key] !== undefined ? T.en[key] : key);
    Object.keys(values || {}).forEach((name) => {
      text = text.split("{" + name + "}").join(String(values[name]));
    });
    return text;
  }

  function applyLang() {
    document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
    document.title = t("brand");
    [...document.querySelectorAll("[data-i18n]")].forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    // A placeholder is a string the window shows like any other, so it belongs in the same
    // table -- and `textContent` would be the wrong property for it.
    [...document.querySelectorAll("[data-i18n-ph]")].forEach((node) => {
      node.placeholder = t(node.dataset.i18nPh);
      node.setAttribute("aria-label", node.placeholder);
    });
    $("q").placeholder = t("search.ph");
    $("q").setAttribute("aria-label", t("search.ph"));
    $("cards").setAttribute("aria-label", t("side.papers"));
    $("lang").textContent = LANG === "zh" ? "English" : "中文";
  }

  function setLang(next) {
    LANG = next === "zh" ? "zh" : "en";
    localStorage.setItem("tessera-lang", LANG);
    applyLang();
    // the dynamic parts carry strings too, so re-render what is on screen
    loadPapers().then(() => {
      if (state.card) openCard(state.card.card.card_id).catch(showError);
    }).catch(() => {});
  }

  const ROLE = {
    focus: { fill: "#f59e0b", border: "#d97706", text: "#451a03", key: "role.focus" },
    upstream: { fill: "#3b82f6", border: "#2563eb", text: "#eff6ff", key: "role.upstream" },
    downstream: { fill: "#22c55e", border: "#16a34a", text: "#052e16", key: "role.downstream" },
    other: { fill: "#94a3b8", border: "#64748b", text: "#0f172a", key: "role.other" },
  };

  const plain = (text) => (TEX ? TEX.toPlain(text) : String(text || ""));
  const richHtml = (text, refs, options) =>
    (TEX ? TEX.toHtml(text, Object.assign({ refs: refs || {} }, options || {}))
         : String(text || ""));
  // an `equation` card's statement is a formula, even when the source wrote no delimiter
  const isFormula = (kind) => kind === "equation";

  /** "Braverman, Finkelberg (2016)" -- the citation form, not the title.
   *
   * Surnames only, at most two, then "et al.": a graph box is a few centimetres wide, and the
   * year is what a reader uses to place a paper in time. The year is the **first version**
   * (`published` from the Atom feed) -- never `updated`, which moves whenever arXiv touches the
   * metadata and would make an old paper look new.
   */
  function paperLabel(brief, sourceId) {
    const authors = (brief && brief.authors) || [];
    const surnames = authors.slice(0, 2).map((name) => {
      const parts = String(name).trim().split(/\s+/);
      return parts[parts.length - 1] || String(name);
    });
    const who = surnames.length
      ? surnames.join(", ") + (authors.length > 2 ? " et al." : "")
      : String(sourceId || "");
    const year = (brief && brief.year) || "";
    return year ? who + " (" + year + ")" : who;
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({ error: "bad json" }));
    if (!response.ok) throw new Error(payload.detail || payload.error || response.status);
    return payload;
  }

  /* ---------------- the sidebar: papers, and the conclusions under them ----------------
   * The paper is the top level, and it opens to its **conclusion cards** -- not to its
   * hundred-odd cards, most of which are displayed equations, remarks and definitions. A
   * card opens when it is clicked; nothing opens by itself. */
  function cardRow(row, macros, paperTitle, overrides) {
    const item = document.createElement("li");
    item.className = "row";
    item.dataset.cardId = row.card_id;
    const top = document.createElement("div");
    top.className = "r-top";
    const label = document.createElement("span");
    label.className = "r-label";
    label.textContent = row.label || t("card.nolabel");
    const kind = document.createElement("span");
    kind.className = "r-kind";
    kind.textContent = row.kind || "";
    top.append(label, kind);
    const snippet = document.createElement("div");
    snippet.className = "r-snip";
    // Each row is written in its own paper's notation, so its paper's macros are installed
    // first (cached per paper) -- and the server has already cut the snippet outside math,
    // so every `$` in it is complete and it compiles.
    if (TEX) TEX.setMacros(macros, row.source_id, overrides);
    // `mark` is what makes a result row a *preview* rather than a label: the query's words are
    // highlighted in the prose, so the reader can see why this card came back. The math is left
    // alone -- see `markTerms`.
    snippet.innerHTML = TEX ? richHtml(row.snippet || "", null,
                                       { math: isFormula(row.kind), mark: row.matched_terms })
                            : String(row.snippet || "");
    item.append(top, snippet);
    const bits = [];
    if (paperTitle) bits.push(paperTitle);
    if (row.paper_year) bits.push(row.paper_year);
    if (bits.length) {
      const paper = document.createElement("div");
      paper.className = "r-paper";
      paper.textContent = bits.join(" · ");
      item.append(paper);
    }
    if (row.matched_terms && row.matched_terms.length) {
      const matched = document.createElement("div");
      matched.className = "r-matched";
      matched.textContent = t("row.matched", { list: row.matched_terms.join(", ") });
      item.append(matched);
    }
    item.addEventListener("click", () => openCard(row.card_id).catch(showError));
    return item;
  }

  /** The visible card rows, in document order -- what the arrow keys walk. */
  function refreshRows() {
    state.rows = [...$("cards").querySelectorAll(".row")].map((node) => ({
      card_id: node.dataset.cardId, node: node }));
    if (state.focus >= state.rows.length) state.focus = state.rows.length - 1;
  }

  function renderPapers(entries) {
    const list = $("cards");
    list.textContent = "";
    state.rows = [];
    state.tree = {};
    state.focus = -1;
    $("count").textContent = String(entries.length);
    entries.forEach((entry) => {
      const item = document.createElement("li");
      // Open when its matching cards came back with the answer; the rest are fetched on click.
      // `entry.cards` is `[]` -- not undefined -- for a paper the answer listed without rows.
      item.className = "paper" + (entry.cards && entry.cards.length ? " open" : "");
      item.dataset.source = entry.paper.source_id;
      const top = document.createElement("div");
      top.className = "p-top";
      const title = document.createElement("span");
      title.className = "p-title";
      title.textContent = entry.paper.title || entry.paper.source_id;
      const meta = document.createElement("span");
      meta.className = "p-meta";
      // A search's row says how much of the paper matched; the browse list says how big it is.
      // Two sentences, because "34 cards · 0 conclusions" was neither.
      meta.textContent = entry.paper.searching
        ? t("paper.meta.hits", { year: entry.paper.year || "",
                                 cards: entry.paper.cards || 0,
                                 hits: entry.paper.hits || 0 })
        : t("paper.meta", { year: entry.paper.year || "", cards: entry.paper.cards || 0 });
      top.append(title, meta);
      item.append(top);
      const inner = document.createElement("ul");
      inner.className = "p-cards";
      (entry.cards || []).forEach((card) =>
        inner.append(cardRow(card, entry.macros, null, entry.overrides)));
      item.append(inner);
      top.addEventListener("click", () => togglePaper(entry, item, inner).catch(showError));
      state.tree[entry.paper.source_id] = { entry: entry, item: item, inner: inner };
      list.append(item);
    });
    refreshRows();
    if (state.rows.length) setFocus(0, false);
  }

  async function togglePaper(entry, item, inner) {
    if (item.classList.contains("open")) {
      item.classList.remove("open");
      inner.textContent = "";
      refreshRows();
      return;
    }
    // **An empty list is not a loaded list.** A paper can now appear in the panel with no rows
    // behind it -- the panel lists every paper the filter selected, and only `k` cards come back
    // -- so `entry.cards` is `[]` for most of them, and `[]` is *truthy*: the fetch was skipped
    // and the row expanded to nothing at all. Andy: "怎么打不开这些文章的卡片".
    if (!entry.cards || !entry.cards.length) {
      const detail = await api("/api/paper?source_id=" +
                               encodeURIComponent(entry.paper.source_id));
      entry.cards = detail.cards || [];
      entry.macros = detail.macros || {};
      entry.overrides = detail.macros_override || [];
    }
    item.classList.add("open");
    entry.cards.forEach((card) =>
      inner.append(cardRow(card, entry.macros, null, entry.overrides)));
    refreshRows();
  }

  function setFocus(index, pulse) {
    state.focus = index;
    state.rows.forEach((row, position) => {
      row.node.classList.toggle("focus", position === index);
    });
    const row = state.rows[index];
    if (!row) return;
    if (pulse) {
      row.node.classList.remove("pulse");
      void row.node.offsetWidth;
      row.node.classList.add("pulse");
    }
    row.node.scrollIntoView({ block: "nearest" });
  }

  async function loadPapers() {
    const payload = await api("/api/papers");
    state.papers = payload.papers || [];
    renderPapers(state.papers.map((paper) => ({ paper: paper, cards: null })));
    $("meta").textContent = t("meta.papers", { n: state.papers.length });
    if (state.facets) renderFacets(state.facets);
  }

  /* ---------------- search ---------------- */
  /** The filters the reader has set, or an empty string for "any". */
  function activeFilters() {
    const out = {};
    ["cluster", "kind", "author", "year"].forEach((name) => {
      const node = $("f-" + name);
      const value = node && node.value ? node.value.trim() : "";
      if (value) out[name] = value;
    });
    return out;
  }

  /** The facets the last answer reported, as the two selects' options.
   *
   * Typesense's `facet_by` and Meilisearch's facets are the same idea: a search box is half of
   * a search interface, and the other half is what the collection says it contains. The lists
   * come from the library, so a field that is not in it cannot be asked for.
   */
  function renderFacets(facets) {
    if (!facets) return;
    [["f-cluster", "cluster", "cluster_counts", "filter.anyfield"],
     ["f-kind", "kind", "kind_counts", "filter.anykind"]].forEach((entry) => {
      const [id, key, countsKey, anyKey] = entry;
      const node = $(id);
      if (!node) return;
      const chosen = node.value;
      node.textContent = "";
      const any = document.createElement("option");
      any.value = "";
      any.textContent = t(anyKey);
      node.append(any);
      const counts = facets[countsKey] || {};
      (facets[key] || []).forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = counts[name] ? name + " (" + counts[name] + ")" : name;
        node.append(option);
      });
      node.value = chosen && counts[chosen] ? chosen : "";
    });
  }

  /** The address carries the question, so a search can be shared and revisited.
   *
   * `replaceState`, never `pushState`: arrowing through a paper is not navigation the
   * reader wants to walk back through, and neither is each keystroke of a query. The card
   * page keeps its own `#<card_id>` deep link; the two never fight, because a search over-
   * writes whatever was there and opening a card overwrites the query.
   */
  function syncHash(text, filters) {
    const params = new URLSearchParams();
    const query = String(text || "").trim();
    if (query) params.set("q", query);
    Object.keys(filters).forEach((name) => params.set(name, filters[name]));
    const next = params.toString() ? "#" + params.toString() : "#";
    if (location.hash !== next) {
      history.replaceState(null, "", params.toString() ? next : location.pathname +
                                                            location.search);
    }
  }

  async function runSearch(text) {
    const filters = activeFilters();
    if (!text.trim() && !Object.keys(filters).length) return loadPapers();
    $("meta").textContent = t("meta.searching");
    const query = ["k=40", "q=" + encodeURIComponent(text)];
    // "Relevance" is the control's default, and it is not a preference the reader expressed:
    // sending it would override the order a filter-with-no-query falls back to (`newest` --
    // there is nothing for a card to be relevant *to*), so the default travels as no parameter
    // at all. An explicit "Newest first" or "Oldest first" still travels.
    const sort = $("f-sort").value;
    if (sort && sort !== "relevance") query.push("sort=" + encodeURIComponent(sort));
    Object.keys(filters).forEach((name) => {
      query.push(name + "=" + encodeURIComponent(filters[name]));
    });
    const payload = await api("/api/search?" + query.join("&"));
    renderFacets(payload.facets);
    // **The panel is the answer's *paper* list, not the papers the returned rows come from.**
    // Grouping the rows made the panel lie: `author:futorny` matches 142 papers and 4776 cards,
    // but the top 40 rows all come from 3 papers, so it said "Papers 3" beside a header reading
    // "4776 hits" -- and that reads as "the filter found 3 papers". The list travels with the
    // answer now (see `Engine.search`), so the panel can name every paper the filter selected.
    const index = {};
    const groups = (payload.papers || []).map((paper) => {
      const group = { paper: { source_id: paper.source_id, title: paper.title || paper.source_id,
                               year: paper.year || "", cards: paper.cards || 0,
                               hits: paper.hits || 0, searching: true },
                      cards: [], macros: (payload.macros || {})[paper.source_id] || {} };
      index[paper.source_id] = group;
      return group;
    });
    (payload.results || []).forEach((row) => {
      const group = index[row.source_id];
      if (group) group.cards.push(row);
    });
    renderPapers(groups);
    syncHash(text, filters);
    const parts = [t("meta.hits", { n: payload.hit_count }),
                   t("meta.indexed", { n: payload.index_docs }),
                   t("meta.ms", { n: payload.took_ms })];
    if (payload.miss) parts.push(t("meta.miss"));
    // A correction is always visible. A search that quietly answers a different question is
    // worse than one that answers nothing.
    const corrected = payload.corrected || {};
    const fixes = Object.keys(corrected);
    if (payload.author_resolved) {
      // the query was a person's name and is answered as one: say so, or the reader cannot
      // tell why "futorny" answers with papers whose text never mentions the word
      parts.push(t("meta.author", { name: payload.author_resolved }));
    }
    if (fixes.length) {
      parts.push(t("meta.corrected", {
        list: fixes.slice(0, 3).map((term) => term + " → " + corrected[term].join(" / "))
          .join(", ") }));
    }
    // A word nothing matched is said out loud. This is the failure that used to be invisible:
    // a two-word query where one word matched nothing was answered with the other word alone,
    // which reads as a bad result set rather than as a query half understood.
    const unmatched = payload.unmatched || [];
    if (unmatched.length) {
      parts.push(t("meta.unmatched", { list: unmatched.slice(0, 4).join(", ") }));
    }
    if (payload.miss && (payload.results || []).length) parts.push(t("meta.partial"));
    $("meta").textContent = parts.join(" · ");
    if (groups.length) setFocus(0, true);
  }

  /* ---------------- card detail ---------------- */
  /** A paper's authors, each one a control that filters the search to that person.
   *
   * A card is one statement out of a paper, and a reader who has just read it and wants the rest
   * of what this person wrote should not have to retype their name -- nor get a *different*
   * answer for having done so. Clicking resolves the name the same way typing it does
   * (`Engine.author_index` groups arXiv's spellings of one person), so clicking `V. Futorny`
   * finds the same papers as typing `Vyacheslav Futorny`: all of them, not just the 131 that
   * spell the given name out.
   */
  function authorChips(authors, limit) {
    const names = (authors || []);
    const out = names.slice(0, limit).map((name) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "author";
      chip.textContent = name;
      chip.title = t("author.filter", { name: name });
      chip.addEventListener("click", () => {
        $("f-author").value = name;
        runSearch($("q").value).catch(showError);
      });
      return chip;
    });
    if (names.length > out.length) {
      const more = document.createElement("span");
      more.className = "author-more";
      more.textContent = t("author.more", { n: names.length - out.length });
      out.push(more);
    }
    return out;
  }

  async function openCard(cardId) {
    const payload = await api("/api/card/" + encodeURIComponent(cardId));
    state.card = payload;
    state.related = null;
    const card = payload.card;
    const paper = payload.paper;
    $("empty").hidden = true;
    $("pane").hidden = false;
    // Who wrote it. A card is one statement out of a paper, and reading it without the title
    // and the authors beside it is reading a quotation with no source.
    $("paper-title").textContent = paper.title || paper.source_id;
    const meta = $("paper-meta");
    meta.textContent = "";
    authorChips(paper.authors, 8).forEach((node) => meta.append(node));
    [paper.year, paper.source_id].filter(Boolean).forEach((value) => {
      const fact = document.createElement("span");
      fact.className = "paper-fact";
      fact.textContent = value;
      meta.append(fact);
    });
    $("card-label").textContent = card.label || card.kind;
    const chips = $("card-chips");
    chips.textContent = "";
    [card.kind, card.cluster, paper.source_id, paper.year].filter(Boolean).forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = value;
      chips.append(chip);
    });
    // The paper's own commands, recovered from its preamble. A card carries no preamble,
    // so without this every statement in the author's notation is shown raw.
    if (TEX) TEX.setMacros(paper.macros, paper.source_id, paper.macros_override);
    $("statement").innerHTML = richHtml(card.statement, TEX ? TEX.refsFor(card) : {},
                                        { math: isFormula(card.kind) });
    reportTex();
    $("abstract").innerHTML = paper.abstract ? richHtml(paper.abstract) : t("node.noabstract");
    setAbstractFolded(false);
    const source = $("source");
    source.textContent = "";
    const detail = document.createElement("span");
    detail.textContent = (paper.title || paper.source_id) + " · " +
      (card.provenance && card.provenance.harvest_mode ? card.provenance.harvest_mode : "") +
      " · " + t("source.line", { n: (card.provenance && card.provenance.line) || 0 }) + " · " +
      (card.wash ? card.wash.version : "");
    source.append(detail);
    // The DOI is arXiv's own, derived from the id rather than fetched, so a card always
    // carries a citable identifier.
    const arxivId = String(paper.source_id || "").indexOf("arXiv:") === 0
      ? paper.source_id.slice(6) : "";
    if (arxivId) {
      const doi = document.createElement("a");
      doi.href = "https://doi.org/10.48550/arXiv." + arxivId;
      doi.target = "_blank";
      doi.rel = "noreferrer";
      doi.textContent = "  ↗ DOI 10.48550/arXiv." + arxivId;
      source.append(doi);
    }
    if (paper.url) {
      const link = document.createElement("a");
      link.href = paper.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "  ↗ " + t("source.link");
      source.append(link);
    }
    $("related-note").textContent = payload.dependents.length
      ? t("rel.dependents", { n: payload.dependents.length }) : "";
    // keep the left column pointing at what is open, including via a deep link
    const position = state.rows.findIndex((row) => row.card_id === card.card_id);
    if (position >= 0) setFocus(position, false);
    const wanted = "#" + card.card_id;
    if (location.hash !== wanted) {
      history.replaceState(null, "", wanted);
    }
    // The relation block loads with the card, and **not awaited**: the card's own text is on
    // screen first, and the graph fills in when it is ready. A card switch abandons whatever
    // was in flight, so clicking through a paper never queues up work behind the reader.
    loadRelated(false).catch(showError);
  }

  /* the abstract folds away on request. It is long, and the statement is what the page is
     for -- but the control lives in the title row so the block never disappears without a
     way back, and a newly opened card always shows it again. */
  function setAbstractFolded(folded) {
    $("abstract").hidden = !!folded;
    const button = $("abstract-fold");
    button.textContent = folded ? "▸" : "×";
    button.title = folded ? t("abstract.open") : t("abstract.close");
    button.setAttribute("aria-label", button.title);
  }

  function reportTex() {
    if (!TEX) return;
    const status = TEX.status();
    const node = $("tex-status");
    if (!status.katex) {
      node.textContent = t("tex.none");
      node.className = "tex-status warn";
      return;
    }
    const parts = [];
    if (status.compiled) parts.push(t("tex.compiled", { n: status.compiled }));
    if (status.inferred) parts.push(t("tex.inferred", { n: status.inferred }));
    if (status.macros) parts.push(t("tex.macros", { n: status.macros }));
    if (status.refs) parts.push(t("tex.refs", { n: status.refs }));
    if (status.failures) {
      parts.push(t("tex.failed", { n: status.failures, list: status.missing.join(" / ") }));
    }
    node.textContent = parts.join(" · ");
    node.className = status.failures ? "tex-status warn" : "tex-status";
  }

  /* a resolved cross reference is clickable: it opens the card it points at */
  function wireRefs(container) {
    container.addEventListener("click", (event) => {
      const link = event.target.closest ? event.target.closest(".cardref[data-card]") : null;
      if (!link || !link.dataset.card) return;
      event.preventDefault();
      openCard(link.dataset.card).catch(showError);
    });
  }
  wireRefs($("statement"));
  wireRefs($("abstract"));
  // the node panel carries a card's statement, and the statement's cross references are
  // links there too -- a reference that does nothing because it sits in the graph's side
  // panel is a link the reader has already been taught to click.
  wireRefs($("node-detail"));

  /* ---------------- related: the articles on the left, the graph on the right ----------------
   * The block is part of the card page, so it opens *with* the card -- there is no button to
   * press and nothing to ask for. The related articles are always shown. The dependencies sit
   * behind two buttons, and the two are mutually exclusive: opening one closes the other,
   * because they answer the same question from opposite ends.
   *
   * Two things make it not feel like a wait:
   * * the card's own text is painted first, and the block fills in when the answer arrives;
   * * switching cards **abandons the load in flight** (`relatedAbort`), and a late answer for
   *   a card the reader has left is dropped rather than painted (`relatedToken`). Without
   *   that, clicking through a paper queues a computation per card and the window goes
   *   sluggish -- the reader's complaint.
   */
  let relatedToken = 0;
  let relatedAbort = null;

  async function loadRelated(refresh) {
    if (!state.card) return;
    const card = state.card.card;
    const token = ++relatedToken;
    if (relatedAbort) relatedAbort.abort();
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    relatedAbort = controller;
    const signal = controller ? controller.signal : undefined;
    $("related").hidden = false;
    state.deps = null;
    $("rel-deps").hidden = true;
    $("show-up").classList.remove("on");
    $("show-down").classList.remove("on");
    showRelatedLoading(true);
    $("related-note").textContent = t("rel.computing");
    let payload;
    try {
      payload = await api("/api/related?source_id=" + encodeURIComponent(card.source_id) +
        "&card_id=" + encodeURIComponent(card.card_id) + (refresh ? "&refresh=1" : ""),
        { signal: signal });
    } catch (error) {
      if (signal && signal.aborted) return;      // a newer card took over; say nothing
      showRelatedLoading(false);
      throw error;
    }
    if (token !== relatedToken) return;          // the reader has moved on
    showRelatedLoading(false);
    state.related = payload;
    $("up-count").textContent = String((payload.upstream || []).length);
    $("down-count").textContent = String((payload.downstream || []).length);
    renderCross(payload);
    renderGraph(payload);
    const method = payload.method || {};
    // "cached" is a fact about the *server's* cache; on the published static site every
    // relation was precomputed at build time, so saying where the payload came from would
    // be noise the reader cannot act on.
    const statusPart = window.TESSERA_STATIC ? "" :
      (payload.status === "cached" ? t("rel.cached") :
       payload.status === "budget_exhausted" ? t("rel.budget") : t("rel.computed")) + " · ";
    $("related-note").textContent = statusPart +
      t("rel.method", { pool: method.candidate_pool || "-",
                        keep: method.top_k || "-" });
  }

  /** Three dots in the area being computed, for as long as it takes. */
  function showRelatedLoading(busy) {
    $("rel-loading").hidden = !busy;
    if (busy) $("graph").classList.add("busy");
    else $("graph").classList.remove("busy");
  }

  /** Put the upstream or the downstream list beside the graph, or take it away.
   *
   * Clicking the open one closes it, and clicking the other switches: at most one is ever up,
   * which is the point -- upstream and downstream are the same question asked in two
   * directions, and showing both at once makes the reader work out which is which.
   */
  function showDeps(which) {
    if (!state.related) return;
    const panel = $("rel-deps");
    state.deps = state.deps === which ? null : which;
    $("show-up").classList.toggle("on", state.deps === "up");
    $("show-down").classList.toggle("on", state.deps === "down");
    if (!state.deps) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const upstream = state.deps === "up";
    $("deps-title").textContent = upstream ? t("rel.deps.up") : t("rel.deps.down");
    fillList("deps-list", upstream ? state.related.upstream : state.related.downstream,
             state.related.nodes, upstream ? t("rel.noup") : t("rel.nodown"));
  }

  /** One dependency list. `empty` is what to say when the direction has nothing.
   *
   * The fallback to the paper's own similar cards is gone. It was there to keep the panel from
   * saying "nothing", but it made a similarity look like a dependency -- the reader clicked
   * "Upstream" and got cards that are merely about the same subject, with no way to tell. The
   * graph already draws the similarity edges; the list says what the source says.
   */
  function fillList(listId, identifiers, nodes, empty) {
    const byId = {};
    (nodes || []).forEach((node) => { byId[node.card_id] = node; });
    const list = $(listId);
    list.textContent = "";
    if (!(identifiers || []).length) {
      const none = document.createElement("li");
      none.className = "none";
      none.textContent = empty;
      list.append(none);
      return;
    }
    (identifiers || []).forEach((identifier) => {
      const node = byId[identifier] || { label: identifier, kind: "" };
      const item = document.createElement("li");
      const title = document.createElement("div");
      title.textContent = node.label || identifier;
      const meta = document.createElement("div");
      meta.className = "m";
      meta.textContent = [node.kind, node.depth ? t("depth", { n: node.depth }) : ""]
        .filter(Boolean).join(" · ");
      item.append(title, meta);
      item.addEventListener("click", () => openCard(identifier).catch(showError));
      list.append(item);
    });
  }

  function renderCross(payload) {
    const list = $("cross-list");
    list.textContent = "";
    const items = payload.cross || [];
    $("cross-count").textContent = String(items.length);
    if (!items.length) {
      const none = document.createElement("li");
      none.className = "none";
      none.textContent = t("rel.nocross");
      list.append(none);
      return;
    }
    items.forEach((item) => {
      const brief = (payload.papers || {})[item.source_id] || {};
      const entry = document.createElement("li");
      const title = document.createElement("div");
      title.textContent = item.title || item.source_id;
      const meta = document.createElement("div");
      meta.className = "m";
      meta.textContent = [item.source_id, brief.year, t("rel.score", { score: item.score }),
        item.via_label ? t("rel.bridge", { label: item.via_label }) : ""]
        .filter(Boolean).join(" · ");
      entry.append(title, meta);
      if (brief.abstract) {
        const abstract = document.createElement("div");
        abstract.className = "m";
        abstract.style.marginTop = "2px";
        abstract.textContent = plain(brief.abstract).slice(0, 150) + "…";
        entry.append(abstract);
      }
      entry.addEventListener("click", () => revealPaper(item.source_id));
      list.append(entry);
    });
  }

  /** Flash a row three times, so the reader can find where the column just moved to.
   *
   * The class is removed when the animation ends, not on a timer: the animation is three
   * iterations of one keyframe set, and only the stylesheet knows how long that is.
   */
  function flash(node) {
    if (!node) return;
    node.classList.remove("flash");
    void node.offsetWidth;                     // restart it if it is already running
    node.classList.add("flash");
    node.addEventListener("animationend", () => node.classList.remove("flash"),
                          { once: true });
  }

  /** Bring a paper into view in the tree **without opening it**.
   *
   * "不要自动打开底下的条目": a click on a related article is a question about *that paper*,
   * and expanding it buries the row the reader is looking for under a hundred of its cards.
   * The row is shown and flashed; opening it stays a separate, deliberate click.
   *
   * This replaces a function that expanded the paper, and whose flash never showed: it added
   * `.pulse` to the `<li>`, and `.row.pulse` only ever matched a card row.
   */
  function revealPaper(sourceId) {
    const found = state.tree[sourceId];
    if (!found) return;
    // Centred, not `nearest`: `nearest` scrolls the row *just* into view, so a row below the
    // fold lands against the bottom edge with the column cut off above it -- "不要再最底下".
    found.item.scrollIntoView({ block: "center" });
    flash(found.item);
  }

  /** Point at one card in the tree: open its paper far enough for the row to exist, then flash.
   *
   * A collapsed paper has no card rows, so this is the one case where locating a card means
   * expanding something -- its own paper, and only as far as the row.
   */
  async function revealCard(cardId) {
    let row = state.rows.find((item) => item.card_id === cardId);
    if (!row) {
      const payload = await api("/api/card/" + encodeURIComponent(cardId));
      const found = state.tree[(payload.card || {}).source_id];
      if (!found) return;
      if (!found.item.classList.contains("open")) {
        await togglePaper(found.entry, found.item, found.inner);
      }
      row = state.rows.find((item) => item.card_id === cardId);
    }
    if (!row) return;
    row.node.scrollIntoView({ block: "center" });
    flash(row.node);
  }

  /* ---------------- the graph: the neighbourhood, drawn here ----------------
   * This box is the canvas. It draws the focus card, what it depends on, what depends on it,
   * and the related papers -- with the relations as **edges**, because a relation a reader
   * cannot see has not been shown. Dependencies are highlighted from the start (upstream
   * blue, downstream green) and clicking a node moves the highlight onto it.
   *
   * It is fluid by construction: one SVG, drag to pan, wheel to zoom, no mode to switch and
   * no button to press. Nothing of it is a second application. */
  const GRAPH = { selected: null, scale: 1, tx: 0, ty: 0, view: null, host: null };

  function renderGraph(payload) {
    const cards = (payload.nodes || []).filter((node) => node.role !== "other");
    const papers = payload.cross || [];
    const host = $("graph");
    host.textContent = "";
    GRAPH.selected = null;
    GRAPH.scale = 1;
    GRAPH.tx = 0;
    GRAPH.ty = 0;
    if (!cards.length && !papers.length) {
      host.textContent = t("graph.empty");
      return;
    }
    const focus = (payload.focus || [])[0] || (cards[0] || {}).card_id || "";

    // --- dependency columns: upstream left, the focus in the middle, downstream right
    const byId = {};
    cards.forEach((node) => { byId[node.card_id] = node; });
    const edges = (payload.edges || []).filter((edge) => byId[edge.from] && byId[edge.to]);
    const outgoing = {}, incoming = {};
    edges.forEach((edge) => {
      (outgoing[edge.from] = outgoing[edge.from] || []).push(edge.to);
      (incoming[edge.to] = incoming[edge.to] || []).push(edge.from);
    });
    const level = {};
    const walk = (start, map, sign) => {
      level[start] = 0;
      let frontier = [start], depth = 0;
      while (frontier.length) {
        depth += 1;
        const next = [];
        frontier.forEach((identifier) => {
          (map[identifier] || []).forEach((neighbour) => {
            if (!(neighbour in level) || Math.abs(level[neighbour]) > depth) {
              level[neighbour] = sign * depth;
              next.push(neighbour);
            }
          });
        });
        frontier = next;
      }
    };
    walk(focus, outgoing, -1);
    walk(focus, incoming, 1);
    cards.forEach((node) => { if (!(node.card_id in level)) level[node.card_id] = 0; });

    const COL = 196, ROW = 62, W = 150, H = 40, PAD = 26, GAP = 182;
    const PW = 168, PH = 42, PSTEP = 186, PROW = 56;
    const columns = {};
    cards.forEach((node) => {
      const key = String(level[node.card_id]);
      (columns[key] = columns[key] || []).push(node);
    });
    const sortKeys = Object.keys(columns).map(Number).sort((a, b) => a - b);
    const minKey = sortKeys.length ? Math.min.apply(null, sortKeys) : 0;
    const maxRows = sortKeys.length
      ? Math.max.apply(null, sortKeys.map((key) => columns[String(key)].length)) : 1;
    const hasBoth = minKey < 0 && sortKeys[sortKeys.length - 1] > 0;
    const cardsW = sortKeys.length
      ? (sortKeys[sortKeys.length - 1] - minKey) * COL + W + PAD * 2 + (hasBoth ? GAP : 0) : 0;
    // The related papers get their own band, and the band is given room for three across
    // before it wraps -- otherwise a card with no dependencies (most of them) drew its
    // related work as one tall column under a lone node.
    const wanted = Math.min(Math.max(papers.length, 1), 3);
    const bandW = wanted * PSTEP - 18 + PAD * 2;
    const width = Math.max(cardsW, papers.length ? bandW : 0, 360);
    const perRow = Math.max(1, Math.floor((width - PAD * 2 + 18) / (PW + 18)));
    const bandRows = Math.ceil(papers.length / perRow);
    const cardsH = maxRows * ROW + PAD;
    const height = Math.max(cardsH + (papers.length ? bandRows * PROW + 34 : 0) + PAD, 150);

    const position = {};
    sortKeys.forEach((key) => {
      const column = columns[String(key)];
      column.sort((a, b) => String(a.card_id).localeCompare(String(b.card_id)));
      const offset = (maxRows - column.length) / 2;
      column.forEach((node, index) => {
        position[node.card_id] = {
          x: PAD + (key - minKey) * COL + (hasBoth && key >= 0 ? GAP : 0),
          y: PAD + (offset + index) * ROW,
        };
      });
    });
    papers.forEach((item, index) => {
      position["paper:" + item.source_id] = {
        x: PAD + (index % perRow) * PSTEP,
        y: cardsH + 34 + Math.floor(index / perRow) * PROW,
      };
    });

    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "graph-svg");

    const defs = document.createElementNS(NS, "defs");
    [["up", "#3b82f6"], ["down", "#22c55e"], ["other", "#94a3b8"]].forEach((pair) => {
      const marker = document.createElementNS(NS, "marker");
      marker.setAttribute("id", "arrow-" + pair[0]);
      marker.setAttribute("viewBox", "0 0 8 8");
      marker.setAttribute("refX", "7");
      marker.setAttribute("refY", "4");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M0,1 L7,4 L0,7 z");
      path.setAttribute("fill", pair[1]);
      marker.append(path);
      defs.append(marker);
    });
    svg.append(defs);

    const view = document.createElementNS(NS, "g");
    view.setAttribute("class", "graph-viewport");
    svg.append(view);
    GRAPH.view = view;
    GRAPH.host = host;

    // --- the dependency edges
    edges.forEach((edge) => {
      const from = position[edge.from], to = position[edge.to];
      if (!from || !to) return;
      const similar = edge.kind === "similar";
      const tone = (byId[edge.from] && byId[edge.from].role === "downstream") ||
        (byId[edge.to] && byId[edge.to].role === "upstream") ? "up" : "other";
      const line = document.createElementNS(NS, "path");
      const x1 = from.x + W, y1 = from.y + H / 2;
      const x2 = to.x, y2 = to.y + H / 2;
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.4);
      line.setAttribute("d", "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " +
        (x2 - dx) + "," + y2 + " " + x2 + "," + y2);
      line.setAttribute("fill", "none");
      line.setAttribute("class", "ge");
      line.setAttribute("data-from", edge.from);
      line.setAttribute("data-to", edge.to);
      // A `uses` edge is a dependency and points somewhere; a `similar` edge is undirected and
      // drawn violet and dashed, so the reader can tell "this is built on that" from "these are
      // about the same thing" without reading a legend.
      if (similar) {
        line.setAttribute("stroke", "#a78bfa");
        line.setAttribute("stroke-width", "1.1");
        line.setAttribute("stroke-dasharray", "4 3");
      } else {
        line.setAttribute("stroke", tone === "up" ? "#60a5fa" : "#94a3b8");
        line.setAttribute("stroke-width", "1.2");
        line.setAttribute("marker-end", "url(#arrow-" + tone + ")");
      }
      view.append(line);
    });

    // --- the related papers, tied to the focus by the similarity they were found on
    const strongest = Math.max.apply(null, papers.map((item) => item.score || 0).concat([1]));
    papers.forEach((item) => {
      const spot = position["paper:" + item.source_id];
      const anchor = position[focus];
      if (!spot || !anchor) return;
      const line = document.createElementNS(NS, "path");
      const x1 = anchor.x + W / 2, y1 = anchor.y + H;
      const x2 = spot.x + PW / 2, y2 = spot.y;
      const dy = Math.max(20, (y2 - y1) * 0.45);
      line.setAttribute("d", "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 + dy) + " " +
        x2 + "," + (y2 - dy) + " " + x2 + "," + y2);
      line.setAttribute("fill", "none");
      line.setAttribute("class", "ge");
      line.setAttribute("data-from", focus);
      line.setAttribute("data-to", "paper:" + item.source_id);
      line.setAttribute("stroke", "#a78bfa");
      // thin: a connector is a hint, not a bar. The score is still carried (1.0-2.2) and
      // stated in the label, so nothing is lost by drawing it quietly.
      line.setAttribute("stroke-width",
        String(Math.max(1.0, 1 + 1.2 * ((item.score || 0) / strongest))));
      line.setAttribute("stroke-dasharray", "4 3");
      view.append(line);
    });

    // --- the nodes
    cards.forEach((node) => {
      const spot = position[node.card_id];
      const tone = ROLE[node.role] || ROLE.other;
      const group = document.createElementNS(NS, "g");
      group.setAttribute("class", "gn");
      group.setAttribute("data-id", node.card_id);
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", spot.x);
      rect.setAttribute("y", spot.y);
      rect.setAttribute("width", W);
      rect.setAttribute("height", H);
      rect.setAttribute("rx", "9");
      rect.setAttribute("fill", tone.fill);
      rect.setAttribute("stroke", tone.border);
      rect.setAttribute("stroke-width", node.card_id === focus ? "2.4" : "1.2");
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", spot.x + 9);
      text.setAttribute("y", spot.y + 17);
      text.setAttribute("fill", tone.text);
      text.textContent = plain(node.label || "").slice(0, 20);
      const sub = document.createElementNS(NS, "text");
      sub.setAttribute("x", spot.x + 9);
      sub.setAttribute("y", spot.y + 31);
      sub.setAttribute("fill", tone.text);
      sub.setAttribute("opacity", "0.75");
      sub.textContent = (node.kind || "") + " · " + t(tone.key);
      group.append(rect, text, sub);
      const tip = document.createElementNS(NS, "title");
      tip.textContent = plain(node.label || "") + "\n" + (node.kind || "");
      group.append(tip);
      view.append(group);
    });
    papers.forEach((item) => {
      const spot = position["paper:" + item.source_id];
      const group = document.createElementNS(NS, "g");
      group.setAttribute("class", "gn paper");
      group.setAttribute("data-id", "paper:" + item.source_id);
      group.setAttribute("data-source", item.source_id);
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", spot.x);
      rect.setAttribute("y", spot.y);
      rect.setAttribute("width", PW);
      rect.setAttribute("height", PH);
      rect.setAttribute("rx", "9");
      rect.setAttribute("fill", "#a78bfa");
      rect.setAttribute("stroke", "#8b5cf6");
      const brief = (payload.papers || {})[item.source_id] || {};
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", spot.x + 9);
      text.setAttribute("y", spot.y + 17);
      text.setAttribute("fill", "#2e1065");
      // The box carries the citation, not the title: authors and the year of the **first
      // version** (`published` from the Atom feed, never `updated`, which moves whenever arXiv
      // touches the metadata). The title is one hover away, and a box that is two lines of
      // title tells a reader less than "Braverman, Finkelberg (2016)".
      text.textContent = plain(paperLabel(brief, item.source_id)).slice(0, 26);
      const sub = document.createElementNS(NS, "text");
      sub.setAttribute("x", spot.x + 9);
      sub.setAttribute("y", spot.y + 32);
      sub.setAttribute("fill", "#2e1065");
      sub.setAttribute("opacity", "0.75");
      sub.textContent = t("graph.paper", { score: item.score });
      group.append(rect, text, sub);
      const tip = document.createElementNS(NS, "title");
      tip.textContent = t("graph.tip", { title: plain(item.title || item.source_id),
                                       score: item.score });
      group.append(tip);
      view.append(group);
    });

    wireGraph(svg, view, focus);
    host.append(svg);
    // One line under the graph: what the colours mean and what the gestures are. Not a
    // button -- the graph is always in its fluid rendering, so there is nothing to toggle.
    const remaining = (payload.nodes || []).length - cards.length;
    const note = document.createElement("div");
    note.className = "graph-note";
    note.textContent = t("graph.legend") +
      (remaining > 0 ? t("graph.notdrawn", { n: remaining }) : "");
    host.append(note);
  }

  /** Drag to pan, wheel to zoom, pinch to zoom, click to move the highlight -- and nothing
   * else.
   *
   * The highlight is on from the start, on the focus card: its upstream and downstream are
   * emphasised and the rest of the graph recedes. Clicking a node moves it there, which is
   * the whole interaction, and clicking a card opens it.
   *
   * The gestures are Pointer Events, so one code path covers the mouse, a pen and a finger:
   * the graph previously answered only the mouse, which on a phone meant a picture that
   * could be neither panned nor zoomed -- the `touch-action: none` was already in the
   * stylesheet, saying the element wants the touches, and nothing was listening. Both zooms
   * are **anchored**: a wheel zoom keeps the point under the cursor under it, and a pinch
   * keeps the midpoint between the fingers -- zooming used to move the content toward the
   * top-left corner, which reads as the graph sliding away. */
  function wireGraph(svg, view, focus) {
    const apply = () => {
      view.setAttribute("transform", "translate(" + GRAPH.tx + "," + GRAPH.ty + ") scale(" +
        GRAPH.scale + ")");
    };
    const highlight = (identifier) => {
      GRAPH.selected = identifier || focus;
      svg.classList.add("has-sel");
      const chosen = GRAPH.selected;
      const near = {};
      near[chosen] = true;
      [...svg.querySelectorAll(".ge")].forEach((edge) => {
        const touches = edge.dataset.from === chosen || edge.dataset.to === chosen;
        edge.classList.toggle("on", touches);
        edge.classList.toggle("off", !touches);
        if (touches) {
          near[edge.dataset.from] = true;
          near[edge.dataset.to] = true;
        }
      });
      [...svg.querySelectorAll(".gn")].forEach((node) => {
        const on = near[node.dataset.id];
        node.classList.toggle("on", !!on);
        node.classList.toggle("off", !on);
      });
    };

    const pointers = new Map();
    let drag = null;
    let pinch = null;

    const markDragged = () => {
      svg.dataset.dragged = "1";
      setTimeout(() => { delete svg.dataset.dragged; }, 0);
    };
    /** Zoom to `next` while keeping the viewport point (`mx`, `my`) over the same content. */
    const zoomAt = (next, mx, my) => {
      const factor = next / GRAPH.scale;
      GRAPH.tx = mx - (mx - GRAPH.tx) * factor;
      GRAPH.ty = my - (my - GRAPH.ty) * factor;
      GRAPH.scale = next;
      apply();
    };

    svg.addEventListener("pointerdown", (event) => {
      // Capture keeps the gesture alive when the pointer leaves the box. It throws when the
      // pointer is already gone -- a race on real devices, always on a synthetic event -- and
      // an exception here would kill the handler before the pointer is even registered, so
      // the whole gesture silently dies. Losing capture only costs tracking past the edge.
      try {
        svg.setPointerCapture(event.pointerId);
      } catch (_error) { /* the pointer vanished; the gesture still works inside the box */ }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        drag = { x: event.clientX, y: event.clientY, tx: GRAPH.tx, ty: GRAPH.ty, moved: false };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: GRAPH.scale,
                  tx: GRAPH.tx, ty: GRAPH.ty, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        drag = null;
      }
    });
    svg.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = svg.getBoundingClientRect();
        const next = Math.max(0.35, Math.min(2.6, pinch.scale * dist / pinch.dist));
        const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
        zoomAt(next, cx, cy);
        drag = null;
        markDragged();
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      GRAPH.tx = drag.tx + dx;
      GRAPH.ty = drag.ty + dy;
      apply();
    });
    const release = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) {
        const moved = drag && drag.moved;
        drag = null;
        if (moved) markDragged();
      }
    };
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(0.35, Math.min(2.6, GRAPH.scale * step));
      zoomAt(next, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    view.addEventListener("click", (event) => {
      const node = event.target.closest ? event.target.closest(".gn") : null;
      if (svg.dataset.dragged) return;
      if (!node) {
        // a click on the background puts the box away and the highlight back on the focus
        $("node-detail").hidden = true;
        highlight(focus);
        return;
      }
      // Clicking a node does **not** navigate. It moves the highlight and fills the panel
      // beside the graph; the link inside that panel is the only thing that opens a card.
      highlight(node.dataset.id);
      showNodeDetail(node.dataset.source || "", node.dataset.id).catch(showError);
    });
    highlight(focus);
    apply();
  }

  /* ---------------- the node detail: a panel beside the graph ----------------
   * Clicking a card must not jump -- the reader is looking at the graph and a jump throws
   * that away. So the panel says what the node is (the abstract and the DOI for a paper, the
   * statement for a card) and offers one link, which is what navigates. */
  async function showNodeDetail(sourceId, cardId) {
    const panel = $("node-detail");
    panel.hidden = false;
    panel.textContent = t("node.loading");
    const heading = (text) => {
      const node = document.createElement("h3");
      node.textContent = text;
      return node;
    };
    /** One line of the node panel. It takes nodes as well as text, because the authors on it are
     *  controls -- clicking one filters the search to that person (see `authorChips`). */
    const line = (content, className) => {
      const node = document.createElement("div");
      node.className = className || "d-meta";
      if (Array.isArray(content)) content.forEach((item) => node.append(item));
      else node.textContent = content;
      return node;
    };
    const fact = (text) => {
      const node = document.createElement("span");
      node.className = "paper-fact";
      node.textContent = text;
      return node;
    };
    const link = (href, text) => {
      const node = document.createElement("a");
      node.href = href;
      node.target = "_blank";
      node.rel = "noreferrer";
      node.textContent = text;
      return node;
    };
    /* The jump button does two things, and both are what the reader asked for by clicking it:
       open the card, and point at it in the tree -- "直接在最左侧的大栏定位具体卡片然后闪烁".
       A jump that opened the card without showing *where* it sits leaves the reader to find
       it again in a column of a hundred rows. */
    const jump = (identifier, text, locate) => {
      const node = document.createElement("button");
      node.className = "go";
      node.textContent = text;
      node.addEventListener("click", () => {
        openCard(identifier).catch(showError);
        if (locate) revealCard(identifier).catch(showError);
      });
      return node;
    };

    // An explicit way out. The panel has always closed on a click on the graph behind it, but
    // that is a gesture the reader has to know; a click on a node fills the panel with an
    // abstract that can be long, and "how do I put this away" should not be a guess.
    const closer = document.createElement("button");
    closer.className = "fold";
    closer.type = "button";
    closer.textContent = "×";
    closer.title = t("node.close");
    closer.setAttribute("aria-label", closer.title);
    closer.addEventListener("click", () => { panel.hidden = true; });

    panel.textContent = "";
    panel.append(closer);
    if (sourceId) {
      const paper = await api("/api/paper?source_id=" + encodeURIComponent(sourceId));
      panel.append(heading(paper.title || sourceId));
      panel.append(line(authorChips(paper.authors, 6)
        .concat([paper.year, paper.cluster].filter(Boolean).map(fact))));
      const body = document.createElement("div");
      body.className = "d-body";
      if (TEX) TEX.setMacros(paper.macros, sourceId, paper.macros_override);
      body.innerHTML = paper.abstract ? richHtml(paper.abstract) : t("node.noabstract");
      panel.append(body);
      if (paper.doi) panel.append(link("https://doi.org/" + paper.doi, "DOI " + paper.doi));
      if (paper.url) panel.append(link(paper.url, "arXiv " + t("source.link")));
      if ((paper.cards || []).length) {
        panel.append(jump(paper.cards[0].card_id,
                          t("node.openfirst", { label: paper.cards[0].label ||
                                                t("card.nolabel") }), true));
      }
      return;
    }
    const payload = await api("/api/card/" + encodeURIComponent(cardId));
    const card = payload.card || {};
    const paper = payload.paper || {};
    panel.append(heading((card.label || t("card.nolabel")) + "  ·  " + (card.kind || "")));
    panel.append(line([document.createTextNode(paper.title || card.source_id || "")]
      .concat(authorChips(paper.authors, 6), [paper.year].filter(Boolean).map(fact))));
    const body = document.createElement("div");
    body.className = "d-body";
    if (TEX) TEX.setMacros(paper.macros, card.source_id, paper.macros_override);
    body.innerHTML = richHtml(card.statement || "", TEX ? TEX.refsFor(card) : {},
                              { math: isFormula(card.kind) });
    panel.append(body);
    if (paper.doi) panel.append(link("https://doi.org/" + paper.doi, "DOI " + paper.doi));
    panel.append(jump(card.card_id, t("node.open"), true));
  }

  /* ---------------- wiring ---------------- */
  $("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch($("q").value).catch(showError);
  });
  let timer = null;
  $("q").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const value = $("q").value;
      if (value.trim().length >= 2) runSearch(value).catch(showError);
      else if (!value.trim() && !Object.keys(activeFilters()).length) loadPapers().catch(showError);
    }, 320);
  });
  // The filter row searches on change, and typing an author or a year waits for a pause: a
  // search per keystroke is a request per keystroke, and the reader is still typing.
  ["f-cluster", "f-kind", "f-sort"].forEach((id) => {
    $(id).addEventListener("change", () => runSearch($("q").value).catch(showError));
  });
  let filterTimer = null;
  ["f-author", "f-year"].forEach((id) => {
    $(id).addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => runSearch($("q").value).catch(showError), 320);
    });
  });
  $("f-clear").addEventListener("click", () => {
    ["f-cluster", "f-kind", "f-author", "f-year"].forEach((id) => { $(id).value = ""; });
    runSearch($("q").value).catch(showError);
  });
  $("cards").addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setFocus(Math.min(state.focus + 1, state.rows.length - 1), false); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setFocus(Math.max(state.focus - 1, 0), false); }
    else if (event.key === "Enter" && state.focus >= 0) {
      const row = state.rows[state.focus];
      if (row) openCard(row.card_id).catch(showError);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== $("q")) {
      event.preventDefault();
      $("q").focus();
    } else if (event.key === "Escape" && !$("node-detail").hidden) {
      // the box has a close button, but Escape is what "put this away" means everywhere
      // else; a keyboard reader should not need the mouse for it.
      $("node-detail").hidden = true;
    }
  });
  $("show-up").addEventListener("click", () => showDeps("up"));
  $("show-down").addEventListener("click", () => showDeps("down"));
  $("abstract-fold").addEventListener("click", () => setAbstractFolded(!$("abstract").hidden));
  $("lang").addEventListener("click", () => setLang(LANG === "zh" ? "en" : "zh"));

  function showError(error) {
    $("meta").textContent = t("error") + error.message;
  }

  if (TEX) TEX.detect();
  let uiStamp = null;
  /** The window's own files change when the code does; a tab that is already open keeps the
   * old ones. That looks exactly like a bug in the new code -- twice in one day a fixed
   * feature was reported broken because the tab had not reloaded -- so `/api/stats` carries a
   * hash of them and this says so when it moves. */
  function pollStats() {
    api("/api/stats").then((stats) => {
      // "cardwash.v2" -> "v2"; slicing the last two characters gave "vv2"
      const version = String(stats.wash_version || "").replace(/^cardwash\./, "");
      $("ver").textContent = t("meta.ver", { version: version, papers: stats.papers,
                                             cards: stats.cards });
      // The filter row is filled from the library itself, so it is usable before the reader
      // has searched for anything.
      if (stats.facets) {
        state.facets = stats.facets;
        renderFacets(stats.facets);
      }
      if (!uiStamp) {
        uiStamp = stats.ui || "";
        return;
      }
      if (stats.ui && uiStamp && stats.ui !== uiStamp) {
        $("stale").hidden = false;
        $("stale").textContent = t("stale");
      }
    }).catch(() => {});
  }
  pollStats();
  setInterval(pollStats, 20000);

  function routeFromHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    if (!raw) return false;
    // `#<card_id>` and the older `#<card_id>/related` are the same thing now: the relation
    // block is part of the card page, so there is nothing extra to ask for.
    const parts = raw.split("/");
    if (/^ma-c-[A-Za-z0-9]+$/.test(parts[0])) {
      openCard(parts[0]).catch(showError);
      return true;
    }
    // `#q=…&author=…` is a shareable search: the query and the filter row travel together,
    // so opening the link answers with the same list rather than with the browse view.
    if (/^q=/.test(raw)) {
      const params = new URLSearchParams(raw);
      $("q").value = params.get("q") || "";
      ["f-cluster", "f-kind", "f-author", "f-year"].forEach((id) => {
        const node = $(id);
        if (node) node.value = params.get(id.slice(2)) || "";
      });
      runSearch($("q").value).catch(showError);
      return true;
    }
    return false;
  }

  // English first: translate the static markup before anything is fetched, so the page is
  // never briefly half a language.
  applyLang();
  loadPapers().then(() => {
    // **The listener registers whatever the page opened with.** It used to register only
    // when there was no card hash -- so a reader who landed on a deep link, then edited the
    // address to another one, got nothing: the page held the first card forever. A hash
    // change is always worth routing, and a `replaceState` (which is how `openCard` and
    // `runSearch` write it) never fires it, so the two cannot loop.
    routeFromHash();
    window.addEventListener("hashchange", routeFromHash);
  }).catch(showError);
})();
