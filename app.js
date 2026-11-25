/* Домашняя еда Ниша — статический каталог.
   Данные: data/catalog.json
   Маршруты: #/  и  #/seller/<sellerId>[/<productId>] */

const state = {
  q: "",
  cat: "all",
  data: null,
  sellerById: new Map(),
  categoryById: new Map(),
  lastView: "home",
};

const els = {
  app: document.getElementById("app"),
  toast: document.getElementById("toast"),
  updated: document.getElementById("updated"),
};

let toastTimer = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

/* Inline line icons: no dependency on emoji fonts. */
const ICONS = {
  fish: '<path d="M4 12c2.5-3.5 6.5-4.5 10-2.5 1.2.7 2.2 1.6 3 2.5-.8.9-1.8 1.8-3 2.5-3.5 2-7.5 1-10-2.5Z"/><path d="m17 12 4-3v6l-4-3Z"/><circle cx="8.2" cy="11.4" r=".9" fill="currentColor" stroke="none"/>',
  meat: '<path d="M14.5 3.5a5 5 0 0 1 3.9 8.1l-5.2 5.2a4.5 4.5 0 0 1-6.4-6.4l5.2-5.2a5 5 0 0 1 2.5-1.7Z"/><path d="m6.8 16.2 1.5 1.5"/><circle cx="13" cy="9" r="2.2"/>',
  ready: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 7.5c0-1 1-1.5 1-2.5M13 7.5c0-1 1-1.5 1-2.5"/>',
  dumplings: '<path d="M4 15a8 8 0 0 1 16 0c0 1.1-.9 2-2 2H6a2 2 0 0 1-2-2Z"/><path d="M7.5 13.5c1.5 1 3 1 4.5 0s3-1 4.5 0"/>',
  bakery: '<path d="M4 20h16"/><path d="M6 20v-7l6-5 6 5v7"/><path d="M6 15h12"/><path d="M12 5V3"/>',
  preserves: '<path d="M7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7Z"/><path d="M8 7c0-2 1.8-3 4-3s4 1 4 3"/><path d="M10 12h4M10 16h4"/>',
  dairy: '<path d="M9 3h6v3l2 3v12H7V9l2-3V3Z"/><path d="M9 3h6"/><path d="M7 12h10"/>',
  honey: '<path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10Z"/><path d="M9.5 13a2.5 2.5 0 0 0 5 0"/>',
  pantry: '<path d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z"/><path d="M5 3h14v4H5z"/><path d="M9 12h6"/>',
  tea: '<path d="M5 19C5 10 12 5 19 5c0 7-5 14-14 14Z"/><path d="M5 19C8 14 11 11 16 8"/>',
  other: '<path d="M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 10v11"/><path d="M16 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  pin: '<path d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z"/><circle cx="12" cy="11" r="2"/>',
  pot: '<path d="M4 10h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6Z"/><path d="M3 10h18"/><path d="M9 7c0-1 1-1.5 1-3M13 7c0-1 1-1.5 1-3"/>',
};

function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.other}</svg>`;
}

function norm(value) {
  return String(value ?? "").toLowerCase().replace(/ё/g, "е").trim();
}

function fmtPrice(value) {
  return new Intl.NumberFormat("ru-RS").format(value);
}

function priceLabel(product) {
  return product.price == null
    ? "цена не указана"
    : `${fmtPrice(product.price)} RSD${product.unit ? " / " + product.unit : ""}`;
}

function productUrl(sellerId, productId) {
  const base = location.href.split("#")[0];
  return `${base}#/seller/${encodeURIComponent(sellerId)}/${encodeURIComponent(productId)}`;
}

