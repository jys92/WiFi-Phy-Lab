const state = {
  samples: [],
  frequency: [],
  height: 360,
  totalSymbols: 0,
  dataSymbols: 0,
  runSummary: "Run: -"
};

const APP_VARIANT = window.OFDM_VARIANT || "20mhz";
const GENERAL_MODE = APP_VARIANT === "general";

const els = {
  phy: document.querySelector("#phy-select"),
  bw: document.querySelector("#bw-select"),
  rate: document.querySelector("#rate-select"),
  mcs: document.querySelector("#mcs-select"),
  mcsRateLabel: document.querySelector("#mcs-rate-label"),
  psduBytes: document.querySelector("#psdu-bytes"),
  psduFill: document.querySelector("#psdu-fill"),
  sampleCount: document.querySelector("#sample-count"),
  codingMode: document.querySelector("#coding-mode"),
  totalSymbolCount: document.querySelector("#total-symbol-count"),
  dataSymbolCount: document.querySelector("#data-symbol-count"),
  rmsSummary: document.querySelector("#rms-summary"),
  phyNote: document.querySelector("#phy-note"),
  runSummary: document.querySelector("#run-summary"),
  timePanelNote: document.querySelector("#time-panel-note"),
  zoomPanelNote: document.querySelector("#zoom-panel-note"),
  zoomStart: document.querySelector("#zoom-start"),
  zoomCount: document.querySelector("#zoom-count"),
  height: document.querySelector("#graph-height"),
  heightLabel: document.querySelector("#height-label"),
  showI: document.querySelector("#show-i"),
  showQ: document.querySelector("#show-q"),
  showMag: document.querySelector("#show-mag"),
  reset: document.querySelector("#reset-view"),
  timeCanvas: document.querySelector("#time-canvas"),
  zoomCanvas: document.querySelector("#zoom-canvas"),
  freqCanvas: document.querySelector("#freq-canvas")
};

// Build the argv passed to the WASM `main()`, mirroring the old
// server-general.js generatorArgs(): the C generator runs client-side here
// instead of being spawned by Node, so there is no /api server to fetch from.
function generatorArgs(extra = []) {
  const phy = els.phy.value;
  const bw = els.bw ? els.bw.value : "20";
  const args = [
    "--phy", phy,
    "--bw", String(bw),
    "--psdu-bytes", String(els.psduBytes.value),
    "--psdu-fill", els.psduFill.value
  ];
  if (phy === "ht" || phy === "vht" || phy === "he" || phy === "be") {
    args.push("--mcs", els.mcs.value);
  } else {
    args.push("--rate", els.rate.value);
  }
  args.push(...extra);
  return args;
}

// Run the OFDM generator WASM once and return its stdout as text.
// A fresh module instance per call mirrors the native binary running as a
// fresh process each time — the C code keeps global/static state that is not
// safe to reuse across runs. `OfdmModule` is the Emscripten MODULARIZE factory
// exposed globally by ofdm_general.js.
async function runGenerator(extra = []) {
  let stdout = "";
  let stderr = "";
  const Module = await OfdmModule({
    print: (text) => { stdout += text + "\n"; },
    printErr: (text) => { stderr += text + "\n"; }
  });
  const code = Module.callMain(generatorArgs(extra));
  if (code !== 0) {
    throw new Error(`generator exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`);
  }
  return stdout;
}

function currentBandwidth() {
  return els.bw ? Number(els.bw.value) : 20;
}

function sampleScale() {
  return currentBandwidth() / 20;
}

function scaleSampleIndex(value) {
  return Math.round(value * sampleScale());
}

function timeDomainAmplitudeLimit() {
  return 0.08 * (20 / currentBandwidth());
}

const colors = {
  grid: "#e4e9ef",
  axis: "#9aa6b2",
  ink: "#16202a",
  muted: "#5c6875",
  i: "#2563eb",
  q: "#b45309",
  mag: "#15803d",
  freq: "#7c3aed",
  pilot: "#dc2626"
};

const htMcsRates = {
  0: "6.5 Mbps",
  1: "13.0 Mbps",
  2: "19.5 Mbps",
  3: "26.0 Mbps",
  4: "39.0 Mbps",
  5: "52.0 Mbps",
  6: "58.5 Mbps",
  7: "65.0 Mbps"
};

