// Tour layer (SAMPLE for the owner's gate, 2026-11-11). Reads tour.json (made by pipeline/tour_build.py) and draws the day routes
// on the map, off by default. Uses the page's own globals: left (the map), whenReady, esc, select, spotBy.
// Walking paths and rail lines/stops come from OpenStreetMap data (c) OpenStreetMap contributors, ODbL.
(function () {
  const DAYCOL = ["#c8102e", "#1d3d9e", "#1b6e2e", "#5c3d00", "#333333"];   // red, navy, dark green, brown: unlike the base map's orange/yellow roads
  const col = d => DAYCOL[(d - 1) % DAYCOL.length];
  let TOUR = null, on = false, shown = new Set(), markers = [];
  const $ = id => document.getElementById(id);

  function dayFilter() { return ["in", ["get", "day"], ["literal", [...shown]]]; }

  function addLayers() {
    if (left.getSource("tour")) return;
    left.addSource("tour", { type: "geojson", data: TOUR.route });
    const colour = ["match", ["get", "day"], ...TOUR.days.flatMap(d => [d.day, col(d.day)]), "#c8102e"];
    const w = ["interpolate", ["linear"], ["zoom"], 11, 3.2, 14, 5, 18, 8];
    left.addLayer({ id: "tour-casing", type: "line", source: "tour", layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 6.5, 14, 9, 18, 13], "line-opacity": 0.95 } });
    left.addLayer({ id: "tour-walk", type: "line", source: "tour", filter: ["==", ["get", "mode"], "walk"],
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": colour, "line-width": w, "line-opacity": 0.9 } });
    left.addLayer({ id: "tour-rail", type: "line", source: "tour", filter: ["==", ["get", "mode"], "rail"],
      layout: { visibility: "none", "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": colour, "line-width": w, "line-dasharray": [1.2, 1.2], "line-opacity": 0.95 } });
    left.addLayer({ id: "tour-arrows", type: "symbol", source: "tour", filter: ["==", ["get", "mode"], "walk"],
      layout: { visibility: "none", "symbol-placement": "line", "symbol-spacing": 120, "text-field": "›", "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 14, 17, 22], "text-keep-upright": false, "text-allow-overlap": true, "text-offset": [0, -0.08] },
      paint: { "text-color": "#ffffff" } });
  }

  function flag(text, colour, lngLat, title) {
    const el = document.createElement("div");
    el.className = "tourflag"; el.textContent = text; el.title = title; el.style.background = colour;
    return new maplibregl.Marker({ element: el, anchor: "bottom-left", offset: [4, -4] }).setLngLat(lngLat);
  }

  function refresh() {
    if (!TOUR) return;
    whenReady(() => {
      addLayers();
      ["tour-casing", "tour-walk", "tour-rail", "tour-arrows"].forEach(id => {
        left.setLayoutProperty(id, "visibility", on ? "visible" : "none");
        const base = id === "tour-walk" || id === "tour-arrows" ? ["==", ["get", "mode"], "walk"] : id === "tour-rail" ? ["==", ["get", "mode"], "rail"] : null;
        left.setFilter(id, base ? ["all", base, dayFilter()] : dayFilter());
      });
      markers.forEach(m => m.remove()); markers = [];
      if (on) TOUR.days.filter(d => shown.has(d.day)).forEach(d => {
        markers.push(flag("Day " + d.day + " start", col(d.day), d.start.at, d.start.name).addTo(left));
        if (d.end.rank !== d.start.rank) markers.push(flag("Day " + d.day + " end", col(d.day), d.end.at, d.end.name).addTo(left));
      });
    });
    $("tourDays").hidden = !on; $("tourPanel").hidden = !on;
    document.querySelectorAll("#tourDays button").forEach(b => b.classList.toggle("off", !shown.has(+b.dataset.day)));
    renderPanel();
  }

  function fitDays() {
    const pts = [];
    TOUR.route.features.filter(f => shown.has(f.properties.day)).forEach(f => pts.push(...f.geometry.coordinates));
    if (!pts.length) return;
    const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
    const wide = window.innerWidth > 760;
    left.fitBounds(b, { padding: { top: 60, bottom: wide ? 40 : 200, left: wide ? 400 : 30, right: 60 }, maxZoom: 16, duration: 600 });
  }

  const hm = m => m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
  const km = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km";

  function renderPanel() {
    const body = $("tourBody"); if (!TOUR || !body) return;
    let h = "<p class='tnote'>" + TOUR.days.length + " days, " + TOUR.totals.spots + " spots, about " + km(TOUR.totals.walk_metres) +
      " on foot in all. Times assume " + TOUR.assumptions.minutes_per_spot + " minutes at each spot and a " +
      TOUR.assumptions.walk_speed_kmh + " km/h walking pace; train times are estimates, not timetables.</p>";
    TOUR.days.filter(d => shown.has(d.day)).forEach(d => {
      h += "<details open class='tday'><summary><b style='color:" + col(d.day) + "'>Day " + d.day + "</b>: " + d.visits + " spots, about " +
        hm(d.minutes_total) + ", " + km(d.walk_metres) + " walking</summary><ol class='tlegs'>";
      d.spots.forEach((r, i) => {
        const s = spotBy(r);
        h += "<li><a href='#' class='tspot' data-rank='" + r + "'>" + esc(s ? s.name : r) + "</a> <span class='tnote'>(spot " + r + ")</span>";
        const L = d.legs[i];
        if (L) {
          h += "<div class='tleg'>" + (L.mode === "rail"
              ? "<b>By train (" + hm(L.minutes) + ")</b><ul>" + L.steps.map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>" +
                "<span class='tnote'>Walking instead: about " + km(L.walk_instead_metres) + ", " + hm(L.walk_instead_minutes) + ".</span>"
              : esc(L.text)) +
            "<div class='tlinks'>Check live times: <a target='_blank' rel='noopener' href='" + esc(L.links.google_transit) + "'>Google Maps (public transport)</a> · " +
            "<a target='_blank' rel='noopener' href='" + esc(L.links.apple_transit) + "'>Apple Maps (public transport)</a> · " +
            "<a target='_blank' rel='noopener' href='" + esc(L.links.google_walk) + "'>walk (Google)</a></div></div>";
        }
        h += "</li>";
      });
      h += "</ol></details>";
    });
    h += "<p class='tnote'>" + TOUR.sources.map(esc).join(" ") + "</p>";
    body.innerHTML = h;
    body.querySelectorAll(".tspot").forEach(a => a.onclick = e => { e.preventDefault(); const s = spotBy(+a.dataset.rank); if (s) select(s, left); });
  }

  fetch("tour.json", { cache: "no-store" }).then(r => r.json()).then(t => {
    TOUR = t;
    shown = new Set(t.days.map(d => d.day));
    $("tourDays").innerHTML = t.days.map(d => "<button data-day='" + d.day + "' style='--c:" + col(d.day) + "'>Day " + d.day + "</button>").join("");
    $("tourDays").querySelectorAll("button").forEach(b => b.onclick = () => {
      const d = +b.dataset.day;
      // first tap on a day shows that day only; tapping more days adds them; tapping a shown day (when others are shown) hides it
      if (shown.size === t.days.length) shown = new Set([d]);
      else if (shown.has(d) && shown.size > 1) shown.delete(d);
      else shown.add(d);
      refresh(); fitDays();
    });
    $("showTour").addEventListener("change", e => { on = e.target.checked; refresh(); if (on) fitDays(); });
    refresh();
  }).catch(() => { $("showTourWrap").hidden = true; });
})();
