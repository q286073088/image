const modeMeta = {
  compress: {
    label: "压缩",
    undo: false,
  },
  "remove-bg": {
    label: "去背景",
    undo: true,
  },
  watermark: {
    label: "水印",
    undo: true,
  },
};

const state = {
  activeMode: "compress",
  items: [],
  selectedId: null,
  running: false,
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropzone: document.querySelector("#dropzone"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  modeScreens: document.querySelectorAll("[data-screen]"),
  compressFormat: document.querySelector("#compressFormat"),
  compressQuality: document.querySelector("#compressQuality"),
  compressQualityValue: document.querySelector("#compressQualityValue"),
  compressMaxEdge: document.querySelector("#compressMaxEdge"),
  bgFormat: document.querySelector("#bgFormat"),
  bgTolerance: document.querySelector("#bgTolerance"),
  bgToleranceValue: document.querySelector("#bgToleranceValue"),
  bgMaxEdge: document.querySelector("#bgMaxEdge"),
  watermarkText: document.querySelector("#watermarkText"),
  watermarkFormat: document.querySelector("#watermarkFormat"),
  watermarkColor: document.querySelector("#watermarkColor"),
  watermarkLayout: document.querySelector("#watermarkLayout"),
  watermarkPositionField: document.querySelector("#watermarkPositionField"),
  watermarkPosition: document.querySelector("#watermarkPosition"),
  watermarkCountField: document.querySelector("#watermarkCountField"),
  watermarkCount: document.querySelector("#watermarkCount"),
  watermarkOpacity: document.querySelector("#watermarkOpacity"),
  watermarkOpacityValue: document.querySelector("#watermarkOpacityValue"),
  watermarkSize: document.querySelector("#watermarkSize"),
  watermarkSizeValue: document.querySelector("#watermarkSizeValue"),
  watermarkMaxEdge: document.querySelector("#watermarkMaxEdge"),
  compressRunBtn: document.querySelector("#compressRunBtn"),
  removeBgApplyBtn: document.querySelector("#removeBgApplyBtn"),
  removeBgBatchBtn: document.querySelector("#removeBgBatchBtn"),
  removeBgUndoBtn: document.querySelector("#removeBgUndoBtn"),
  watermarkApplyBtn: document.querySelector("#watermarkApplyBtn"),
  watermarkBatchBtn: document.querySelector("#watermarkBatchBtn"),
  watermarkUndoBtn: document.querySelector("#watermarkUndoBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  currentPreview: document.querySelector("#currentPreview"),
  currentName: document.querySelector("#currentName"),
  currentSize: document.querySelector("#currentSize"),
  queue: document.querySelector("#queue"),
  fileCount: document.querySelector("#fileCount"),
  sizeDelta: document.querySelector("#sizeDelta"),
  batchStatus: document.querySelector("#batchStatus"),
};

bindEvents();
render();

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => activateMode(button.dataset.mode));
  });

  bindRange(els.compressQuality, els.compressQualityValue);
  bindRange(els.bgTolerance, els.bgToleranceValue);
  bindRange(els.watermarkOpacity, els.watermarkOpacityValue);
  bindRange(els.watermarkSize, els.watermarkSizeValue);

  [
    els.compressFormat,
    els.compressQuality,
    els.compressMaxEdge,
    els.bgFormat,
    els.bgTolerance,
    els.bgMaxEdge,
    els.watermarkText,
    els.watermarkFormat,
    els.watermarkColor,
    els.watermarkLayout,
    els.watermarkPosition,
    els.watermarkCount,
    els.watermarkOpacity,
    els.watermarkSize,
    els.watermarkMaxEdge,
  ].forEach((control) => {
    control.addEventListener("input", render);
    control.addEventListener("change", render);
  });

  els.watermarkLayout.addEventListener("change", syncWatermarkFields);
  syncWatermarkFields();

  els.fileInput.addEventListener("change", (event) => {
    addFiles([...event.target.files]);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragover");
    });
  });

  els.dropzone.addEventListener("drop", (event) => {
    addFiles([...event.dataTransfer.files]);
  });

  els.compressRunBtn.addEventListener("click", () => runMode("compress"));
  els.removeBgApplyBtn.addEventListener("click", () => applySelected("remove-bg"));
  els.removeBgBatchBtn.addEventListener("click", () => batchApply("remove-bg"));
  els.removeBgUndoBtn.addEventListener("click", () => undoSelected("remove-bg"));
  els.watermarkApplyBtn.addEventListener("click", () => applySelected("watermark"));
  els.watermarkBatchBtn.addEventListener("click", () => batchApply("watermark"));
  els.watermarkUndoBtn.addEventListener("click", () => undoSelected("watermark"));
  els.downloadBtn.addEventListener("click", downloadResult);
  els.clearBtn.addEventListener("click", clearAll);

  els.queue.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const itemNode = event.target.closest("[data-id]");
    if (!itemNode) return;

    const item = findItem(itemNode.dataset.id);
    if (!item) return;

    if (button?.dataset.action === "download") {
      const version = currentVersion(item);
      downloadBlob(version.blob, version.name);
      return;
    }

    state.selectedId = item.id;
    render();
  });
}

