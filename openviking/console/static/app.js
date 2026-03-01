const API_BASE = "/console/api/v1";
const SESSION_KEY = "ov_console_api_key";

const state = {
  activePanel: "filesystem",
  writeEnabled: false,
  fsCurrentUri: "viking://",
  fsHistory: [],
  fsSortField: "uri",
  fsSortDirection: "asc",
  findRows: [],
  findSortField: "",
  findSortDirection: "asc",
};

const elements = {
  workspace: document.querySelector(".workspace"),
  content: document.querySelector(".content"),
  tabsTop: document.querySelector(".tabs-top"),
  panelStack: document.querySelector(".panel-stack"),
  sidebar: document.querySelector(".sidebar"),
  resultCard: document.querySelector(".result-card"),
  sidebarResizer: document.getElementById("sidebarResizer"),
  outputResizer: document.getElementById("outputResizer"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveKeyBtn: document.getElementById("saveKeyBtn"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
  connectionHint: document.getElementById("connectionHint"),
  writeBadge: document.getElementById("writeBadge"),
  output: document.getElementById("output"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  fsBackBtn: document.getElementById("fsBackBtn"),
  fsUpBtn: document.getElementById("fsUpBtn"),
  fsRefreshBtn: document.getElementById("fsRefreshBtn"),
  fsGoBtn: document.getElementById("fsGoBtn"),
  fsCurrentUri: document.getElementById("fsCurrentUri"),
  fsEntries: document.getElementById("fsEntries"),
  fsSortHeaders: document.querySelectorAll(".fs-sort-btn"),
  fsTable: document.querySelector(".fs-table"),
  findQuery: document.getElementById("findQuery"),
  findTarget: document.getElementById("findTarget"),
  findBtn: document.getElementById("findBtn"),
  findResultsHead: document.getElementById("findResultsHead"),
  findResultsBody: document.getElementById("findResultsBody"),
  addResourcePath: document.getElementById("addResourcePath"),
  addResourceFile: document.getElementById("addResourceFile"),
  addResourceTarget: document.getElementById("addResourceTarget"),
  addResourceWait: document.getElementById("addResourceWait"),
  addResourceStrict: document.getElementById("addResourceStrict"),
  addResourceUploadMedia: document.getElementById("addResourceUploadMedia"),
  addResourceTimeout: document.getElementById("addResourceTimeout"),
  addResourceIgnoreDirs: document.getElementById("addResourceIgnoreDirs"),
  addResourceInclude: document.getElementById("addResourceInclude"),
  addResourceExclude: document.getElementById("addResourceExclude"),
  addResourceReason: document.getElementById("addResourceReason"),
  addResourceInstruction: document.getElementById("addResourceInstruction"),
  addResourceBtn: document.getElementById("addResourceBtn"),
  addResourceUploadBtn: document.getElementById("addResourceUploadBtn"),
  accountsBtn: document.getElementById("accountsBtn"),
  createAccountBtn: document.getElementById("createAccountBtn"),
  usersAccountId: document.getElementById("usersAccountId"),
  usersBtn: document.getElementById("usersBtn"),
  tenantResults: document.getElementById("tenantResults"),
  systemBtn: document.getElementById("systemBtn"),
  observerBtn: document.getElementById("observerBtn"),
  monitorResults: document.getElementById("monitorResults"),
};

const layoutLimits = {
  minSidebar: 200,
  maxSidebar: 560,
  minPanel: 0,
  minResult: 48,
};

function setOutput(value) {
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  elements.output.textContent = content;
}

function setActivePanel(panel) {
  state.activePanel = panel;
  for (const tab of elements.tabs) {
    tab.classList.toggle("active", tab.dataset.panel === panel);
  }
  for (const panelNode of elements.panels) {
    panelNode.classList.toggle("active", panelNode.id === `panel-${panel}`);
  }
}

function getApiKey() {
  return window.sessionStorage.getItem(SESSION_KEY) || "";
}

function updateConnectionHint() {
  const key = getApiKey();
  elements.connectionHint.textContent = key
    ? `API key loaded in session (${key.length} chars).`
    : "No API key in session.";
}

async function callConsole(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({
    status: "error",
    error: {
      code: "BAD_RESPONSE",
      message: "Invalid JSON response from console",
    },
  }));

  if (!response.ok) {
    const message = payload.error?.message || `Request failed with status ${response.status}`;
    throw new Error(`${payload.error?.code || "ERROR"}: ${message}`);
  }

  return payload;
}

function normalizeDirUri(uri) {
  const value = (uri || "").trim();
  if (!value) {
    return "viking://";
  }
  if (value === "viking://") {
    return value;
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function parentUri(uri) {
  const normalized = normalizeDirUri(uri);
  if (normalized === "viking://") {
    return normalized;
  }

  const scheme = "viking://";
  if (!normalized.startsWith(scheme)) {
    return scheme;
  }

  const withoutTrailingSlash = normalized.slice(0, -1);
  const body = withoutTrailingSlash.slice(scheme.length);
  if (!body.includes("/")) {
    return scheme;
  }

  const prefix = body.slice(0, body.lastIndexOf("/") + 1);
  return `${scheme}${prefix}`;
}

function joinUri(baseUri, child) {
  const raw = String(child || "").trim();
  if (!raw) {
    return normalizeDirUri(baseUri);
  }
  if (raw.startsWith("viking://")) {
    return raw;
  }

  const normalizedBase = normalizeDirUri(baseUri);
  const cleanedChild = raw.replace(/^\//, "");
  return `${normalizedBase}${cleanedChild}`;
}

function pickFirstNonEmpty(candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") {
      return candidate;
    }
  }
  return null;
}

function normalizeFsEntries(result, currentUri) {
  const toEntry = (item) => {
    if (typeof item === "string") {
      const rawName = item.trim();
      const isDir = rawName.endsWith("/");
      const resolvedUri = joinUri(currentUri, rawName);
      return {
        uri: isDir ? normalizeDirUri(resolvedUri) : resolvedUri,
        size: null,
        isDir,
        modTime: null,
        abstract: "",
      };
    }

    if (item && typeof item === "object") {
      const baseLabel =
        item.name || item.path || item.relative_path || item.uri || item.id || JSON.stringify(item);
      const isDir =
        Boolean(item.is_dir) ||
        Boolean(item.isDir) ||
        item.type === "dir" ||
        item.type === "directory" ||
        item.kind === "dir" ||
        String(baseLabel).endsWith("/");
      const rawUri = item.uri || item.path || item.relative_path || baseLabel;
      const resolvedUri = joinUri(currentUri, rawUri);
      const size = pickFirstNonEmpty([
        item.size,
        item.size_bytes,
        item.content_length,
        item.contentLength,
        item.bytes,
      ]);
      const modTime = pickFirstNonEmpty([
        item.modTime,
        item.mod_time,
        item.mtime,
        item.modified_at,
        item.modifiedAt,
        item.updated_at,
        item.updatedAt,
        item.last_modified,
        item.lastModified,
        item.timestamp,
        item.time,
      ]);
      const abstract = pickFirstNonEmpty([
        item.abstract,
        item.summary,
        item.description,
        item.desc,
      ]);

      return {
        uri: isDir ? normalizeDirUri(resolvedUri) : resolvedUri,
        size,
        isDir,
        modTime,
        abstract: abstract === null ? "" : String(abstract),
      };
    }

    return {
      uri: joinUri(currentUri, String(item)),
      size: null,
      isDir: false,
      modTime: null,
      abstract: "",
    };
  };

  if (Array.isArray(result)) {
    return result.map(toEntry);
  }

  if (result && typeof result === "object") {
    const candidates = [result.entries, result.items, result.children, result.results];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map(toEntry);
      }
    }
  }

  if (typeof result === "string") {
    return result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(toEntry);
  }

  return [];
}

function normalizeSortString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).toLowerCase();
}

function toSortableNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toSortableTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.getTime();
  }
  return toSortableNumber(value);
}

function compareNullable(left, right, compareFn) {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";
  if (leftMissing && rightMissing) {
    return 0;
  }
  if (leftMissing) {
    return 1;
  }
  if (rightMissing) {
    return -1;
  }
  return compareFn(left, right);
}

function compareFsEntries(left, right, field) {
  switch (field) {
    case "size":
      return compareNullable(left.size, right.size, (a, b) => {
        const leftNum = toSortableNumber(a);
        const rightNum = toSortableNumber(b);
        if (leftNum !== null && rightNum !== null) {
          return leftNum - rightNum;
        }
        return normalizeSortString(a).localeCompare(normalizeSortString(b));
      });
    case "isDir":
      return Number(left.isDir) - Number(right.isDir);
    case "modTime":
      return compareNullable(left.modTime, right.modTime, (a, b) => {
        const leftTime = toSortableTime(a);
        const rightTime = toSortableTime(b);
        if (leftTime !== null && rightTime !== null) {
          return leftTime - rightTime;
        }
        return normalizeSortString(a).localeCompare(normalizeSortString(b));
      });
    case "abstract":
      return compareNullable(left.abstract, right.abstract, (a, b) =>
        normalizeSortString(a).localeCompare(normalizeSortString(b))
      );
    case "uri":
    default:
      return normalizeSortString(left.uri).localeCompare(normalizeSortString(right.uri));
  }
}

