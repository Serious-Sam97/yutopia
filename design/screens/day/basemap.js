// draws the Grounds from map.json into ctx (1 px = 1 tile × k), building coords → canvas
function drawGrounds(ctx, M, k) {
  const { S, cols, rows, G } = M;
  const X = (x) => (x - G.x0) * k;
  const Z = (z) => (z - G.z0) * k;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = M.cells[j * cols + i];
      const s = Math.floor(v / 1000);
      const td = (v % 1000) / 100;
      let c;
      if (s === 5) c = "#b9d3e3"; // ice
      else if (s === 2) c = "#c9b79a"; // trail
      else if (s === 3) c = "#7d7f84"; // asphalt
      else if (s === 4) c = "#a9a39a"; // walk
      else if (s === 6) c = "#555";
      else if (s === 7) c = "#8d8a86";
      else {
        const g = Math.round(245 - td * 150);
        c = td > 0.05 ? `rgb(${g - 40},${g - 10},${g - 40})` : "#f4f6f8";
      }
      ctx.fillStyle = c;
      ctx.fillRect(i * S * k, j * S * k, S * k + 0.5, S * k + 0.5);
    }
  ctx.fillStyle = "#3b3f46";
  for (const b of M.buildings) ctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
  ctx.fillStyle = "#f2c94c";
  for (const [x, z] of M.lamps) {
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 1.6, 0, 7);
    ctx.fill();
  }
  return { X, Z };
}