function bindRange(input, output) {
  input.addEventListener("input", () => {
    output.value = input.value;
  });
}

function activateMode(mode) {
  if (!modeMeta[mode] || state.activeMode === mode) return;
  state.activeMode = mode;
  render();
}

function syncWatermarkFields() {
  const scatter = els.watermarkLayout.value === "scatter";
  els.watermarkPositionField.hidden = scatter;
  els.watermarkCountField.hidden = !scatter;
}

function addFiles(files) {
  const images = files.filter(isSupportedImageFile);
  const entries = images.map((file) => ({
    id: crypto.randomUUID(),
    originalName: file.name,
    originalSize: file.size,
    status: "ready",
    error: "",
    history: [{
      blob: file,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      label: "原图",
      mime: mimeFromFile(file),
    }],
  }));

  state.items.push(...entries);
  if (!state.selectedId && entries[0]) state.selectedId = entries[0].id;
  render();
}

function isSupportedImageFile(file) {
  if (!file) return false;
  if (file.type.startsWith("image/")) return true;
  return Boolean(extensionForFileName(file.name));
}

function mimeFromFile(file) {
  if (file?.type?.startsWith("image/")) return file.type;

  const extension = extensionForFileName(file?.name || "");
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return map[extension] || "image/png";
}

function extensionForFileName(name) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return "";
  return match[1];
}

async function applySelected(mode) {
  const item = selectedItem();
  if (!item || state.running || !canProcess(mode)) return;

  state.running = true;
  setItemStatus(item, "processing");
  render();

  try {
    const result = await processVersion(currentVersion(item), mode);
    pushVersion(item, result);
    setItemStatus(item, "done");
  } catch (error) {
    setItemStatus(item, "error", error.message || "处理失败");
  }

  state.running = false;
  render();
}

async function batchApply(mode) {
  if (state.running || state.items.length === 0 || !canProcess(mode)) return;

  state.running = true;
  render();

  for (const item of state.items) {
    setItemStatus(item, "processing");
    render();

    try {
      const result = await processVersion(currentVersion(item), mode);
      pushVersion(item, result);
      setItemStatus(item, "done");
    } catch (error) {
      setItemStatus(item, "error", error.message || "处理失败");
    }
  }

  state.running = false;
  render();
}

function runMode(mode) {
  if (state.items.length > 1) {
    return batchApply(mode);
  }
  return applySelected(mode);
}

function undoSelected(mode) {
  const item = selectedItem();
  if (!canUndo(item, mode) || state.running) return;

  const removed = item.history.pop();
  URL.revokeObjectURL(removed.url);
  setItemStatus(item, "ready");
  render();
}

