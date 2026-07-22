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

  function createAccountAssetLogo(
    transaction,
    config
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
              "calc(2rem * var(--mantine-scale))",
            "--avatar-radius":
              "var(--mantine-radius-xs)",
            width:
              "calc(2rem * var(--mantine-scale, 1))",
            height:
              "calc(2rem * var(--mantine-scale, 1))",
            borderRadius:
              "var(--mantine-radius-xs, 4px)",
            overflow: "hidden",
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center"
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
              width: "20px",
              height: "20px",
              maxWidth: "20px",
              maxHeight: "20px",
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
        "20px",
        "important"
      );
      image.style.setProperty(
        "height",
        "20px",
        "important"
      );
      image.style.setProperty(
        "max-width",
        "20px",
        "important"
      );
      image.style.setProperty(
        "max-height",
        "20px",
        "important"
      );
      image.style.setProperty(
        "object-fit",
        "contain",
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
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background:
                "var(--mantine-color-gray-2, #e9ecef)",
              color:
                "var(--mantine-color-dark-8, #343a40)",
              fontSize: "11px",
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

  function createTransactionRow(
    transaction,
    config,
    historyVariant
  ) {
    const isAccounts =
      historyVariant === "accounts";

    const rowAttributes = {
      "data-testid":
        "hub__transactionHistory__row",
      [TRANSACTION_ID_ATTRIBUTE]:
        transaction.id,
      "data-remote-demo-three-history":
        historyVariant
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
        style: {
          display: "flex",
          alignItems: "center",
          gap:
            "var(--mantine-spacing-md, 16px)",
          cursor:
            isAccounts
              ? "default"
              : "pointer",
          minWidth: "100%",
          paddingBlock:
            "var(--mantine-spacing-sm, 12px)",
          borderTop:
            isAccounts
              ? "1px solid transparent"
              : "",
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

    if (isAccounts) {
      left.appendChild(
        createAccountAssetLogo(
          transaction,
          config
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
    }

    return row;
  }

  function createAccountsHistoryBlock(
    transactions,
    config
  ) {
    const rows = makeElement(
      "div",
      {
        className:
          "m_6d731127 mantine-Stack-root",
        attributes: {
          [DAY_GROUP_ATTRIBUTE]:
            "accounts"
        },
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
          "accounts"
        )
      );
    }

    return rows;
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
            `[${DAY_GROUP_ATTRIBUTE}]`
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
          fragment.appendChild(
            createAccountsHistoryBlock(
              transactions,
              config
            )
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

        root.insertBefore(
          fragment,
          root.firstChild
        );

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
          text:
            getAssetSymbol(
              transaction,
              config
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