function sortFilesystemEntries(entries) {
  const sorted = [...entries].sort((left, right) =>
    compareFsEntries(left, right, state.fsSortField)
  );
  if (state.fsSortDirection === "desc") {
    sorted.reverse();
  }
  return sorted;
}

function updateFilesystemSortHeaders() {
  for (const button of elements.fsSortHeaders) {
    const field = button.dataset.fsSort || "";
    const isActive = field === state.fsSortField;
    button.classList.toggle("active", isActive);
    button.setAttribute(
      "aria-sort",
      isActive ? (state.fsSortDirection === "asc" ? "ascending" : "descending") : "none"
    );
    const suffix = !isActive ? "" : state.fsSortDirection === "asc" ? " ↑" : " ↓";
    button.textContent = `${field}${suffix}`;
  }
}

function bindFilesystemSort() {
  for (const button of elements.fsSortHeaders) {
    button.addEventListener("click", async () => {
      const field = button.dataset.fsSort;
      if (!field) {
        return;
      }

      if (state.fsSortField === field) {
        state.fsSortDirection = state.fsSortDirection === "asc" ? "desc" : "asc";
      } else {
        state.fsSortField = field;
        state.fsSortDirection = "asc";
      }

      updateFilesystemSortHeaders();

      try {
        await loadFilesystem(state.fsCurrentUri);
      } catch (error) {
        setOutput(error.message);
      }
    });
  }
}

function initFsColumnResize() {
  if (!elements.fsTable) {
    return;
  }

  const headers = elements.fsTable.querySelectorAll("thead th");
  for (const header of headers) {
    if (header.dataset.resizable === "false") {
      continue;
    }
    if (header.querySelector(".fs-col-resizer")) {
      continue;
    }

    const handle = document.createElement("div");
    handle.className = "fs-col-resizer";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", "Resize column");
    header.appendChild(handle);

    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.body.classList.add("dragging-fs-column");

      const startX = event.clientX;
      const startWidth = header.getBoundingClientRect().width;
      const minWidth = Number.parseFloat(header.dataset.minWidth || "90");

      handle.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), minWidth, 1200);
        header.style.width = `${nextWidth}px`;
        header.style.minWidth = `${nextWidth}px`;
      };

      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("dragging-fs-column");
        handle.releasePointerCapture(event.pointerId);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }
}

function normalizeReadContent(result) {
  if (typeof result === "string") {
    return result;
  }
  if (Array.isArray(result)) {
    return result.map((item) => String(item)).join("\n");
  }
  if (result && typeof result === "object") {
    const content = pickFirstNonEmpty([
      result.content,
      result.text,
      result.body,
      result.value,
      result.data,
    ]);
    if (content !== null) {
      return typeof content === "string" ? content : JSON.stringify(content, null, 2);
    }
  }
  return JSON.stringify(result, null, 2);
}