function pushVersion(item, result) {
  item.history.push({
    blob: result.blob,
    url: URL.createObjectURL(result.blob),
    name: result.name,
    size: result.blob.size,
    label: result.label,
    mime: result.blob.type,
  });
}

async function processVersion(version, mode) {
  const settings = readSettings(mode, version);
  const image = await loadImage(version.blob);
  const { width, height } = scaledSize(image.width, image.height, settings.maxEdge);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });

  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  if (mode === "remove-bg") {
    removeBackground(ctx, width, height, settings.tolerance);
  }

  if (mode === "watermark") {
    drawWatermark(ctx, width, height, settings);
  }

  const outputCanvas = settings.mime === "image/jpeg" ? flattenToWhite(canvas) : canvas;
  const blob = await canvasToBlob(outputCanvas, settings.mime, settings.quality);

  return {
    blob,
    name: renameFile(version.name, settings.mime),
    label: modeMeta[mode].label,
  };
}

function readSettings(mode, version) {
  if (mode === "compress") {
    return {
      mime: els.compressFormat.value,
      quality: Number(els.compressQuality.value) / 100,
      maxEdge: numberOrEmpty(els.compressMaxEdge.value),
    };
  }

  if (mode === "remove-bg") {
    return {
      mime: els.bgFormat.value,
      quality: 0.92,
      maxEdge: numberOrEmpty(els.bgMaxEdge.value),
      tolerance: Number(els.bgTolerance.value),
    };
  }

  const text = els.watermarkText.value.trim();
  if (!text) throw new Error("请填写水印文字");

  return {
    mime: els.watermarkFormat.value,
    quality: 0.9,
    maxEdge: numberOrEmpty(els.watermarkMaxEdge.value),
    text,
    color: els.watermarkColor.value,
    layout: els.watermarkLayout.value,
    position: els.watermarkPosition.value,
    count: clamp(Number.parseInt(els.watermarkCount.value, 10) || 12, 4, 80),
    opacity: Number(els.watermarkOpacity.value) / 100,
    sizePercent: Number(els.watermarkSize.value) / 100,
    seed: `${version.name}-${version.size}-${els.watermarkLayout.value}`,
  };
}

function canProcess(mode) {
  return mode !== "watermark" || els.watermarkText.value.trim().length > 0;
}

function canUndo(item, mode) {
  return Boolean(item)
    && modeMeta[mode].undo
    && item.history.length > 1
    && currentVersion(item).label === modeMeta[mode].label;
}

function scaledSize(width, height, maxEdge) {
  const scale = Number.isFinite(maxEdge) && maxEdge > 0
    ? Math.min(1, maxEdge / Math.max(width, height))
    : 1;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function removeBackground(ctx, width, height, tolerance) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const background = sampleBackground(data, width, height);
  const fade = 30;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    const distance = Math.hypot(
      data[i] - background.r,
      data[i + 1] - background.g,
      data[i + 2] - background.b,
    );

    if (distance <= tolerance) {
      data[i + 3] = 0;
    } else if (distance <= tolerance + fade) {
      data[i + 3] = Math.round(data[i + 3] * ((distance - tolerance) / fade));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function sampleBackground(data, width, height) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const total = points.reduce((sum, [x, y]) => {
    const index = (y * width + x) * 4;
    return {
      r: sum.r + data[index],
      g: sum.g + data[index + 1],
      b: sum.b + data[index + 2],
    };
  }, { r: 0, g: 0, b: 0 });

  return {
    r: total.r / points.length,
    g: total.g / points.length,
    b: total.b / points.length,
  };
}

function drawWatermark(ctx, width, height, settings) {
  const baseFontSize = Math.max(14, Math.round(Math.min(width, height) * settings.sizePercent));

  if (settings.layout === "scatter") {
    drawScatterWatermarks(ctx, width, height, settings, baseFontSize);
    return;
  }

  drawTextWatermark(ctx, settings, getWatermarkPoint(settings.position, width, height, 0), baseFontSize);
}

function drawScatterWatermarks(ctx, width, height, settings, baseFontSize) {
  const seed = seedFromString(settings.seed);
  const random = createRng(seed);
  const padding = Math.max(18, Math.round(Math.min(width, height) * 0.08));

  for (let index = 0; index < settings.count; index += 1) {
    const point = {
      x: padding + (width - padding * 2) * random(),
      y: padding + (height - padding * 2) * random(),
      angle: -0.45 + random() * 0.9,
      scale: 0.72 + random() * 0.36,
      opacity: settings.opacity * (0.72 + random() * 0.28),
    };
    drawTextWatermark(ctx, settings, point, baseFontSize);
  }
}

function drawTextWatermark(ctx, settings, point, baseFontSize) {
  const fontSize = Math.max(14, Math.round(baseFontSize * (point.scale || 1)));
  const opacity = point.opacity || settings.opacity;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.angle || 0);
  ctx.globalAlpha = opacity;
  ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = point.align || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.09));
  ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fillStyle = settings.color;
  ctx.strokeText(settings.text, 0, 0);
  ctx.fillText(settings.text, 0, 0);
  ctx.restore();
}

