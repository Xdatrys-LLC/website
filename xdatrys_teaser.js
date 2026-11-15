// Xdatrys library teaser pages (public /library/<slug>/), 2026-11-11.
// Runs the interactive map for the PUBLIC page: spots 1-3 complete, the other spots as locked numbered pins with names only.
// Reuses the shared map code unchanged: xdatrys_osm_style.js (base map) and xdatrys_markers.js (pins, phones, labels).
// No correction gate, no "Suggest a better spot", no review info here (those stay on the review pages).
// Locked spots are drawn grey (the markers' "below the cut" look) when MAP.lockedGrey is true, magenta otherwise.
(function () {
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const paras = t => esc(t).split(/\n+/).filter(Boolean).map(p => "<p>" + p + "</p>").join("");

  window.XdTeaser = function (MAP) {
    if (window.pmtiles) { const protocol = new pmtiles.Protocol(); maplibregl.addProtocol("pmtiles", protocol.tile); }
    const B = MAP.bounds, pad = Math.max(0.03, Math.max(B[2] - B[0], B[3] - B[1]) * 0.6);
    const maxB = [[B[0] - pad, B[1] - pad], [B[2] + pad, B[3] + pad]];
    const tiles = MAP.tiles.startsWith("/") ? location.origin + MAP.tiles : MAP.tiles;     // MapLibre needs a full address
    const map = new maplibregl.Map({ container: "map", style: xdatrysOsmStyle(tiles, B, MAP.english), center: MAP.center, zoom: 12,
      maxBounds: maxB, cooperativeGestures: false });
    xdatrysAddImages(map);
    let READY = false; map.once("load", () => { READY = true; });
    const whenReady = fn => READY ? fn() : map.once("load", fn);
    map.addControl(new maplibregl.NavigationControl());

    // Vatican City outline (OpenStreetMap relation 36989, ODbL), as on the review page
    if (MAP.vatican) whenReady(() => {
      map.addSource("vatican", { type: "geojson", data: "vatican.geojson" });
      const before = map.getLayer("water-names") ? "water-names" : undefined;
      map.addLayer({ id: "vatican-shade", type: "fill", source: "vatican", paint: { "fill-color": "#b07cc6", "fill-opacity": 0.14 } }, before);
      map.addLayer({ id: "vatican-edge", type: "line", source: "vatican", paint: { "line-color": "#8d618b", "line-width": 1.6, "line-dasharray": [4, 2] } }, before);
    });

    // "Show transport" switch (same colours as the review page)
    const TCOL = { subway: "#1f5fd1", tram: "#e0442b", light_rail: "#2a9d55", monorail: "#2a9d55", funicular: "#2a9d55", rail: "#555555", narrow_gauge: "#555555" };
    function addTransport() {
      if (map.getLayer("tx-lines")) return;
      const isRail = ["all", ["==", ["get", "kind"], "rail"], ["in", ["get", "kind_detail"], ["literal", Object.keys(TCOL)]]];
      const col = ["match", ["get", "kind_detail"], ...Object.entries(TCOL).flat(), "#555555"];
      const before = map.getLayer("water-names") ? "water-names" : undefined;
      map.addLayer({ id: "tx-casing", type: "line", source: "pm", "source-layer": "roads", filter: isRail, layout: { visibility: "none", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 5, 18, 9] } }, before);
      map.addLayer({ id: "tx-lines", type: "line", source: "pm", "source-layer": "roads", filter: isRail, layout: { visibility: "none", "line-cap": "round" },
        paint: { "line-color": col, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 14, 2.8, 18, 5.5],
                 "line-opacity": ["case", ["==", ["get", "is_tunnel"], true], 0.55, 1] } }, before);
      map.addLayer({ id: "tx-stops", type: "circle", source: "pm", "source-layer": "pois", minzoom: 13.5,
        filter: ["in", ["get", "kind"], ["literal", ["tram_stop", "station", "halt", "subway_entrance"]]], layout: { visibility: "none" },
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 5], "circle-color": "#ffffff",
                 "circle-stroke-color": ["match", ["get", "kind"], "tram_stop", TCOL.tram, TCOL.subway], "circle-stroke-width": 2 } });
    }
    function setTransport(on) {
      whenReady(() => { addTransport(); ["tx-casing", "tx-lines", "tx-stops"].forEach(id => map.setLayoutProperty(id, "visibility", on ? "visible" : "none")); });
      const lg = document.getElementById("tlegend"); if (lg) lg.hidden = !on;
      try { localStorage.setItem("xd-transport", on ? "1" : "0"); } catch (e) {}
    }
    const cb = document.getElementById("showTransport");
    if (cb) { let on = false; try { on = localStorage.getItem("xd-transport") === "1"; } catch (e) {}
      cb.checked = on; if (on) setTransport(true); cb.addEventListener("change", () => setTransport(cb.checked)); }

    // ---- spot text
    function photoHtml(s) {
      const p = s.photo; if (!p) return "";
      const lic = p.licence_url ? "<a target='_blank' rel='noopener license' href='" + esc(p.licence_url) + "'>" + esc(p.licence) + "</a>" : esc(p.licence);
      return "<figure class='thumb'><a target='_blank' rel='noopener' href='" + esc(p.source_url) + "'><img src='" + esc(p.file) + "' alt='" + esc(s.alt || (s.name + ", " + MAP.place + " (photo: " + (p.artist || "Wikimedia Commons") + ")")) + "' loading='lazy'></a>" +
        "<figcaption>" + (p.source_url ? "Photo: " + esc(p.artist) + ", " + lic + ", via Wikimedia Commons" : esc(p.artist)) + "</figcaption></figure>";
    }
    function publicHtml(s) {
      const t = s.text || {}, ph = t.shooting_on_your_phone || {}, nav = s.camera ? s.camera[1] + "," + s.camera[0] : s.pin[1] + "," + s.pin[0];
      return "<div class='pop'><h3>" + s.rank + ". " + esc(s.name) + "</h3>" + photoHtml(s) +
        "<div class='desc'>" + paras(t.description) + "</div><div class='after-thumb'></div>" +
        "<h4>Where it is</h4><p>" + esc(t.geographic_location) + "</p>" +
        "<h4>Getting there</h4><p>" + esc(t.directions_text) + "</p>" +
        "<div class='phone'><h4>Shooting it on your phone</h4>" +
        "<p><b>Lens:</b> " + esc(ph.phone_lens) + "</p><p><b>Where to stand:</b> " + esc(ph.where_to_stand) + "</p>" +
        "<p><b>Framing:</b> " + esc(ph.how_to_frame) + "</p>" + (ph.phone_settings_tip ? "<p><b>Settings tip:</b> " + esc(ph.phone_settings_tip) + "</p>" : "") +
        "<p><b>Best time:</b> " + esc(ph.best_time) + "</p></div>" +
        (t.access_note ? "<p><i>" + esc(t.access_note) + "</i></p>" : "") +
        "<div class='nav'><b>Walk to where to stand (the phone icon):</b> " +
        "<a target='_blank' rel='noopener' href='https://www.google.com/maps/dir/?api=1&destination=" + nav + "&travelmode=walking'>Google Maps</a> · " +
        "<a target='_blank' rel='noopener' href='https://maps.apple.com/?daddr=" + nav + "&dirflg=w'>Apple Maps</a><br>" +
        "<b>By public transport:</b> " +
        "<a target='_blank' rel='noopener' href='https://www.google.com/maps/dir/?api=1&destination=" + nav + "&travelmode=transit'>Google Maps</a> · " +
        "<a target='_blank' rel='noopener' href='https://maps.apple.com/?daddr=" + nav + "&dirflg=r'>Apple Maps</a></div></div>";
    }
    function lockedHtml(s) {
      return "<div class='pop locked'><h3>" + s.rank + ". " + esc(s.name) + "</h3>" +
        "<p class='lockline'><span aria-hidden='true'>&#128274;</span> <b>Members only: membership coming soon</b></p>" +
        "<p>Where to stand, the phone tips, a photo and directions for this spot are part of Xdatrys membership. " +
        "Spots 1 to " + MAP.teaser + " on this map are free for everyone.</p>" +
        "<p>Get Pocket Lens, our free daily smartphone travel photography newsletter, and be the first to hear when membership opens.</p>" +
        "<p><a class='lockbtn' href='#join' onclick='XdTeaserClose()'>Join Pocket Lens (free)</a></p></div>";
    }
    const html = s => s.locked ? lockedHtml(s) : publicHtml(s);

    // ---- selection: popup on a computer, bottom panel on a phone (as on the review page)
    const overlays = [], sheet = document.getElementById("sheet");
    let popup = null, SPOTS = [];
    function onClose() { popup = null; overlays.forEach(o => o.select(null)); }
    function closeAll() { if (popup) { popup.off("close", onClose); popup.remove(); popup = null; } sheet.hidden = true; onClose(); }
    window.XdTeaserClose = () => setTimeout(closeAll, 0);
    function zoomToSpot(s, padding) {
      const pts = [s.pin, s.camera].filter(Boolean), b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach(p => b.extend(p));
      const cam = map.cameraForBounds(b, { padding, maxZoom: 17.5 }); if (!cam) return;
      // locked spots: zoom only a little (there is nothing more to see there)
      const z = s.locked ? Math.max(map.getZoom(), Math.min(15, cam.zoom)) : Math.max(15.5, Math.min(17.5, cam.zoom));
      map.easeTo({ center: cam.center, zoom: z, duration: 700 });
    }
    // the map sits below the page heading: bring all of it on screen (under the menu when the menu stays at the top), so the
    // popup or the bottom panel has room
    function bringMapOnScreen() {
      const wr = document.getElementById("wrap").getBoundingClientRect(), nav = document.querySelector("nav.top");
      const navH = nav && getComputedStyle(nav).position === "sticky" ? nav.offsetHeight : 0;
      if (wr.top < navH - 2 || wr.bottom > window.innerHeight + 2) window.scrollTo({ top: window.scrollY + wr.top - navH, behavior: "smooth" });
    }
    let pending = null;                              // a spot chosen (e.g. from the list) before the pins were ready
    function select(s) {
      if (!overlays.length) { pending = s; return; }
      if (popup) { popup.off("close", onClose); popup.remove(); popup = null; }
      sheet.hidden = true;
      overlays.forEach(o => o.select(s));
      if (!s) return;
      bringMapOnScreen();
      if (window.innerWidth <= 760) {
        sheet.innerHTML = "<button id='sheetClose' aria-label='Close'>×</button>" + html(s);
        sheet.hidden = false; sheet.scrollTop = 0;
        document.getElementById("sheetClose").onclick = closeAll;
        zoomToSpot(s, { top: 70, bottom: sheet.offsetHeight + 50, left: 50, right: 70 });
        return;
      }
      const h = overlays[0].pinTopOffset();
      popup = new maplibregl.Popup({ anchor: "bottom", offset: [0, -h], maxWidth: "340px", focusAfterOpen: false })
        .setLngLat(s.pin).setHTML(html(s)).addTo(map);
      const box = popup.getElement().querySelector(".pop"); if (box) box.scrollTop = 0;
      const H = map.getContainer().clientHeight;
      zoomToSpot(s, { top: Math.min(0.55 * H, 420), bottom: 50, left: 60, right: 60 });
      popup.on("close", onClose);
    }
    // from the list under the map: "Show on the map"
    window.XdShowSpot = rank => {
      const s = SPOTS.find(x => x.rank === rank); if (!s) return false;
      document.getElementById("wrap").scrollIntoView({ behavior: "smooth", block: "start" });
      whenReady(() => select(s));
      return false;
    };
    window.XdChooseSpot = rank => select(SPOTS.find(x => x.rank === rank));

    const fontReady = document.fonts ? document.fonts.load("bold 12px 'DejaVu Sans Bold'").catch(() => null) : Promise.resolve();
    Promise.all([fetch("public.json", { cache: "no-cache" }).then(r => r.json()), fontReady]).then(([data]) => {
      // order comes from the data (ranks may be renumbered later); nothing here assumes ranks 1-20
      const spots = data.spots.slice().sort((a, b) => a.rank - b.rank);
      for (const s of spots) { s.in_cut = MAP.lockedGrey ? !s.locked : true; if (!s.label) s.label = s.name; if (s.locked) s.camera = null; }
      SPOTS = spots;
      const pts = spots.map(s => s.pin);
      if (pts.length) {
        const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
        const fitAll = () => map.fitBounds(b, { padding: { top: 70, bottom: 20, left: 20, right: 60 }, animate: false });
        fitAll(); map.once("idle", fitAll);
      }
      const go = () => {
        const o = XdatrysMarkers(map, spots, {
          onSelect: s => select(s), reserve: (W, H) => [[W - 52, 0, W, 112]],
          onDraw: st => { const el = document.getElementById("hidden"); if (el) el.textContent = st.hidden ? st.hidden + " label(s) hidden at this zoom: zoom in" : ""; },
          onChoose: g => {
            if (popup) { popup.off("close", onClose); popup.remove(); popup = null; }
            const list = "<div class='pop'><b>" + g.length + " spots here:</b>" + g.sort((a, b) => a.rank - b.rank).map(x =>
              "<p style='margin:6px 0'><a href='#' style='color:#B000C8;font-weight:600' onclick='XdChooseSpot(" + x.rank + ");return false'>" + x.rank + ". " + esc(x.name) + (x.locked ? " (members)" : "") + "</a></p>").join("") + "</div>";
            popup = new maplibregl.Popup({ offset: [0, -overlays[0].pinTopOffset()], maxWidth: "300px", focusAfterOpen: false }).setLngLat(g[0].pin).setHTML(list).addTo(map);
          } });
        if (MAP.lockedGrey) o.setShowOut(true);      // locked spots carry in_cut=false so they draw grey; show them
        overlays.push(o);
        if (pending) { const s = pending; pending = null; select(s); }
      };
      whenReady(go);
      setTimeout(() => overlays.forEach(o => o.redraw()), 500);
    });
    window.xdMap = map;
  };
})();
