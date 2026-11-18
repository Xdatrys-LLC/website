// Public short version of a Pocket Lens issue page (Ifan, 2026-11-18).
// The Pocket Lens project publishes the FULL issue to /issues/<date> unchanged. This website code shortens it as it is
// served, so the two projects stay separate: Pocket Lens never needs to know about it.
// Kept in full: everything above the first section (headline, intro, places, greeting), TOUR and STAY, HOT LOCATION
// (with its shot map) and Your Travel. Every other section keeps its heading, one line, and the line
// "Subscribers read the full issue: Subscribe free". Everyone (visitors and search engines) gets the same short page;
// signed-in members and the owner get the full page (decided in _middleware.js).
// Depends only on the section headings' ids (<h2 id="your-shot"> etc.). If they are missing, the page is served unchanged.

const KEEP = new Set(["tour-and-stay", "hot-location", "your-travel"]);
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

function oneLine(id, body) {
  const strongs = [...body.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => text(m[1]))
    .filter((s) => s && !/^(HARDWARE|SOFTWARE|INDUSTRY)$/.test(s));
  const firstP = text((body.match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
  if (id === "today-in-focus" || id === "changing-focus") return strongs[0] || "";
  if (id === "through-the-lens") return (firstP.match(/^.*?[.!?](\s|$)/) || [firstP])[0].trim();
  if (id === "frame-the-moment") return firstP; // "Today's theme: ..."
  return firstP; // your-shot (the theme), shot-school (the video title), anything new
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
    const line = oneLine(h[1], body);
    // keep the layout tags (the issue closes and reopens its padded box around full-width pictures)
    const divs = (body.match(/<\/?div\b[^>]*>/g) || []).join("\n");
    out += h[0] + "\n" + (line ? "<p>" + esc(line) + "</p>\n" : "") + SUB_LINE + "\n" + divs + "\n";
  });
  return out + html.slice(endLast);
}