function priceHtml(product) {
  if (product.price == null) {
    return `<span class="price-missing" title="Продавец не указал цену — уточните в Telegram">Цена не указана</span>`;
  }
  return `<span class="price">${fmtPrice(product.price)} <small>RSD</small></span>`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/* ---------- Data helpers ---------- */

function sellerOf(product) {
  return state.sellerById.get(product.seller_id);
}

function categoryOf(product) {
  return state.categoryById.get(product.category) || { id: "other", label: "Другое", emoji: "🍽️" };
}

function filteredProducts() {
  const q = norm(state.q);
  return state.data.products.filter((product) => {
    if (state.cat !== "all" && product.category !== state.cat) return false;
    if (!q) return true;
    const seller = sellerOf(product);
    const haystack = norm([
      product.name,
      product.description,
      product.unit,
      ...(product.tags || []),
      seller?.name,
      seller?.person,
      categoryOf(product).label,
    ].join(" "));
    return q.split(/\s+/).every((word) => haystack.includes(word));
  }).sort((a, b) => {
    const sa = sellerOf(a)?.name || "";
    const sb = sellerOf(b)?.name || "";
    return sa.localeCompare(sb, "ru") || a.name.localeCompare(b.name, "ru");
  });
}

/* ---------- Home ---------- */

function renderHome() {
  state.lastView = "home";
  const { sellers, products, categories } = state.data;

  const noPrice = products.filter((p) => p.price == null).length;

  els.app.innerHTML = `
    <section class="hero">
      <h1>Домашняя еда, выпечка и заготовки</h1>
      <p>Все товары продавцов из чата «Русскоговорящий Ниш» в одном месте.
        Найдите блюдо, откройте магазин продавца и закажите в Telegram.</p>
      <div class="stats">
        <span class="stat"><strong>${products.length}</strong> товаров</span>
        <span class="stat"><strong>${sellers.length}</strong> продавцов</span>
        <span class="stat"><strong>${noPrice}</strong> без цены — уточняйте</span>
      </div>
    </section>

    <section class="controls" aria-label="Поиск и фильтры">
      <div class="search-row">
        <label class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
          </svg>
          <input id="search" type="search" placeholder="Найти пельмени, торт, творог…" autocomplete="off" value="${esc(state.q)}" aria-label="Поиск по товарам">
        </label>
        <button class="clear-btn" id="reset" type="button">Сбросить</button>
      </div>
      <div class="chips" role="group" aria-label="Категории">
        ${categoryChips(categories, products)}
      </div>
    </section>

    <div class="section-head">
      <h2>Все товары</h2>
      <span class="result-count" id="result-count"></span>
    </div>

    <div class="grid" id="grid"></div>
  `;

  els.app.querySelector("#search").addEventListener("input", (event) => {
    state.q = event.target.value;
    renderGrid();
  });

  els.app.querySelector("#reset").addEventListener("click", () => {
    state.q = "";
    state.cat = "all";
    const input = els.app.querySelector("#search");
    input.value = "";
    els.app.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.cat === "all");
      chip.setAttribute("aria-pressed", String(chip.dataset.cat === "all"));
    });
    renderGrid();
    input.focus();
  });

  els.app.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.cat = chip.dataset.cat;
      els.app.querySelectorAll(".chip").forEach((c) => {
        const active = c.dataset.cat === state.cat;
        c.classList.toggle("is-active", active);
        c.setAttribute("aria-pressed", String(active));
      });
      renderGrid();
    });
  });

  renderGrid();
}

function categoryChips(categories, products) {
  const count = (cat) => cat === "all"
    ? products.length
    : products.filter((p) => p.category === cat).length;

  const all = `<button class="chip${state.cat === "all" ? " is-active" : ""}" data-cat="all" type="button" aria-pressed="${state.cat === "all"}">Все <span class="count">${count("all")}</span></button>`;

  const rest = categories
    .map((cat) => ({ cat, n: count(cat.id) }))
    .filter(({ n }) => n > 0)
    .map(({ cat, n }) => `
      <button class="chip${state.cat === cat.id ? " is-active" : ""}" data-cat="${esc(cat.id)}" type="button" aria-pressed="${state.cat === cat.id}">
        ${icon(cat.id)} ${esc(cat.label)} <span class="count">${n}</span>
      </button>`)
    .join("");

  return all + rest;
}

function renderGrid() {
  const grid = els.app.querySelector("#grid");
  const countEl = els.app.querySelector("#result-count");
  if (!grid) return;

  const items = filteredProducts();

  countEl.textContent = items.length === 1
    ? "1 товар"
    : `${items.length} ${plural(items.length, ["товар", "товара", "товаров"])}`;

  if (!items.length) {
    grid.classList.add("is-empty");
    grid.innerHTML = `
      <div class="empty">
        <strong>Ничего не найдено</strong>
        Попробуйте другой запрос или сбросьте фильтры.<br><br>
        <button class="btn btn-ghost" id="empty-reset" type="button">Сбросить поиск</button>
      </div>`;
    els.app.querySelector("#empty-reset").addEventListener("click", () => {
      state.q = "";
      state.cat = "all";
      renderHome();
    });
    return;
  }

  grid.classList.remove("is-empty");
  grid.innerHTML = items.map(productCardHtml).join("");
}

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