async function readFilesystemFile(entry) {
  const uri = String(entry?.uri || "").replace(/\/$/, "");
  if (!uri) {
    throw new Error("Invalid file uri.");
  }

  setOutput(`Reading ${uri} ...`);
  const payload = await callConsole(
    `/ov/content/read?uri=${encodeURIComponent(uri)}&offset=0&limit=-1`,
    { method: "GET" }
  );
  const content = normalizeReadContent(payload.result);
  setOutput(content && content.trim() ? content : "(empty file)");
}

async function statFilesystemResource(entry) {
  let uri = String(entry?.uri || "").trim();
  if (!uri) {
    throw new Error("Invalid resource uri.");
  }
  if (uri !== "viking://") {
    uri = uri.replace(/\/$/, "");
  }

  const payload = await callConsole(`/ov/fs/stat?uri=${encodeURIComponent(uri)}`, { method: "GET" });
  setOutput(payload);
}

function renderFilesystemEntries(target, rows, onOpen, onOpenContent) {
  target.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "fs-empty";
    td.textContent = "No data";
    tr.appendChild(td);
    target.appendChild(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");

    const actionCell = document.createElement("td");
    actionCell.className = "fs-col-action";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "fs-open-btn";
    openBtn.title = "Show stat info";
    openBtn.setAttribute("aria-label", `Show stat info for ${row.uri}`);
    openBtn.textContent = "ⓘ";
    openBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await onOpenContent(row);
      } catch (error) {
        setOutput(error.message);
      }
    });
    actionCell.appendChild(openBtn);
    tr.appendChild(actionCell);

    const uriCell = document.createElement("td");
    uriCell.className = "fs-col-uri";
    const uriBtn = document.createElement("button");
    uriBtn.type = "button";
    uriBtn.className = "fs-uri-btn";
    uriBtn.textContent = row.uri || "-";
    uriBtn.addEventListener("click", () => onOpen(row));
    uriCell.appendChild(uriBtn);
    tr.appendChild(uriCell);

    const sizeCell = document.createElement("td");
    sizeCell.className = "fs-col-size";
    sizeCell.textContent = row.size === null || row.size === undefined || row.size === "" ? "-" : String(row.size);
    tr.appendChild(sizeCell);

    const dirCell = document.createElement("td");
    dirCell.className = "fs-col-dir";
    dirCell.textContent = row.isDir ? "true" : "false";
    tr.appendChild(dirCell);

    const modTimeCell = document.createElement("td");
    modTimeCell.className = "fs-col-mod-time";
    modTimeCell.textContent =
      row.modTime === null || row.modTime === undefined || row.modTime === ""
        ? "-"
        : String(row.modTime);
    tr.appendChild(modTimeCell);

    const abstractCell = document.createElement("td");
    abstractCell.className = "fs-col-abstract";
    abstractCell.textContent = row.abstract || "-";
    tr.appendChild(abstractCell);

    target.appendChild(tr);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractDeepestObjectArray(value) {
  const best = { depth: -1, rows: null };

  const visit = (current, depth) => {
    if (Array.isArray(current)) {
      if (current.length > 0 && current.every((item) => isRecord(item))) {
        if (depth > best.depth) {
          best.depth = depth;
          best.rows = current;
        }
      }

      for (const item of current) {
        visit(item, depth + 1);
      }
      return;
    }

    if (!isRecord(current)) {
      return;
    }

    for (const nested of Object.values(current)) {
      visit(nested, depth + 1);
    }
  };

  visit(value, 0);
  return best.rows;
}

function normalizeFindRows(result) {
  const deepestRows = extractDeepestObjectArray(result);
  if (deepestRows) {
    return deepestRows;
  }

  if (Array.isArray(result)) {
    return result.map((item) => (isRecord(item) ? item : { value: item }));
  }

  if (isRecord(result)) {
    return [result];
  }

  if (result === null || result === undefined) {
    return [];
  }

  return [{ value: result }];
}

function collectFindColumns(rows) {
  const columns = [];
  const seen = new Set();

  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }

    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

function formatFindCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function toFindComparable(value) {
  if (value === null || value === undefined || value === "") {
    return { missing: true, type: "missing", value: "" };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { missing: false, type: "number", value };
  }

  if (typeof value === "boolean") {
    return { missing: false, type: "number", value: Number(value) };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const asNumber = Number.parseFloat(trimmed);
    if (trimmed !== "" && Number.isFinite(asNumber)) {
      return { missing: false, type: "number", value: asNumber };
    }

    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.getTime())) {
      return { missing: false, type: "date", value: asDate.getTime() };
    }

    return { missing: false, type: "string", value: trimmed.toLowerCase() };
  }

  return { missing: false, type: "string", value: JSON.stringify(value).toLowerCase() };
}

function compareFindValues(left, right) {
  const leftValue = toFindComparable(left);
  const rightValue = toFindComparable(right);

  if (leftValue.missing && rightValue.missing) {
    return 0;
  }
  if (leftValue.missing) {
    return 1;
  }
  if (rightValue.missing) {
    return -1;
  }

  if (leftValue.type === rightValue.type && (leftValue.type === "number" || leftValue.type === "date")) {
    return leftValue.value - rightValue.value;
  }

  return String(leftValue.value).localeCompare(String(rightValue.value));
}

function sortFindRows(rows, column, direction) {
  const sorted = [...rows].sort((left, right) => {
    const leftCell = isRecord(left) ? left[column] : undefined;
    const rightCell = isRecord(right) ? right[column] : undefined;
    return compareFindValues(leftCell, rightCell);
  });

  if (direction === "desc") {
    sorted.reverse();
  }
  return sorted;
}

function renderFindTable(rows) {
  state.findRows = rows;
  elements.findResultsHead.innerHTML = "";
  elements.findResultsBody.innerHTML = "";

  const columns = collectFindColumns(rows);
  if (!columns.length) {
    columns.push("value");
  }

  if (!state.findSortField || !columns.includes(state.findSortField)) {
    state.findSortField = columns[0];
    state.findSortDirection = "asc";
  }

  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";

    const sortBtn = document.createElement("button");
    sortBtn.type = "button";
    sortBtn.className = "find-sort-btn";
    sortBtn.dataset.findSort = column;

    const isActive = state.findSortField === column;
    const sortLabel = isActive ? (state.findSortDirection === "asc" ? " ↑" : " ↓") : "";
    sortBtn.textContent = `${column}${sortLabel}`;
    sortBtn.setAttribute(
      "aria-sort",
      isActive ? (state.findSortDirection === "asc" ? "ascending" : "descending") : "none"
    );

    sortBtn.addEventListener("click", () => {
      if (state.findSortField === column) {
        state.findSortDirection = state.findSortDirection === "asc" ? "desc" : "asc";
      } else {
        state.findSortField = column;
        state.findSortDirection = "asc";
      }
      renderFindTable(state.findRows);
    });

    th.appendChild(sortBtn);
    headerRow.appendChild(th);
  }
  elements.findResultsHead.appendChild(headerRow);

  if (!rows.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = columns.length;
    emptyCell.className = "find-empty";
    emptyCell.textContent = "No data";
    emptyRow.appendChild(emptyCell);
    elements.findResultsBody.appendChild(emptyRow);
    return;
  }

  const sortedRows = sortFindRows(rows, state.findSortField, state.findSortDirection);
  for (const row of sortedRows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      const cellValue = isRecord(row) ? row[column] : undefined;
      td.textContent = formatFindCellValue(cellValue);
      tr.appendChild(td);
    }
    elements.findResultsBody.appendChild(tr);
  }
}