const vhtMcsRates = {
  ...htMcsRates,
  8: "78.0 Mbps"
};

const heMcsRates = {
  0: "8.6 Mbps",
  1: "17.2 Mbps",
  2: "25.8 Mbps",
  3: "34.4 Mbps",
  4: "51.6 Mbps",
  5: "68.8 Mbps",
  6: "77.4 Mbps",
  7: "86.0 Mbps",
  8: "103.2 Mbps",
  9: "114.7 Mbps",
  10: "129.0 Mbps",
  11: "143.4 Mbps"
};

const ehtMcsRates = {
  ...heMcsRates,
  12: "154.9 Mbps",
  13: "172.1 Mbps"
};

const allowedBandwidths = {
  legacy: [20],
  ht: [20, 40],
  vht: [20, 40, 80],
  he: [20, 40, 80, 160],
  be: [20, 40, 80, 160, 320]
};

function updateMcsRateLabel() {
  if (els.phy.value === "ht") {
    els.mcsRateLabel.value = `Rate: ${htMcsRates[els.mcs.value] || "-"}`;
  } else if (els.phy.value === "vht") {
    els.mcsRateLabel.value = `Rate: ${vhtMcsRates[els.mcs.value] || "-"}`;
  } else if (els.phy.value === "he") {
    els.mcsRateLabel.value = `Rate: ${heMcsRates[els.mcs.value] || "-"}`;
  } else if (els.phy.value === "be") {
    els.mcsRateLabel.value = `Rate: ${ehtMcsRates[els.mcs.value] || "-"}`;
  } else {
    els.mcsRateLabel.value = "Rate: legacy selector";
  }
}

function parseSamples(text) {
  const samples = [];
  text.split(/\n/).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (!parts[0]) return;

    if (parts[0] === "T") {
      const samplePattern = /\[(-?\d+)\]\s+([-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?)([-+](?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?)j/g;
      let match;
      while ((match = samplePattern.exec(line)) !== null) {
        const re = Number(match[2]);
        const im = Number(match[3]);
        samples.push({
          index: Number(match[1]),
          re,
          im,
          mag: Math.hypot(re, im)
        });
      }
      return;
    }

    if (parts.length === 3 && /^\d+$/.test(parts[0])) {
      const re = Number(parts[1]);
      const im = Number(parts[2]);
      samples.push({
        index: Number(parts[0]),
        re,
        im,
        mag: Math.hypot(re, im)
      });
    }
  });
  return samples;
}