function cardMediaHtml(product, cat) {
  if (product.image) {
    return `<div class="card-media has-photo" aria-hidden="true">
      <img src="${esc(product.image)}" alt="" width="800" height="600" loading="lazy" decoding="async">
    </div>`;
  }
  return `<div class="card-media" aria-hidden="true">${icon(cat.id, "icon card-icon")}</div>`;
}

function productCardHtml(product) {
  const seller = sellerOf(product);
  const cat = categoryOf(product);
  const href = `#/seller/${encodeURIComponent(product.seller_id)}/${encodeURIComponent(product.id)}`;

  return `
    <a class="product-card" href="${href}" style="--seller-color:${esc(seller?.color || "#f3ede5")}">
      ${cardMediaHtml(product, cat)}
      <div class="card-body">
        <span class="seller-line">${esc(seller?.name || "Продавец")}</span>
        <h3>${esc(product.name)}</h3>
        <p class="card-desc">${esc(product.description || "")}</p>
        <div class="card-foot">
          ${priceHtml(product)}
          <span class="unit">${esc(product.unit || "")}</span>
        </div>
      </div>
    </a>`;
}

/* ---------- Seller page ---------- */

function sellerInitial(seller) {
  const source = (seller.name || seller.person || "?").trim();
  return source.charAt(0).toLocaleUpperCase("ru-RU");
}

