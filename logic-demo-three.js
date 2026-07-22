// Upload this file to GitHub as logic-demo-three.js.

(function startRemoteDemoThree() {
  "use strict";

  if (
    globalThis.__REMOTE_DEMO_THREE__?.stop
  ) {
    globalThis.__REMOTE_DEMO_THREE__.stop();
  }

  const ROOT_MARKER_SELECTOR =
    "#cdc-web-body";

  const ORIGINAL_TEXT_ATTRIBUTE =
    "data-remote-demo-three-original-text";

  const TARGET_ID_ATTRIBUTE =
    "data-remote-demo-three-target-id";

  const DAY_GROUP_ATTRIBUTE =
    "data-remote-demo-three-day-group";

  const TRANSACTION_ID_ATTRIBUTE =
    "data-remote-demo-three-transaction-id";

  const DETAIL_OVERLAY_ATTRIBUTE =
    "data-remote-demo-three-detail-overlay";

  const MIN_POLL_MS = 1000;
  const MAX_POLL_MS = 30000;

  const state = {
    stopped: false,
    applying: false,
    pollTimer: null,
    mutationTimer: null,
    observer: null,
    revision: "",
    config: null,
    transactionSignature: ""
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

  function cssEscape(value) {
    if (globalThis.CSS?.escape) {
      return CSS.escape(
        String(value)
      );
    }

    return String(value)
      .replace(
        /["\\]/g,
        "\\$&"
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

  function queryFirstSelector(
    selectorList
  ) {
    const selectors =
      String(selectorList)
        .split("||")
        .map(
          (selector) =>
            selector.trim()
        )
        .filter(Boolean);

    for (const selector of selectors) {
      try {
        const element =
          document.querySelector(
            selector
          );

        if (element) {
          return element;
        }
      } catch (error) {
        console.warn(
          "[remote-demo-three] Invalid selector:",
          selector,
          error
        );
      }
    }

    return null;
  }

  function rememberOriginalText(
    element,
    targetId
  ) {
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

    element.setAttribute(
      TARGET_ID_ATTRIBUTE,
      targetId
    );
  }

  function setTextTarget(
    target,
    config
  ) {
    const element =
      queryFirstSelector(
        target.selector
      );

    if (!element) {
      return;
    }

    rememberOriginalText(
      element,
      target.id
    );

    const nextText = String(
      getValue(
        config,
        target.valueKey
      )
    );

    if (
      element.textContent !==
      nextText
    ) {
      element.textContent =
        nextText;
    }
  }

  function restoreTarget(targetId) {
    document
      .querySelectorAll(
        `[${TARGET_ID_ATTRIBUTE}="${cssEscape(targetId)}"]`
      )
      .forEach((element) => {
        if (
          element.hasAttribute(
            ORIGINAL_TEXT_ATTRIBUTE
          )
        ) {
          element.textContent =
            element.getAttribute(
              ORIGINAL_TEXT_ATTRIBUTE
            ) ?? "";
        }

        element.removeAttribute(
          ORIGINAL_TEXT_ATTRIBUTE
        );

        element.removeAttribute(
          TARGET_ID_ATTRIBUTE
        );
      });
  }

  function cleanNumericText(value) {
    return String(value ?? "")
      .replace(/[^\d.,-]/g, "")
      .replace(/,/g, "");
  }

  function formatDecimal(
    value,
    locale,
    maximumFractionDigits
  ) {
    const parsed =
      Number(
        cleanNumericText(value)
      );

    if (!Number.isFinite(parsed)) {
      return String(value ?? "");
    }

    return new Intl.NumberFormat(
      locale,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits
      }
    ).format(
      Math.abs(parsed)
    );
  }

  function transactionSign(direction) {
    return direction === "in"
      ? "+"
      : "-";
  }

  function statusColor(status) {
    const normalized =
      String(status ?? "")
        .trim()
        .toLowerCase();

    if (
      normalized === "processed" ||
      normalized === "completed" ||
      normalized === "successful" ||
      normalized === "success"
    ) {
      return "var(--text-success, #099268)";
    }

    if (
      normalized === "pending" ||
      normalized === "processing" ||
      normalized === "in progress" ||
      normalized === "review"
    ) {
      return "var(--mantine-color-yellow-7, #f08c00)";
    }

    if (
      normalized === "failed" ||
      normalized === "rejected" ||
      normalized === "cancelled" ||
      normalized === "canceled"
    ) {
      return "var(--text-danger, #e03131)";
    }

    return "var(--text-secondary, #868e96)";
  }

  function makeElement(
    tag,
    options = {}
  ) {
    const element =
      document.createElement(tag);

    if (options.className) {
      element.className =
        options.className;
    }

    if (
      options.text !== undefined
    ) {
      element.textContent =
        String(options.text);
    }

    if (options.attributes) {
      for (
        const [name, value] of
        Object.entries(
          options.attributes
        )
      ) {
        element.setAttribute(
          name,
          String(value)
        );
      }
    }

    if (options.style) {
      Object.assign(
        element.style,
        options.style
      );
    }

    return element;
  }

  function createIcon(direction) {
    const icon = makeElement(
      "div",
      {
        attributes: {
          "aria-hidden": "true"
        },
        style: {
          width: "32px",
          height: "32px",
          borderRadius: "6px",
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          background:
            direction === "in"
              ? "var(--mantine-color-green-filled, #099268)"
              : "var(--mantine-color-gray-filled, #495057)",
          color: "#fff",
          fontWeight: "700",
          fontSize: "18px"
        },
        text:
          direction === "in"
            ? "↓"
            : "↑"
      }
    );

    return icon;
  }

  function createTransactionRow(
    transaction,
    config
  ) {
    const row = makeElement(
      "div",
      {
        className:
          "styles_transaction__DQcby m_4081bf90 mantine-Group-root",
        attributes: {
          "data-testid":
            "hub__transactionHistory__row",
          [TRANSACTION_ID_ATTRIBUTE]:
            transaction.id,
          role: "button",
          tabindex: "0"
        },
        style: {
          display: "flex",
          alignItems: "center",
          gap:
            "var(--mantine-spacing-md, 16px)",
          cursor: "pointer",
          minWidth: "100%",
          paddingBlock:
            "var(--mantine-spacing-sm, 12px)",
          borderBottom:
            "1px solid var(--border-surface, #dee2e6)"
        }
      }
    );

    const left = makeElement(
      "div",
      {
        className:
          "styles_transactionGroup__QWgo3 m_4081bf90 mantine-Group-root",
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: "0"
        }
      }
    );

    left.appendChild(
      createIcon(
        transaction.direction
      )
    );

    const information =
      makeElement(
        "div",
        {
          className:
            "styles_transactionInformation__MiOTo m_6d731127 mantine-Stack-root",
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            minWidth: "0"
          }
        }
      );

    information.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T styles_oneLineEllipsis__ns6Uw m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant":
              "subhead3"
          },
          text: transaction.title,
          style: {
            margin: "0",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis"
          }
        }
      )
    );

    information.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant":
              "caption1"
          },
          text: transaction.status,
          style: {
            margin: "0",
            color:
              statusColor(
                transaction.status
              )
          }
        }
      )
    );

    left.appendChild(information);

    const right = makeElement(
      "div",
      {
        className:
          "styles_transactionAmount__DsHZx m_4081bf90 mantine-Group-root",
        style: {
          marginInlineStart: "auto",
          textAlign: "end"
        }
      }
    );

    const amountStack =
      makeElement(
        "div",
        {
          className:
            "m_6d731127 mantine-Stack-root",
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0"
          }
        }
      );

    const tokenAmount =
      `${transactionSign(
        transaction.direction
      )}${formatDecimal(
        transaction.tokenAmount,
        config.locale,
        config.tokenDecimals
      )}\u00A0${config.tokenSymbol}`;

    amountStack.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant": "body2",
            dir: "ltr"
          },
          text: tokenAmount,
          style: {
            margin: "0",
            textAlign: "end",
            color:
              transaction.direction ===
              "in"
                ? "var(--text-success, #099268)"
                : "var(--text-primary, #212529)"
          }
        }
      )
    );

    if (
      String(
        transaction.nativeAmount
      ).trim()
    ) {
      const nativeAmount =
        `${transactionSign(
          transaction.direction
        )}${config.currencyPrefix}${formatDecimal(
          transaction.nativeAmount,
          config.locale,
          config.nativeDecimals
        )}\u00A0${config.nativeSymbol}`;

      amountStack.appendChild(
        makeElement(
          "p",
          {
            className:
              "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
            attributes: {
              "data-variant":
                "caption1",
              "data-testid":
                "hub__transactionHistory__nativeAmount"
            },
            text: nativeAmount,
            style: {
              margin: "0",
              color:
                "var(--text-secondary, #868e96)",
              textAlign: "end"
            }
          }
        )
      );
    }

    right.appendChild(amountStack);

    row.appendChild(left);
    row.appendChild(right);

    const openDetails = () => {
      showTransactionDetails(
        transaction,
        config
      );
    };

    row.addEventListener(
      "click",
      openDetails
    );

    row.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          openDetails();
        }
      }
    );

    return row;
  }

  function createDayGroup(
    dateGroup,
    transactions,
    config
  ) {
    const group = makeElement(
      "div",
      {
        className:
          "m_6d731127 mantine-Stack-root",
        attributes: {
          "data-testid":
            "hub__transactionHistory__dayGroupGrid",
          [DAY_GROUP_ATTRIBUTE]:
            dateGroup
        },
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "0"
        }
      }
    );

    group.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T styles_dateHeader__V0YBj m_b6d8b162 mantine-Text-root",
          text: dateGroup,
          style: {
            margin: "0",
            paddingBlock:
              "var(--mantine-spacing-xs, 8px)",
            color:
              "var(--content-primary, #212529)",
            fontSize: "18px",
            fontWeight: "600",
            lineHeight: "20px"
          }
        }
      )
    );

    const rows = makeElement(
      "div",
      {
        className:
          "m_6d731127 mantine-Stack-root",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "0"
        }
      }
    );

    for (
      const transaction of
      transactions
    ) {
      rows.appendChild(
        createTransactionRow(
          transaction,
          config
        )
      );
    }

    group.appendChild(rows);

    return group;
  }

  function removeInjectedTransactions() {
    document
      .querySelectorAll(
        `[${DAY_GROUP_ATTRIBUTE}]`
      )
      .forEach(
        (element) =>
          element.remove()
      );

    state.transactionSignature = "";
  }

  function upsertTransactions(config) {
    const root =
      document.querySelector(
        config.transactionBodySelector
      );

    if (!root) {
      return;
    }

    const signature =
      JSON.stringify(
        config.transactions
      );

    const hasCurrentGroups =
      root.querySelector(
        `[${DAY_GROUP_ATTRIBUTE}]`
      );

    if (
      state.transactionSignature ===
        signature &&
      hasCurrentGroups
    ) {
      return;
    }

    removeInjectedTransactions();

    const groups = new Map();

    for (
      const transaction of
      config.transactions
    ) {
      if (
        !groups.has(
          transaction.dateGroup
        )
      ) {
        groups.set(
          transaction.dateGroup,
          []
        );
      }

      groups
        .get(transaction.dateGroup)
        .push(transaction);
    }

    const fragment =
      document.createDocumentFragment();

    for (
      const [
        dateGroup,
        transactions
      ] of groups.entries()
    ) {
      fragment.appendChild(
        createDayGroup(
          dateGroup,
          transactions,
          config
        )
      );
    }

    root.insertBefore(
      fragment,
      root.firstChild
    );

    state.transactionSignature =
      signature;
  }

  function addDetailRow(
    tbody,
    label,
    value
  ) {
    if (!String(value ?? "").trim()) {
      return;
    }

    const row =
      makeElement("tr");

    const labelCell =
      makeElement(
        "td",
        {
          style: {
            width: "35%",
            padding:
              "12px 12px 12px 0",
            verticalAlign: "top",
            color:
              "var(--content-secondary, #868e96)",
            whiteSpace: "nowrap"
          }
        }
      );

    labelCell.appendChild(
      makeElement(
        "p",
        {
          text: label,
          style: {
            margin: "0"
          }
        }
      )
    );

    const valueCell =
      makeElement(
        "td",
        {
          style: {
            padding:
              "12px 0 12px 12px",
            textAlign: "end",
            wordBreak: "break-word"
          }
        }
      );

    valueCell.appendChild(
      makeElement(
        "p",
        {
          text: value,
          style: {
            margin: "0",
            overflowWrap: "anywhere"
          }
        }
      )
    );

    row.appendChild(labelCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  }

  function closeTransactionDetails() {
    document
      .querySelector(
        `[${DETAIL_OVERLAY_ATTRIBUTE}]`
      )
      ?.remove();
  }

  function showTransactionDetails(
    transaction,
    config
  ) {
    closeTransactionDetails();

    const overlay =
      makeElement(
        "div",
        {
          attributes: {
            [DETAIL_OVERLAY_ATTRIBUTE]:
              transaction.id,
            role: "dialog",
            "aria-modal": "true",
            "aria-label":
              `${transaction.title} details`
          },
          style: {
            position: "fixed",
            inset: "0",
            zIndex: "2147483647",
            overflow: "auto",
            background:
              "var(--mantine-color-body, #fff)",
            color:
              "var(--content-primary, #212529)"
          }
        }
      );

    const container =
      makeElement(
        "div",
        {
          className:
            "TransactionDetail_container__sJWWO",
          style: {
            maxWidth: "900px",
            margin: "0 auto",
            padding:
              "24px 20px 48px"
          }
        }
      );

    const backButton =
      makeElement(
        "button",
        {
          attributes: {
            type: "button",
            "aria-label":
              "Close transaction details"
          },
          text: "← Back",
          style: {
            border: "0",
            background: "transparent",
            color:
              "var(--mantine-primary-color-filled, #228be6)",
            cursor: "pointer",
            fontSize: "16px",
            padding: "8px 0",
            marginBottom: "16px"
          }
        }
      );

    backButton.addEventListener(
      "click",
      closeTransactionDetails
    );

    const left =
      makeElement(
        "div",
        {
          className:
            "TransactionDetail_leftContent__SkS3k"
        }
      );

    const header =
      makeElement(
        "div",
        {
          className:
            "TransactionDetail_bannerHeaderV2__7UmAv"
        }
      );

    const headerBlock =
      makeElement(
        "div",
        {
          className:
            "TransactionDetail_headerBlock__SxaOg"
        }
      );

    headerBlock.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T TransactionDetail_headerTitle__28v75 m_b6d8b162 mantine-Text-root",
          text: transaction.title,
          style: {
            margin: "0 0 6px",
            fontSize: "24px",
            fontWeight: "700"
          }
        }
      )
    );

    headerBlock.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          text: transaction.status,
          style: {
            margin: "0 0 6px",
            color:
              statusColor(
                transaction.status
              )
          }
        }
      )
    );

    headerBlock.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          text:
            transaction.detailDateTime,
          style: {
            margin: "0",
            color:
              "var(--text-secondary, #868e96)"
          }
        }
      )
    );

    header.appendChild(headerBlock);
    left.appendChild(header);

    const amountBlock =
      makeElement(
        "div",
        {
          style: {
            marginTop: "20px"
          }
        }
      );

    const amountLine =
      makeElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: "4px"
          }
        }
      );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          text:
            transactionSign(
              transaction.direction
            ),
          style: {
            margin: "0",
            color:
              "var(--content-secondary, #868e96)",
            fontSize: "20px"
          }
        }
      )
    );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          text: formatDecimal(
            transaction.tokenAmount,
            config.locale,
            config.tokenDecimals
          ),
          style: {
            margin: "0",
            fontSize: "34px",
            fontWeight: "700"
          }
        }
      )
    );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          text: config.tokenSymbol,
          style: {
            margin: "0",
            color:
              "var(--content-secondary, #868e96)",
            fontSize: "20px"
          }
        }
      )
    );

    amountBlock.appendChild(
      amountLine
    );

    const approximateText =
      String(
        transaction.detailApprox
      ).trim() ||
      (
        String(
          transaction.nativeAmount
        ).trim()
          ? `≈ ${config.currencyPrefix}${formatDecimal(
              transaction.nativeAmount,
              config.locale,
              config.nativeDecimals
            )} ${config.nativeSymbol}`
          : ""
      );

    if (approximateText) {
      amountBlock.appendChild(
        makeElement(
          "p",
          {
            className:
              "mantine-focus-auto Text_root__Zab6T TransactionDetail_bannerSubText__KARHk m_b6d8b162 mantine-Text-root",
            text: approximateText,
            style: {
              margin: "6px 0 0",
              color:
                "var(--content-secondary, #868e96)"
            }
          }
        )
      );
    }

    left.appendChild(amountBlock);

    left.appendChild(
      makeElement(
        "div",
        {
          attributes: {
            role: "separator"
          },
          style: {
            borderTop:
              "1px solid var(--border-surface, #dee2e6)",
            marginTop: "20px"
          }
        }
      )
    );

    const table =
      makeElement(
        "table",
        {
          className:
            "m_b23fa0ef mantine-Table-table",
          style: {
            width: "100%",
            borderCollapse:
              "collapse"
          }
        }
      );

    const tbody =
      makeElement(
        "tbody",
        {
          className:
            "m_b2404537 mantine-Table-tbody"
        }
      );

    addDetailRow(
      tbody,
      transaction.sourceLabel ||
        (
          transaction.direction ===
          "in"
            ? "Deposit from"
            : "Withdraw to"
        ),
      transaction.sourceValue
    );

    addDetailRow(
      tbody,
      "Network type",
      transaction.network
    );

    addDetailRow(
      tbody,
      "Sender's name",
      transaction.senderName
    );

    addDetailRow(
      tbody,
      "Wallet type",
      transaction.walletType
    );

    table.appendChild(tbody);
    left.appendChild(table);

    container.appendChild(backButton);
    container.appendChild(left);
    overlay.appendChild(container);

    overlay.addEventListener(
      "click",
      (event) => {
        if (event.target === overlay) {
          closeTransactionDetails();
        }
      }
    );

    document.body.appendChild(overlay);
    backButton.focus();
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
      if (
        !state.config.enabled ||
        !document.querySelector(
          ROOT_MARKER_SELECTOR
        )
      ) {
        for (
          const target of
          state.config.targets
        ) {
          restoreTarget(
            target.id
          );
        }

        removeInjectedTransactions();
        closeTransactionDetails();
        return;
      }

      for (
        const target of
        state.config.targets
      ) {
        try {
          setTextTarget(
            target,
            state.config
          );
        } catch (error) {
          console.warn(
            `[remote-demo-three] Target "${target.id}" failed:`,
            error
          );
        }
      }

      upsertTransactions(
        state.config
      );
    } finally {
      queueMicrotask(() => {
        state.applying = false;
      });
    }
  }

  function scheduleApply() {
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
        80
      );
  }

  function cleanupAll() {
    if (
      state.config?.targets
    ) {
      for (
        const target of
        state.config.targets
      ) {
        restoreTarget(
          target.id
        );
      }
    }

    removeInjectedTransactions();
    closeTransactionDetails();
  }

  async function pullConfig() {
    if (state.stopped) {
      return;
    }

    try {
      const response =
        await chrome.runtime.sendMessage({
          type:
            "GET_REMOTE_DEMO_THREE_CONFIG",
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
        cleanupAll();

        state.config =
          response.config;

        state.revision =
          response.config.revision;

        applyConfig();
      }
    } catch (error) {
      console.warn(
        "[remote-demo-three] Synchronization failed:",
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

  function refresh() {
    clearTimeout(
      state.pollTimer
    );

    void pullConfig();
  }

  function stop() {
    cleanupAll();

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
      refresh
    );

    document.removeEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    document.removeEventListener(
      "keydown",
      onKeyDown
    );
  }

  function onVisibilityChange() {
    if (
      document.visibilityState ===
      "visible"
    ) {
      refresh();
    }
  }

  function onKeyDown(event) {
    if (
      event.key === "Escape"
    ) {
      closeTransactionDetails();
    }
  }

  state.observer =
    new MutationObserver(
      scheduleApply
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
    refresh
  );

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );

  document.addEventListener(
    "keydown",
    onKeyDown
  );

  globalThis.__REMOTE_DEMO_THREE__ = {
    stop,
    refresh
  };

  void pullConfig();
})();
