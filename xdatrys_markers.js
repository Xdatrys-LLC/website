// Xdatrys map markers, trial 2 (Rome, 2026-11-06).
// Copies the Prague (Pocket Scout) format: render_mini_maps_v5b.py (teardrop pin, camera icon, dashed arrow,
// split pin) and pocket_scout_agent.py (master map: side labels with a leader line, split-sphere clusters).
// Decisions for this trial (2026-11-06): every pin carries a name label beside it (master-map placement:
// right, left, above, below; never over another pin or label; a label with no free place waits until zoom-in);
// black label text; overlapping pins merge into one sliced circle and split apart on zoom-in; a spot's camera,
// camera pill and arrow appear only when the spot is tapped; camera icon gets a tail whose tip is the stand-here
// point (new); everything at 60% of the Prague pixel sizes, same on-screen size at every zoom; ~48 px tap areas.
// Drawn as one SVG overlay per map, recomputed whenever the map moves.
(function () {
  const S = 0.6;                                   // 60% of the Prague pixel sizes
  const MAGENTA = "#E100FF", CYAN = "#00D4FF", WHITE = "#FFFFFF", BLACK = "#000000", GREY = "#9a9a9a";
  const FONT = "'DejaVu Sans Bold', 'DejaVu Sans', sans-serif";
  // v5b draw_teardrop_label_above: radius 26, border 3, tail 1.4 x radius, tail base at 0.5 r, half-width 0.55 r
  const PIN_R = 26 * S, PIN_B = 3 * S;
  // pocket_scout_agent: SPLIT_SPHERE_RADIUS 30, SPLIT_SPHERE_BORDER 4, slice outline 3
  const CL_R = 30 * S, CL_B = 4 * S;
  // v5b split pin (camera under 10 m): radius 34, border 5
  const SP_R = 34 * S, SP_B = 5 * S;
  // labels: mini-map pill text 20 px, padding 16 x 8, fully rounded; master: clearance 24, leader width 2, margin 8
  const LBL_SIZE = 20 * S, LBL_PX = 16 * S, LBL_PY = 8 * S, LBL_CLEAR = 24 * S, LEADER_W = 3 * S, MARGIN = 8;
  // camera icon (v5b draw_camera, body 54 x 36) and new tail (as long as the pin's tail)
  // smartphone icon (2026-11-06) replaces the camera: portrait phone 36 x 56 at Prague scale
  const CAM_W = 36 * S, CAM_H = 56 * S, CAM_TAIL = 1.4 * PIN_R, CAM_TAIL_HW = 0.55 * PIN_R;
  // arrow (v5b draw_arrow): weight 5, dash 10 gap 6, head 16 at 28 degrees, clips 28 px / 15% and 55 px / 25%
  const AR_W = 5 * S, AR_DASH = 10 * S, AR_GAP = 6 * S, AR_HEAD = 16 * S, AR_ANG = 28 * Math.PI / 180;
  const CLOSE_M = 10;
  const CAM_ZOOM = 15;                             // phones for every spot on screen from this zoom (was 16; 2026-11-07: "less zoom")
  const TAP = 48;                                  // minimum tap target, px

  const ctx = document.createElement("canvas").getContext("2d");
  function textW(t, size) { ctx.font = "bold " + size + "px " + FONT; return ctx.measureText(t).width; }
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NS = "http://www.w3.org/2000/svg";
  function hav(a, b) {
    const R = 6371000, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dp = (b[1] - a[1]) * r;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function segHitsRect(x0, y0, x1, y1, r) {        // does the arrow line cross a label box?
    for (let i = 0; i <= 40; i++) { const t = i / 40, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (x >= r[0] - 2 && x <= r[2] + 2 && y >= r[1] - 2 && y <= r[3] + 2) return true; }
    return false;
  }
  const overlap = (a, b) =>!(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);

  // ---- shapes (SVG strings), all in screen pixels -------------------------------------------------
  function teardrop(x, y, r, b, fill, number) {      // tip at (x, y)
    const cy = y - 1.4 * r - r;
    return `<circle cx="${x}" cy="${cy}" r="${r + b}" fill="${WHITE}"/>` +
      `<polygon points="${x - r * 0.55 - b},${cy + r * 0.5} ${x + r * 0.55 + b},${cy + r * 0.5} ${x},${y + b}" fill="${WHITE}"/>` +
      `<circle cx="${x}" cy="${cy}" r="${r}" fill="${fill}"/>` +
      `<polygon points="${x - r * 0.55},${cy + r * 0.5} ${x + r * 0.55},${cy + r * 0.5} ${x},${y}" fill="${fill}"/>` +
      `<text x="${x}" y="${cy}" dy="0.36em" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${r * 1.1}" fill="${WHITE}">${number}</text>`;
  }
  function slicedPin(x, y, ranks, fill) {           // master-map split sphere, with the teardrop tail seen on the Prague master map
    const r = CL_R, b = CL_B, cy = y - 1.4 * r - r, n = ranks.length;
    let s = `<circle cx="${x}" cy="${cy}" r="${r + b}" fill="${WHITE}"/>` +
      `<polygon points="${x - r * 0.55 - b},${cy + r * 0.5} ${x + r * 0.55 + b},${cy + r * 0.5} ${x},${y + b}" fill="${WHITE}"/>` +
      `<polygon points="${x - r * 0.55},${cy + r * 0.5} ${x + r * 0.55},${cy + r * 0.5} ${x},${y}" fill="${fill}"/>`;
    const fs = n > 4 ? r * 0.55 : r * 0.75;
    for (let i = 0; i < n; i++) {
      const a0 = (i * 360 / n - 90) * Math.PI / 180, a1 = ((i + 1) * 360 / n - 90) * Math.PI / 180;
      const large = 360 / n > 180 ? 1 : 0;
      const p = n === 1 ? `<circle cx="${x}" cy="${cy}" r="${r}"/>` :
        `<path d="M${x},${cy} L${x + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${x + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z" fill="${fill}" stroke="${WHITE}" stroke-width="${3 * S}"/>`;
      s += p;
      const m = (a0 + a1) / 2, d = n === 1 ? 0 : r * 0.55;
      s += `<text x="${x + Math.cos(m) * d}" y="${cy + Math.sin(m) * d}" dy="0.36em" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${fs}" fill="${WHITE}">${ranks[i]}</text>`;
    }
    return s;
  }
  // Smartphone stand-here icon (2026-11-06, option 1: phone outline with a big lens). Same colours and white
  // border as the Prague camera; the lens is the Prague camera's lens. Centred on (cx, cy).
  function cameraIcon(cx, cy) {
    const bw = CAM_W, bh = CAM_H;
    return `<rect x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="${7 * S}" fill="${CYAN}" stroke="${WHITE}" stroke-width="${3 * S}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${13 * S}" fill="#09090F" stroke="${WHITE}" stroke-width="${2 * S}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${7 * S}" fill="${CYAN}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${3 * S}" fill="${WHITE}"/>`;
  }
  function cameraIconPrague(cx, cy) {               // v5b draw_camera at scale S (kept for reference; not used)
    const bw = 54 * S, bh = 36 * S, vw = 16 * S, vh = 10 * S;
    return `<rect x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" rx="${5 * S}" fill="${CYAN}" stroke="${WHITE}" stroke-width="${3 * S}"/>` +
      `<rect x="${cx - vw / 2}" y="${cy - bh / 2 - vh + 2 * S}" width="${vw}" height="${vh}" rx="${3 * S}" fill="${CYAN}" stroke="${WHITE}" stroke-width="${2 * S}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${13 * S}" fill="#09090F" stroke="${WHITE}" stroke-width="${2 * S}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${7 * S}" fill="${CYAN}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${3 * S}" fill="${WHITE}"/>` +
      `<circle cx="${cx + 14 * S}" cy="${cy - bh / 2}" r="${4 * S}" fill="${WHITE}"/>`;
  }
  function cameraWithTail(x, y) {                   // NEW (2026-11-06): tail tip on the stand-here point (x, y)
    const cy = y - CAM_TAIL - CAM_H / 2, top = cy + CAM_H / 2 - 1, b = 3 * S;
    return `<polygon points="${x - CAM_TAIL_HW - b},${top} ${x + CAM_TAIL_HW + b},${top} ${x},${y + b}" fill="${WHITE}"/>` +
      `<polygon points="${x - CAM_TAIL_HW},${top} ${x + CAM_TAIL_HW},${top} ${x},${y}" fill="${CYAN}"/>` + cameraIcon(x, cy);
  }
  function splitPin(x, y, number) {                 // v5b draw_split_pin_label_above (camera within 10 m)
    const r = SP_R, bw = SP_B, tail = 1.45 * r, cy = y - tail - r, sb = cy + r, th = r * 0.58;
    const ix = x, iy = cy + r * 0.52, w = r * 0.95, h = r * 0.58;
    return `<polygon points="${x - th},${sb - 4} ${x + th},${sb - 4} ${x},${y}" fill="${MAGENTA}"/>` +
      `<path d="M${x - r},${cy} A${r},${r} 0 0 0 ${x + r},${cy} Z" fill="${CYAN}"/>` +
      `<path d="M${x - r},${cy} A${r},${r} 0 0 1 ${x + r},${cy} Z" fill="${MAGENTA}"/>` +
      `<circle cx="${x}" cy="${cy}" r="${r + bw / 2}" fill="none" stroke="${MAGENTA}" stroke-width="${bw}"/>` +
      `<line x1="${x - th}" y1="${sb}" x2="${x}" y2="${y}" stroke="${MAGENTA}" stroke-width="${bw}"/>` +
      `<line x1="${x + th}" y1="${sb}" x2="${x}" y2="${y}" stroke="${MAGENTA}" stroke-width="${bw}"/>` +
      `<rect x="${ix - w / 2}" y="${iy - h / 2}" width="${w}" height="${h}" rx="${r * 0.08}" fill="${WHITE}"/>` +
      `<rect x="${ix - r * 0.14}" y="${iy - h / 2 - r * 0.15 + r * 0.04}" width="${r * 0.28}" height="${r * 0.15}" rx="${r * 0.05}" fill="${WHITE}"/>` +
      `<circle cx="${ix}" cy="${iy}" r="${r * 0.24}" fill="${CYAN}"/><circle cx="${ix}" cy="${iy}" r="${r * 0.13}" fill="${WHITE}"/>` +
      `<circle cx="${ix}" cy="${iy}" r="${r * 0.06}" fill="${CYAN}"/>` +
      `<text x="${x}" y="${cy - r / 2}" dy="0.36em" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${r}" fill="${WHITE}">${number}</text>`;
  }
  function arrow(x0, y0, x1, y1) {                  // v5b draw_arrow
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
    if (dist < 4) return "";
    const nx = dx / dist, ny = dy / dist;
    const cs = Math.min(28 * S, dist * 0.15), ce = Math.min(55 * S, dist * 0.25);
    let ax0 = x0 + nx * cs, ay0 = y0 + ny * cs, ax1 = x1 - nx * ce, ay1 = y1 - ny * ce;
    if (Math.hypot(ax1 - ax0, ay1 - ay0) < 6) { ax0 = x0; ay0 = y0; ax1 = x1; ay1 = y1; }
    const ea = Math.atan2(ay1 - ay0, ax1 - ax0);
    let s = `<line x1="${ax0}" y1="${ay0}" x2="${ax1}" y2="${ay1}" stroke="${CYAN}" stroke-width="${AR_W}" stroke-dasharray="${AR_DASH} ${AR_GAP}"/>`;
    for (const sg of [1, -1]) s += `<line x1="${ax1}" y1="${ay1}" x2="${ax1 - AR_HEAD * Math.cos(ea - sg * AR_ANG)}" y2="${ay1 - AR_HEAD * Math.sin(ea - sg * AR_ANG)}" stroke="${CYAN}" stroke-width="${AR_W}" stroke-linecap="round"/>`;
    return s;
  }
  function pill(rect, text, bg) {
    const [x0, y0, x1, y1] = rect, h = y1 - y0;
    return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${h}" rx="${h / 2}" fill="${bg}"/>` +
      `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" dy="0.36em" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${LBL_SIZE}" fill="${BLACK}">${esc(text)}</text>`;
  }
  const pillSize = t => [textW(t, LBL_SIZE) + 2 * LBL_PX, LBL_SIZE * 1.15 + 2 * LBL_PY];

  // ---- the overlay -----------------------------------------------------------------------------
  window.XdatrysMarkers = function (map, spots, opts) {
    const GATE = !!(opts && opts.gate);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "xd-overlay");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:hidden";
    map.getContainer().appendChild(svg);
    const state = { selected: null, showOut: false, hidden: 0, suggest: null };   // suggest: the spot whose phone a visitor may drag (2026-11-11)
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    map.on("move", schedule); map.on("resize", schedule); map.once("idle", schedule); schedule();

    function visible() { return spots.filter(s => s.pin && (s.in_cut || state.showOut)); }

    function draw() {
      const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
      const sp = visible().map(s => ({ s, p: map.project(s.pin) }));
      // 1. clusters: pins whose circles would overlap (centres closer than the pin's full width) are merged
      const n = sp.length, parent = sp.map((_, i) => i);
      const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      const sel = state.selected;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (sel && (sp[i].s === sel || sp[j].s === sel)) continue;          // the tapped spot always stands alone
        const ci = [sp[i].p.x, sp[i].p.y - 2.4 * PIN_R], cj = [sp[j].p.x, sp[j].p.y - 2.4 * PIN_R];
        if (Math.hypot(ci[0] - cj[0], ci[1] - cj[1]) < 2 * (PIN_R + PIN_B)) parent[find(i)] = find(j);
      }
      const groups = {};
      sp.forEach((o, i) => (groups[find(i)] ||= []).push(o));
      const items = Object.values(groups).map(g => {
        g.sort((a, b) => a.s.rank - b.s.rank);
        const x = g.reduce((t, o) => t + o.p.x, 0) / g.length, y = g.reduce((t, o) => t + o.p.y, 0) / g.length;
        const r = g.length > 1 ? CL_R : PIN_R, b = g.length > 1 ? CL_B : PIN_B;
        const cy = y - 2.4 * r;
        return { g, x, y, r, b, cy, rank: g[0].s.rank, box: [x - r - b, cy - r - b, x + r + b, y + b] };
      }).sort((a, b) => (b.g.some(o => o.s === sel) - a.g.some(o => o.s === sel)) || a.rank - b.rank);

      // 2. cameras, camera pills and arrows (drawn first so labels avoid them). Shown for the tapped spot, and for
      //    every spot on screen once the map is zoomed in to CAM_ZOOM or closer (2026-11-06).
      const obstacles = items.map(it => it.box);
      if (opts && opts.reserve) obstacles.push(...opts.reserve(W, H));          // e.g. the zoom buttons
      let camSvg = "", arrowSegs = [];
      const camSpots = [];
      if (sel && sel.camera) camSpots.push(sel);
      if (map.getZoom() >= CAM_ZOOM) for (const o of sp) {
        if (o.s === sel || !o.s.camera) continue;
        const c = map.project(o.s.camera);
        const onScreen = (q) => q.x > -20 && q.x < W + 20 && q.y > -20 && q.y < H + 60;
        if (onScreen(o.p) || onScreen(c)) camSpots.push(o.s);
      }
      const camPlaced = [];
      for (const cs of camSpots) {                    // pass 1: icons and arrows
        const p = map.project(cs.pin), c = map.project(cs.camera);
        if (hav(cs.pin, cs.camera) < CLOSE_M && !((GATE || state.suggest === cs) && cs === sel)) continue;   // split pin instead (the gate shows both, to drag)
        const shared = camPlaced.find(q => Math.hypot(q.x - c.x, q.y - c.y) < 2);   // two spots, one stand point
        camSvg = arrow(c.x, c.y, p.x, p.y) + camSvg;
        arrowSegs.push([c.x, c.y, p.x, p.y]);
        if (shared) continue;
        camPlaced.push({ x: c.x, y: c.y, s: cs, p });
        const iconCy = c.y - CAM_TAIL - CAM_H / 2;
        obstacles.push([c.x - CAM_W / 2 - 2, iconCy - CAM_H / 2 - 6, c.x + CAM_W / 2 + 2, c.y + 2]);
      }
      for (const q of camPlaced) camSvg += cameraWithTail(q.x, q.y);
      for (const q of camPlaced) {                    // pass 2: camera pills
        const cs = q.s, c = q, p = q.p;
        if (!cs.camera_pill) continue;
        const iconCy = c.y - CAM_TAIL - CAM_H / 2;
        const [w, h] = pillSize(cs.camera_pill);
        const away = p.x > c.x ? -1 : 1;
        // v2.0 (2026-11-06): the pill sits beside the phone, centred on the CENTRE OF THE PHONE BODY; away from the subject first
        const tries = [[c.x + away * (w / 2 + CAM_W / 2 + 15 * S), iconCy], [c.x - away * (w / 2 + CAM_W / 2 + 15 * S), iconCy]];
        let rect = null;
        for (let [lx, ly] of tries) {
          lx = Math.max(MARGIN + w / 2, Math.min(lx, W - MARGIN - w / 2));          // keep inside the map
          const r = [lx - w / 2, ly - h / 2, lx + w / 2, ly + h / 2];
          if (r[0] >= MARGIN && r[2] <= W - MARGIN && r[1] >= MARGIN && r[3] <= H - MARGIN && !obstacles.some(o => overlap(r, o))
              && !arrowSegs.some(a => segHitsRect(...a, r))) { rect = r; break; }
        }
        if (!rect) { if (cs !== sel) continue; let [lx, ly] = tries[0]; lx = Math.max(MARGIN + w / 2, Math.min(lx, W - MARGIN - w / 2)); rect = [lx - w / 2, ly - h / 2, lx + w / 2, ly + h / 2]; }
        obstacles.push(rect);
        camSvg += pill(rect, cs.camera_pill, CYAN);
      }

      // 3. labels, master-map placement: right, left, above, below; never over a pin, camera or another label
      let labelSvg = "", hidden = 0;
      const placed = [];
      for (const it of items) {
        if (it.x < 0 || it.x > W || it.y < 0 || it.cy - it.r > H) continue;     // pin off screen: no label
        const names = it.g.map(o => o.s.label || o.s.name);
        const text = names.length === 1 ? names[0] : names.length === 2 ? names.join(" / ") : names.slice(0, 2).join(" / ") + " / +" + (names.length - 2);
        const [w, h] = pillSize(text);
        const cands = [[it.x + it.r + it.b + LBL_CLEAR, it.cy - h / 2], [it.x - it.r - it.b - LBL_CLEAR - w, it.cy - h / 2],
                       [it.x - w / 2, it.cy - it.r - it.b - LBL_CLEAR - h], [it.x - w / 2, it.y + LBL_CLEAR]];
        let rect = null;
        for (let [x, y] of cands) {
          if (y !== it.cy - h / 2) x = Math.max(MARGIN, Math.min(x, W - MARGIN - w));   // above/below: slide sideways to stay inside
          const r = [x, y, x + w, y + h];
          if (x < MARGIN || y < MARGIN || x + w > W - MARGIN || y + h > H - MARGIN) continue;
          if (placed.some(o => overlap(r, o)) || obstacles.some(o => o !== it.box && overlap(r, o))) continue;
          if (arrowSegs.some(a => segHitsRect(...a, r))) continue;                   // keep the arrows clear
          rect = r; break;
        }
        it.label = rect;
        if (!rect) { if (it.x > 0 && it.x < W && it.y > 0 && it.y < H) hidden++; continue; }
        placed.push(rect);
        const lx = Math.max(rect[0], Math.min(it.x, rect[2])), ly = Math.max(rect[1], Math.min(it.y, rect[3]));
        const fill = it.g.every(o => !o.s.in_cut) ? GREY : MAGENTA;
        labelSvg += `<line x1="${it.x}" y1="${it.y}" x2="${lx}" y2="${ly}" stroke="${fill}" stroke-width="${LEADER_W}"/>` + pill(rect, text, fill);
      }
      state.hidden = hidden;

      // 4. pins (on top), then invisible tap areas
      // Tap areas are NOT drawn as SVG any more (2026-11-11, ): SVG tap areas swallowed the mouse wheel and pinch, so the map
      // could not be zoomed with the pointer or fingers on a pin. They are kept as a list and checked on the map's own click.
      let pinSvg = "", hit = "";
      const hits = [];
      for (const it of items) {
        const fill = it.g.every(o => !o.s.in_cut) ? GREY : MAGENTA;
        if (it.g.length > 1) pinSvg += slicedPin(it.x, it.y, it.g.map(o => o.s.rank), fill);
        else if (!GATE && it.g[0].s === sel && sel.camera && hav(sel.pin, sel.camera) < CLOSE_M) pinSvg += splitPin(it.x, it.y, it.rank);
        else pinSvg += teardrop(it.x, it.y, it.r, it.b, it.g[0].s.in_cut ? MAGENTA : GREY, it.rank);
        const key = it.g.map(o => o.s.rank).join(",");
        const hw = Math.max(TAP, 2 * (it.r + it.b)) / 2, hy0 = Math.min(it.cy - it.r - it.b, it.y - TAP);
        hits.push({ k: key, x0: it.x - hw, y0: hy0, x1: it.x + hw, y1: it.y + 4, pin: true });
        if (it.label) {
          const [x0, y0, x1, y1] = it.label, pad = Math.max(0, (TAP - (y1 - y0)) / 2);
          hits.push({ k: key, x0, y0: y0 - pad, x1, y1: y1 + pad });
        }
      }
      // 5. correction gate (2026-11-07): the selected spot's pin and phone can be dragged. Handles sit on top.
      let handles = "";
      if ((GATE || (state.suggest && state.suggest === sel)) && sel && sel.pin) {
        const p = map.project(sel.pin), r = PIN_R, cy = p.y - 2.4 * r;
        if (GATE) handles += `<rect data-drag="pin" x="${p.x - r - 8}" y="${cy - r - 8}" width="${2 * r + 16}" height="${p.y - cy + r + 12}" fill="${MAGENTA}" fill-opacity="0.12" stroke="${MAGENTA}" stroke-dasharray="4 3" style="pointer-events:auto;cursor:move;touch-action:none"/>`;
        if (sel.camera) {
          const c = map.project(sel.camera), iy = c.y - CAM_TAIL - CAM_H;
          handles += `<rect data-drag="cam" x="${c.x - CAM_W / 2 - 8}" y="${iy - 8}" width="${CAM_W + 16}" height="${c.y - iy + 12}" fill="${CYAN}" fill-opacity="0.15" stroke="${CYAN}" stroke-dasharray="4 3" style="pointer-events:auto;cursor:move;touch-action:none"/>`;
        }
      }
      state.hits = hits;
      svg.innerHTML = labelSvg + camSvg + pinSvg + hit + handles;
      if (opts && opts.onDraw) opts.onDraw(state);
    }

    // drag: the point under the tip moves with the pointer, keeping the grab offset (so the marker does not jump)
    let drag = null;
    svg.addEventListener("pointerdown", e => {
      const which = e.target.getAttribute && e.target.getAttribute("data-drag");
      if (!which || !state.selected) return;
      e.preventDefault(); e.stopPropagation();
      const s = state.selected, ll = which === "pin" ? s.pin : s.camera, tip = map.project(ll);
      const rect = map.getContainer().getBoundingClientRect();
      drag = { which, s, dx: tip.x - (e.clientX - rect.left), dy: tip.y - (e.clientY - rect.top), id: e.pointerId, rect };
      map.dragPan.disable();
      // listen on the whole window: the overlay is redrawn while dragging, so the grabbed box itself disappears
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", endDrag); window.addEventListener("pointercancel", endDrag);
    });
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      const ll = map.unproject([e.clientX - drag.rect.left + drag.dx, e.clientY - drag.rect.top + drag.dy]);
      const v = [+ll.lng.toFixed(7), +ll.lat.toFixed(7)];
      if (drag.which === "pin") drag.s.pin = v; else drag.s.camera = v;
      schedule();
    }
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", endDrag); window.removeEventListener("pointercancel", endDrag);
      const d = drag; drag = null; map.dragPan.enable();
      if (opts && opts.onEdit) opts.onEdit(d.s, d.which);
    }

    // which pin or label is under a map point (pins win over labels; the nearest pin wins)
    function hitAt(pt) {
      let best = null, bd = 1e9;
      for (const h of state.hits || []) {
        if (pt.x < h.x0 || pt.x > h.x1 || pt.y < h.y0 || pt.y > h.y1) continue;
        const d = (h.pin ? 0 : 1e6) + Math.abs(pt.x - (h.x0 + h.x1) / 2) + Math.abs(pt.y - h.y1);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    }
    map.on("mousemove", e => { if (!drag) map.getCanvas().style.cursor = hitAt(e.point) ? "pointer" : ""; });
    map.on("click", e => {
      const h = hitAt(e.point);
      if (!h) return;
      const k = h.k;
      if (e.originalEvent) e.originalEvent.xdHandled = true;
      const ranks = k.split(",").map(Number);
      if (ranks.length > 1) {                       // a merged circle: zoom in until it splits apart
        const g = spots.filter(s => ranks.includes(s.rank));
        const b = new maplibregl.LngLatBounds(); g.forEach(s => b.extend(s.pin));
        // pins on (almost) the same spot never split apart (e.g. a cathedral and its rooftop view, 2026-11-11): offer a choice instead
        const spread = Math.max(...g.map(a => Math.max(...g.map(c => hav(a.pin, c.pin)))));
        if ((spread < 15 || map.getZoom() >= 17.5) && opts.onChoose) { opts.onChoose(g); return; }
        map.fitBounds(b, { padding: 120, maxZoom: Math.max(map.getZoom() + 2, 17) });
        return;
      }
      opts.onSelect(spots.find(s => s.rank === ranks[0]));
    });

    return {
      select(s) { state.selected = s; draw(); },
      setSuggest(s) { state.suggest = s; draw(); },
      setShowOut(v) { state.showOut = v; draw(); },
      redraw: draw, state, hitAt,
      pinTopOffset: () => 2.4 * PIN_R + PIN_R + PIN_B,
    };
  };
})();