function parseMetadata(text) {
  const meta = {};
  const totalMatch = text.match(/^# Total OFDM symbols : (\d+)$/m);
  const dataMatch = text.match(/^# DATA symbols : (\d+)$/m);
  if (totalMatch) meta.totalSymbols = Number(totalMatch[1]);
  if (dataMatch) meta.dataSymbols = Number(dataMatch[1]);
  return meta;
}

function parseRunSummary(text) {
  const commandMatch = text.match(/^# Command : (.+)$/m);
  const elapsedMatch = text.match(/^# Elapsed ms : ([0-9]+(?:\.[0-9]+)?)$/m);
  if (!commandMatch && !elapsedMatch) {
    return null;
  }

  const command = commandMatch ? commandMatch[1] : "-";
  const elapsed = elapsedMatch ? elapsedMatch[1] : "-";
  return `Run: ${command} | ${elapsed} ms`;
}

function parseFrequency(text) {
  const points = [];
  text.split(/\n/).forEach((line) => {
    if (!line.startsWith("F")) return;
    const pointPattern = /\[(-?\d+)\]\s+([-+]?\d+(?:\.\d+)?)/g;
    let match;
    while ((match = pointPattern.exec(line)) !== null) {
      points.push({
        bin: Number(match[1]),
        magDb: Number(match[2])
      });
    }
  });
  return points;
}

function setupCanvas(canvas, height) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.floor(height * ratio);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height };
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(3);
}

function rmsOfSamples(samples, start, end) {
  const segment = samples.filter((sample) => sample.index >= start && sample.index < end);
  if (!segment.length) {
    return null;
  }
  const meanSquare = segment.reduce((sum, sample) => {
    return sum + sample.re * sample.re + sample.im * sample.im;
  }, 0) / segment.length;
  return Math.sqrt(meanSquare);
}

function rmsSummaryText(samples, phy) {
  if (!samples.length) {
    return "RMS: -";
  }

  const r = (start, end) => niceNumber(rmsOfSamples(samples, scaleSampleIndex(start), scaleSampleIndex(end)));

  if (phy === "he") {
    const peStart = scaleSampleIndex(864 + (state.dataSymbols || 0) * 272);
    return `RMS: ${[
      `L-SIG ${r(320, 400)}`,
      `HE-STF ${r(640, 720)}`,
      `HE-LTF ${r(720, 864)}`,
      `HE-Data1 ${r(864, 1136)}`,
      `PE ${niceNumber(rmsOfSamples(samples, peStart, samples.length))}`
    ].join(" | ")}`;
  }

  if (phy === "be") {
    const peStart = scaleSampleIndex(1024 + (state.dataSymbols || 0) * 272);
    return `RMS: ${[
      `L-SIG ${r(320, 400)}`,
      `EHT-STF ${r(800, 880)}`,
      `EHT-LTF ${r(880, 1024)}`,
      `EHT-Data1 ${r(1024, 1296)}`,
      `PE ${niceNumber(rmsOfSamples(samples, peStart, samples.length))}`
    ].join(" | ")}`;
  }

  return "RMS: legacy/HT/VHT summary not shown";
}

function usesLdpcCoding() {
  const phy = els.phy.value;
  const bw = currentBandwidth();
  const mcs = Number(els.mcs.value);

  return (phy === "he" || phy === "be") && (bw > 20 || mcs >= 10);
}

function codingModeText() {
  return usesLdpcCoding() ? "LDPC" : "BCC";
}

function phyNoteText() {
  if (GENERAL_MODE) {
    const bw = currentBandwidth();
    return `Model: wideband ${els.phy.value.toUpperCase()} ${bw} MHz`;
  }

  if (els.phy.value === "be") {
    return "Model: EHT displayed with current local generator";
  }

  if (els.phy.value === "he") {
    return "Model: HE displayed with current local generator";
  }

  return "Model: current local generator output";
}

function timeDomainXTickLabel(sampleIndex) {
  return [
    niceNumber(sampleIndex),
    `${niceNumber(sampleIndex / currentBandwidth())} us`
  ];
}

function sampleIndexFromTimeUs(timeUs) {
  return Math.round(timeUs * currentBandwidth());
}

function timeUsFromSampleIndex(sampleIndex) {
  return sampleIndex / currentBandwidth();
}

function frequencyDomainXTickLabel(binIndex) {
  const fftSize = state.frequency.length || 1;
  const frequencyMhz = (binIndex * currentBandwidth()) / fftSize;
  const roundedFrequency = Math.round(frequencyMhz);
  if (Math.abs(binIndex) < 0.5) {
    return [
      "0",
      "0 MHz"
    ];
  }
  return [
    niceNumber(binIndex),
    `${roundedFrequency} MHz`
  ];
}

function drawAxes(ctx, box, xMin, xMax, yMin, yMax, xLabel, yLabel, xTickLabel = (value) => [niceNumber(value)], xExtraTickValues = []) {
  ctx.clearRect(0, 0, box.totalWidth, box.totalHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, box.totalWidth, box.totalHeight);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const ticks = [];
  for (let t = 0; t <= 5; t++) {
    ticks.push(xMin + ((xMax - xMin) * t) / 5);
  }
  xExtraTickValues.forEach((value) => {
    if (value >= xMin && value <= xMax) {
      ticks.push(value);
    }
  });

  ticks.sort((a, b) => a - b);
  const uniqueTicks = ticks.filter((value, index) => index === 0 || Math.abs(value - ticks[index - 1]) > 1e-6);

  uniqueTicks.forEach((xValue) => {
    const x = box.left + (box.width * (xValue - xMin)) / Math.max(1, xMax - xMin);
    const y = box.top + box.height * 0.2; // reused for y grid position later

    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.height);
    ctx.stroke();

    const yTick = box.top + box.height;
    const xLines = xTickLabel(xValue);
    xLines.forEach((line, idx) => {
      ctx.fillText(line, x, yTick + 22 + idx * 14);
    });
  });

  for (let t = 0; t <= 5; t++) {
    const y = box.top + (box.height * t) / 5;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.left + box.width, y);
    ctx.stroke();

    const yValue = yMax - ((yMax - yMin) * t) / 5;
    ctx.textAlign = "left";
    ctx.fillText(niceNumber(yValue), 8, y + 4);
    ctx.textAlign = "center";
  }

  ctx.strokeStyle = colors.axis;
  ctx.strokeRect(box.left, box.top, box.width, box.height);

  ctx.fillStyle = colors.ink;
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`[${xLabel}]`, box.left + box.width, box.top + box.height + 56);
  // y-axis name: horizontal, just above the max value (top-left), bracketed.
  ctx.textAlign = "left";
  ctx.fillText(`[${yLabel}]`, 8, box.top - 10);
}