function renderList(target, rows, onClick) {
  target.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.innerHTML = '<div class="row-item">No data</div>';
    target.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const li = document.createElement("li");
    if (onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = row.label;
      button.addEventListener("click", () => onClick(row));
      li.appendChild(button);
    } else {
      const div = document.createElement("div");
      div.className = "row-item";
      div.textContent = row.label;
      li.appendChild(div);
    }
    target.appendChild(li);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function initResizablePanes() {
  const rootStyle = document.documentElement.style;

  if (elements.sidebarResizer && elements.sidebar) {
    elements.sidebarResizer.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        return;
      }
      event.preventDefault();
      document.body.classList.add("dragging-sidebar");
      elements.sidebarResizer.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = elements.sidebar.getBoundingClientRect().width;

      const onMove = (moveEvent) => {
        const nextWidth = clamp(
          startWidth + (moveEvent.clientX - startX),
          layoutLimits.minSidebar,
          layoutLimits.maxSidebar
        );
        rootStyle.setProperty("--sidebar-width", `${nextWidth}px`);
      };

      const onUp = () => {
        elements.sidebarResizer.removeEventListener("pointermove", onMove);
        elements.sidebarResizer.removeEventListener("pointerup", onUp);
        elements.sidebarResizer.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("dragging-sidebar");
        elements.sidebarResizer.releasePointerCapture(event.pointerId);
      };

      elements.sidebarResizer.addEventListener("pointermove", onMove);
      elements.sidebarResizer.addEventListener("pointerup", onUp);
      elements.sidebarResizer.addEventListener("pointercancel", onUp);
    });
  }

  if (elements.outputResizer && elements.resultCard) {
    elements.outputResizer.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        return;
      }
      event.preventDefault();
      document.body.classList.add("dragging-output");
      elements.outputResizer.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight =
        elements.panelStack?.getBoundingClientRect().height || layoutLimits.minPanel;

      const onMove = (moveEvent) => {
        const contentHeight = elements.content?.getBoundingClientRect().height || window.innerHeight;
        const tabsHeight = elements.tabsTop?.getBoundingClientRect().height || 0;
        const resizerHeight = elements.outputResizer.getBoundingClientRect().height || 8;
        const rowGap = Number.parseFloat(
          window.getComputedStyle(elements.content || document.body).rowGap || "0"
        );
        const totalGap = Number.isFinite(rowGap) ? rowGap * 3 : 0;
        const maxPanel = Math.max(
          layoutLimits.minPanel,
          contentHeight - tabsHeight - resizerHeight - layoutLimits.minResult - totalGap
        );
        const nextHeight = clamp(
          startHeight + (moveEvent.clientY - startY),
          layoutLimits.minPanel,
          maxPanel
        );
        rootStyle.setProperty("--panel-height", `${nextHeight}px`);
      };

      const onUp = () => {
        elements.outputResizer.removeEventListener("pointermove", onMove);
        elements.outputResizer.removeEventListener("pointerup", onUp);
        elements.outputResizer.removeEventListener("pointercancel", onUp);
        document.body.classList.remove("dragging-output");
        elements.outputResizer.releasePointerCapture(event.pointerId);
      };

      elements.outputResizer.addEventListener("pointermove", onMove);
      elements.outputResizer.addEventListener("pointerup", onUp);
      elements.outputResizer.addEventListener("pointercancel", onUp);
    });
  }
}

async function loadFilesystem(uri, { pushHistory = false } = {}) {
  const targetUri = normalizeDirUri(uri);
  const payload = await callConsole(
    `/ov/fs/ls?uri=${encodeURIComponent(targetUri)}&show_all_hidden=true`,
    { method: "GET" }
  );

  if (pushHistory && state.fsCurrentUri !== targetUri) {
    state.fsHistory.push(state.fsCurrentUri);
  }

  state.fsCurrentUri = targetUri;
  elements.fsCurrentUri.value = targetUri;

  const entries = sortFilesystemEntries(normalizeFsEntries(payload.result, targetUri));

  renderFilesystemEntries(
    elements.fsEntries,
    entries,
    async (entry) => {
      if (entry.isDir) {
        try {
          await loadFilesystem(entry.uri, { pushHistory: true });
        } catch (error) {
          setOutput(error.message);
        }
        return;
      }
      try {
        await readFilesystemFile(entry);
      } catch (error) {
        setOutput(error.message);
      }
    },
    async (entry) => {
      await statFilesystemResource(entry);
    }
  );

  setOutput(payload);
}

