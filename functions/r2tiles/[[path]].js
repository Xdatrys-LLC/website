// Map tiles for the library pages, served from the R2 bucket "xdatrys-maps-tiles" (2026-11-11). NOT ACTIVE until the lead enables the
// R2 binding "TILES" (see wrangler.toml); without it every request answers 503 and nothing else on the site is affected.
//
// Why: the live site cannot hold ~19,000 single tile files (Cloudflare Pages file limit). Each map is ONE .pmtiles file in R2; this
// function reads just the bytes of the requested tile with R2 range reads, the method Protomaps documents for serving PMTiles from
// Cloudflare. The PMTiles v3 reading below follows the specification (github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md),
// the same steps as pipeline/pmtiles_to_dir.py, so no npm package is needed.
//
// Address: /r2tiles/<map>/<z>/<x>/<y>.pbf   e.g. /r2tiles/rome/14/8760/6088.pbf  -> R2 object "rome.pmtiles"
// Maps split into parts (Italy: italy/base.pmtiles z0-9 plus italy/spotNN.pmtiles z10-15 around each spot) are found by listing
// "<map>/" in the bucket; the first part whose zoom range and area hold the tile answers.
// Answers: 200 with an uncompressed vector tile (Cloudflare compresses it on the way out), 204 when no part has that tile (the map
// draws an empty square, as with the tile folders), 400 for a bad address, 404 for an unknown map, 503 when R2 is not bound.

const HEADER_BYTES = 16384;                        // the header (127 bytes) plus the root directory fit in the first 16 KB
const META = new Map();                            // per worker instance: R2 key -> { h, root }
const LEAVES = new Map();                          // leaf directories, small cache
const PARTS = new Map();                           // map -> [R2 keys]
const CACHE_SECONDS = 86400;

function u64(dv, o) { return dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296; }

function readHeader(buf) {
  const dv = new DataView(buf);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 7));
  if (magic !== "PMTiles" || dv.getUint8(7) !== 3) throw new Error("not a PMTiles v3 file");
  return {
    rootOff: u64(dv, 8), rootLen: u64(dv, 16), leafOff: u64(dv, 40), tileOff: u64(dv, 56),
    internalC: dv.getUint8(97), tileC: dv.getUint8(98), minZ: dv.getUint8(100), maxZ: dv.getUint8(101),
    minLon: dv.getInt32(102, true) / 1e7, minLat: dv.getInt32(106, true) / 1e7, maxLon: dv.getInt32(110, true) / 1e7, maxLat: dv.getInt32(114, true) / 1e7,
  };
}

async function decompress(bytes, c) {               // 1 = none, 2 = gzip (what our tiles use); others not supported
  if (c === 1 || c === 0) return bytes;
  if (c !== 2) throw new Error("compression " + c + " not supported");
  const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
  return new Uint8Array(await ds.arrayBuffer());
}

function readDir(b) {                               // a directory: ids, run lengths, lengths, offsets (all varints)
  let i = 0;
  const v = () => { let r = 0, m = 1, c; do { c = b[i++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80); return r; };
  const n = v(), e = new Array(n);
  let last = 0;
  for (let k = 0; k < n; k++) { last += v(); e[k] = { id: last, run: 0, len: 0, off: 0 }; }
  for (let k = 0; k < n; k++) e[k].run = v();
  for (let k = 0; k < n; k++) e[k].len = v();
  for (let k = 0; k < n; k++) { const o = v(); e[k].off = (o === 0 && k > 0) ? e[k - 1].off + e[k - 1].len : o - 1; }
  return e;
}

function zxyToId(z, x, y) {                         // position on the Hilbert curve, as in the specification
  let acc = 0;
  for (let a = 0; a < z; a++) acc += Math.pow(4, a);
  let d = 0;
  for (let s = Math.pow(2, z - 1); s >= 1; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const t = x; x = y; y = t; }
  }
  return acc + d;
}

function find(entries, id) {                        // the last entry whose id is <= the tile id
  let lo = 0, hi = entries.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (entries[m].id === id) return entries[m];
    if (entries[m].id < id) lo = m + 1; else hi = m - 1;
  }
  if (hi >= 0) { const e = entries[hi]; if (e.run === 0) return e; if (id - e.id < e.run) return e; }
  return null;
}