function pathFor(ctx, points, box, xMin, xMax, yMin, yMax, getX, getY, color) {
  if (!points.length) return;
  const xScale = box.width / Math.max(1, xMax - xMin);
  const yScale = box.height / Math.max(1e-12, yMax - yMin);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.width, box.height);
  ctx.clip();
  ctx.beginPath();
  points.forEach((point, idx) => {
    const x = box.left + (getX(point) - xMin) * xScale;
    const y = box.top + box.height - (getY(point) - yMin) * yScale;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function pointsFor(ctx, points, box, xMin, xMax, yMin, yMax, getX, getY, color) {
  if (!points.length) return;
  const xScale = box.width / Math.max(1, xMax - xMin);
  const yScale = box.height / Math.max(1e-12, yMax - yMin);
  const baselineY = box.top + box.height - (0 - yMin) * yScale;
  const clampedBaselineY = Math.max(box.top, Math.min(box.top + box.height, baselineY));

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.width, box.height);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  for (const point of points) {
    const x = box.left + (getX(point) - xMin) * xScale;
    const y = box.top + box.height - (getY(point) - yMin) * yScale;
    ctx.beginPath();
    ctx.moveTo(x, clampedBaselineY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLegend(ctx, items, x, y) {
  ctx.font = "13px system-ui, sans-serif";
  let offset = 0;
  items.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + 24, y);
    ctx.stroke();
    ctx.fillStyle = colors.ink;
    ctx.fillText(item.label, x + offset + 30, y + 4);
    offset += 92;
  });
}

function drawPacketRegions(ctx, box, xMin, xMax) {
  const totalBaseSamples = Math.ceil((state.samples.length || 0) / sampleScale());
  const dataSymbols = state.dataSymbols || 0;
  let regions = [
    { label: "STF", start: 0, end: 160, kind: "legacy" },
    { label: "LTF", start: 161, end: 320, kind: "legacy" },
    { label: "SIGNAL", start: 321, end: 400, kind: "legacy" }
  ];
  if (els.phy.value === "ht") {
    regions = [
      { label: "L-STF", start: 0, end: 160, kind: "legacy" },
      { label: "L-LTF", start: 161, end: 320, kind: "legacy" },
      { label: "L-SIG", start: 321, end: 400, kind: "legacy" },
      { label: "HT-SIG", start: 401, end: 560, kind: "phy" },
      { label: "HT-STF", start: 561, end: 640, kind: "phy" },
      { label: "HT-LTF", start: 641, end: 720, kind: "phy" }
    ];
  } else if (els.phy.value === "vht") {
    regions = [
      { label: "L-STF", start: 0, end: 160, kind: "legacy" },
      { label: "L-LTF", start: 161, end: 320, kind: "legacy" },
      { label: "L-SIG", start: 321, end: 400, kind: "legacy" },
      { label: "VHT-SIG-A", start: 401, end: 560, kind: "phy" },
      { label: "VHT-STF", start: 561, end: 640, kind: "phy" },
      { label: "VHT-LTF", start: 641, end: 720, kind: "phy" },
      { label: "VHT-SIG-B", start: 721, end: 800, kind: "phy" }
    ];
  } else if (els.phy.value === "he") {
    const dataStart = 864;
    const dataEnd = dataStart + dataSymbols * 272;
    regions = [
      { label: "L-STF", start: 0, end: 160, kind: "legacy" },
      { label: "L-LTF", start: 161, end: 320, kind: "legacy" },
      { label: "L-SIG", start: 321, end: 400, kind: "legacy" },
      { label: "RL-SIG", start: 401, end: 480, kind: "legacy" },
      { label: "HE-SIG-A", start: 481, end: 640, kind: "phy" },
      { label: "HE-STF", start: 641, end: 720, kind: "phy" },
      { label: "HE-LTF", start: 721, end: 864, kind: "phy" },
      { label: "DATA", start: dataStart, end: dataEnd },
      { label: "PE", start: dataEnd, end: totalBaseSamples, kind: "pe" }
    ];
  } else if (els.phy.value === "be") {
    const dataStart = 1024;
    const dataEnd = dataStart + dataSymbols * 272;
    regions = [
      { label: "L-STF", start: 0, end: 160, kind: "legacy" },
      { label: "L-LTF", start: 161, end: 320, kind: "legacy" },
      { label: "L-SIG", start: 321, end: 400, kind: "legacy" },
      { label: "RL-SIG", start: 401, end: 480, kind: "legacy" },
      { label: "U-SIG", start: 481, end: 640, kind: "phy" },
      { label: "EHT-SIG", start: 641, end: 800, kind: "phy" },
      { label: "EHT-STF", start: 801, end: 880, kind: "phy" },
      { label: "EHT-LTF", start: 881, end: 1024, kind: "phy" },
      { label: "DATA", start: dataStart, end: dataEnd },
      { label: "PE", start: dataEnd, end: totalBaseSamples, kind: "pe" }
    ];
  }
  const xScale = box.width / Math.max(1, xMax - xMin);

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#334155";
  ctx.font = "12px system-ui, sans-serif";

  regions.forEach((region) => {
    if (region.end <= region.start) return;
    const startSample = scaleSampleIndex(region.start);
    const endSample = scaleSampleIndex(region.end);
    if (startSample > xMax || endSample < xMin) return;

    const startX = box.left + (startSample - xMin) * xScale;
    const endX = box.left + (endSample - xMin) * xScale;
    const clippedStartX = Math.max(box.left, startX);
    const clippedEndX = Math.min(box.left + box.width, endX);
    if (region.kind === "legacy" || region.kind === "phy" || region.kind === "pe") {
      ctx.save();
      ctx.setLineDash([]);
      if (region.kind === "pe") {
        ctx.fillStyle = "rgba(220, 38, 38, 0.13)";
      } else if (region.kind === "legacy") {
        ctx.fillStyle = "rgba(234, 179, 8, 0.16)";
      } else {
        ctx.fillStyle = "rgba(37, 99, 235, 0.10)";
      }
      ctx.fillRect(clippedStartX, box.top, Math.max(0, clippedEndX - clippedStartX), box.height);
      ctx.restore();
    }

    [startX, endX].forEach((x) => {
      if (x < box.left || x > box.left + box.width) return;
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.top + box.height);
      ctx.stroke();
    });

    const labelWidth = Math.max(24, ctx.measureText(region.label).width);
    const labelX = Math.max(box.left + 4, Math.min(box.left + box.width - labelWidth - 4, (startX + endX) / 2 - labelWidth / 2));
    ctx.fillStyle = region.kind === "pe" ? "#b91c1c" : "#334155";
    ctx.fillText(region.label, labelX, box.top + 36);
  });

  ctx.restore();
}

