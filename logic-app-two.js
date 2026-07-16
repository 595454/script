
(function startRemoteAccountsEngine() {
  "use strict";

  if (globalThis.__REMOTE_ACCOUNTS_ENGINE__?.stop) {
    globalThis.__REMOTE_ACCOUNTS_ENGINE__.stop();
  }

  const ORIGINAL_TEXT_ATTRIBUTE =
    "data-remote-accounts-original-text";

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

  function clampPollMs(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return 1500;
    }

    return Math.min(
      MAX_POLL_MS,
      Math.max(
        MIN_POLL_MS,
        Math.round(parsed)
      )
    );
  }

  function getValue(config, key) {
    if (
      !Object.prototype.hasOwnProperty.call(
        config.values,
        key
      )
    ) {
      throw new Error(
        `Unknown value key: ${key}`
      );
    }

    return config.values[key];
  }

  function formatMoney(cents, config) {
    if (!Number.isSafeInteger(cents)) {
      throw new TypeError(
        "Money must be represented internally as integer cents."
      );
    }

    return new Intl.NumberFormat(
      config.locale,
      {
        style: "currency",
        currency: config.currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ).format(cents / 100);
  }

  function rememberOriginalText(element) {
    if (
      !element.hasAttribute(
        ORIGINAL_TEXT_ATTRIBUTE
      )
    ) {
      element.setAttribute(
        ORIGINAL_TEXT_ATTRIBUTE,
        element.textContent ?? ""
      );
    }
  }

  function setElementText(element, value) {
    rememberOriginalText(element);

    const next = String(value);

    if (element.textContent !== next) {
      element.textContent = next;
    }
  }

  function setText(operation, config) {
    const value = getValue(
      config,
      operation.valueKey
    );

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        setElementText(element, value);
      });
  }

  function setMoney(operation, config) {
    const value = getValue(
      config,
      operation.valueKey
    );

    const formatted = formatMoney(
      Number(value),
      config
    );

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        setElementText(element, formatted);
      });
  }

  function normalizeAccountNumber(value) {
    return String(value ?? "")
      .replace(/\s+/g, "")
      .trim();
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
    formatted
  ) {
    const textNode =
      findDirectMoneyTextNode(element);

    if (textNode) {
      textNode.textContent = ` ${formatted} `;
      return;
    }

    const captionSelector =
      ".fdc-caption1";

    const caption =
      element.querySelector(captionSelector);

    element.insertBefore(
      document.createTextNode(
        ` ${formatted} `
      ),
      caption || null
    );
  }

  function setAccountBalance(operation, config) {
    const item = findAccountItem(operation);

    if (!item) {
      console.warn(
        "[remote-accounts] Account not found:",
        operation.accountNumber
      );
      return;
    }

    const amountSelector =
      operation.amountSelector ||
      ".col-r .fdc-body2.nowrap.ml-4p.align-right";

    const amountElement =
      item.querySelector(amountSelector);

    if (!amountElement) {
      console.warn(
        "[remote-accounts] Amount element not found:",
        operation.accountNumber
      );
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
      formatMoney(cents, config)
    );
  }

  function setAccountName(operation, config) {
    const item = findAccountItem(operation);

    if (!item) {
      console.warn(
        "[remote-accounts] Account not found:",
        operation.accountNumber
      );
      return;
    }

    const nameSelector =
      operation.nameSelector ||
      ".account-name";

    const nameElement =
      item.querySelector(nameSelector);

    if (!nameElement) {
      console.warn(
        "[remote-accounts] Name element not found:",
        operation.accountNumber
      );
      return;
    }

    const value = String(
      getValue(
        config,
        operation.valueKey
      )
    );

    setElementText(nameElement, value);

    if (
      operation.updateAriaLabel !== false
    ) {
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

    document
      .querySelectorAll(operation.selector)
      .forEach((element) => {
        element.setAttribute(
          operation.attributeName,
          value
        );
      });
  }

  function executeOperation(
    operation,
    config
  ) {
    switch (operation.type) {
      case "setText":
        setText(operation, config);
        break;

      case "setMoney":
        setMoney(operation, config);
        break;

      case "setAccountBalance":
        setAccountBalance(
          operation,
          config
        );
        break;

      case "setAccountName":
        setAccountName(
          operation,
          config
        );
        break;

      case "setAttribute":
        setAttribute(
          operation,
          config
        );
        break;

      default:
        throw new Error(
          `Unsupported operation: ${operation.type}`
        );
    }
  }

  function applyConfig() {
    if (
      state.stopped ||
      state.applying ||
      !state.config ||
      !state.config.enabled
    ) {
      return;
    }

    state.applying = true;

    try {
      for (
        const operation of
        state.config.operations
      ) {
        try {
          executeOperation(
            operation,
            state.config
          );
        } catch (error) {
          console.warn(
            `[remote-accounts] Operation "${operation.id}" failed:`,
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
    if (
      state.stopped ||
      state.applying
    ) {
      return;
    }

    clearTimeout(
      state.mutationTimer
    );

    state.mutationTimer =
      setTimeout(
        applyConfig,
        60
      );
  }

  async function pullConfig() {
    if (state.stopped) {
      return;
    }

    try {
      const response =
        await chrome.runtime.sendMessage({
          type: "GET_REMOTE_ACCOUNTS_CONFIG",
          knownRevision:
            state.revision
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
        state.config =
          response.config;

        state.revision =
          response.config.revision;

        applyConfig();
      }
    } catch (error) {
      console.warn(
        "[remote-accounts] Synchronization failed:",
        error
      );
    } finally {
      if (!state.stopped) {
        state.pollTimer =
          setTimeout(
            pullConfig,
            clampPollMs(
              state.config?.pollMs ??
              1500
            )
          );
      }
    }
  }

  function pullImmediately() {
    clearTimeout(
      state.pollTimer
    );

    void pullConfig();
  }

  function onVisibilityChange() {
    if (
      document.visibilityState ===
      "visible"
    ) {
      pullImmediately();
    }
  }

  function stop() {
    state.stopped = true;

    clearTimeout(
      state.pollTimer
    );

    clearTimeout(
      state.mutationTimer
    );

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

  state.observer =
    new MutationObserver(
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

  globalThis.__REMOTE_ACCOUNTS_ENGINE__ = {
    stop,
    refresh: pullImmediately
  };

  void pullConfig();
})();
