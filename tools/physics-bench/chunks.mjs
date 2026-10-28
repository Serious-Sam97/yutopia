// The boxes grouped by chunk (chunk × chunk tiles): one compound shape each, as a real build would.
export function byChunk(boxes, chunk) {
  const groups = new Map();
  for (let k = 0; k < boxes.length; k += 6) {
    const key = `${Math.floor(boxes[k] / chunk)},${Math.floor(boxes[k + 1] / chunk)}`;
    let g = groups.get(key);
    if (!g) {
      g = { cx: Math.floor(boxes[k] / chunk) * chunk, cz: Math.floor(boxes[k + 1] / chunk) * chunk, list: [] };
      groups.set(key, g);
    }
    g.list.push(k);
  }
  return [...groups.values()];
}