async function refreshCapabilities() {
  try {
    const payload = await callConsole("/runtime/capabilities", { method: "GET" });
    state.writeEnabled = Boolean(payload.result?.write_enabled);
    elements.writeBadge.textContent = state.writeEnabled ? "Write Enabled" : "Readonly";
    elements.writeBadge.classList.toggle("write", state.writeEnabled);
    elements.createAccountBtn.disabled = !state.writeEnabled;
    elements.addResourceBtn.disabled = !state.writeEnabled;
    elements.addResourceUploadBtn.disabled = !state.writeEnabled;
  } catch (error) {
    setOutput(`Failed to load capabilities: ${error.message}`);
  }
}

function bindTabs() {
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => setActivePanel(tab.dataset.panel));
  }
}

function bindConnection() {
  elements.saveKeyBtn.addEventListener("click", () => {
    const value = elements.apiKeyInput.value.trim();
    if (!value) {
      setOutput("API key is empty.");
      return;
    }

    window.sessionStorage.setItem(SESSION_KEY, value);
    elements.apiKeyInput.value = "";
    updateConnectionHint();
    setOutput("API key saved in browser session storage.");
  });

  elements.clearKeyBtn.addEventListener("click", () => {
    window.sessionStorage.removeItem(SESSION_KEY);
    updateConnectionHint();
    setOutput("API key cleared from browser session.");
  });
}

