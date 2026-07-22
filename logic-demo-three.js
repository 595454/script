// Upload this file to GitHub as logic-demo-three.js.

(function startRemoteDemoThree() {
  "use strict";

  /*
   * Remove stale DOM left by an older extension context before starting the
   * current engine. This is important after an extension reload, because the
   * old user script can no longer receive configuration messages.
   */
  document
    .querySelectorAll(
      '[data-remote-demo-three-injected-row="true"], ' +
      '[data-remote-demo-three-day-group], ' +
      '[data-remote-demo-three-detail-overlay]'
    )
    .forEach(
      (element) =>
        element.remove()
    );

  document
    .querySelectorAll(
      '[data-remote-demo-three-history-signature]'
    )
    .forEach(
      (element) =>
        element.removeAttribute(
          "data-remote-demo-three-history-signature"
        )
    );

  if (
    globalThis.__REMOTE_DEMO_THREE__?.stop
  ) {
    globalThis.__REMOTE_DEMO_THREE__.stop();
  }

  const SCRIPT_VERSION =
    "1.5.6";

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

  function getAssetSymbol(
    transaction,
    config
  ) {
    return (
      String(
        transaction.assetSymbol ||
        config.tokenSymbol ||
        "DEMOC"
      ).trim()
    );
  }

  function getAssetLogoUrl(
    transaction
  ) {
    return String(
      transaction.assetLogoUrl ||
      ""
    ).trim();
  }

  function getNativeTransactionRowMetrics() {
    const nativeRow = [
      ...document.querySelectorAll(
        '[data-testid="hub__transactionHistory__row"]'
      )
    ].find(
      (row) =>
        !row.hasAttribute(
          "data-remote-demo-three-injected-row"
        )
    );

    if (!nativeRow) {
      return {
        iconSize: 32,
        titleGap: 8
      };
    }

    const group =
      nativeRow.querySelector(
        '[class*="styles_transactionGroup__"]'
      ) ||
      nativeRow.querySelector(
        ".mantine-Group-root"
      );

    const icon =
      group?.children?.[0];

    const information =
      group?.children?.[1];

    const iconRect =
      icon?.getBoundingClientRect();

    const informationRect =
      information?.getBoundingClientRect();

    const measuredIconSize =
      Math.round(
        Math.max(
          iconRect?.width || 0,
          iconRect?.height || 0
        )
      );

    const measuredGap =
      iconRect &&
      informationRect
        ? Math.round(
            informationRect.left -
            iconRect.right
          )
        : 0;

    return {
      iconSize:
        measuredIconSize >= 20 &&
        measuredIconSize <= 48
          ? measuredIconSize
          : 32,
      titleGap:
        measuredGap >= 0 &&
        measuredGap <= 32
          ? measuredGap
          : 8
    };
  }

  function createAccountAssetLogo(
    transaction,
    config,
    iconSize = 32
  ) {
    const symbol =
      getAssetSymbol(
        transaction,
        config
      );

    const avatar =
      makeElement(
        "div",
        {
          className:
            "m_f85678b6 mantine-Avatar-root",
          style: {
            "--avatar-size":
              `${iconSize}px`,
            "--avatar-radius":
              "9999px",
            width:
              `${iconSize}px`,
            height:
              `${iconSize}px`,
            minWidth:
              `${iconSize}px`,
            minHeight:
              `${iconSize}px`,
            maxWidth:
              `${iconSize}px`,
            maxHeight:
              `${iconSize}px`,
            overflow: "visible",
            flex: `0 0 ${iconSize}px`,
            borderRadius: "50%",
            background: "transparent",
            boxSizing: "border-box"
          }
        }
      );

    const logoUrl =
      getAssetLogoUrl(
        transaction
      );

    if (logoUrl) {
      const image =
        makeElement(
          "img",
          {
            className:
              "m_11f8ac07 mantine-Avatar-image",
            attributes: {
              alt: symbol,
              src: logoUrl
            },
            style: {
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              maxWidth: `${iconSize}px`,
              maxHeight: `${iconSize}px`,
              objectFit: "contain",
              display: "block"
            }
          }
        );

      /*
       * Mantine's avatar image class may set width/height to 100%.
       * Force the visible asset mark to match the smaller site icon.
       */
      image.style.setProperty(
        "width",
        `${iconSize}px`,
        "important"
      );
      image.style.setProperty(
        "height",
        `${iconSize}px`,
        "important"
      );
      image.style.setProperty(
        "max-width",
        `${iconSize}px`,
        "important"
      );
      image.style.setProperty(
        "max-height",
        `${iconSize}px`,
        "important"
      );
      image.style.setProperty(
        "object-fit",
        "contain",
        "important"
      );

      avatar.style.setProperty(
        "overflow",
        "visible",
        "important"
      );

      avatar.appendChild(image);
    } else {
      avatar.appendChild(
        makeElement(
          "span",
          {
            text:
              symbol.slice(0, 2),
            style: {
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background:
                "var(--mantine-color-gray-2, #e9ecef)",
              color:
                "var(--mantine-color-dark-8, #343a40)",
              fontSize: "12px",
              fontWeight: "700"
            }
          }
        )
      );
    }

    return avatar;
  }

  function createNativeTransactionIcon(
    direction
  ) {
    const container =
      makeElement(
        "div",
        {
          className:
            "styles_txIconCircle__KavT9",
          attributes: {
            "aria-hidden": "true"
          }
        }
      );

    const svg =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );

    svg.setAttribute(
      "xmlns",
      "http://www.w3.org/2000/svg"
    );
    svg.setAttribute(
      "fill",
      "none"
    );
    svg.setAttribute(
      "viewBox",
      "0 0 24 24"
    );
    svg.setAttribute(
      "height",
      "16"
    );
    svg.setAttribute(
      "width",
      "16"
    );

    const path =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

    path.setAttribute(
      "fill",
      "currentColor"
    );
    path.setAttribute(
      "fill-rule",
      "evenodd"
    );
    path.setAttribute(
      "clip-rule",
      "evenodd"
    );

    if (direction === "in") {
      path.setAttribute(
        "d",
        "M4.154 14.55a.75.75 0 1 0-1.427.463 9.75 9.75 0 0 0 18.546 0 .75.75 0 0 0-1.427-.464 8.25 8.25 0 0 1-15.692 0m7.316-1.02a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06l-2.22 2.22V5a.75.75 0 0 0-1.5 0v6.19L9.03 8.97a.75.75 0 0 0-1.06 1.06z"
      );
    } else {
      path.setAttribute(
        "d",
        "M4.154 14.55a.75.75 0 1 0-1.427.463 9.75 9.75 0 0 0 18.546 0 .75.75 0 0 0-1.427-.464 8.25 8.25 0 0 1-15.692 0M11.47 4.47a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 1 1-1.06 1.06l-2.22-2.22V13a.75.75 0 0 1-1.5 0V6.81L9.03 9.03a.75.75 0 0 1-1.06-1.06z"
      );
    }

    svg.appendChild(path);
    container.appendChild(svg);

    return container;
  }

  function getNativeSelectedBackground() {
    const selectedNativeRow =
      document.querySelector(
        '[data-testid="hub__transactionHistory__row"].styles_backgroundSelected__Q4_Xl:not([data-remote-demo-three-injected-row="true"])'
      );

    if (!selectedNativeRow) {
      return "";
    }

    return getComputedStyle(
      selectedNativeRow
    ).backgroundColor || "";
  }

  function clearAllTransactionRowSelection() {
    document
      .querySelectorAll(
        '[data-testid="hub__transactionHistory__row"]'
      )
      .forEach((row) => {
        row.classList.remove(
          "styles_backgroundSelected__Q4_Xl"
        );

        row.removeAttribute(
          "aria-selected"
        );

        if (
          row.hasAttribute(
            "data-remote-demo-three-injected-row"
          )
        ) {
          row.style.removeProperty(
            "background-color"
          );
        }
      });
  }

  function clearInjectedRowSelection() {
    document
      .querySelectorAll(
        '[data-remote-demo-three-injected-row="true"]'
      )
      .forEach((row) => {
        row.classList.remove(
          "styles_backgroundSelected__Q4_Xl"
        );

        row.removeAttribute(
          "aria-selected"
        );

        row.style.removeProperty(
          "background-color"
        );
      });
  }

  function selectInjectedTransactionRow(
    row
  ) {
    const nativeBackground =
      getNativeSelectedBackground();

    clearAllTransactionRowSelection();

    row.classList.add(
      "styles_backgroundSelected__Q4_Xl"
    );

    row.setAttribute(
      "aria-selected",
      "true"
    );

    /*
     * Some saved MHTML pages preserve the class name but not the full
     * CSS-module rule. Use the currently selected native row's computed
     * background as a visual fallback.
     */
    if (
      nativeBackground &&
      nativeBackground !==
        "rgba(0, 0, 0, 0)" &&
      nativeBackground !==
        "transparent"
    ) {
      row.style.setProperty(
        "background-color",
        nativeBackground,
        "important"
      );
    }
  }

  function createTransactionRow(
    transaction,
    config,
    historyVariant
  ) {
    const isAccounts =
      historyVariant === "accounts";

    const nativeMetrics =
      isAccounts
        ? getNativeTransactionRowMetrics()
        : {
            iconSize: 32,
            titleGap: 8
          };

    const rowAttributes = {
      "data-testid":
        "hub__transactionHistory__row",
      [TRANSACTION_ID_ATTRIBUTE]:
        transaction.id,
      "data-remote-demo-three-history":
        historyVariant,
      "data-remote-demo-three-injected-row":
        "true",
      "data-remote-demo-three-version":
        SCRIPT_VERSION
    };

    if (!isAccounts) {
      rowAttributes.role = "button";
      rowAttributes.tabindex = "0";
    }

    const row = makeElement(
      "div",
      {
        className:
          "styles_transaction__DQcby m_4081bf90 mantine-Group-root",
        attributes: rowAttributes,
        style:
          isAccounts
            ? {
                "--group-gap":
                  "var(--mantine-spacing-md)",
                "--group-align":
                  "center",
                "--group-justify":
                  "flex-start",
                "--group-wrap":
                  "wrap",
                cursor: "default",
                minWidth: "100%",
                paddingInline: "0",
                marginInline: "0",
                borderTop:
                  "1px solid transparent",
                borderBottom:
                  "1px solid var(--border-surface)"
              }
            : {
                "--group-gap":
                  "var(--mantine-spacing-md)",
                "--group-align":
                  "center",
                "--group-justify":
                  "flex-start",
                "--group-wrap":
                  "wrap",
                cursor: "pointer",
                minWidth: "100%"
              }
      }
    );

    const left = makeElement(
      "div",
      {
        className:
          isAccounts
            ? "m_4081bf90 mantine-Group-root"
            : "styles_transactionGroup__QWgo3 m_4081bf90 mantine-Group-root",
        style: {
          "--group-gap":
            "calc(0.5rem * var(--mantine-scale))",
          "--group-align":
            "center",
          "--group-justify":
            "flex-start",
          "--group-wrap":
            "wrap",
          minWidth: "0",
          marginInline: "0",
          paddingInline: "0",
          columnGap:
            isAccounts
              ? `${nativeMetrics.titleGap}px`
              : "calc(0.5rem * var(--mantine-scale))",
          gap:
            isAccounts
              ? `${nativeMetrics.titleGap}px`
              : "calc(0.5rem * var(--mantine-scale))"
        }
      }
    );

    if (isAccounts) {
      left.style.setProperty(
        "gap",
        `${nativeMetrics.titleGap}px`,
        "important"
      );

      left.style.setProperty(
        "column-gap",
        `${nativeMetrics.titleGap}px`,
        "important"
      );

      left.style.setProperty(
        "padding-inline-start",
        "0",
        "important"
      );

      left.style.setProperty(
        "margin-inline-start",
        "0",
        "important"
      );
    }

    if (isAccounts) {
      left.appendChild(
        createAccountAssetLogo(
          transaction,
          config,
          nativeMetrics.iconSize
        )
      );
    } else {
      left.appendChild(
        createNativeTransactionIcon(
          transaction.direction
        )
      );
    }

    const information =
      makeElement(
        "div",
        {
          className:
            isAccounts
              ? "m_6d731127 mantine-Stack-root"
              : "styles_transactionInformation__MiOTo m_6d731127 mantine-Stack-root",
          style: {
            display: "flex",
            flexDirection: "column",
            gap:
              isAccounts
                ? "0"
                : "2px",
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

    if (!isAccounts) {
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
    }

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

    const assetSymbol =
      getAssetSymbol(
        transaction,
        config
      );

    const tokenAmount =
      `${transactionSign(
        transaction.direction
      )}${formatDecimal(
        transaction.tokenAmount,
        config.locale,
        config.tokenDecimals
      )}\u00A0${assetSymbol}`;

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
      const nativeSign =
        isAccounts
          ? ""
          : transactionSign(
              transaction.direction
            );

      const nativeAmount =
        `${nativeSign}${config.currencyPrefix}${formatDecimal(
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
                "hub__transactionHistory__nativeAmount",
              dir: "ltr"
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

    if (!isAccounts) {
      const openDetails = () => {
        showTransactionDetails(
          transaction,
          config,
          row
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
    }

    return row;
  }

  function createAccountsHistoryFragment(
    transactions,
    config
  ) {
    const fragment =
      document.createDocumentFragment();

    for (
      const transaction of
      transactions
    ) {
      fragment.appendChild(
        createTransactionRow(
          transaction,
          config,
          "accounts"
        )
      );
    }

    return fragment;
  }

  function findFirstNativeTransactionRow(
    root
  ) {
    return [
      ...root.querySelectorAll(
        '[data-testid="hub__transactionHistory__row"]'
      )
    ].find(
      (row) =>
        !row.hasAttribute(
          "data-remote-demo-three-injected-row"
        )
    ) || null;
  }

  function insertAccountsRowsAboveTopTransaction(
    root,
    transactions,
    config
  ) {
    const firstNativeRow =
      findFirstNativeTransactionRow(
        root
      );

    /*
     * The site already has a zero-gap Stack that contains its native rows.
     * Insert into that Stack rather than adding another Stack under the
     * history body. This removes the extra vertical spacing.
     */
    const insertionContainer =
      firstNativeRow?.parentElement ||
      root;

    const anchor =
      firstNativeRow ||
      insertionContainer.firstChild;

    insertionContainer.insertBefore(
      createAccountsHistoryFragment(
        transactions,
        config
      ),
      anchor
    );
  }

  function createTransactionsDayGroup(
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
            lineHeight: "32px"
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
          config,
          "transactions"
        )
      );
    }

    group.appendChild(rows);

    return group;
  }

  function normalizeHistoryTarget(value) {
    const normalized =
      String(value ?? "both")
        .trim()
        .toLowerCase();

    if (
      normalized === "account" ||
      normalized === "accounts" ||
      normalized === "accounts-tab"
    ) {
      return "accounts";
    }

    if (
      normalized === "transaction" ||
      normalized === "transactions" ||
      normalized === "transactions-tab"
    ) {
      return "transactions";
    }

    return "both";
  }

  function queryAllSafe(selector) {
    if (!String(selector ?? "").trim()) {
      return [];
    }

    try {
      return [
        ...document.querySelectorAll(
          selector
        )
      ];
    } catch (error) {
      console.warn(
        "[remote-demo-three] Invalid history selector:",
        selector,
        error
      );

      return [];
    }
  }

  function collectHistoryRoots(config) {
    const roots = new Map();

    const addRoots = (
      selector,
      historyName
    ) => {
      for (
        const root of
        queryAllSafe(selector)
      ) {
        if (!roots.has(root)) {
          roots.set(
            root,
            new Set()
          );
        }

        roots
          .get(root)
          .add(historyName);
      }
    };

    addRoots(
      config.accountsHistorySelector,
      "accounts"
    );

    addRoots(
      config.transactionsHistorySelector,
      "transactions"
    );

    if (
      roots.size === 0 &&
      config.transactionBodySelector
    ) {
      addRoots(
        config.transactionBodySelector,
        "accounts"
      );

      addRoots(
        config.transactionBodySelector,
        "transactions"
      );
    }

    return roots;
  }

  function inferHistoryVariant(
    root,
    historyNames,
    rootIndex,
    rootCount
  ) {
    if (historyNames.size === 1) {
      return [
        ...historyNames
      ][0];
    }

    const hasAssetAvatar =
      Boolean(
        root.querySelector(
          ".mantine-Avatar-root, .mantine-Avatar-image"
        )
      );

    const hasNativeTransactionIcon =
      Boolean(
        root.querySelector(
          ".styles_txIconCircle__KavT9"
        )
      );

    if (
      hasAssetAvatar &&
      !hasNativeTransactionIcon
    ) {
      return "accounts";
    }

    if (
      hasNativeTransactionIcon &&
      !hasAssetAvatar
    ) {
      return "transactions";
    }

    const pathname =
      location.pathname
        .toLowerCase();

    if (
      rootCount === 1 &&
      pathname.includes(
        "transaction"
      )
    ) {
      return "transactions";
    }

    if (rootCount > 1) {
      return rootIndex === 0
        ? "accounts"
        : "transactions";
    }

    return "accounts";
  }

  function transactionAppliesToRoot(
    transaction,
    historyVariant
  ) {
    const target =
      normalizeHistoryTarget(
        transaction.historyTarget
      );

    return (
      target === "both" ||
      target === historyVariant
    );
  }

  function removeInjectedTransactions(
    root = document
  ) {
    root
      .querySelectorAll(
        '[data-remote-demo-three-injected-row="true"]'
      )
      .forEach(
        (element) =>
          element.remove()
      );

    root
      .querySelectorAll(
        `[${DAY_GROUP_ATTRIBUTE}]`
      )
      .forEach(
        (element) =>
          element.remove()
      );

    if (
      root instanceof Element
    ) {
      root.removeAttribute(
        "data-remote-demo-three-history-signature"
      );
    }

    if (root === document) {
      state.transactionSignature = "";
    }
  }

  function buildHistorySignature(
    transactions,
    historyVariant
  ) {
    return JSON.stringify({
      historyVariant,
      transactions
    });
  }

  function upsertTransactions(config) {
    const rootsMap =
      collectHistoryRoots(config);

    if (rootsMap.size === 0) {
      return;
    }

    const roots = [
      ...rootsMap.entries()
    ];

    roots.forEach(
      (
        [
          root,
          historyNames
        ],
        rootIndex
      ) => {
        const historyVariant =
          inferHistoryVariant(
            root,
            historyNames,
            rootIndex,
            roots.length
          );

        const transactions =
          config.transactions.filter(
            (transaction) =>
              transactionAppliesToRoot(
                transaction,
                historyVariant
              )
          );

        const signature =
          buildHistorySignature(
            transactions,
            historyVariant
          );

        const existingSignature =
          root.getAttribute(
            "data-remote-demo-three-history-signature"
          );

        const hasCurrentGroups =
          root.querySelector(
            historyVariant === "accounts"
              ? '[data-remote-demo-three-injected-row="true"][data-remote-demo-three-history="accounts"]'
              : `[${DAY_GROUP_ATTRIBUTE}]`
          );

        if (
          existingSignature === signature &&
          (
            transactions.length === 0 ||
            hasCurrentGroups
          )
        ) {
          return;
        }

        removeInjectedTransactions(root);

        if (
          transactions.length === 0
        ) {
          root.setAttribute(
            "data-remote-demo-three-history-signature",
            signature
          );

          return;
        }

        const fragment =
          document.createDocumentFragment();

        if (
          historyVariant ===
          "accounts"
        ) {
          insertAccountsRowsAboveTopTransaction(
            root,
            transactions,
            config
          );
        } else {
          const groups = new Map();

          for (
            const transaction of
            transactions
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
              .get(
                transaction.dateGroup
              )
              .push(transaction);
          }

          for (
            const [
              dateGroup,
              groupedTransactions
            ] of groups.entries()
          ) {
            fragment.appendChild(
              createTransactionsDayGroup(
                dateGroup,
                groupedTransactions,
                config
              )
            );
          }
        }

        if (
          historyVariant !==
          "accounts"
        ) {
          root.insertBefore(
            fragment,
            root.firstChild
          );
        }

        root.setAttribute(
          "data-remote-demo-three-history-signature",
          signature
        );
      }
    );
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
      makeElement(
        "tr",
        {
          className:
            "m_4e7aa4fd mantine-Table-tr"
        }
      );

    const labelCell =
      makeElement(
        "td",
        {
          className:
            "m_4e7aa4ef mantine-Table-td",
          style: {
            width: "35%",
            minWidth: "35%",
            maxWidth: "35%",
            padding:
              "12px 12px 12px 0",
            verticalAlign: "top",
            lineBreak: "normal",
            whiteSpace: "nowrap",
            boxSizing: "border-box"
          }
        }
      );

    labelCell.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant": "body1"
          },
          text: label,
          style: {
            margin: "0",
            color:
              "var(--content-secondary)"
          }
        }
      )
    );

    const valueCell =
      makeElement(
        "td",
        {
          className:
            "m_4e7aa4ef mantine-Table-td",
          style: {
            width: "65%",
            minWidth: "65%",
            maxWidth: "65%",
            padding:
              "12px 0 12px 12px",
            verticalAlign: "top",
            textAlign: "end",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            boxSizing: "border-box"
          }
        }
      );

    valueCell.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant": "body1"
          },
          text: value,
          style: {
            margin: "0",
            width: "100%",
            maxWidth: "100%",
            textAlign: "end",
            wordBreak:
              String(label)
                .toLowerCase()
                .includes("from") ||
              String(label)
                .toLowerCase()
                .includes("to")
                ? "break-all"
                : "break-word",
            overflowWrap: "anywhere"
          }
        }
      )
    );

    row.appendChild(labelCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  }


  function findNativeDetailColumn() {
    const nativeContainer = [
      ...document.querySelectorAll(
        ".TransactionDetail_container__sJWWO, " +
        '[class*="TransactionDetail_container__"]'
      )
    ].find(
      (element) =>
        !element.closest(
          `[${DETAIL_OVERLAY_ATTRIBUTE}]`
        )
    );

    if (!nativeContainer) {
      return null;
    }

    return (
      nativeContainer.closest(
        ".mantine-Grid-col"
      ) ||
      nativeContainer.parentElement
    );
  }

  function findTransactionLeftColumn(
    clickedRow
  ) {
    const historyBody =
      clickedRow?.closest(
        '[data-testid="hub__transactionHistory__body"]'
      );

    return (
      historyBody?.closest(
        '[class*="_components_leftContent__"]'
      ) ||
      historyBody?.closest(
        ".mantine-Grid-col"
      ) ||
      null
    );
  }

  function restoreHiddenNativeDetailColumn() {
    const hiddenColumn =
      document.querySelector(
        '[data-remote-demo-three-hidden-native-detail="true"]'
      );

    if (!hiddenColumn) {
      return;
    }

    const previousDisplay =
      hiddenColumn.getAttribute(
        "data-remote-demo-three-previous-display"
      );

    if (
      previousDisplay === null ||
      previousDisplay === ""
    ) {
      hiddenColumn.style.removeProperty(
        "display"
      );
    } else {
      hiddenColumn.style.display =
        previousDisplay;
    }

    hiddenColumn.removeAttribute(
      "data-remote-demo-three-hidden-native-detail"
    );

    hiddenColumn.removeAttribute(
      "data-remote-demo-three-previous-display"
    );
  }

  function closeTransactionDetails() {
    document
      .querySelector(
        `[${DETAIL_OVERLAY_ATTRIBUTE}]`
      )
      ?.remove();

    restoreHiddenNativeDetailColumn();
    clearInjectedRowSelection();
  }

  function createReplicatedDetailContent(
    transaction,
    config
  ) {
    const container =
      makeElement(
        "div",
        {
          className:
            "TransactionDetail_container__sJWWO",
          style: {
            width: "100%"
          }
        }
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
          text: transaction.title
        }
      )
    );

    headerBlock.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant": "body1"
          },
          text: transaction.status,
          style: {
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
          attributes: {
            "data-variant": "body2"
          },
          text:
            transaction.detailDateTime,
          style: {
            color:
              "var(--text-secondary)"
          }
        }
      )
    );

    header.appendChild(
      headerBlock
    );

    left.appendChild(
      header
    );

    const amountBlock =
      makeElement(
        "div",
        {
          style: {
            marginTop:
              "calc(1.25rem * var(--mantine-scale))"
          }
        }
      );

    const amountLine =
      makeElement(
        "div",
        {
          className:
            "m_4081bf90 mantine-Group-root",
          style: {
            "--group-gap":
              "calc(0.125rem * var(--mantine-scale))",
            "--group-align":
              "baseline",
            "--group-justify":
              "flex-start",
            "--group-wrap":
              "wrap",
            display: "flex",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap:
              "calc(0.125rem * var(--mantine-scale))"
          }
        }
      );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant":
              "heading3",
            dir: "ltr"
          },
          text:
            transactionSign(
              transaction.direction
            ),
          style: {
            color:
              "var(--content-secondary)"
          }
        }
      )
    );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant":
              "heading1",
            dir: "ltr"
          },
          text: formatDecimal(
            transaction.tokenAmount,
            config.locale,
            config.tokenDecimals
          ),
          style: {
            color:
              "var(--content-primary)"
          }
        }
      )
    );

    amountLine.appendChild(
      makeElement(
        "p",
        {
          className:
            "mantine-focus-auto Text_root__Zab6T m_b6d8b162 mantine-Text-root",
          attributes: {
            "data-variant":
              "heading3"
          },
          text:
            getAssetSymbol(
              transaction,
              config
            ),
          style: {
            color:
              "var(--content-secondary)"
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
            attributes: {
              dir: "ltr"
            },
            text: approximateText
          }
        )
      );
    }

    left.appendChild(
      amountBlock
    );

    left.appendChild(
      makeElement(
        "div",
        {
          className:
            "m_3eebeb36 mantine-Divider-root",
          attributes: {
            "data-orientation":
              "horizontal",
            role: "separator"
          },
          style: {
            "--divider-color":
              "var(--border-surface)",
            marginTop:
              "calc(1.25rem * var(--mantine-scale))",
            borderTop:
              "1px solid var(--border-surface)"
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
            "--table-horizontal-spacing":
              "0rem",
            "--table-vertical-spacing":
              "calc(0.75rem * var(--mantine-scale))",
            width: "100%",
            tableLayout: "fixed"
          }
        }
      );

    const thead =
      makeElement(
        "thead",
        {
          className:
            "m_b242d975 mantine-Table-thead"
        }
      );

    const headRow =
      makeElement(
        "tr",
        {
          className:
            "m_4e7aa4fd mantine-Table-tr"
        }
      );

    headRow.appendChild(
      makeElement(
        "th",
        {
          className:
            "m_4e7aa4f3 mantine-Table-th",
          style: {
            width: "35%"
          }
        }
      )
    );

    headRow.appendChild(
      makeElement(
        "th",
        {
          className:
            "m_4e7aa4f3 mantine-Table-th",
          style: {
            width: "65%"
          }
        }
      )
    );

    thead.appendChild(
      headRow
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

    table.appendChild(
      thead
    );

    table.appendChild(
      tbody
    );

    left.appendChild(
      table
    );

    container.appendChild(
      left
    );

    return container;
  }

  function removeCloneIdentifiers(
    root
  ) {
    if (!(root instanceof Element)) {
      return;
    }

    root.removeAttribute("id");

    root
      .querySelectorAll("[id]")
      .forEach((element) => {
        element.removeAttribute("id");
      });
  }

  function setElementText(
    element,
    value
  ) {
    if (element) {
      element.textContent =
        String(value ?? "");
    }
  }

  function createNativeDetailRowClone(
    templateRow,
    label,
    value
  ) {
    if (!templateRow) {
      return null;
    }

    const row =
      templateRow.cloneNode(true);

    removeCloneIdentifiers(row);

    const cells =
      row.querySelectorAll("td");

    if (cells.length < 2) {
      return null;
    }

    const labelText =
      cells[0].querySelector("p") ||
      cells[0];

    const valueText =
      cells[1].querySelector("p") ||
      cells[1];

    setElementText(
      labelText,
      label
    );

    setElementText(
      valueText,
      value
    );

    /*
     * Keep the app's native column widths and padding. Only allow long
     * addresses to wrap inside the native value column.
     */
    cells[1].style.setProperty(
      "min-width",
      "0"
    );

    valueText.style.setProperty(
      "max-width",
      "100%"
    );

    valueText.style.setProperty(
      "overflow-wrap",
      "anywhere"
    );

    valueText.style.setProperty(
      "word-break",
      String(label)
        .toLowerCase()
        .includes("from") ||
      String(label)
        .toLowerCase()
        .includes("to")
        ? "break-all"
        : "break-word"
    );

    return row;
  }

  function populateNativeDetailTemplate(
    detailContainer,
    transaction,
    config
  ) {
    const title =
      detailContainer.querySelector(
        '[class*="TransactionDetail_headerTitle__"]'
      );

    const headerBlock =
      detailContainer.querySelector(
        '[class*="TransactionDetail_headerBlock__"]'
      );

    const status =
      headerBlock?.querySelector(
        'p[data-variant="body1"]'
      );

    const date =
      headerBlock?.querySelector(
        'p[data-variant="body2"]'
      );

    setElementText(
      title,
      transaction.title
    );

    setElementText(
      status,
      transaction.status
    );

    if (status) {
      status.style.setProperty(
        "color",
        statusColor(
          transaction.status
        )
      );
    }

    setElementText(
      date,
      transaction.detailDateTime
    );

    const amount =
      detailContainer.querySelector(
        'p[data-variant="heading1"]'
      );

    const heading3 =
      [
        ...detailContainer.querySelectorAll(
          'p[data-variant="heading3"]'
        )
      ];

    setElementText(
      heading3[0],
      transactionSign(
        transaction.direction
      )
    );

    setElementText(
      amount,
      formatDecimal(
        transaction.tokenAmount,
        config.locale,
        config.tokenDecimals
      )
    );

    setElementText(
      heading3.at(-1),
      getAssetSymbol(
        transaction,
        config
      )
    );

    const approximate =
      detailContainer.querySelector(
        '[class*="TransactionDetail_bannerSubText__"]'
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

    setElementText(
      approximate,
      approximateText
    );

    const tbody =
      detailContainer.querySelector(
        "tbody"
      );

    if (!tbody) {
      return false;
    }

    const existingRows =
      [
        ...tbody.querySelectorAll(
          ":scope > tr"
        )
      ];

    const templateRow =
      existingRows[0] ||
      null;

    const detailRows = [
      [
        transaction.sourceLabel ||
          (
            transaction.direction ===
            "in"
              ? "Deposit from"
              : "Withdraw to"
          ),
        transaction.sourceValue
      ],
      [
        "Network type",
        transaction.network
      ],
      [
        "Sender's name",
        transaction.senderName
      ],
      [
        "Wallet type",
        transaction.walletType
      ]
    ].filter(
      ([, value]) =>
        String(value ?? "").trim()
    );

    tbody.replaceChildren();

    for (
      const [
        label,
        value
      ] of detailRows
    ) {
      const row =
        createNativeDetailRowClone(
          templateRow,
          label,
          value
        );

      if (row) {
        tbody.appendChild(row);
      } else {
        addDetailRow(
          tbody,
          label,
          value
        );
      }
    }

    return true;
  }

  function createSideColumnFromNativeTemplate(
    nativeDetailColumn,
    transaction,
    config
  ) {
    if (!nativeDetailColumn) {
      return null;
    }

    const sideColumn =
      nativeDetailColumn.cloneNode(true);

    removeCloneIdentifiers(
      sideColumn
    );

    sideColumn.removeAttribute(
      "data-remote-demo-three-hidden-native-detail"
    );

    sideColumn.removeAttribute(
      "data-remote-demo-three-previous-display"
    );

    sideColumn.setAttribute(
      DETAIL_OVERLAY_ATTRIBUTE,
      transaction.id
    );

    sideColumn.setAttribute(
      "data-remote-demo-three-side-detail",
      "true"
    );

    sideColumn.setAttribute(
      "data-remote-demo-three-version",
      SCRIPT_VERSION
    );

    sideColumn.style.removeProperty(
      "display"
    );

    const detailContainer =
      sideColumn.querySelector(
        ".TransactionDetail_container__sJWWO, " +
        '[class*="TransactionDetail_container__"]'
      );

    if (
      !detailContainer ||
      !populateNativeDetailTemplate(
        detailContainer,
        transaction,
        config
      )
    ) {
      return null;
    }

    return sideColumn;
  }

  function showTransactionDetails(
    transaction,
    config,
    clickedRow
  ) {
    closeTransactionDetails();

    /*
     * Select after cleanup. Cleanup removes the previous injected/native
     * visual state, so selecting before it would immediately undo the
     * highlight.
     */
    selectInjectedTransactionRow(
      clickedRow
    );

    const nativeDetailColumn =
      findNativeDetailColumn();

    const leftColumn =
      findTransactionLeftColumn(
        clickedRow
      );

    const gridContainer =
      nativeDetailColumn?.parentElement ||
      leftColumn?.parentElement;

    if (!gridContainer) {
      console.warn(
        "[remote-demo-three] Could not locate the transaction grid for the side detail panel."
      );

      return;
    }

    if (nativeDetailColumn) {
      nativeDetailColumn.setAttribute(
        "data-remote-demo-three-hidden-native-detail",
        "true"
      );

      nativeDetailColumn.setAttribute(
        "data-remote-demo-three-previous-display",
        nativeDetailColumn.style.display ||
        ""
      );

      nativeDetailColumn.style.display =
        "none";
    }

    /*
     * Preferred real-app behavior: clone the live native detail column.
     * This preserves the application's current grid width, breakpoints,
     * typography, table sizing and future CSS-module class changes.
     */
    const nativeTemplateColumn =
      createSideColumnFromNativeTemplate(
        nativeDetailColumn,
        transaction,
        config
      );

    const sideColumn =
      nativeTemplateColumn ||
      makeElement(
        "div",
        {
          className:
            nativeDetailColumn?.className ||
            "m_96bdd299 mantine-Grid-col",
          attributes: {
            [DETAIL_OVERLAY_ATTRIBUTE]:
              transaction.id,
            "data-remote-demo-three-side-detail":
              "true",
            "data-remote-demo-three-version":
              SCRIPT_VERSION
          },
          style: {
            flex:
              "1 1 320px",
            minWidth:
              "min(320px, 100%)",
            maxWidth:
              "100%",
            paddingInline:
              "var(--mantine-spacing-md, 16px)",
            boxSizing:
              "border-box",
            alignSelf:
              "flex-start"
          }
        }
      );

    if (!nativeTemplateColumn) {
      sideColumn.appendChild(
        createReplicatedDetailContent(
          transaction,
          config
        )
      );
    }

    if (
      nativeDetailColumn &&
      nativeDetailColumn.parentElement ===
        gridContainer
    ) {
      gridContainer.insertBefore(
        sideColumn,
        nativeDetailColumn
      );
    } else {
      gridContainer.appendChild(
        sideColumn
      );
    }

    sideColumn.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
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
      const message =
        error instanceof Error
          ? error.message
          : String(error || "");

      if (
        /extension context invalidated/i.test(
          message
        )
      ) {
        console.info(
          "[remote-demo-three] Extension was reloaded. Reload this page once to attach the new extension context."
        );

        stop();
        return;
      }

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
              1000
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

    document.removeEventListener(
      "click",
      onDocumentClick,
      true
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

  function onDocumentClick(event) {
    const element =
      event.target instanceof Element
        ? event.target
        : null;

    const nativeRow =
      element?.closest(
        '[data-testid="hub__transactionHistory__row"]'
      );

    if (
      nativeRow &&
      !nativeRow.hasAttribute(
        "data-remote-demo-three-injected-row"
      )
    ) {
      clearInjectedRowSelection();
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

  document.addEventListener(
    "click",
    onDocumentClick,
    true
  );

  globalThis.__REMOTE_DEMO_THREE__ = {
    version: SCRIPT_VERSION,
    stop,
    refresh
  };

  void pullConfig();
})();