function drawSymbolBoundaries(ctx, box, xMin, xMax) {
  const phy = els.phy.value;
  let start = 400;
  let step = 80;

  if (phy === "ht") {
    start = 720;
    step = 80;
  } else if (phy === "vht") {
    start = 800;
    step = 80;
  } else if (phy === "he") {
    start = 864;
    step = 272;
  } else if (phy === "be") {
    start = 1024;
    step = 272;
  }
  const xScale = box.width / Math.max(1, xMax - xMin);
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  const scaledStart = scaleSampleIndex(start + step);
  const scaledStep = Math.max(1, scaleSampleIndex(step));
  const count = state.dataSymbols || 0;
  for (let i = 1; i < count; i++) {
    const x = scaleSampleIndex(start + i * step);
    if (x < xMin || x > xMax) continue;
    const px = box.left + (x - xMin) * xScale;
    ctx.beginPath();
    ctx.moveTo(px, box.top);
    ctx.lineTo(px, box.top + box.height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDataSymbolNumbers(ctx, box, xMin, xMax) {
  const phy = els.phy.value;
  let start = 400;
  let step = 80;

  if (phy === "ht") {
    start = 720;
    step = 80;
  } else if (phy === "vht") {
    start = 800;
    step = 80;
  } else if (phy === "he") {
    start = 864;
    step = 272;
  } else if (phy === "be") {
    start = 1024;
    step = 272;
  }
  const scaledStart = scaleSampleIndex(start);
  const scaledStep = Math.max(1, scaleSampleIndex(step));
  const count = state.dataSymbols || 0;
  if (!count) {
    return;
  }

  const xScale = box.width / Math.max(1, xMax - xMin);
  ctx.save();
  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = 0; i < count; i++) {
    const left = scaledStart + i * scaledStep;
    const right = left + scaledStep;
    const center = (left + right) / 2;
    const x = box.left + (center - xMin) * xScale;
    if (x < box.left - 8 || x > box.left + box.width + 8) {
      continue;
    }
    const label = String(i + 1);
    ctx.strokeText(label, x, box.top + 10);
    ctx.fillText(label, x, box.top + 10);
  }

  ctx.restore();
}

function sampleWindowForZoom() {
  const total = state.samples.length;
  const requestedStartUs = Math.max(0, Number(els.zoomStart?.value || 0));
  const requestedDurationUs = Math.max(1 / currentBandwidth(), Number(els.zoomCount?.value || 40));
  const requestedStart = sampleIndexFromTimeUs(requestedStartUs);
  const requestedCount = Math.max(1, sampleIndexFromTimeUs(requestedDurationUs));
  const start = total > 0 ? Math.min(requestedStart, total - 1) : 0;
  const end = total > 0 ? Math.min(start + requestedCount, total) : requestedCount;
  const actualCount = Math.max(0, end - start);
  return {
    xMin: start,
    xMax: Math.max(end, start + 1),
    start,
    end,
    count: actualCount,
    startUs: timeUsFromSampleIndex(start),
    endUs: timeUsFromSampleIndex(Math.max(end - 1, start)),
    durationUs: actualCount / currentBandwidth()
  };
}

function drawTimeDomain() {
  const samples = state.samples;
  const { ctx, width, height } = setupCanvas(els.timeCanvas, state.height);
  const box = { left: 58, top: 30, width: width - 76, height: height - 102, totalWidth: width, totalHeight: height };
  const traces = [];

  if (els.showI.checked) traces.push({ label: "I", color: colors.i, getter: (p) => p.re });
  if (els.showQ.checked) traces.push({ label: "Q", color: colors.q, getter: (p) => p.im });
  if (els.showMag.checked) traces.push({ label: "|x|", color: colors.mag, getter: (p) => p.mag });

  const yLimit = timeDomainAmplitudeLimit();
  const yMin = -yLimit;
  const yMax = yLimit;
  const xMin = samples[0]?.index ?? 0;
  const xMax = samples[samples.length - 1]?.index ?? 1;

  drawAxes(ctx, box, xMin, xMax, yMin, yMax, "sample / time", "amplitude", timeDomainXTickLabel);
  drawPacketRegions(ctx, box, xMin, xMax);
  drawSymbolBoundaries(ctx, box, xMin, xMax);
  drawDataSymbolNumbers(ctx, box, xMin, xMax);
  traces.forEach((trace) => {
    pathFor(ctx, samples, box, xMin, xMax, yMin, yMax, (p) => p.index, trace.getter, trace.color);
  });
  drawLegend(ctx, traces, box.left + 8, box.top + 18);
}

function drawZoomDomain() {
  const samples = state.samples;
  const { ctx, width, height } = setupCanvas(els.zoomCanvas, state.height);
  const box = { left: 58, top: 30, width: width - 76, height: height - 102, totalWidth: width, totalHeight: height };
  const traces = [];

  if (els.showI.checked) traces.push({ label: "I", color: colors.i, getter: (p) => p.re });
  if (els.showQ.checked) traces.push({ label: "Q", color: colors.q, getter: (p) => p.im });
  if (els.showMag.checked) traces.push({ label: "|x|", color: colors.mag, getter: (p) => p.mag });

  const { xMin, xMax } = sampleWindowForZoom();
  const windowedSamples = samples.filter((sample) => sample.index >= xMin && sample.index < xMax);
  const yLimit = timeDomainAmplitudeLimit();
  const yMin = -yLimit;
  const yMax = yLimit;

  drawAxes(ctx, box, xMin, xMax, yMin, yMax, "sample / time", "amplitude", timeDomainXTickLabel);
  drawPacketRegions(ctx, box, xMin, xMax);
  drawSymbolBoundaries(ctx, box, xMin, xMax);
  drawDataSymbolNumbers(ctx, box, xMin, xMax);
  traces.forEach((trace) => {
    pointsFor(ctx, windowedSamples, box, xMin, xMax, yMin, yMax, (p) => p.index, trace.getter, trace.color);
  });
  drawLegend(ctx, traces, box.left + 8, box.top + 18);
}

function drawFrequencyDomain() {
  const points = state.frequency;
  const { ctx, width, height } = setupCanvas(els.freqCanvas, state.height);
  const box = { left: 58, top: 30, width: width - 76, height: height - 102, totalWidth: width, totalHeight: height };

  // Compute min/max with a single pass. Avoid Math.max(...mags): at large PSDU
  // the frequency array can exceed 131072 points, which overflows the browser's
  // argument-spread limit and throws RangeError.
  let magMin = Infinity;
  let magMax = -Infinity;
  for (const p of points) {
    if (p.magDb < magMin) magMin = p.magDb;
    if (p.magDb > magMax) magMax = p.magDb;
  }
  const yMax = points.length ? magMax + 3 : 1;
  const yMin = points.length ? magMin - 3 : -80;
  const xMin = points[0]?.bin ?? -1;
  const xMax = points[points.length - 1]?.bin ?? 1;
  const extraXTicks = [];
  if (xMin < 0 && xMax > 0) {
    extraXTicks.push(0);
  }

  drawAxes(ctx, box, xMin, xMax, yMin, yMax, "FFT bin index / frequency", "magnitude dB", frequencyDomainXTickLabel, extraXTicks);

  if (xMin < 0 && xMax > 0) {
    const xScale = box.width / Math.max(1, xMax - xMin);
    const x = box.left + (0 - xMin) * xScale;
    ctx.save();
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.height);
    ctx.stroke();
    ctx.restore();
  }

  if (yMin < 0 && yMax > 0) {
    const yScale = box.height / Math.max(1e-12, yMax - yMin);
    const y = box.top + box.height - (0 - yMin) * yScale;
    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.left + box.width, y);
    ctx.stroke();
    ctx.restore();
  }

  pathFor(ctx, points, box, xMin, xMax, yMin, yMax, (p) => p.bin, (p) => p.magDb, colors.freq);
  drawLegend(ctx, [
    { label: "FFT magnitude", color: colors.freq }
  ], box.left + 8, box.top + 18);
}