function bindFilesystem() {
  bindFilesystemSort();
  updateFilesystemSortHeaders();

  elements.fsGoBtn.addEventListener("click", async () => {
    try {
      await loadFilesystem(elements.fsCurrentUri.value, { pushHistory: true });
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.fsRefreshBtn.addEventListener("click", async () => {
    try {
      await loadFilesystem(state.fsCurrentUri);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.fsBackBtn.addEventListener("click", async () => {
    if (!state.fsHistory.length) {
      setOutput("No previous directory.");
      return;
    }

    const previous = state.fsHistory.pop();
    try {
      await loadFilesystem(previous);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.fsUpBtn.addEventListener("click", async () => {
    const parent = parentUri(state.fsCurrentUri);
    if (parent === state.fsCurrentUri) {
      setOutput("Already at viking:// root.");
      return;
    }

    state.fsHistory.push(state.fsCurrentUri);
    try {
      await loadFilesystem(parent);
    } catch (error) {
      setOutput(error.message);
    }
  });
}

function bindFind() {
  elements.findBtn.addEventListener("click", async () => {
    const query = elements.findQuery.value.trim();
    if (!query) {
      setOutput("Query cannot be empty.");
      return;
    }

    try {
      const payload = await callConsole("/ov/search/find", {
        method: "POST",
        body: JSON.stringify({
          query,
          target_uri: elements.findTarget.value.trim(),
          limit: 10,
        }),
      });

      const rows = normalizeFindRows(payload.result);
      renderFindTable(rows);
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });
}

function buildAddResourcePayload() {
  const payload = {
    target: elements.addResourceTarget.value.trim(),
    reason: elements.addResourceReason.value.trim(),
    instruction: elements.addResourceInstruction.value.trim(),
    wait: elements.addResourceWait.checked,
    strict: elements.addResourceStrict.checked,
    directly_upload_media: elements.addResourceUploadMedia.checked,
  };

  const timeoutRaw = elements.addResourceTimeout.value.trim();
  if (timeoutRaw) {
    const timeout = Number.parseFloat(timeoutRaw);
    if (Number.isFinite(timeout) && timeout > 0) {
      payload.timeout = timeout;
    }
  }

  const ignoreDirs = elements.addResourceIgnoreDirs.value.trim();
  if (ignoreDirs) {
    payload.ignore_dirs = ignoreDirs;
  }

  const include = elements.addResourceInclude.value.trim();
  if (include) {
    payload.include = include;
  }

  const exclude = elements.addResourceExclude.value.trim();
  if (exclude) {
    payload.exclude = exclude;
  }

  return payload;
}

function bindAddResource() {
  elements.addResourceBtn.addEventListener("click", async () => {
    if (!state.writeEnabled) {
      setOutput("Write mode is disabled on the server.");
      return;
    }

    const path = elements.addResourcePath.value.trim();
    if (!path) {
      setOutput("Path cannot be empty. Or use Upload & Add.");
      return;
    }

    try {
      const payload = await callConsole("/ov/resources", {
        method: "POST",
        body: JSON.stringify({
          ...buildAddResourcePayload(),
          path,
        }),
      });
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.addResourceUploadBtn.addEventListener("click", async () => {
    if (!state.writeEnabled) {
      setOutput("Write mode is disabled on the server.");
      return;
    }

    const file = elements.addResourceFile.files?.[0];
    if (!file) {
      setOutput("Please select a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setOutput(`Uploading ${file.name} ...`);
      const uploadPayload = await callConsole("/ov/resources/temp_upload", {
        method: "POST",
        body: formData,
      });
      const tempPath = uploadPayload.result?.temp_path;
      if (!tempPath) {
        throw new Error("Temp upload did not return temp_path.");
      }

      const addPayload = await callConsole("/ov/resources", {
        method: "POST",
        body: JSON.stringify({
          ...buildAddResourcePayload(),
          temp_path: tempPath,
        }),
      });

      setOutput({
        status: "ok",
        result: {
          upload: uploadPayload.result,
          add_resource: addPayload.result,
        },
      });
    } catch (error) {
      setOutput(error.message);
    }
  });
}

function bindTenants() {
  elements.accountsBtn.addEventListener("click", async () => {
    try {
      const payload = await callConsole("/ov/admin/accounts", { method: "GET" });
      const accounts = Array.isArray(payload.result) ? payload.result : [];
      renderList(
        elements.tenantResults,
        accounts.map((item) => ({
          label: typeof item === "string" ? item : JSON.stringify(item),
        }))
      );
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.createAccountBtn.addEventListener("click", async () => {
    if (!state.writeEnabled) {
      setOutput("Write mode is disabled on the server.");
      return;
    }

    const accountId = window.prompt("Account ID");
    const adminUserId = window.prompt("First admin user ID", "admin");
    if (!accountId || !adminUserId) {
      return;
    }

    const confirmation = window.prompt(`Type ${accountId} to confirm`);
    if (confirmation !== accountId) {
      setOutput("Confirmation mismatch. Operation cancelled.");
      return;
    }

    try {
      const payload = await callConsole("/ov/admin/accounts", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId, admin_user_id: adminUserId }),
      });
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.usersBtn.addEventListener("click", async () => {
    const accountId = elements.usersAccountId.value.trim();
    if (!accountId) {
      setOutput("Please input account_id first.");
      return;
    }

    try {
      const payload = await callConsole(`/ov/admin/accounts/${encodeURIComponent(accountId)}/users`, {
        method: "GET",
      });
      const users = Array.isArray(payload.result) ? payload.result : [];
      renderList(
        elements.tenantResults,
        users.map((item) => ({
          label: typeof item === "string" ? item : JSON.stringify(item),
        }))
      );
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });
}

function bindMonitor() {
  elements.systemBtn.addEventListener("click", async () => {
    try {
      const payload = await callConsole("/ov/system/status", { method: "GET" });
      const rows = Object.entries(payload.result || {}).map(([key, value]) => ({
        label: `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      }));
      renderList(elements.monitorResults, rows);
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });

  elements.observerBtn.addEventListener("click", async () => {
    try {
      const payload = await callConsole("/ov/observer/system", { method: "GET" });
      const rows = Object.entries(payload.result?.components || {}).map(([name, value]) => ({
        label: `${name}: ${value?.status || JSON.stringify(value)}`,
      }));
      renderList(elements.monitorResults, rows);
      setOutput(payload);
    } catch (error) {
      setOutput(error.message);
    }
  });
}

async function init() {
  initResizablePanes();
  initFsColumnResize();
  bindTabs();
  bindConnection();
  bindFilesystem();
  bindFind();
  renderFindTable([]);
  bindAddResource();
  bindTenants();
  bindMonitor();
  updateConnectionHint();
  setActivePanel("filesystem");
  await refreshCapabilities();

  try {
    await loadFilesystem("viking://");
  } catch (error) {
    setOutput(error.message);
  }
}

init();