function getWatermarkPoint(position, width, height, paddingBase) {
  const padding = paddingBase || Math.max(12, Math.round(Math.min(width, height) * 0.06));
  const points = {
    "top-left": { x: padding, y: padding, align: "left", angle: 0 },
    "top-right": { x: width - padding, y: padding, align: "right", angle: 0 },
    "bottom-left": { x: padding, y: height - padding, align: "left", angle: 0 },
    "bottom-right": { x: width - padding, y: height - padding, align: "right", angle: 0 },
    center: { x: width / 2, y: height / 2, align: "center", angle: 0 },
  };

  return points[position] || points["bottom-right"];
}

function seedFromString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let stateValue = seed || 1;
  return () => {
    stateValue = (stateValue * 1664525 + 1013904223) >>> 0;
    return stateValue / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function flattenToWhite(source) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = source.width;
  canvas.height = source.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((output) => {
      output ? resolve(output) : reject(new Error("当前浏览器不支持该格式"));
    }, mime, quality);
  });
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

function render() {
  syncWatermarkFields();

  const selected = selectedItem();
  const doneCount = state.items.filter((item) => item.history.length > 1).length;
  const current = selected ? currentVersion(selected) : null;
  const originalTotal = state.items.reduce((sum, item) => sum + item.originalSize, 0);
  const currentTotal = state.items.reduce((sum, item) => sum + currentVersion(item).size, 0);
  const delta = currentTotal - originalTotal;

  els.fileCount.textContent = state.items.length;
  els.sizeDelta.textContent = formatDelta(delta);
  els.batchStatus.textContent = batchStatus(doneCount);
  els.currentName.textContent = current ? current.name : "当前图片";
  els.currentSize.textContent = current ? formatSize(current.size) : "0 KB";

  els.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.activeMode);
  });
  els.modeScreens.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.screen === state.activeMode);
  });

  const hasItems = state.items.length > 0;
  const canRunCompress = Boolean(selected);
  const canRunRemoveBg = Boolean(selected);
  const canRunWatermark = Boolean(selected) && els.watermarkText.value.trim().length > 0;

  els.compressRunBtn.disabled = state.running || !canRunCompress;
  els.removeBgApplyBtn.disabled = state.running || !canRunRemoveBg;
  els.removeBgBatchBtn.disabled = state.running || !hasItems;
  els.removeBgUndoBtn.disabled = state.running || !canUndo(selected, "remove-bg");
  els.watermarkApplyBtn.disabled = state.running || !canRunWatermark;
  els.watermarkBatchBtn.disabled = state.running || !hasItems || !canRunWatermark;
  els.watermarkUndoBtn.disabled = state.running || !canUndo(selected, "watermark");
  els.downloadBtn.disabled = state.running || !hasItems;
  els.clearBtn.disabled = state.running || !hasItems;

  els.currentPreview.innerHTML = current
    ? `<img src="${current.url}" alt="${escapeHtml(current.name)}">`
    : `<div class="preview-empty">选择图片后显示</div>`;

  els.queue.innerHTML = hasItems
    ? state.items.map(renderItem).join("")
    : `<div class="empty">还没有图片</div>`;
}