function renderSeller(sellerId, productId) {
  state.lastView = "seller";
  const seller = state.sellerById.get(sellerId);

  if (!seller) {
    els.app.innerHTML = `
      <section class="seller-page">
        <a class="back-link" href="#/">← Все товары</a>
        <div class="empty"><strong>Продавец не найден</strong>Возможно, ссылка устарела.</div>
      </section>`;
    window.scrollTo({ top: 0 });
    return;
  }

  const products = state.data.products
    .filter((p) => p.seller_id === seller.id)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const hasHandle = Boolean(seller.tg_handle);
  const contactLabel = seller.tg_kind === "user"
    ? "Написать в Telegram"
    : seller.tg_kind === "group"
      ? "Открыть группу"
      : "Открыть сообщение в чате";

  const contactUrl = seller.tg_kind === "user" && hasHandle
    ? `https://t.me/${encodeURIComponent(seller.tg_handle)}`
    : seller.tg_kind === "group" && hasHandle
      ? seller.tg_url
      : (seller.source_message_url || seller.tg_url);

  const contactNote = seller.tg_kind === "user" && hasHandle
    ? "Заказ откроется в личном чате с продавцом — текст можно дополнить."
    : seller.tg_kind === "group" && hasHandle
      ? "Откроется группа продавца. Кнопка «Заказать» скопирует текст заказа — вставьте его в чат."
      : "У продавца нет публичного username: откроется его сообщение в общем чате. Текст заказа скопируется в буфер.";

  els.app.innerHTML = `
    <section class="seller-page">
      <a class="back-link" href="#/">← Все товары</a>

      <div class="seller-hero">
        <div class="seller-avatar" aria-hidden="true">${esc(sellerInitial(seller))}</div>
        <div class="seller-info">
          <h1>${esc(seller.name)}</h1>
          ${seller.person && seller.person !== seller.name ? `<div class="seller-person">${esc(seller.person)}</div>` : ""}
          <p class="seller-about">${esc(seller.about || "")}</p>
          <div class="seller-meta">
            ${seller.place ? `<span class="meta-pill">${icon("pin", "icon meta-icon")} ${esc(seller.place)}</span>` : ""}
            <span class="meta-pill">${products.length} ${plural(products.length, ["товар", "товара", "товаров"])}</span>
            ${seller.updated_at ? `<span class="meta-pill">обновлено ${esc(seller.updated_at)}</span>` : ""}
          </div>
        </div>
        <div class="seller-actions">
          <a class="btn btn-primary" href="${esc(contactUrl)}" target="_blank" rel="noopener">${esc(contactLabel)}</a>
          ${seller.source_message_url ? `<a class="btn btn-ghost" href="${esc(seller.source_message_url)}" target="_blank" rel="noopener">Сообщение в чате</a>` : ""}
          <p class="contact-note">${esc(contactNote)}</p>
        </div>
      </div>

      <div class="section-head">
        <h2>Товары продавца</h2>
        <span class="result-count">${products.length} ${plural(products.length, ["позиция", "позиции", "позиций"])}</span>
      </div>

      <div class="grid">
        ${products.map((p) => orderCardHtml(p, seller)).join("")}
      </div>
    </section>
  `;

  els.app.querySelectorAll(".order-btn").forEach((btn) => {
    btn.addEventListener("click", () => orderProduct(btn.dataset.product, btn.dataset.seller));
  });

  if (productId) {
    const target = els.app.querySelector(`.order-card[data-product="${cssEscape(productId)}"]`);
    if (target) {
      target.classList.add("target");
      requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
  } else {
    window.scrollTo({ top: 0 });
  }
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function orderCardHtml(product, seller) {
  const cat = categoryOf(product);

  return `
    <div class="product-card order-card" data-product="${esc(product.id)}" style="--seller-color:${esc(seller.color || "#f3ede5")}">
      ${cardMediaHtml(product, cat)}
      <div class="card-body">
        <span class="seller-line">${esc(cat.label)}</span>
        <h3>${esc(product.name)}</h3>
        <p class="card-desc">${esc(product.description || "")}</p>
        <div class="card-foot">
          ${priceHtml(product)}
          <span class="unit">${esc(product.unit || "")}</span>
        </div>
        ${product.price_note ? `<p class="card-desc">${esc(product.price_note)}</p>` : ""}
        <button class="btn btn-primary order-btn" type="button" data-seller="${esc(seller.id)}" data-product="${esc(product.id)}">
          Заказать в Telegram
        </button>
      </div>
    </div>`;
}

async function orderProduct(productId, sellerId) {
  const seller = state.sellerById.get(sellerId);
  const product = state.data.products.find((p) => p.id === productId && p.seller_id === sellerId);
  if (!seller || !product) return;

  const url = productUrl(seller.id, product.id);
  const message =
    `Здравствуйте! Хочу заказать: ${product.name} — ${priceLabel(product)}.\n` +
    `Ссылка на товар: ${url}\n` +
    `Количество: \n` +
    `Комментарий: `;

  // Start copying inside the click gesture, then open Telegram before awaiting.
  const copied = copyText(message);

  const handle = seller.tg_handle;
  const canPrefill = seller.tg_kind === "user" && handle;
  const tgUrl = canPrefill
    ? `https://t.me/${encodeURIComponent(handle)}?text=${encodeURIComponent(message)}`
    : seller.tg_kind === "group" && handle
      ? seller.tg_url
      : (seller.source_message_url || seller.tg_url);

  if (tgUrl) window.open(tgUrl, "_blank", "noopener");

  if (!(await copied)) {
    showToast("Не удалось скопировать текст. Проверьте разрешение на буфер обмена.");
    return;
  }

  showToast(canPrefill
    ? "Открываем Telegram — текст заказа уже вставлен в сообщение."
    : "Текст заказа скопирован. Вставьте его в чат продавца.");
}

/* ---------- Router ---------- */

function route() {
  if (!state.data) return;
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "seller" && parts[1]) {
    renderSeller(parts[1], parts[2]);
  } else {
    const cameFromSeller = state.lastView === "seller";
    renderHome();
    if (cameFromSeller) window.scrollTo({ top: 0 });
  }
}

/* ---------- Boot ---------- */

async function boot() {
  try {
    const response = await fetch("data/catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.data = data;
    state.sellerById = new Map(data.sellers.map((s) => [s.id, s]));
    state.categoryById = new Map(data.categories.map((c) => [c.id, c]));

    if (els.updated) {
      els.updated.textContent = `Каталог обновлён ${data.updated_at}. Период сообщений: ${data.source.period_from} — ${data.source.period_to}. Источник: ${data.source.chat_title}.`;
    }

    route();
    window.addEventListener("hashchange", route);
  } catch (error) {
    console.error(error);
    els.app.innerHTML = `
      <div class="empty">
        <strong>Не удалось загрузить каталог</strong>
        Откройте сайт через локальный сервер, например:<br>
        <code>python3 -m http.server 8000</code><br>
        и зайдите на <code>http://localhost:8000</code>.
      </div>`;
  }
}

boot();
