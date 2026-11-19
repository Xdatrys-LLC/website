// Xdatrys "OSM look" style, iteration 2 (Rome, 2026-11-06).
// Our own drawing rules for Protomaps tiles, written to imitate the standard OpenStreetMap ("OSM Carto") look.
// Colours are taken from common knowledge of the OSM Carto palette and refined by side-by-side comparison
// over the 10 pilot maps (2026-11-05). Map data (c) OpenStreetMap contributors, ODbL.
// Iteration 2 changes (agreed with 2026-11-06): buildings at every zoom the tiles carry them; main roads
// orange/yellow with OSM-style coloured edges and wider at low zoom; smaller district names; street names from
// zoom 14 (was 15) at OSM's smaller size; square names; pedestrian streets as grey bands; metro/rail station names;
// no icons except churches (a black cross, as on OSM).
// Contrast raised (2026-11-06): darker street edges and building outlines, wider street edges, darker text.
function xdatrysOsmStyle(tilesUrl, tileBounds, english) {   // english: show name:en where the map data has it (non-Latin-script places, house style 5.1)
  const NAME = english ? ["coalesce", ["get", "name:en"], ["get", "name"]] : ["get", "name"];   // tileBounds [w, s, e, n] of the tile folder (Rome if omitted)
  const C = {
    land: "#f2efe9", water: "#aad3df", park: "#c8facc", grass: "#cdebb0", forest: "#add19e", cemetery: "#aacbaf",
    residential: "#e0dfdf", commercial: "#f2dad9", retail: "#ffd6d1", industrial: "#ebdbe8", school: "#ffffe5", hospital: "#ffffe5",
    pedestrian: "#dddde8", pedestrianCasing: "#8a8a8a", sand: "#f5e9c6", building: "#b3aaa8", buildingLine: "#8a817e",
    motorway: "#e892a2", trunk: "#f9b29c", primary: "#fcd6a4", secondary: "#f7fabf", tertiary: "#ffffff", minor: "#ffffff",
    motorwayCasing: "#dc2a67", trunkCasing: "#c84e2f", primaryCasing: "#a06b00", secondaryCasing: "#707d05", tertiaryCasing: "#8f8f8f",
    casing: "#999999", path: "#f2685a", rail: "#5a5a5a", text: "#111111", halo: "#ffffff", waterText: "#4d80b3",
    station: "#4a5fb4", church: "#000000",
    // mountain features (Tre Cime, 2026-11-11), OSM Carto-like colours
    scrub: "#c8d7ab", rock: "#e3dad0", scree: "#ebe3d9", glacier: "#ddecec", heath: "#d6d99f", wetland: "#d3e6e2", peak: "#6b4f2a",
  };
  const detail = ["coalesce", ["get", "kind_detail"], ["get", "kind"]];
  const cls = (k) => ["in", detail, ["literal", k]];
  const MOTORWAY = ["motorway", "motorway_link"], TRUNK = ["trunk", "trunk_link"], PRIMARY = ["primary", "primary_link"],
        SECONDARY = ["secondary", "secondary_link"], TERTIARY = ["tertiary", "tertiary_link"];
  const major = [...MOTORWAY, ...TRUNK, ...PRIMARY, ...SECONDARY, ...TERTIARY];
  const roadColour = ["match", detail, MOTORWAY, C.motorway, TRUNK, C.trunk, PRIMARY, C.primary, SECONDARY, C.secondary, C.tertiary];
  const casingColour = ["match", detail, MOTORWAY, C.motorwayCasing, TRUNK, C.trunkCasing, PRIMARY, C.primaryCasing,
                        SECONDARY, C.secondaryCasing, C.tertiaryCasing];
  // widths in px; main roads wider at low zoom so they stand out as on OSM
  const majorWidth = ["interpolate", ["exponential", 1.5], ["zoom"],
    10, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 1.6, SECONDARY, 1.2, 0.6],
    12, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 3, SECONDARY, 2.4, 1.4],
    14, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 6, SECONDARY, 5, 4],
    16, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 12, SECONDARY, 11, 10],
    18, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 28, SECONDARY, 26, 24]];
  const minorW = (e) => ["interpolate", ["exponential", 1.6], ["zoom"], 13, 1.2 + e, 14, 2.4 + e, 16, 6.5 + e, 18, 19 + e];
  const minorWidth = minorW(0);
  const minorList = ["residential", "unclassified", "living_street", "service", "road", "minor_road", "alley"];
  const pathList = ["footway", "path", "cycleway", "steps", "track", "bridleway", "corridor", "sidewalk", "crossing"];
  const fill = (id, kinds, colour, layer = "landuse") => ({
    id, type: "fill", source: "pm", "source-layer": layer, filter: ["in", ["get", "kind"], ["literal", kinds]], paint: { "fill-color": colour } });
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    // tilesUrl is either a .pmtiles file (local preview) or a folder of single tiles ".../{z}/{x}/{y}.pbf" (Cloudflare preview)
    sources: { pm: tilesUrl.endsWith(".pmtiles")
      ? { type: "vector", url: "pmtiles://" + tilesUrl, attribution: "Map data © OpenStreetMap contributors (ODbL)" }
      : { type: "vector", tiles: [tilesUrl], minzoom: 0, maxzoom: 15, bounds: tileBounds || [12.40, 41.84, 12.55, 41.95], attribution: "Map data © OpenStreetMap contributors (ODbL)" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": C.land } },
      { id: "earth", type: "fill", source: "pm", "source-layer": "earth", paint: { "fill-color": C.land } },
      fill("landcover-forest", ["forest", "wood"], C.forest, "landcover"),
      fill("landcover-grass", ["grassland", "grass", "scrub", "farmland"], C.grass, "landcover"),
      fill("lu-residential", ["residential", "neighbourhood"], C.residential),
      fill("lu-commercial", ["commercial"], C.commercial),
      fill("lu-retail", ["retail"], C.retail),
      fill("lu-industrial", ["industrial", "railway"], C.industrial),
      fill("lu-education", ["school", "university", "college", "kindergarten", "hospital"], C.school),
      fill("lu-cemetery", ["cemetery", "grave_yard"], C.cemetery),
      fill("lu-grass", ["grass", "meadow", "village_green", "allotments", "recreation_ground", "golf_course"], C.grass),
      // mountains and open country (2026-11-11): these were in the tiles but not drawn, so Tre Cime looked empty
      fill("lu-scrub", ["scrub"], C.scrub),
      fill("lu-grassland", ["grassland", "fell"], C.grass),
      fill("lu-heath", ["heath"], C.heath),
      fill("lu-wetland", ["wetland", "marsh", "bog"], C.wetland),
      fill("lu-rock", ["bare_rock", "rock", "cliff"], C.rock),
      fill("lu-scree", ["scree", "shingle"], C.scree),
      fill("lu-glacier", ["glacier"], C.glacier),
      fill("lu-forest", ["forest", "wood"], C.forest),
      // nature reserves: a green edge only, not a forest fill (it covered the bare rock at Tre Cime, 2026-11-11)
      { id: "lu-reserve-edge", type: "line", source: "pm", "source-layer": "landuse", minzoom: 10, filter: ["in", ["get", "kind"], ["literal", ["nature_reserve"]]],
        paint: { "line-color": "#6aa86a", "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 3] } },
      fill("lu-park", ["park", "garden", "playground", "zoo", "protected_area", "national_park", "pitch", "stadium"], C.park),
      { id: "lu-pedestrian", type: "fill", source: "pm", "source-layer": "landuse", filter: ["in", ["get", "kind"], ["literal", ["pedestrian", "platform"]]],
        paint: { "fill-color": C.pedestrian, "fill-outline-color": C.pedestrianCasing } },
      fill("lu-sand", ["beach", "sand"], C.sand),
      { id: "water", type: "fill", source: "pm", "source-layer": "water", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": C.water } },
      { id: "water-lines", type: "line", source: "pm", "source-layer": "water", filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": C.water, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 18, 6] } },
      // buildings at every zoom; the tiles themselves only carry the large buildings below zoom 14
      { id: "buildings", type: "fill", source: "pm", "source-layer": "buildings", filter: ["in", ["get", "kind"], ["literal", ["building", "building_part"]]],
        paint: { "fill-color": C.building, "fill-outline-color": C.buildingLine } },
      // separate outline so each building stands out from its neighbours, as on OSM (2026-11-06)
      { id: "building-edges", type: "line", source: "pm", "source-layer": "buildings", minzoom: 14,
        filter: ["in", ["get", "kind"], ["literal", ["building", "building_part"]]],
        paint: { "line-color": C.buildingLine, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 16, 0.6, 18, 1] } },
      { id: "paths", type: "line", source: "pm", "source-layer": "roads", minzoom: 14, filter: cls(pathList),
        paint: { "line-color": C.path, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.6], "line-dasharray": [2, 1.5] } },
      // via ferrata (protected climbing routes): dark dashes, from zoom 14
      { id: "via-ferrata", type: "line", source: "pm", "source-layer": "roads", minzoom: 14, filter: ["==", ["get", "kind_detail"], "via_ferrata"],
        paint: { "line-color": "#3d3d3d", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 2], "line-dasharray": [1, 1.5] } },
      { id: "rail", type: "line", source: "pm", "source-layer": "roads", filter: ["any", ["==", ["get", "kind"], "rail"], cls(["rail", "light_rail", "tram", "subway"])],
        paint: { "line-color": C.rail, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 18, 2.5] } },
      // pedestrian streets: grey band with a darker edge, as OSM
      { id: "pedestrian-casing", type: "line", source: "pm", "source-layer": "roads", minzoom: 13, filter: cls(["pedestrian"]),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.pedestrianCasing, "line-width": minorW(1.8) } },
      { id: "pedestrian", type: "line", source: "pm", "source-layer": "roads", minzoom: 13, filter: cls(["pedestrian"]),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.pedestrian, "line-width": minorWidth } },
      { id: "minor-casing", type: "line", source: "pm", "source-layer": "roads", minzoom: 13, filter: cls(minorList),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.casing, "line-width": minorW(1.6) } },
      { id: "minor", type: "line", source: "pm", "source-layer": "roads", minzoom: 13, filter: cls(minorList),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.minor, "line-width": minorWidth } },
      { id: "major-casing", type: "line", source: "pm", "source-layer": "roads", filter: cls(major),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": casingColour, "line-width": ["interpolate", ["exponential", 1.5], ["zoom"],
          10, ["+", 0.8, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 1.6, SECONDARY, 1.2, 0.6]],
          12, ["+", 1.2, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 3, SECONDARY, 2.4, 1.4]],
          14, ["+", 1.6, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 6, SECONDARY, 5, 4]],
          16, ["+", 2, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 12, SECONDARY, 11, 10]],
          18, ["+", 3, ["match", detail, [...MOTORWAY, ...TRUNK, ...PRIMARY], 28, SECONDARY, 26, 24]]] } },
      { id: "major", type: "line", source: "pm", "source-layer": "roads", filter: cls(major),
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": roadColour, "line-width": majorWidth } },
      { id: "water-names", type: "symbol", source: "pm", "source-layer": "water", minzoom: 13,
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 12, "symbol-placement": "line" },
        paint: { "text-color": C.waterText, "text-halo-color": C.halo, "text-halo-width": 1 } },
      // street names from zoom 14 (one level earlier), at OSM's smaller size
      { id: "road-names", type: "symbol", source: "pm", "source-layer": "roads", minzoom: 14,
        layout: { "text-field": NAME, "text-font": ["Noto Sans Medium"], "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 17, 12, 19, 13.5],
                  "symbol-placement": "line" },
        paint: { "text-color": C.text, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // square names (OSM tags piazzas as pedestrian areas)
      { id: "square-names", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 16, filter: ["==", ["get", "kind"], "pedestrian"],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Medium"], "text-size": 11.5, "text-max-width": 7 },
        paint: { "text-color": "#333333", "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      { id: "poi-names", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 15,
        filter: ["in", ["get", "kind"], ["literal", ["attraction", "museum", "park", "garden", "monument", "artwork", "viewpoint"]]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 11, "text-max-width": 8 },
        paint: { "text-color": "#734a08", "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // lake names, peaks and mountain huts (2026-11-11)
      { id: "lake-names", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 13, filter: ["in", ["get", "kind"], ["literal", ["water", "lake", "reservoir"]]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 11, "text-max-width": 8 },
        paint: { "text-color": C.waterText, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      { id: "peaks", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 11, filter: ["in", ["get", "kind"], ["literal", ["peak", "volcano"]]],
        layout: { "icon-image": "xd-peak", "text-field": ["step", ["zoom"], "", 13, NAME], "text-font": ["Noto Sans Medium"], "text-size": 10.5,
                  "text-offset": [0, 0.8], "text-anchor": "top", "text-max-width": 8, "text-optional": true },
        paint: { "text-color": C.peak, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      { id: "huts", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 13,
        filter: ["any", ["in", ["get", "kind"], ["literal", ["alpine_hut", "wilderness_hut"]]],
                 ["all", ["==", ["get", "kind"], "restaurant"], ["in", "Rifugio", ["coalesce", ["get", "name"], ""]]]],
        layout: { "icon-image": "xd-hut", "text-field": ["step", ["zoom"], "", 14, NAME], "text-font": ["Noto Sans Medium"], "text-size": 10.5,
                  "text-offset": [0, 0.9], "text-anchor": "top", "text-max-width": 8, "text-optional": true },
        paint: { "text-color": C.peak, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // churches: the only icon kept (black cross, as on OSM), name below
      { id: "churches", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 15,
        filter: ["all", ["==", ["get", "kind"], "place_of_worship"], ["==", ["get", "kind_detail"], "christian"]],
        layout: { "icon-image": "xd-church", "icon-size": 1, "text-field": ["step", ["zoom"], "", 16, NAME], "text-font": ["Noto Sans Medium"],
                  "text-size": 11.5, "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 8, "text-optional": true },
        paint: { "text-color": "#222222", "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // bus and tram stops (2026-11-07): a small dot from zoom 16, the stop's name from zoom 17
      { id: "stops", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 16,
        filter: ["in", ["get", "kind"], ["literal", ["bus_stop", "tram_stop"]]],
        layout: { "icon-image": "xd-stop", "icon-allow-overlap": false, "text-field": ["step", ["zoom"], "", 17, NAME], "text-font": ["Noto Sans Regular"],
                  "text-size": 10, "text-offset": [0, 0.9], "text-anchor": "top", "text-max-width": 7, "text-optional": true },
        paint: { "text-color": C.station, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // metro and rail stations: our station symbol (2026-11-07, ) with the name in blue as on OSM (colour matched by eye)
      { id: "stations", type: "symbol", source: "pm", "source-layer": "pois", minzoom: 13, filter: ["==", ["get", "kind"], "station"],
        layout: { "icon-image": "xd-station", "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 16, 1.1],
                  "text-field": NAME, "text-font": ["Noto Sans Medium"], "text-size": 11, "text-max-width": 8,
                  "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, "symbol-sort-key": 0 },
        paint: { "text-color": C.station, "text-halo-color": C.halo, "text-halo-width": 1.5 } },
      // district names, smaller than iteration 1 (was 18 / 13)
      { id: "place-names", type: "symbol", source: "pm", "source-layer": "places",
        filter: ["in", ["get", "kind"], ["literal", ["neighbourhood", "macrohood", "locality"]]],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Regular"],
                  "text-size": ["match", ["get", "kind_detail"], "city", 15, 11] },
        paint: { "text-color": "#555555", "text-halo-color": C.halo, "text-halo-width": 2 } },
    ],
  };
}

// Icons drawn on a canvas (no external icon files):
// - church: a black Latin cross, as on OSM
// - station (2026-11-07, ): our own simple symbol, a blue rounded square with a white train front. Deliberately NOT the
//   London Underground roundel or the Paris Métro "M" (trade marks); the same symbol is used in every city.
// - bus and tram stops: small blue dots with a white centre, shown only when zoomed right in.
function xdatrysAddImages(map) {
  const make = (id, w, h, paint) => {
    const s = 2, c = document.createElement("canvas");
    c.width = w * s; c.height = h * s;
    const g = c.getContext("2d"); g.scale(s, s); paint(g);
    map.addImage(id, g.getImageData(0, 0, w * s, h * s), { pixelRatio: s });
  };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  map.on("styleimagemissing", (e) => {
    if (map.hasImage(e.id)) return;
    if (e.id === "xd-church") make("xd-church", 10, 14, g => { g.fillStyle = "#000000"; g.fillRect(4, 0, 2, 14); g.fillRect(1, 3.5, 8, 2); });
    if (e.id === "xd-station") make("xd-station", 16, 16, g => {
      g.fillStyle = "#ffffff"; rr(g, 0, 0, 16, 16, 4); g.fill();
      g.fillStyle = "#2f4aa8"; rr(g, 1, 1, 14, 14, 3.5); g.fill();
      g.fillStyle = "#ffffff"; rr(g, 4.5, 3, 7, 8, 1.6); g.fill();                     // train front
      g.fillStyle = "#2f4aa8"; g.fillRect(5.7, 4.3, 4.6, 2.6);                            // window
      g.fillStyle = "#2f4aa8"; g.beginPath(); g.arc(6.4, 9, 0.8, 0, 7); g.arc(9.6, 9, 0.8, 0, 7); g.fill();   // lights
      g.strokeStyle = "#ffffff"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(5.5, 11); g.lineTo(4.3, 13.2); g.moveTo(10.5, 11); g.lineTo(11.7, 13.2); g.stroke();
    });
    if (e.id === "xd-peak") make("xd-peak", 10, 9, g => {         // brown triangle, as OSM marks a summit
      g.fillStyle = "#6b4f2a"; g.beginPath(); g.moveTo(5, 0.5); g.lineTo(9.5, 8.5); g.lineTo(0.5, 8.5); g.closePath(); g.fill(); });
    if (e.id === "xd-hut") make("xd-hut", 12, 11, g => {           // small brown house: mountain hut (rifugio)
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 12, 11);
      g.fillStyle = "#6b4f2a"; g.beginPath(); g.moveTo(6, 1); g.lineTo(11, 5.5); g.lineTo(1, 5.5); g.closePath(); g.fill(); g.fillRect(2.5, 5.5, 7, 4.5);
      g.fillStyle = "#ffffff"; g.fillRect(5, 7, 2, 3); });
    if (e.id === "xd-stop") make("xd-stop", 9, 9, g => {
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(4.5, 4.5, 4.5, 0, 7); g.fill();
      g.fillStyle = "#2f4aa8"; g.beginPath(); g.arc(4.5, 4.5, 3.4, 0, 7); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(4.5, 4.5, 1.3, 0, 7); g.fill();
    });
  });
}