async function rangeGet(bucket, key, offset, length) {
  const obj = await bucket.get(key, { range: { offset, length } });
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

async function meta(bucket, key) {
  if (META.has(key)) return META.get(key);
  const first = await rangeGet(bucket, key, 0, HEADER_BYTES);
  if (!first) return null;
  const h = readHeader(first.buffer.slice(first.byteOffset, first.byteOffset + 127));
  const rootBytes = h.rootOff + h.rootLen <= first.length ? first.subarray(h.rootOff, h.rootOff + h.rootLen)
    : await rangeGet(bucket, key, h.rootOff, h.rootLen);
  const m = { h, root: readDir(await decompress(rootBytes, h.internalC)) };
  META.set(key, m);
  return m;
}

function tileInside(h, z, x, y) {                   // does the tile touch the part's area? (cheap test before reading)
  if (z < h.minZ || z > h.maxZ) return false;
  const n = Math.pow(2, z);
  const lon0 = x / n * 360 - 180, lon1 = (x + 1) / n * 360 - 180;
  const lat = t => Math.atan(Math.sinh(Math.PI * (1 - 2 * t / n))) * 180 / Math.PI;
  const lat0 = lat(y + 1), lat1 = lat(y);
  return lon1 >= h.minLon && lon0 <= h.maxLon && lat1 >= h.minLat && lat0 <= h.maxLat;
}

async function getTile(bucket, key, z, x, y) {
  const m = await meta(bucket, key);
  if (!m || !tileInside(m.h, z, x, y)) return null;
  const id = zxyToId(z, x, y);
  let dir = m.root;
  for (let depth = 0; depth < 4; depth++) {
    const e = find(dir, id);
    if (!e) return null;
    if (e.run > 0) return decompress(await rangeGet(bucket, key, m.h.tileOff + e.off, e.len), m.h.tileC);
    const lk = key + "@" + e.off;                   // run 0: a pointer to a leaf directory
    let leaf = LEAVES.get(lk);
    if (!leaf) {
      leaf = readDir(await decompress(await rangeGet(bucket, key, m.h.leafOff + e.off, e.len), m.h.internalC));
      if (LEAVES.size > 200) LEAVES.delete(LEAVES.keys().next().value);
      LEAVES.set(lk, leaf);
    }
    dir = leaf;
  }
  return null;
}

async function partsOf(bucket, map) {
  if (PARTS.has(map)) return PARTS.get(map);
  let keys = [];
  if (await bucket.head(map + ".pmtiles")) keys = [map + ".pmtiles"];
  else {
    let cursor;
    do {
      const r = await bucket.list({ prefix: map + "/", cursor });
      keys.push(...r.objects.map(o => o.key).filter(k => k.endsWith(".pmtiles")));
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
    keys.sort((a, b) => (a.endsWith("/base.pmtiles") ? -1 : 0) - (b.endsWith("/base.pmtiles") ? -1 : 0) || a.localeCompare(b));
  }
  PARTS.set(map, keys);
  return keys;
}

export async function handle(request, env, path) {
  if (!env.TILES) return new Response("Tile storage (R2 binding TILES) is not enabled on this site.", { status: 503 });
  const p = Array.isArray(path) ? path : String(path || "").split("/");
  const m = p.length === 4 && /^[a-z0-9-]{1,40}$/.test(p[0]) && /^\d{1,2}$/.test(p[1]) && /^\d{1,7}$/.test(p[2]) && /^\d{1,7}\.pbf$/.test(p[3]);
  if (!m) return new Response("bad tile address", { status: 400 });
  const map = p[0], z = +p[1], x = +p[2], y = parseInt(p[3], 10);
  if (z > 20 || x >= Math.pow(2, z) || y >= Math.pow(2, z)) return new Response("bad tile address", { status: 400 });

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const ck = new Request(new URL(request.url).origin + "/r2tiles/" + p.join("/"));
  if (cache) { const hit = await cache.match(ck); if (hit) return hit; }

  const parts = await partsOf(env.TILES, map);
  if (!parts.length) return new Response("unknown map", { status: 404 });
  let tile = null;
  for (const key of parts) { tile = await getTile(env.TILES, key, z, x, y); if (tile) break; }
  const headers = { "access-control-allow-origin": "*", "cache-control": "public, max-age=" + CACHE_SECONDS };
  const res = tile ? new Response(tile, { status: 200, headers: { ...headers, "content-type": "application/x-protobuf" } })
    : new Response(null, { status: 204, headers });
  if (cache && tile) await cache.put(ck, res.clone());
  return res;
}

export const onRequestGet = ({ request, env, params }) => handle(request, env, params.path);