async function loadFrequency() {
  const text = await runGenerator(["--freq-only"]);
  state.frequency = parseFrequency(text);
  drawFrequencyDomain();
}

function render(reloadFrequency = true) {
  state.height = Number(els.height.value);
  els.heightLabel.value = `${state.height} px`;
  els.sampleCount.textContent = state.samples.length;
  if (els.codingMode) {
    els.codingMode.textContent = codingModeText();
  }
  els.totalSymbolCount.textContent = state.totalSymbols;
  els.dataSymbolCount.textContent = state.dataSymbols;
  els.rmsSummary.textContent = rmsSummaryText(state.samples, els.phy.value);
  els.phyNote.textContent = phyNoteText();
  if (els.runSummary) {
    els.runSummary.textContent = state.runSummary;
  }
  els.timePanelNote.textContent = phyNoteText();
  drawTimeDomain();
  if (els.zoomPanelNote) {
    const zoomWindow = sampleWindowForZoom();
    els.zoomPanelNote.textContent = `${niceNumber(zoomWindow.startUs)} us to ${niceNumber(zoomWindow.endUs)} us (${zoomWindow.count} samples)`;
  }
  if (els.zoomCanvas) {
    drawZoomDomain();
  }
  if (reloadFrequency) {
    loadFrequency().catch((error) => {
      console.error(error);
      alert("Failed to generate frequency data");
    });
  } else {
    drawFrequencyDomain();
  }
}

