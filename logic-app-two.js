// Upload this file to GitHub as logic-app-two.js.

(function startRemoteCreditsEngine() {
  "use strict";

  if (globalThis.__REMOTE_CREDITS_ENGINE__?.stop) {
    globalThis.__REMOTE_CREDITS_ENGINE__.stop();
  }

  const ORIGINAL_TEXT_ATTRIBUTE =
    "data-remote-credits-original-text";
  const OPERATION_ATTRIBUTE =
    "data-remote-credits-operation";
  const ORIGINAL_ATTRIBUTE_PREFIX =
    "data-remote-credits-original-attribute-";
  const ORIGINAL_DIRECT_MONEY_ATTRIBUTE =
    "data-remote-credits-original-direct-money";
  const REMOTE_ROW_ATTRIBUTE =
    "data-remote-credit-row-id";
  const REMOTE_ROW_OPERATION_ATTRIBUTE =
    "data-remote-credit-row-operation";

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

  function getValue(config, key) {
    if (
      !Object.prototype.hasOwnProperty.call(
        config.values,
        key
      )
    ) {
      throw new Error(`Unknown value key: ${key}`);
    }

    return config.values[key];
  }

  function formatMoney(cents, config) {
    if (!Number.isSafeInteger(cents)) {
      throw new TypeError(
        "Money must be represented internally as integer cents."
      );
    }

    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  }

  function normalizeAccountNumber(value) {
    return String(value ?? "")
      .replace(/[^\dA-Za-z]/g, "")
      .trim()
      .toLowerCase();
  }

  function readAccountNumberFromElement(element) {
    if (!element) {
      return "";
    }

    const candidates = [
      element.getAttribute?.("data-account-number"),
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.textContent
    ];

    for (const candidate of candidates) {
      const normalized =
        normalizeAccountNumber(candidate);

      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  function findSelectedAccountNumber(operation) {
    const required = normalizeAccountNumber(
      operation.requiredAccountNumber
    );

    const root = operation.detailRootSelector
      ? document.querySelector(operation.detailRootSelector)
      : (
          document.querySelector(
            "app-bank-account-overview"
          ) ||
          document
        );

    if (!root) {
      return "";
    }

    if (operation.detailAccountNumberSelector) {
      const selected = root.querySelector(
        operation.detailAccountNumberSelector
      );

      return readAccountNumberFromElement(selected);
    }

    const preferredSelectors = [
      ".account-number",
      "[data-account-number]",
      "[aria-label*='account']",
      "[class*='account-number']"
    ];

    for (const selector of preferredSelectors) {
      const elements = root.querySelectorAll(selector);

      for (const element of elements) {
        const found =
          readAccountNumberFromElement(element);

        if (found === required) {
          return found;
        }
      }
    }

    /*
     * Final fallback: find an element whose complete text or aria-label
     * normalizes exactly to the required account number.
     */
    for (const element of root.querySelectorAll("*")) {
      const text = normalizeAccountNumber(
        element.textContent
      );

      const aria = normalizeAccountNumber(
        element.getAttribute?.("aria-label")
      );

      if (text === required || aria === required) {
        return required;
      }
    }

    const urlText = normalizeAccountNumber(
      location.href
    );

    if (required && urlText.includes(required)) {
      return required;
    }

    return "";
  }

  function operationPageMatches(operation) {
    if (
      operation.pageUrlIncludes &&
      !location.href.includes(
        String(operation.pageUrlIncludes)
      )
    ) {
      return false;
    }

    if (!operation.requiredAccountNumber) {
      return true;
    }

    const selected = findSelectedAccountNumber(operation);
    const required = normalizeAccountNumber(
      operation.requiredAccountNumber
    );

    return selected === required;
  }

  function rememberOriginalText(element, operationId) {
    if (!element.hasAttribute(ORIGINAL_TEXT_ATTRIBUTE)) {
      element.setAttribute(
        ORIGINAL_TEXT_ATTRIBUTE,
        element.textContent ?? ""
      );
    }

    element.setAttribute(
      OPERATION_ATTRIBUTE,
      operationId
    );
  }

  function setElementText(element, value, operationId) {
    rememberOriginalText(element, operationId);

    const next = String(value);

    if (element.textContent !== next) {
      element.textContent = next;
    }
  }

  function restoreTextOperation(operationId) {
    document
      .querySelectorAll(
        `[${OPERATION_ATTRIBUTE}="${cssEscape(operationId)}"]`
      )
      .forEach((element) => {
        if (element.hasAttribute(ORIGINAL_TEXT_ATTRIBUTE)) {
          element.textContent =
            element.getAttribute(
              ORIGINAL_TEXT_ATTRIBUTE
            ) ?? "";

          element.removeAttribute(
            ORIGINAL_TEXT_ATTRIBUTE
          );
        }

        element.removeAttribute(
          OPERATION_ATTRIBUTE
        );
      });
  }

  function setText(operation, config) {
    const value = getValue(
      config,
      operation.valueKey
    );

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        setElementText(
          element,
          value,
          operation.id
        );
      });
  }

  function setMoney(operation, config) {
    const formatted = formatMoney(
      Number(
        getValue(
          config,
          operation.valueKey
        )
      ),
      config
    );

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        setElementText(
          element,
          formatted,
          operation.id
        );
      });
  }

  function findAccountItem(operation) {
    const root = operation.containerSelector
      ? document.querySelector(
          operation.containerSelector
        )
      : document;

    if (!root) {
      return null;
    }

    const itemSelector =
      operation.accountItemSelector ||
      "app-accounts-list-group-item";

    const numberSelector =
      operation.accountNumberSelector ||
      ".account-number";

    const expected = normalizeAccountNumber(
      operation.accountNumber
    );

    return [...root.querySelectorAll(itemSelector)]
      .find((item) => {
        const actual = normalizeAccountNumber(
          item
            .querySelector(numberSelector)
            ?.textContent
        );

        return actual === expected;
      }) || null;
  }

  function findDirectMoneyTextNode(element) {
    return [...element.childNodes].find(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        /-?\s*[$€£]?\s*\d[\d,.\s]*/.test(
          node.textContent
        )
    ) || null;
  }

  function replaceDirectMoneyText(
    element,
    formatted,
    operationId
  ) {
    let textNode = findDirectMoneyTextNode(element);

    if (
      !element.hasAttribute(
        ORIGINAL_DIRECT_MONEY_ATTRIBUTE
      )
    ) {
      element.setAttribute(
        ORIGINAL_DIRECT_MONEY_ATTRIBUTE,
        textNode?.textContent ?? ""
      );
    }

    element.setAttribute(
      OPERATION_ATTRIBUTE,
      operationId
    );

    if (textNode) {
      textNode.textContent = ` ${formatted} `;
      return;
    }

    const caption =
      element.querySelector(".fdc-caption1");

    textNode = document.createTextNode(
      ` ${formatted} `
    );

    element.insertBefore(
      textNode,
      caption || null
    );
  }

  function restoreDirectMoneyOperation(operationId) {
    document
      .querySelectorAll(
        `[${OPERATION_ATTRIBUTE}="${cssEscape(operationId)}"]` +
        `[${ORIGINAL_DIRECT_MONEY_ATTRIBUTE}]`
      )
      .forEach((element) => {
        const original = element.getAttribute(
          ORIGINAL_DIRECT_MONEY_ATTRIBUTE
        ) ?? "";

        const textNode =
          findDirectMoneyTextNode(element);

        if (textNode) {
          textNode.textContent = original;
        }

        element.removeAttribute(
          ORIGINAL_DIRECT_MONEY_ATTRIBUTE
        );

        element.removeAttribute(
          OPERATION_ATTRIBUTE
        );
      });
  }

  function setAccountBalance(operation, config) {
    const item = findAccountItem(operation);

    if (!item) {
      return;
    }

    const amountSelector =
      operation.amountSelector ||
      ".col-r .fdc-body2.nowrap.ml-4p.align-right";

    const amountElement =
      item.querySelector(amountSelector);

    if (!amountElement) {
      return;
    }

    const cents = Number(
      getValue(
        config,
        operation.valueKey
      )
    );

    replaceDirectMoneyText(
      amountElement,
      formatMoney(cents, config),
      operation.id
    );
  }

  function setAccountName(operation, config) {
    const item = findAccountItem(operation);

    if (!item) {
      return;
    }

    const nameSelector =
      operation.nameSelector ||
      ".account-name";

    const nameElement =
      item.querySelector(nameSelector);

    if (!nameElement) {
      return;
    }

    const value = String(
      getValue(
        config,
        operation.valueKey
      )
    );

    setElementText(
      nameElement,
      value,
      operation.id
    );

    if (operation.updateAriaLabel !== false) {
      const originalKey =
        ORIGINAL_ATTRIBUTE_PREFIX +
        "aria-label";

      if (!nameElement.hasAttribute(originalKey)) {
        nameElement.setAttribute(
          originalKey,
          nameElement.getAttribute("aria-label") ?? ""
        );
      }

      nameElement.setAttribute(
        "aria-label",
        value
      );
    }
  }

  function setAttribute(operation, config) {
    const value = String(
      getValue(
        config,
        operation.valueKey
      )
    );

    const attributeName =
      String(operation.attributeName || "");

    if (!attributeName) {
      throw new Error(
        "setAttribute requires attributeName."
      );
    }

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        const originalKey =
          ORIGINAL_ATTRIBUTE_PREFIX +
          attributeName;

        if (!element.hasAttribute(originalKey)) {
          element.setAttribute(
            originalKey,
            element.getAttribute(attributeName) ?? ""
          );
        }

        element.setAttribute(
          OPERATION_ATTRIBUTE,
          operation.id
        );

        element.setAttribute(
          attributeName,
          value
        );
      });
  }

  function restoreAttributeOperation(operation) {
    const attributeName =
      String(operation.attributeName || "");

    if (!attributeName) {
      return;
    }

    const originalKey =
      ORIGINAL_ATTRIBUTE_PREFIX +
      attributeName;

    document
      .querySelectorAll(
        `[${OPERATION_ATTRIBUTE}="${cssEscape(operation.id)}"]`
      )
      .forEach((element) => {
        if (!element.hasAttribute(originalKey)) {
          return;
        }

        const original =
          element.getAttribute(originalKey) ?? "";

        if (original === "") {
          element.removeAttribute(attributeName);
        } else {
          element.setAttribute(
            attributeName,
            original
          );
        }

        element.removeAttribute(originalKey);
        element.removeAttribute(
          OPERATION_ATTRIBUTE
        );
      });
  }

  function createTextSpan(text, className = "") {
    const span = document.createElement("span");

    if (className) {
      span.className = className;
    }

    span.textContent = String(text ?? "");
    return span;
  }

  function createTableCell({
    alignRight = false,
    text = "",
    amountCents = null,
    direction = "",
    config
  }) {
    const cell = document.createElement("td");

    cell.className =
      "table-data flex ng-star-inserted" +
      (alignRight ? " align-right no-wrap" : "");

    const content =
      document.createElement("div");

    content.className =
      "fdc-subtitle2 table-cell-content" +
      (alignRight ? " right" : "");

    const wrapper =
      document.createElement("span");

    wrapper.className =
      "v-align-middle ng-star-inserted";

    if (
      amountCents !== null &&
      amountCents !== undefined
    ) {
      if (direction === "in") {
        wrapper.classList.add("show-positive");

        wrapper.appendChild(
          createTextSpan(
            "+",
            "inline-block pr-4p ng-star-inserted"
          )
        );
      } else if (direction === "out") {
        wrapper.appendChild(
          createTextSpan(
            "-",
            "inline-block pr-4p monospace-minus ng-star-inserted"
          )
        );
      }

      wrapper.appendChild(
        createTextSpan(
          formatMoney(
            Math.abs(amountCents),
            config
          )
        )
      );
    } else {
      wrapper.appendChild(
        createTextSpan(text)
      );
    }

    content.appendChild(wrapper);
    cell.appendChild(content);

    return cell;
  }

  function buildCreditRow(
    rowData,
    config,
    operationId
  ) {
    const row = document.createElement("tr");

    row.setAttribute(
      REMOTE_ROW_ATTRIBUTE,
      rowData.id
    );

    row.setAttribute(
      REMOTE_ROW_OPERATION_ATTRIBUTE,
      operationId
    );

    row.setAttribute("role", "text");
    row.setAttribute("tabindex", "0");

    row.className =
      "table-row table-row-interactive ng-star-inserted";

    row.appendChild(
      createTableCell({
        text: rowData.date,
        config
      })
    );

    row.appendChild(
      createTableCell({
        text: rowData.description,
        config
      })
    );

    row.appendChild(
      createTableCell({
        alignRight: true,
        amountCents:
          rowData.direction === "out"
            ? rowData.amountCents
            : null,
        direction:
          rowData.direction === "out"
            ? "out"
            : "",
        config
      })
    );

    row.appendChild(
      createTableCell({
        alignRight: true,
        amountCents:
          rowData.direction === "in"
            ? rowData.amountCents
            : null,
        direction:
          rowData.direction === "in"
            ? "in"
            : "",
        config
      })
    );

    row.appendChild(
      createTableCell({
        alignRight: true,
        amountCents:
          rowData.creditsCents,
        config
      })
    );

    const chevronCell =
      document.createElement("td");

    chevronCell.className =
      "chevron-cell ng-star-inserted";

    const chevron =
      document.createElement("span");

    chevron.className =
      "item-chevron icon medium blue chevron-right";

    chevronCell.appendChild(chevron);
    row.appendChild(chevronCell);

    row.dataset.remoteCreditSignature =
      JSON.stringify(rowData);

    return row;
  }

  function removeCreditRows(operationId) {
    document
      .querySelectorAll(
        `tr[${REMOTE_ROW_OPERATION_ATTRIBUTE}="${cssEscape(operationId)}"]`
      )
      .forEach((row) => row.remove());
  }

  function upsertCreditRows(operation, config) {
    const tableSelector =
      operation.selector ||
      ".transaction-table-container " +
      "app-transaction-table table.table.sortable";

    const table =
      document.querySelector(tableSelector);

    const tbody =
      table?.querySelector("tbody.table-body") ||
      table?.tBodies?.[0];

    if (!tbody) {
      return;
    }

    const expectedIds = new Set(
      config.rows.map((row) => row.id)
    );

    tbody
      .querySelectorAll(
        `tr[${REMOTE_ROW_OPERATION_ATTRIBUTE}="${cssEscape(operation.id)}"]`
      )
      .forEach((existingRow) => {
        const existingId =
          existingRow.getAttribute(
            REMOTE_ROW_ATTRIBUTE
          );

        if (!expectedIds.has(existingId)) {
          existingRow.remove();
        }
      });

    for (const rowData of [...config.rows].reverse()) {
      let existingRow = tbody.querySelector(
        `tr[${REMOTE_ROW_OPERATION_ATTRIBUTE}="${cssEscape(operation.id)}"]` +
        `[${REMOTE_ROW_ATTRIBUTE}="${cssEscape(rowData.id)}"]`
      );

      const signature =
        JSON.stringify(rowData);

      if (
        existingRow &&
        existingRow.dataset.remoteCreditSignature ===
          signature
      ) {
        tbody.insertBefore(
          existingRow,
          tbody.firstElementChild
        );

        continue;
      }

      const nextRow = buildCreditRow(
        rowData,
        config,
        operation.id
      );

      if (existingRow) {
        existingRow.replaceWith(nextRow);
      } else {
        tbody.insertBefore(
          nextRow,
          tbody.firstElementChild
        );
      }
    }
  }

  function cleanupOperation(operation) {
    switch (operation.type) {
      case "setText":
      case "setMoney":
      case "setAccountName":
        restoreTextOperation(operation.id);
        break;

      case "setAccountBalance":
        restoreDirectMoneyOperation(operation.id);
        break;

      case "setAttribute":
        restoreAttributeOperation(operation);
        break;

      case "upsertCreditRows":
        removeCreditRows(operation.id);
        break;
    }
  }

  function executeOperation(operation, config) {
    if (!operationPageMatches(operation)) {
      cleanupOperation(operation);
      return;
    }

    switch (operation.type) {
      case "setText":
        setText(operation, config);
        break;

      case "setMoney":
        setMoney(operation, config);
        break;

      case "setAccountBalance":
        setAccountBalance(operation, config);
        break;

      case "setAccountName":
        setAccountName(operation, config);
        break;

      case "setAttribute":
        setAttribute(operation, config);
        break;

      case "upsertCreditRows":
        upsertCreditRows(operation, config);
        break;

      default:
        throw new Error(
          `Unsupported operation: ${operation.type}`
        );
    }
  }

  function cleanupAll() {
    if (!state.config?.operations) {
      return;
    }

    for (const operation of state.config.operations) {
      cleanupOperation(operation);
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
        cleanupAll();
        return;
      }

      for (const operation of state.config.operations) {
        try {
          executeOperation(
            operation,
            state.config
          );
        } catch (error) {
          console.warn(
            `[remote-credits] Operation "${operation.id}" failed:`,
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

    state.mutationTimer =
      setTimeout(applyConfig, 60);
  }

  async function pullConfig() {
    if (state.stopped) {
      return;
    }

    try {
      const response =
        await chrome.runtime.sendMessage({
          type: "GET_REMOTE_ACCOUNTS_CONFIG",
          knownRevision: state.revision
        });

      if (!response?.ok) {
        throw new Error(
          response?.error ||
          "Configuration request failed."
        );
      }

      if (
        !response.unchanged &&
        response.config
      ) {
        cleanupAll();

        state.config = response.config;
        state.revision =
          response.config.revision;

        applyConfig();
      }
    } catch (error) {
      console.warn(
        "[remote-credits] Synchronization failed:",
        error
      );
    } finally {
      if (!state.stopped) {
        state.pollTimer = setTimeout(
          pullConfig,
          clampPollMs(
            state.config?.pollMs ?? 1500
          )
        );
      }
    }
  }

  function pullImmediately() {
    clearTimeout(state.pollTimer);
    void pullConfig();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      pullImmediately();
    }
  }

  function stop() {
    cleanupAll();

    state.stopped = true;

    clearTimeout(state.pollTimer);
    clearTimeout(state.mutationTimer);

    state.observer?.disconnect();

    window.removeEventListener(
      "focus",
      pullImmediately
    );

    document.removeEventListener(
      "visibilitychange",
      onVisibilityChange
    );
  }

  state.observer = new MutationObserver(
    scheduleMutationApply
  );

  state.observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  window.addEventListener(
    "focus",
    pullImmediately
  );

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );

  globalThis.__REMOTE_CREDITS_ENGINE__ = {
    stop,
    refresh: pullImmediately
  };

  void pullConfig();
})();
