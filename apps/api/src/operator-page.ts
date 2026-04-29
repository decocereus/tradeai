export const operatorPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TradeAI Operator</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f2;
        --panel: #ffffff;
        --ink: #18211f;
        --muted: #66716d;
        --line: #d9ded7;
        --green: #18735c;
        --amber: #a96216;
        --red: #b33138;
        --blue: #315f9f;
        --shadow: 0 10px 24px rgb(24 33 31 / 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.4;
      }

      button {
        font: inherit;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 40px;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .mark {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: linear-gradient(135deg, #18735c 0%, #315f9f 100%);
        box-shadow: var(--shadow);
      }

      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.1;
      }

      .subtle {
        color: var(--muted);
        font-size: 13px;
      }

      .refresh {
        min-width: 44px;
        min-height: 40px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--ink);
        cursor: pointer;
        box-shadow: var(--shadow);
      }

      .refresh:hover {
        border-color: #9ca8a2;
      }

      .grid {
        display: grid;
        gap: 14px;
      }

      .summary {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-bottom: 14px;
      }

      .main {
        grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
        align-items: start;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: var(--shadow);
        padding: 16px;
      }

      .metric {
        min-height: 104px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0;
      }

      .value {
        font-size: 24px;
        font-weight: 700;
      }

      .section-title {
        margin: 0 0 12px;
        font-size: 15px;
      }

      .row {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 10px 0;
        border-top: 1px solid var(--line);
      }

      .row:first-of-type {
        border-top: 0;
        padding-top: 0;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: #f9faf7;
        color: var(--muted);
        font-size: 12px;
        white-space: nowrap;
      }

      .ok {
        color: var(--green);
        border-color: rgb(24 115 92 / 0.25);
        background: rgb(24 115 92 / 0.08);
      }

      .warn {
        color: var(--amber);
        border-color: rgb(169 98 22 / 0.25);
        background: rgb(169 98 22 / 0.08);
      }

      .bad {
        color: var(--red);
        border-color: rgb(179 49 56 / 0.25);
        background: rgb(179 49 56 / 0.08);
      }

      .info {
        color: var(--blue);
        border-color: rgb(49 95 159 / 0.25);
        background: rgb(49 95 159 / 0.08);
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      .action {
        border-top: 1px solid var(--line);
        padding: 12px 0;
      }

      .action:first-of-type {
        border-top: 0;
        padding-top: 0;
      }

      .action h3 {
        margin: 0 0 4px;
        font-size: 14px;
      }

      .action p {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
      }

      .bars {
        display: grid;
        gap: 10px;
      }

      .bar-label {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 13px;
      }

      .bar-track {
        height: 8px;
        border-radius: 999px;
        background: #e8ece6;
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #18735c, #315f9f);
      }

      .holding {
        grid-template-columns: minmax(140px, 1fr) repeat(3, minmax(76px, auto));
      }

      .right {
        text-align: right;
      }

      .empty {
        color: var(--muted);
        font-size: 13px;
      }

      .error {
        border-color: rgb(179 49 56 / 0.35);
        background: rgb(179 49 56 / 0.08);
        color: var(--red);
      }

      @media (max-width: 840px) {
        .summary,
        .main {
          grid-template-columns: 1fr;
        }

        .topbar {
          align-items: flex-start;
        }

        .holding {
          grid-template-columns: minmax(0, 1fr);
        }

        .right {
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="mark" aria-hidden="true"></div>
          <div>
            <h1>TradeAI Operator</h1>
            <div id="generated" class="subtle">Loading daily state</div>
          </div>
        </div>
        <button id="refresh" class="refresh" type="button" aria-label="Refresh" title="Refresh">Reload</button>
      </header>

      <section id="error" class="panel error" hidden></section>

      <section class="grid summary" aria-label="Portfolio summary">
        <div class="panel metric">
          <div class="label">Market Value</div>
          <div id="market-value" class="value">--</div>
          <div id="broker" class="subtle">--</div>
        </div>
        <div class="panel metric">
          <div class="label">PnL</div>
          <div id="pnl" class="value">--</div>
          <div id="holdings-count" class="subtle">--</div>
        </div>
        <div class="panel metric">
          <div class="label">Provider Status</div>
          <div id="provider-status" class="value">--</div>
          <div id="provider-detail" class="subtle">--</div>
        </div>
        <div class="panel metric">
          <div class="label">Data Quality</div>
          <div id="data-quality" class="value">--</div>
          <div class="subtle">Price fallbacks / research gaps</div>
        </div>
      </section>

      <section class="grid main">
        <div class="stack">
          <section class="panel">
            <h2 class="section-title">Today's Actions</h2>
            <div id="actions"></div>
          </section>

          <section class="panel">
            <h2 class="section-title">Holdings</h2>
            <div id="holdings"></div>
          </section>
        </div>

        <aside class="stack">
          <section class="panel">
            <h2 class="section-title">Asset Allocation</h2>
            <div id="allocation" class="bars"></div>
          </section>

          <section class="panel">
            <h2 class="section-title">Conflicts</h2>
            <div id="conflicts"></div>
          </section>

          <section class="panel">
            <h2 class="section-title">Provider Checks</h2>
            <div id="providers"></div>
          </section>
        </aside>
      </section>
    </main>

    <script>
      const money = new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });

      const byId = (id) => document.getElementById(id);

      const formatMoney = (value) => money.format(Number(value || 0));
      const formatPercent = (value) => Number(value || 0).toFixed(2) + "%";
      const titleCase = (value) => String(value || "unknown").replaceAll("_", " ");

      const statusClass = (status) => {
        if (status === "ok") return "ok";
        if (status === "failed") return "bad";
        if (status === "degraded") return "warn";
        return "info";
      };

      const setText = (id, value) => {
        byId(id).textContent = value;
      };

      const el = (tag, options = {}) => {
        const node = document.createElement(tag);
        if (options.className) node.className = options.className;
        if (options.text !== undefined) node.textContent = String(options.text);
        return node;
      };

      const append = (parent, ...children) => {
        for (const child of children) parent.appendChild(child);
        return parent;
      };

      const empty = (text) => el("div", { className: "empty", text });

      const clear = (id) => {
        const node = byId(id);
        node.replaceChildren();
        return node;
      };

      const renderActions = (id, actions) => {
        const root = clear(id);
        if (!actions.length) {
          root.appendChild(empty("No action items."));
          return;
        }
        for (const action of actions) {
          const badge = el("span", {
            className: "pill " + (action.priority === "high" ? "bad" : "warn"),
            text: action.priority,
          });
          const title = el("h3");
          append(title, badge, document.createTextNode(" " + (action.title || "")));
          root.appendChild(append(el("article", { className: "action" }), title, el("p", { text: action.detail || "" })));
        }
      };

      const renderHoldings = (id, holdings) => {
        const root = clear(id);
        if (!holdings.length) {
          root.appendChild(empty("No holdings found."));
          return;
        }
        for (const holding of holdings) {
          const identity = el("div");
          append(
            identity,
            el("strong", { text: holding.symbol || "unknown" }),
            el("div", { className: "subtle", text: titleCase(holding.assetType) }),
          );
          root.appendChild(
            append(
              el("div", { className: "row holding" }),
              identity,
              el("div", { className: "right", text: formatMoney(holding.marketValue) }),
              el("div", { className: "right", text: formatPercent(holding.pnlPercent) }),
              append(
                el("div", { className: "right" }),
                el("span", {
                  className: "pill info",
                  text: holding.priceProvenance?.marketDataProvider || holding.priceProvenance?.source || "price",
                }),
              ),
            ),
          );
        }
      };

      const renderAllocation = (id, allocation) => {
        const root = clear(id);
        if (!allocation.length) {
          root.appendChild(empty("No allocation data."));
          return;
        }
        for (const item of allocation) {
          const fill = el("div", { className: "bar-fill" });
          fill.style.width = Math.max(0, Math.min(100, Number(item.percentage || 0))) + "%";
          root.appendChild(
            append(
              el("div"),
              append(
                el("div", { className: "bar-label" }),
                el("span", { text: titleCase(item.assetType) }),
                el("span", { text: formatPercent(item.percentage) }),
              ),
              append(el("div", { className: "bar-track" }), fill),
            ),
          );
        }
      };

      const renderReviews = (id, reviews) => {
        const root = clear(id);
        if (!reviews.length) {
          root.appendChild(empty("No conflicts."));
          return;
        }
        for (const review of reviews) {
          const title = el("h3");
          append(
            title,
            el("span", { className: "pill bad", text: review.status || "review" }),
            document.createTextNode(" " + (review.symbol || "unknown")),
          );
          root.appendChild(append(el("div", { className: "action" }), title, el("p", { text: review.reason || "" })));
        }
      };

      const renderProviders = (id, checks) => {
        const root = clear(id);
        for (const check of checks) {
          const identity = el("div");
          append(
            identity,
            el("strong", { text: titleCase(check.name) }),
            el("div", { className: "subtle", text: check.provider || "unknown" }),
          );
          root.appendChild(
            append(
              el("div", { className: "row" }),
              identity,
              el("span", { className: "pill " + statusClass(check.status), text: check.status || "unknown" }),
            ),
          );
        }
      };

      async function loadDaily() {
        byId("error").hidden = true;
        const response = await fetch("/operator/daily");
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Unable to load daily state");
        }

        const data = payload.data;
        setText("generated", "Generated " + new Date(data.generatedAt).toLocaleString());
        setText("market-value", formatMoney(data.portfolio.marketValue));
        setText("broker", data.portfolio.broker || "unknown broker");
        setText("pnl", formatPercent(data.portfolio.weightedPnlPercent));
        setText("holdings-count", data.portfolio.holdingsCount + " holdings");
        setText("provider-status", data.providerHealth.status);
        setText("provider-detail", data.providerHealth.checks.length + " checks");
        setText("data-quality", data.portfolio.priceFallbacks + " / " + data.portfolio.partialResearch);

        renderActions("actions", data.actionItems || []);
        renderHoldings("holdings", data.holdings || []);
        renderAllocation("allocation", data.assetAllocation || []);
        renderReviews("conflicts", data.conflicts || []);
        renderProviders("providers", data.providerHealth.checks || []);
      }

      async function refresh() {
        byId("refresh").disabled = true;
        try {
          await loadDaily();
        } catch (error) {
          byId("error").hidden = false;
          byId("error").textContent = error instanceof Error ? error.message : String(error);
        } finally {
          byId("refresh").disabled = false;
        }
      }

      byId("refresh").addEventListener("click", refresh);
      void refresh();
    </script>
  </body>
</html>`;
