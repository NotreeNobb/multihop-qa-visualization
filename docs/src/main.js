const state = {
  data: null,
  filtered: [],
  selected: null,
};

const clusterLabels = {
  creative_work: "作品创作",
  person_family: "人物亲属",
  location: "地理位置",
  organization: "组织机构",
  time: "时间日期",
  other: "其他关系",
};

const clusterColors = {
  creative_work: "#21605a",
  person_family: "#bf5b45",
  location: "#386ca3",
  organization: "#7b679c",
  time: "#b9822a",
  other: "#6a7370",
};

const el = {
  metricQuestions: document.querySelector("#metricQuestions"),
  metricNodes: document.querySelector("#metricNodes"),
  metricEdges: document.querySelector("#metricEdges"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  chatInput: document.querySelector("#chatInput"),
  chatButton: document.querySelector("#chatButton"),
  chatMessages: document.querySelector("#chatMessages"),
  typeFilter: document.querySelector("#typeFilter"),
  clusterFilter: document.querySelector("#clusterFilter"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
  graphSvg: document.querySelector("#graphSvg"),
  graphHint: document.querySelector("#graphHint"),
  selectedType: document.querySelector("#selectedType"),
  selectedQuestion: document.querySelector("#selectedQuestion"),
  selectedAnswer: document.querySelector("#selectedAnswer"),
  chainList: document.querySelector("#chainList"),
  contextList: document.querySelector("#contextList"),
  supportCount: document.querySelector("#supportCount"),
  typeChart: document.querySelector("#typeChart"),
  clusterChart: document.querySelector("#clusterChart"),
  relationList: document.querySelector("#relationList"),
};

init();

async function init() {
  const response = await fetch("data/app_data.json");
  state.data = await response.json();
  state.filtered = state.data.questions;
  state.selected = state.filtered[0];

  renderMeta();
  renderFilters();
  renderCharts();
  renderRelations();
  applyFilters();

  el.searchButton.addEventListener("click", applyFilters);
  el.searchInput.addEventListener("input", debounce(applyFilters, 160));
  el.typeFilter.addEventListener("change", applyFilters);
  el.clusterFilter.addEventListener("change", applyFilters);
  el.chatButton.addEventListener("click", askDatasetQuestion);
  el.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") askDatasetQuestion();
  });
}

function renderMeta() {
  el.metricQuestions.textContent = state.data.meta.sampleSize.toLocaleString();
  el.metricNodes.textContent = state.data.meta.nodeCount.toLocaleString();
  el.metricEdges.textContent = state.data.meta.edgeCount.toLocaleString();
}

function renderFilters() {
  Object.keys(state.data.questionTypeCounts)
    .sort()
    .forEach((type) => {
      el.typeFilter.append(new Option(type, type));
    });

  Object.keys(state.data.clusterCounts)
    .sort()
    .forEach((cluster) => {
      el.clusterFilter.append(new Option(clusterLabels[cluster] || cluster, cluster));
    });
}

function applyFilters() {
  const query = normalize(el.searchInput.value);
  const type = el.typeFilter.value;
  const cluster = el.clusterFilter.value;

  state.filtered = state.data.questions.filter((item) => {
    const text = normalize(
      [
        item.question,
        item.answer,
        item.type,
        ...item.chain.flatMap((hop) => [hop.source, hop.relation, hop.target, hop.cluster]),
      ].join(" ")
    );
    const matchesQuery = !query || text.includes(query);
    const matchesType = type === "all" || item.type === type;
    const matchesCluster = cluster === "all" || item.chain.some((hop) => hop.cluster === cluster);
    return matchesQuery && matchesType && matchesCluster;
  });

  if (!state.filtered.includes(state.selected)) {
    state.selected = state.filtered[0] || null;
  }

  renderResults();
  renderSelected();
}

function renderResults() {
  el.resultCount.textContent = state.filtered.length.toLocaleString();
  el.resultList.innerHTML = "";

  if (state.filtered.length === 0) {
    el.resultList.innerHTML = '<div class="empty-state">没有匹配结果</div>';
    return;
  }

  state.filtered.slice(0, 80).forEach((item) => {
    const card = document.createElement("article");
    card.className = `result-card ${state.selected?.id === item.id ? "active" : ""}`;
    card.innerHTML = `
      <strong>${escapeHtml(item.question)}</strong>
      <span>${escapeHtml(item.type)} · ${escapeHtml(item.answer)}</span>
    `;
    card.addEventListener("click", () => {
      state.selected = item;
      renderResults();
      renderSelected();
    });
    el.resultList.append(card);
  });
}

function renderSelected() {
  if (!state.selected) {
    el.selectedType.textContent = "-";
    el.selectedQuestion.textContent = "没有可展示的问题";
    el.selectedAnswer.textContent = "";
    el.chainList.innerHTML = "";
    el.contextList.innerHTML = "";
    el.graphSvg.innerHTML = "";
    return;
  }

  const item = state.selected;
  el.selectedType.textContent = item.type;
  el.selectedQuestion.textContent = item.question;
  el.selectedAnswer.textContent = `答案：${item.answer}`;
  el.graphHint.textContent = `${item.chain.length} 跳推理路径`;

  el.chainList.innerHTML = item.chain
    .map(
      (hop) => `
        <li>
          <strong>${escapeHtml(hop.source)}</strong>
          <span> --[${escapeHtml(hop.relation)}]→ </span>
          <strong>${escapeHtml(hop.target)}</strong>
          <br />
          <small>${clusterLabels[hop.cluster] || hop.cluster}</small>
        </li>
      `
    )
    .join("");

  el.supportCount.textContent = item.supportingFacts.length;
  el.contextList.innerHTML = item.context
    .map(
      (doc) => `
        <div class="context-item">
          <strong>${escapeHtml(doc.title)}</strong>
          ${doc.sentences.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join("")}
        </div>
      `
    )
    .join("");

  renderGraph(item);
}