function renderItem(item) {
  const current = currentVersion(item);
  const ratio = Math.round((1 - current.size / item.originalSize) * 100);
  const changed = item.history.length > 1;
  const selectedClass = item.id === state.selectedId ? " is-selected" : "";
  const status = item.status === "error"
    ? `<span class="error">${escapeHtml(item.error)}</span>`
    : statusLabel(item.status);

  return `
    <article class="item${selectedClass}" data-id="${item.id}">
      <img class="thumb" src="${current.url}" alt="${escapeHtml(item.originalName)}">
      <div class="item-main">
        <div class="name" title="${escapeHtml(item.originalName)}">${escapeHtml(item.originalName)}</div>
        <div class="item-meta">
          <span>${formatSize(item.originalSize)} -> ${formatSize(current.size)}</span>
          <span>${changed ? `${current.label}后` : "原图"}</span>
          <span>${status}</span>
          ${changed ? `<span class="save ${ratio >= 0 ? "good" : "bad"}">${ratio >= 0 ? "小了" : "大了"} ${Math.abs(ratio)}%</span>` : ""}
        </div>
      </div>
      <div class="item-actions">
        <button type="button" data-action="select">选择</button>
        <button class="small-primary" type="button" data-action="download">下载</button>
      </div>
    </article>
  `;
}

function statusLabel(status) {
  const labels = {
    ready: "待处理",
    processing: "处理中",
    done: "已应用",
  };
  return labels[status] || status;
}

function batchStatus(doneCount) {
  if (state.running) return "正在处理";
  if (state.items.length === 0) return "等待选择图片";
  if (doneCount > 0) return `已处理 ${doneCount}/${state.items.length}`;
  return "已导入，待处理";
}

function setItemStatus(item, status, error = "") {
  item.status = status;
  item.error = error;
}

function selectedItem() {
  return findItem(state.selectedId);
}

function findItem(id) {
  return state.items.find((item) => item.id === id);
}

function currentVersion(item) {
  return item.history[item.history.length - 1];
}

function clearAll() {
  for (const item of state.items) {
    item.history.forEach((version) => URL.revokeObjectURL(version.url));
  }

  state.items = [];
  state.selectedId = null;
  render();
}

function downloadCurrent() {
  const item = selectedItem();
  if (!item) return;

  const version = currentVersion(item);
  downloadBlob(version.blob, version.name);
}

function downloadResult() {
  if (state.items.length > 1) {
    return downloadZip();
  }
  return downloadCurrent();
}

async function downloadZip() {
  const files = state.items.map((item) => {
    const version = currentVersion(item);
    return { name: version.name, blob: version.blob };
  });
  if (files.length === 0) return;

  const zipBlob = await createZip(files);
  downloadBlob(zipBlob, "images-current.zip");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const name = encoder.encode(file.name);
    const crc = crc32(data);
    const time = dosTime(new Date());
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time.time), u16(time.date),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);

    chunks.push(local, data);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time.time),
      u16(time.date), u32(crc), u32(data.length), u32(data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralOffset), u16(0),
  ]);

  return new Blob([...chunks, ...central, end], { type: "application/zip" });
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function renameFile(name, mime) {
  return `${baseName(name)}.${extensionForMime(mime)}`;
}

function baseName(name) {
  return name.includes(".") ? name.replace(/\.[^.]+$/, "") : name;
}

function extensionForMime(mime) {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mime] || "png";
}

function numberOrEmpty(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSize(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDelta(bytes) {
  if (bytes === 0) return "0 KB";
  const sign = bytes > 0 ? "+" : "-";
  return `${sign}${formatSize(Math.abs(bytes))}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
