/* The static window: no server, so the two things Python used to compute are computed here.
 *
 * `tools/build_site.py` exports the data; this file answers `/api/*` from it and implements
 *
 *   1. **the search** -- the same pipeline as `tesseralib/engine.py`: tokenise, correct the
 *      spelling, score with BM25, then rank by Meilisearch's rules (`words`, `typo`,
 *      `proximity`, `attributeRank`, then the score);
 *   2. **the relations walk** -- the same walk as `tesseralib/relations.py`: the focus's
 *      upstream/downstream closure over the `uses` edges, and its similar neighbours.
 *
 * Two implementations of one behaviour drift, so `tests/test_static.py` runs this file in a
 * headless browser and compares its answers against the Python engine, query by query. If you
 * change one side, that test is what tells you.
 *
 * It works by replacing `window.fetch`, so `app.js` is untouched and cannot tell the difference
 * between the server and these files.
 */
(function () {
  "use strict";

  var LATEX_COMMAND = /\\[A-Za-z]+/g;
  var VENDOR_TOKEN = /[a-z0-9]+/g;
  var CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
  //: mirrors `textnorm.STOPWORDS`: a stopword is not a "significant" term, so it never counts
  //: towards coverage
  var STOPWORDS = new Set(["a", "about", "all", "an", "and", "any", "are", "as", "at", "be",
    "been", "by", "for", "from", "he", "hence", "if", "in", "into", "is", "it", "its", "no",
    "non", "not", "of", "on", "or", "our", "over", "she", "so", "some", "such", "than", "that",
    "the", "then", "these", "they", "this", "those", "thus", "to", "under", "was", "we", "were",
    "when", "with", "you"]);
  //: mirrors `index.Index`: the typo budget by word length, and the rare-term rule
  var ONE_TYPO = 5, TWO_TYPOS = 9, PREFIX_MIN = 5, FUZZY_LIMIT = 4, MIN_TERM = 4,
      RARE = 2, RATIO = 4;
  var SEARCH_POOL = 400;
  var FIELD_ALIASES = { source: "paper", category: "cluster", field: "cluster",
                        area: "cluster", by: "author", type: "kind" };
  var FIELD_NAMES = ["author", "year", "cluster", "kind", "paper"]
    .concat(Object.keys(FIELD_ALIASES));
  var QUERY_FIELD = new RegExp("\\b(" + FIELD_NAMES.join("|") + ")\\s*:\\s*(\"[^\"]*\"|\\S+)",
                               "gi");

  /* ---------------- tokenising (mirrors `textnorm`) ---------------- */
  function tokenize(text) {
    return String(text == null ? "" : text).toLowerCase().match(VENDOR_TOKEN) || [];
  }

  function cjkTokens(text) {
    var out = [];
    var runs = String(text == null ? "" : text).match(CJK_RUN) || [];
    runs.forEach(function (run) {
      for (var index = 0; index < run.length; index += 1) {
        out.push(run[index]);
        if (index + 1 < run.length) out.push(run.slice(index, index + 2));
      }
    });
    return out;
  }

  function tokenizeQuery(text) {
    var terms = tokenize(String(text == null ? "" : text).replace(LATEX_COMMAND, " "));
    return terms.length ? terms : cjkTokens(text);
  }

  function parseQuery(text) {
    var filters = {};
    var clean = String(text == null ? "" : text).replace(QUERY_FIELD, function (whole, name, value) {
      var key = FIELD_ALIASES[name.toLowerCase()] || name.toLowerCase();
      var trimmed = value.replace(/^"|"$/g, "").trim();
      if (trimmed) {
        if (!filters[key]) filters[key] = [];
        filters[key].push(trimmed);
      }
      return " ";
    });
    return { text: clean.split(/\s+/).filter(Boolean).join(" "), filters: filters };
  }

  /* ---------------- spelling (mirrors `index`) ---------------- */
  function editDistance(a, b, limit) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limit) return null;
    if (limit <= 1) {
      var short = a, long = b;
      if (short.length > long.length) { short = b; long = a; }
      var index = 0;
      while (index < short.length && short[index] === long[index]) index += 1;
      if (index === short.length) return long.length - short.length === 1 ? 1 : null;
      if (short.length !== long.length) {
        return short.slice(index) === long.slice(index + 1) ? 1 : null;
      }
      if (short.slice(index + 1) === long.slice(index + 1)) return 1;
      return null;
    }
    var previous = [];
    for (var column = 0; column <= b.length; column += 1) previous.push(column);
    for (var row = 1; row <= a.length; row += 1) {
      var current = [row];
      for (var col = 1; col <= b.length; col += 1) {
        var cost = a[row - 1] === b[col - 1] ? 0 : 1;
        current.push(Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + cost));
      }
      if (Math.min.apply(null, current) > limit) return null;
      previous = current;
    }
    return previous[b.length] <= limit ? previous[b.length] : null;
  }

  function withinEdits(a, b, limit) {
    if (editDistance(a, b, limit) !== null) return true;
    if (limit < 1 || a.length !== b.length) return false;
    for (var index = 0; index + 1 < a.length; index += 1) {
      var swapped = a.slice(0, index) + a[index + 1] + a[index] + a.slice(index + 2);
      if (swapped === b) return true;
    }
    return false;
  }

  function allowedTypos(term) {
    if (term.length < ONE_TYPO) return 0;
    return term.length < TWO_TYPOS ? 1 : 2;
  }

  /* ---------------- the search pipeline (mirrors `engine.search`) ---------------- */
  function searcher(data, meta) {
    var terms = data.terms;
    var byTerm = Object.create(null);
    var buckets = Object.create(null);
    terms.forEach(function (entry, id) {
      byTerm[entry[0]] = { id: id, rows: entry[1] };
      var key = entry[0].slice(0, 1) + "|" + entry[0].length;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(entry[0]);
    });

    function frequency(term) {
      return byTerm[term] ? byTerm[term].rows.length : 0;
    }

    function nearTerms(term) {
      if (term.length < MIN_TERM) return [];
      var budget = allowedTypos(term);
      var out = [];
      // a prefix match has no length bound, and costs nothing: the reader stopped typing
      Object.keys(buckets).forEach(function (key) {
        var parts = key.split("|");
        if (parts[0] !== term.slice(0, 1) || Number(parts[1]) < term.length) return;
        buckets[key].forEach(function (candidate) {
          if (candidate.indexOf(term) === 0) out.push([0, candidate]);
        });
      });
      if (budget) {
        for (var length = term.length - budget; length <= term.length + budget; length += 1) {
          var list = buckets[term.slice(0, 1) + "|" + length] || [];
          list.forEach(function (candidate) {
            var cost = editDistance(term, candidate, budget);
            if (cost === null && budget >= 1 && withinEdits(term, candidate, 1)) cost = 1;
            if (cost === null) return;
            if (term[0] !== candidate[0]) cost += 1;
            if (cost <= budget) out.push([cost, candidate]);
          });
        }
      }
      var seen = Object.create(null);
      out = out.filter(function (pair) {
        var key = pair[0] + "|" + pair[1];
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      out.sort(function (a, b) {
        return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
      });
      return out.slice(0, FUZZY_LIMIT);
    }

    function expand(rawTerms) {
      var expanded = [], corrections = {}, unmatched = [];
      rawTerms.forEach(function (term) {
        if (STOPWORDS.has(term)) { expanded.push(term); return; }
        var count = frequency(term);
        if (count > RARE) { expanded.push(term); return; }
        var found = nearTerms(term);
        var chosen = [];
        if (!count) {
          if (found.length) chosen = [found[0][1]];
        } else {
          var floor = Math.max(2, count * RATIO);
          chosen = found.filter(function (pair) { return frequency(pair[1]) >= floor; })
            .slice(0, 1).map(function (pair) { return pair[1]; });
        }
        if (chosen.length) {
          corrections[term] = chosen;
          chosen.forEach(function (name) { expanded.push(name); });
        } else if (count) {
          expanded.push(term);
        } else {
          unmatched.push(term);
        }
      });
      return { terms: expanded, corrections: corrections, unmatched: unmatched };
    }

    function scores(scoring) {
      var total = data.docs.length;
      var out = Object.create(null);
      if (!data.avgdl) return out;
      scoring.forEach(function (term) {
        var entry = byTerm[term];
        if (!entry) return;
        var idf = Math.log(1 + (total - entry.rows.length + 0.5) / (entry.rows.length + 0.5));
        entry.rows.forEach(function (pair) {
          var ordinal = pair[0], count = pair[1];
          var length = data.lens[ordinal];
          var denominator = count + data.k1 * (1 - data.b + data.b * length / data.avgdl);
          out[ordinal] = (out[ordinal] || 0) + idf * count * (data.k1 + 1) / denominator;
        });
      });
      return out;
    }

    function window(tokens, matched) {
      if (matched.length < 2) return [0, 0];
      var wanted = Object.create(null);
      matched.forEach(function (term, index) { wanted[term] = index; });
      var best = tokens.length, disordered = 0;
      for (var start = 0; start < tokens.length; start += 1) {
        var term = tokens[start];
        if (!(term in wanted)) continue;
        var seen = [], order = 0;
        for (var index = start; index < Math.min(tokens.length, start + best); index += 1) {
          var name = tokens[index];
          if (!(name in wanted) || seen.indexOf(name) >= 0) continue;
          if (seen.length && wanted[name] < wanted[seen[seen.length - 1]]) order = 1;
          seen.push(name);
          if (seen.length === matched.length) {
            if (index - start < best) { best = index - start; disordered = order; }
            break;
          }
        }
      }
      return [best, disordered];
    }

    function passes(row, info, wanted) {
      var name, values;
      for (name in wanted) {
        // A value is compared as a case-insensitive *substring of the field*, never as a whole
        // word, and surrounding whitespace is not part of the name -- see
        // `Engine._passes_filters`.
        values = (wanted[name] || []).map(function (value) { return String(value).trim(); })
                                     .filter(function (value) { return value.length; });
        if (!values.length) continue;
        if (name === "cluster") {
          if (!values.some(function (v) { return (row.cluster || "").toLowerCase() === v.toLowerCase(); })) return false;
        } else if (name === "kind") {
          if (!values.some(function (v) { return (row.kind || "").toLowerCase() === v.toLowerCase(); })) return false;
        } else if (name === "paper") {
          if (!values.some(function (v) { return (row.source_id || "").toLowerCase().indexOf(v.toLowerCase()) >= 0; })) return false;
        } else if (name === "author") {
          var names = ((info && info.authors) || []).join(" ; ").toLowerCase();
          if (!values.some(function (v) { return names.indexOf(v.toLowerCase()) >= 0; })) return false;
        } else if (name === "year") {
          var year = (info && info.year) || "";
          if (!values.some(function (v) { return yearMatches(year, v); })) return false;
        }
      }
      return true;
    }

    return { expand: expand, scores: scores, window: window, passes: passes,
             frequency: frequency };
  }

  function yearMatches(year, wanted) {
    if (!year) return false;
    var text = String(wanted).trim();
    if (text.indexOf("-") >= 0) {
      var parts = text.split("-");
      var low = parts[0].trim(), high = parts[1].trim();
      if (low && year < low) return false;
      if (high && year > high) return false;
      return true;
    }
    return year === text;
  }

  /** Meilisearch's rules, in its order, as one comparison.
   *
   * `sort` goes **where Meilisearch puts it**: after `proximity` and before `attributeRank`, so
   * sorting by year still prefers the card that matches more of the query. Getting this order
   * wrong is exactly what the cross-implementation test caught: the first version put the year
   * first, and the two engines then disagreed about the order of two cards from the same year.
   */
  function compareRows(a, b, sort) {
    var keys = [["matched_count", -1], ["typos", 1], ["window", 1], ["out_of_order", 1]];
    for (var index = 0; index < keys.length; index += 1) {
      var field = keys[index][0], sign = keys[index][1];
      if (a[field] !== b[field]) return sign * (a[field] - b[field]);
    }
    var left = stamp(a.paper_year, sort), right = stamp(b.paper_year, sort);
    if (left[0] !== right[0]) return left[0] - right[0];
    if (left[1] !== right[1]) return left[1] - right[1];
    var one = a.in_label ? 0 : 1, two = b.in_label ? 0 : 1;
    if (one !== two) return one - two;
    if (a.score !== b.score) return b.score - a.score;
    if (a.position !== b.position) return a.position - b.position;
    // The card's place in the library, then its id: two rows that tie on every rule above are
    // two rows the reader has no reason to see shuffled, and the id is a digest of the statement
    // -- stable, but saying nothing about order. This is the *whole* ordering for a filter with
    // no query text, where every rule above sits at its floor.
    if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
    return a.card_id < b.card_id ? -1 : a.card_id > b.card_id ? 1 : 0;
  }

  /** The year as a sort key: a card with no year sorts last either way. */
  function stamp(year, sort) {
    var text = String(year || "");
    if (sort !== "newest" && sort !== "oldest") return [0, 0];
    if (!/^[0-9]+$/.test(text)) return [1, 0];
    return [0, sort === "newest" ? -Number(text) : Number(text)];
  }

  /* ---------------- the relations walk (mirrors `relations`) ---------------- */
  function closure(edges, start, direction) {
    var adjacency = Object.create(null);
    edges.forEach(function (edge) {
      var from = direction === "up" ? edge.from : edge.to;
      var to = direction === "up" ? edge.to : edge.from;
      if (!adjacency[from]) adjacency[from] = [];
      adjacency[from].push(to);
    });
    var seen = Object.create(null);
    var frontier = (adjacency[start] || []).slice();
    var depth = 1;
    while (frontier.length) {
      var next = [];
      frontier.forEach(function (node) {
        if (node in seen || node === start) return;
        seen[node] = depth;
        next = next.concat((adjacency[node] || []).slice().sort());
      });
      frontier = next;
      depth += 1;
    }
    return seen;
  }

  function defaultFocus(edges, nodes, roots) {
    var order = Object.create(null), byId = Object.create(null);
    nodes.forEach(function (node) {
      order[node.card_id] = node.order || 0;
      byId[node.card_id] = node;
    });
    var candidates = (roots && roots.length ? roots : nodes.map(function (n) { return n.card_id; }))
      .filter(function (id) { return (byId[id] || {}).kind !== "abstract"; });
    if (!candidates.length) return [];
    // The key is a tuple in Python, so compare it as one: `-reach` and `order` numerically,
    // the id lexicographically. Joining it into a string compares "10" < "9", which is how the
    // first version of this picked a different card than the server.
    function before(left, right) {
      if (left[0] !== right[0]) return left[0] < right[0];
      if (left[1] !== right[1]) return left[1] < right[1];
      return left[2] < right[2];
    }
    var best = null, bestKey = null;
    candidates.forEach(function (id) {
      var reach = Object.keys(closure(edges, id, "down")).length +
                  Object.keys(closure(edges, id, "up")).length;
      var key = [-reach, order[id] || 0, id];
      if (bestKey === null || before(key, bestKey)) {
        best = id;
        bestKey = key;
      }
    });
    return best ? [best] : [];
  }

  function relatedPayload(graph, cardId) {
    var edges = graph.edges || [], nodes = graph.nodes || [];
    var focus = cardId ? [cardId] : defaultFocus(edges, nodes, graph.roots || []);
    var uses = edges.filter(function (edge) { return edge.kind !== "similar"; });
    var upstream = focus.length ? closure(uses, focus[0], "up") : {};
    var downstream = focus.length ? closure(uses, focus[0], "down") : {};
    var similar = [];
    if (focus.length) {
      edges.forEach(function (edge) {
        if (edge.kind !== "similar") return;
        if (edge.from === focus[0]) similar.push(edge.to);
        else if (edge.to === focus[0]) similar.push(edge.from);
      });
    }
    var rows = nodes.map(function (node) {
      var id = node.card_id, role = "other";
      if (focus.indexOf(id) >= 0) role = "focus";
      else if (id in upstream) role = "upstream";
      else if (id in downstream) role = "downstream";
      var row = {};
      Object.keys(node).forEach(function (key) { row[key] = node[key]; });
      row.role = role;
      row.depth = upstream[id] || downstream[id] || 0;
      return row;
    });
    var sorted = function (table) {
      return Object.keys(table).sort(function (a, b) {
        return table[a] - table[b] || (a < b ? -1 : a > b ? 1 : 0);
      });
    };
    var out = { source_id: graph.source_id, status: graph.status, focus: focus, nodes: rows,
                edges: edges, upstream: sorted(upstream), downstream: sorted(downstream),
                similar: similar.slice().sort(), cross: graph.cross || [],
                method: graph.method || {}, papers: graph.papers || [] };
    return out;
  }

  /* ---------------- the data, and the shim ---------------- */
  var cache = Object.create(null);

  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch("data/" + name, { cache: "force-cache" }).then(function (response) {
        if (!response.ok) throw new Error("missing " + name);
        return response.json();
      });
    }
    return cache[name];
  }

  function json(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200, headers: { "Content-Type": "application/json" } });
  }

  function abortError() {
    return new DOMException("aborted", "AbortError");
  }

  async function searchPayload(params, signal) {
    var query = params.get("q") || "";
    var limit = Math.max(1, Math.min(60, Number(params.get("k") || 12)));
    var sort = params.get("sort") || null;
    var parsed = parseQuery(query);
    var wanted = {};
    Object.keys(parsed.filters).forEach(function (name) { wanted[name] = parsed.filters[name].slice(); });
    ["cluster", "author", "year", "kind", "paper"].forEach(function (name) {
      var value = params.get(name);
      if (value) {
        if (!wanted[name]) wanted[name] = [];
        wanted[name].push(value);
      }
    });
    var started = Date.now();
    var data = await load("search.json");
    // The filter row asks about authors, which the tree index does not carry -- `meta.json` is
    // `Engine.papers_meta`, the same map the server filters on.
    var meta = await load("meta.json");
    var engine = searcher(data, meta);
    var raw = tokenizeQuery(parsed.text);
    var plan = engine.expand(raw);
    var significant = plan.terms.filter(function (term) { return !STOPWORDS.has(term); });
    var unique = Array.from(new Set(significant)).sort();
    // **A filter with no query text is the whole question** -- see `Engine.search`. The filters
    // select the rows, and with nothing matched there is nothing to rank by, so the answer is
    // ordered newest paper first, then the order the cards were written in.
    var filterOnly = !unique.length && Object.keys(wanted).length > 0;
    sort = sort || (filterOnly ? "newest" : "relevance");
    var scored = engine.scores(plan.terms);
    var pool = filterOnly ? data.docs.map(function (_doc, ordinal) { return ordinal; })
      : Object.keys(scored).map(Number).sort(function (a, b) {
          return scored[b] - scored[a] || (data.docs[a].card_id < data.docs[b].card_id ? -1 : 1);
        }).slice(0, Math.max(SEARCH_POOL, limit * 20));

    var idOf = Object.create(null);
    data.terms.forEach(function (entry, id) { idOf[entry[0]] = id; });
    var results = [];
    pool.forEach(function (ordinal) {
      var row = data.docs[ordinal];
      var info = meta[row.source_id] || {};
      if (!engine.passes(row, info, wanted)) return;
      var matched, labelTokens, span, position, typos = 0;
      if (filterOnly) {
        // Nothing was matched, so every match-shaped field sits at its floor and the comparison
        // reduces to the paper's year and the card's place in the library. Skipping the token
        // walk is not only tidier: it is most of the cost of a row.
        matched = []; labelTokens = new Set(); span = [0, 0]; position = 0;
      } else {
        var tokens = data.tokens[ordinal].map(function (id) { return data.terms[id][0]; });
        var present = new Set(tokens);
        matched = unique.filter(function (term) { return present.has(term); });
        if (!matched.length) return;
        labelTokens = new Set(tokenize(row.label));
        span = engine.window(tokens, matched);
        position = tokens.length;
        for (var index = 0; index < tokens.length; index += 1) {
          if (matched.indexOf(tokens[index]) >= 0) { position = index; break; }
        }
        matched.forEach(function (term) {
          if (unique.indexOf(term) >= 0) return;
          Object.keys(plan.corrections).forEach(function (typed) {
            if (plan.corrections[typed].indexOf(term) >= 0 && unique.indexOf(typed) < 0) typos += 1;
          });
        });
      }
      results.push({ card_id: row.card_id,
                     score: filterOnly ? 0 : Math.round(scored[ordinal] * 10000) / 10000,
                     label: row.label, kind: row.kind, cluster: row.cluster,
                     source_id: row.source_id, paper_title: info.title || row.source_id,
                     paper_authors: info.authors || [], paper_year: info.year || "",
                     snippet: row.snippet, matched_terms: matched.slice(0, 8),
                     matched_count: matched.length,
                     coverage: unique.length ? Math.round(matched.length / unique.length * 100) / 100 : 0,
                     typos: typos, window: span[0], out_of_order: span[1],
                     in_label: matched.some(function (term) { return labelTokens.has(term); }),
                     position: position, ordinal: ordinal });
    });
    results.sort(function (a, b) { return compareRows(a, b, sort); });
    var shown = results.slice(0, limit);
    var complete = shown.filter(function (row) { return row.matched_count === unique.length; });
    var missing = plan.unmatched.filter(function (term) { return term.length >= MIN_TERM; });
    // Each row is written in its own paper's notation, so the tables travel with the rows.
    var macros = {}, overrides = {};
    var tables = await load("macros.json");
    var redefined = await load("overrides.json");
    shown.forEach(function (row) {
      if (tables[row.source_id]) macros[row.source_id] = tables[row.source_id];
      if (redefined[row.source_id]) overrides[row.source_id] = redefined[row.source_id];
    });
    return { query: query, text: parsed.text, tokenizer: raw.length ? "vendor" : "empty",
             results: shown,
             // Every row that passed a filter-with-no-query is a hit, and how many there are is
             // what the reader asked for; see `Engine.search`.
             hit_count: filterOnly ? results.length : complete.length,
             miss: Boolean(missing.length) || !complete.length, decisive_terms: unique,
             corrected: plan.corrections, unmatched: plan.unmatched, filters: wanted,
             sort: sort, index_docs: data.docs.length, facets: null,
             took_ms: Date.now() - started, macros: macros, macros_override: overrides };
  }

  async function cardPayload(cardId, signal) {
    // one file per card, so opening a card costs one small request and not its paper's worth
    try {
      return await load("card/" + cardId + ".json");
    } catch (error) {
      return null;
    }
  }

  async function relatedPayloadFor(params, signal) {
    var sourceId = params.get("source_id");
    if (!sourceId) return { error: "source_id is required" };
    var files = await load("files.json");
    var safe = files[sourceId];
    if (!safe) return null;
    var graph = await load("graph/" + safe + ".json");
    return relatedPayload(graph, params.get("card_id") || null);
  }

  async function answer(path, init) {
    var signal = init && init.signal;
    if (signal && signal.aborted) throw abortError();
    var mark = path.indexOf("?");
    var route = mark < 0 ? path : path.slice(0, mark);
    var params = new URLSearchParams(mark < 0 ? "" : path.slice(mark + 1));
    if (signal && signal.aborted) throw abortError();
    if (route === "/api/stats") {
      var stats = await load("stats.json");
      var facets = await load("facets.json");
      return json(Object.assign({}, stats, { facets: facets }));
    }
    if (route === "/api/papers") return json(await load("papers.json"));
    if (route === "/api/paper") {
      var files = await load("files.json");
      var safe = files[params.get("source_id")];
      if (!safe) return json({ error: "unknown paper" }, 404);
      return json(await load("paper/" + safe + ".json"));
    }
    if (route === "/api/search") return json(await searchPayload(params, signal));
    if (route === "/api/related") {
      var payload = await relatedPayloadFor(params, signal);
      if (payload === null) return json({ error: "unknown paper" }, 404);
      return json(payload);
    }
    var match = /^\/api\/card\/([^/]+)$/.exec(route);
    if (match) {
      var card = await cardPayload(decodeURIComponent(match[1]), signal);
      if (!card) return json({ error: "unknown card" }, 404);
      return json(card);
    }
    return json({ error: "not found" }, 404);
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var path = url.replace(/^[a-z]+:\/\/[^/]+/i, "");
    if (path.indexOf("/api/") !== 0) {
      return realFetch ? realFetch(input, init) : Promise.reject(new Error("no network"));
    }
    return answer(path, init || {});
  };
  window.TESSERA_STATIC = true;
})();