function renderGraph(item) {
  const svg = el.graphSvg;
  svg.innerHTML = "";

  const entities = [];
  item.chain.forEach((hop) => {
    if (!entities.includes(hop.source)) entities.push(hop.source);
    if (!entities.includes(hop.target)) entities.push(hop.target);
  });

  const width = 900;
  const height = 520;
  const step = width / Math.max(entities.length, 2);
  const positions = new Map();
  entities.forEach((entity, index) => {
    positions.set(entity, {
      x: step * index + step / 2,
      y: height / 2 + (index % 2 === 0 ? -34 : 34),
    });
  });

  const defs = createSvg("defs");
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#53615d"></path>
    </marker>
  `;
  svg.append(defs);

  item.chain.forEach((hop) => {
    const source = positions.get(hop.source);
    const target = positions.get(hop.target);
    const color = clusterColors[hop.cluster] || clusterColors.other;

    const line = createSvg("line", {
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      stroke: color,
      "stroke-width": 4,
      "marker-end": "url(#arrow)",
      "stroke-linecap": "round",
    });
    svg.append(line);

    const label = createSvg("text", {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2 - 18,
      "text-anchor": "middle",
      class: "edge-label",
    });
    label.textContent = hop.relation;
    svg.append(label);
  });

  entities.forEach((entity) => {
    const point = positions.get(entity);
    const group = createSvg("g");
    group.append(
      createSvg("circle", {
        cx: point.x,
        cy: point.y,
        r: 34,
        fill: "#ffffff",
        stroke: "#17201d",
        "stroke-width": 2,
      })
    );
    const text = createSvg("text", {
      x: point.x,
      y: point.y + 58,
      "text-anchor": "middle",
      class: "node-label",
    });
    text.textContent = truncate(entity, 24);
    group.append(text);
    svg.append(group);
  });
}

function renderCharts() {
  renderBarChart(el.typeChart, state.data.questionTypeCounts);
  const labeledClusters = {};
  Object.entries(state.data.clusterCounts).forEach(([key, value]) => {
    labeledClusters[clusterLabels[key] || key] = value;
  });
  renderBarChart(el.clusterChart, labeledClusters);
}

function renderBarChart(target, counts) {
  target.innerHTML = "";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  entries.forEach(([label, value], index) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const colors = Object.values(clusterColors);
    const color = colors[index % colors.length];
    row.innerHTML = `
      <span title="${escapeHtml(label)}">${escapeHtml(truncate(label, 18))}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%; background:${color}"></div></div>
      <strong>${value}</strong>
    `;
    target.append(row);
  });
}

function renderRelations() {
  el.relationList.innerHTML = state.data.topRelations
    .slice(0, 24)
    .map((item) => `<span class="tag">${escapeHtml(item.relation)} · ${item.count}</span>`)
    .join("");
}

function askDatasetQuestion() {
  const query = el.chatInput.value.trim();
  if (!query) return;

  appendChatMessage("user", "你", escapeHtml(query));
  el.chatInput.value = "";

  const match = findBestQuestion(query);
  if (!match || match.score <= 0) {
    appendChatMessage(
      "assistant",
      "系统",
      "没有在当前样本中找到足够相似的问题。可以输入实体名、关系词，或使用检索框扩大查找范围。"
    );
    return;
  }

  state.selected = match.item;
  el.searchInput.value = match.item.question;
  applyFilters();

  const confidence = Math.min(99, Math.round(match.score * 18));
  const chainText = match.item.chain
    .map((hop) => `${hop.source} --[${hop.relation}]→ ${hop.target}`)
    .join("；");

  appendChatMessage(
    "assistant",
    "系统",
    `<span class="chat-answer">答案：${escapeHtml(match.item.answer)}</span><br>匹配问题：${escapeHtml(
      match.item.question
    )}<br>相似度：${confidence}%<br>推理路径：${escapeHtml(chainText)}`
  );
}

function findBestQuestion(query) {
  const queryTokens = tokenize(query);
  const queryText = normalize(query);
  let best = null;

  state.data.questions.forEach((item) => {
    const questionTokens = tokenize(item.question);
    const answerText = normalize(item.answer);
    const chainText = normalize(
      item.chain.flatMap((hop) => [hop.source, hop.relation, hop.target]).join(" ")
    );

    const overlap = queryTokens.filter((token) => questionTokens.includes(token)).length;
    const coverage = overlap / Math.max(queryTokens.length, 1);
    const exactQuestionBonus = normalize(item.question).includes(queryText) ? 2.4 : 0;
    const answerBonus = answerText.includes(queryText) ? 1.4 : 0;
    const chainBonus = chainText.includes(queryText) ? 1.6 : 0;
    const relationBonus = item.chain.some((hop) => queryText.includes(normalize(hop.relation)))
      ? 0.8
      : 0;
    const score =
      overlap + coverage * 2 + exactQuestionBonus + answerBonus + chainBonus + relationBonus;

    if (!best || score > best.score) {
      best = { item, score };
    }
  });

  return best;
}

function tokenize(value) {
  return normalize(value)
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter(
      (token) =>
        ![
          "the",
          "and",
          "for",
          "with",
          "who",
          "what",
          "when",
          "where",
          "which",
          "was",
          "were",
          "did",
          "does",
          "film",
        ].includes(token)
    );
}

function appendChatMessage(type, speaker, html) {
  const message = document.createElement("div");
  message.className = `chat-message ${type}`;
  message.innerHTML = `<strong>${escapeHtml(speaker)}</strong><p>${html}</p>`;
  el.chatMessages.append(message);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createSvg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
