// Public short version of a Pocket Lens issue page (Ifan, 2026-11-18).
// The Pocket Lens project publishes the FULL issue to /issues/<date> unchanged. This website code shortens it as it is
// served, so the two projects stay separate: Pocket Lens never needs to know about it.
// Kept in full: everything above the first section (headline, intro, places, greeting) and Your Travel (the call to
// send in a trip). Every other section keeps only its heading, the item's title and its first sentence, then the line
// "Subscribers read the full issue: Subscribe free" (Ifan, 2026-11-18: the first version showed too much). Everyone (visitors and search engines) gets the same short page;
// signed-in members and the owner get the full page (decided in _middleware.js).
// Depends only on the section headings' ids (<h2 id="your-shot"> etc.). If they are missing, the page is served unchanged.

const KEEP = new Set(["your-travel"]);
const SUB_LINE =
  '<p style="margin:10px 0 18px;padding:10px 14px;border-left:4px solid #E100FF;background:#faf5ff">' +
  '<a href="/subscribe/" style="color:#6200EA;font-weight:700;text-decoration:none">Subscribers read the full issue: Subscribe free</a></p>';

const text = (s) =>
  (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LABEL = /^(TOUR|STAY|HARDWARE|SOFTWARE|INDUSTRY)$/;
const SKIP = /^(Photo[: ]|Pictured:|Map:|Watch the video$)/;
const firstSentence = (s) => {
  const m = s.match(/^[\s\S]*?[.!?](?=\s+["“A-Z0-9]|\s*$)/);
  let x = (m ? m[0] : s).trim();
  return x.length > 260 ? x.slice(0, 257).replace(/\s+\S*$/, "") + "..." : x;
};

// The item's title (if it has one) and its first sentence, from the section's own paragraphs.
function firstItem(body) {
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1])
    .filter((p) => { const x = text(p); return x && !SKIP.test(x) && !LABEL.test(x); });
  let head = "", sentence = "";
  for (const p of paras) {
    let inner = p.trim();
    // leading bold labels such as HARDWARE are not titles
    let m;
    while ((m = inner.match(/^<strong>([\s\S]*?)<\/strong>\s*(<br\s*\/?>)?/)) && LABEL.test(text(m[1]))) inner = inner.slice(m[0].length).trim();
    const sm = inner.match(/^<strong>([\s\S]*?)<\/strong>\s*(<br\s*\/?>)?([\s\S]*)$/);
    let title = sm ? text(sm[1]) : "", rest = text(sm ? sm[3] : inner);
    if (SKIP.test(title)) title = "";                      // a bold picture credit is not a title
    if (!title && (!rest || SKIP.test(rest))) continue;    // a picture with its credit only
    if (!head && title) {
      if (rest.length >= 60) return { head: title, sentence: firstSentence(rest) };
      head = rest && !/\d/.test(rest) ? title + ", " + rest : title;   // "Foundation Park, The Rocks, Sydney"; dates left out
      continue;
    }
    if (!head && !title && rest.length < 70 && !/[.!?]$/.test(rest)) { head = rest; continue; }
    sentence = firstSentence(rest);
    break;
  }
  return { head, sentence };
}

export function teaserIssue(html) {
  const heads = [...html.matchAll(/<h2 id="([a-z0-9-]+)"[^>]*>[\s\S]*?<\/h2>/g)];
  if (heads.length < 3) return html;
  // a section ends where the next heading starts; the last one ends at the subscribe/footer block
  let endLast = html.indexOf('<div class="sub">', heads[heads.length - 1].index);
  if (endLast < 0) endLast = html.indexOf('<div class="footer">', heads[heads.length - 1].index);
  if (endLast < 0) return html;
  let out = html.slice(0, heads[0].index);
  heads.forEach((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : endLast;
    const body = html.slice(start, end);
    if (KEEP.has(h[1])) { out += h[0] + body; return; }
    const { head, sentence } = firstItem(body);
    const line = (head ? "<strong>" + esc(head) + "</strong>" + (sentence ? "<br>" : "") : "") + (sentence ? esc(sentence) : "");
    // keep the layout tags (the issue closes and reopens its padded box around full-width pictures)
    const divs = (body.match(/<\/?div\b[^>]*>/g) || []).join("\n");
    out += h[0] + "\n" + (line ? "<p>" + line + "</p>\n" : "") + SUB_LINE + "\n" + divs + "\n";
  });
  return out + html.slice(endLast);
}