async function loadRate(rate) {
  const text = await runGenerator(["--precise-time"]);
  state.samples = parseSamples(text);
  state.frequency = parseFrequency(text);
  const meta = parseMetadata(text);
  state.totalSymbols = meta.totalSymbols ?? 0;
  state.dataSymbols = meta.dataSymbols ?? 0;
  state.runSummary = parseRunSummary(text) || "Run: -";
  render(false);
}

function syncBwControls() {
  if (!els.bw) {
    return;
  }
  const allowed = allowedBandwidths[els.phy.value] || [20];
  Array.from(els.bw.options).forEach((option) => {
    option.disabled = !allowed.includes(Number(option.value));
  });
  if (!allowed.includes(Number(els.bw.value))) {
    els.bw.value = String(allowed[0]);
  }
}

async function init() {
  [els.showI, els.showQ, els.showMag].forEach((el) => {
    el.addEventListener("input", () => render(false));
    el.addEventListener("change", () => render(false));
  });
  [els.zoomStart, els.zoomCount].filter(Boolean).forEach((el) => {
    el.addEventListener("input", () => render(false));
    el.addEventListener("change", () => render(false));
  });
  els.height.addEventListener("input", () => render(false));
  els.height.addEventListener("change", () => render(false));
  function syncPhyControls() {
    const usesMcs = els.phy.value === "ht" || els.phy.value === "vht" || els.phy.value === "he" || els.phy.value === "be";
    els.rate.disabled = usesMcs;
    els.mcs.disabled = !usesMcs;
    els.mcs.querySelector('option[value="8"]').disabled = els.phy.value !== "vht" && els.phy.value !== "he" && els.phy.value !== "be";
    ["9", "10", "11"].forEach((value) => {
      const option = els.mcs.querySelector(`option[value="${value}"]`);
      if (option) option.disabled = els.phy.value !== "he" && els.phy.value !== "be";
    });
    ["12", "13"].forEach((value) => {
      const option = els.mcs.querySelector(`option[value="${value}"]`);
      if (option) option.disabled = els.phy.value !== "be";
    });
    if (els.phy.value === "ht" && Number(els.mcs.value) > 7) {
      els.mcs.value = "7";
    }
    if (els.phy.value === "vht" && Number(els.mcs.value) > 8) {
      els.mcs.value = "8";
    }
    if (els.phy.value === "he" && Number(els.mcs.value) > 11) {
      els.mcs.value = "11";
    }
    if (els.phy.value === "be" && Number(els.mcs.value) > 13) {
      els.mcs.value = "13";
    }
    updateMcsRateLabel();
    syncBwControls();
  }

  [els.phy, els.rate, els.mcs, els.psduBytes, els.psduFill, els.bw].filter(Boolean).forEach((el) => {
    el.addEventListener("change", () => {
      syncPhyControls();
      const psduBytes = Number(els.psduBytes.value);
      if (!Number.isInteger(psduBytes) || psduBytes < 1 || psduBytes > 4095) {
        alert("PSDU bytes must be 1..4095");
        return;
      }
      loadRate(els.rate.value).catch((error) => {
        console.error(error);
        alert("Failed to generate samples");
      });
    });
  });
  els.psduBytes.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      els.psduBytes.blur();
    }
  });
  els.reset.addEventListener("click", () => {
    els.phy.value = "legacy";
    els.rate.value = "36";
    els.mcs.value = "0";
    syncPhyControls();
    if (els.bw) {
      els.bw.value = "20";
      syncBwControls();
    }
    els.height.value = 360;
    els.psduBytes.value = 100;
    els.psduFill.value = "00";
    if (els.zoomStart) {
      els.zoomStart.value = "0";
    }
    if (els.zoomCount) {
      els.zoomCount.value = "40";
    }
    els.showI.checked = true;
    els.showQ.checked = true;
    els.showMag.checked = true;
    loadRate(els.rate.value).catch((error) => {
      console.error(error);
      alert("Failed to generate samples");
    });
  });
  window.addEventListener("resize", render);
  syncPhyControls();
  await loadRate(els.rate.value);
}

init().catch((error) => {
  console.error(error);
  alert("Failed to generate OFDM samples");
});
