import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { FAUCET_ADDRESS, SEPOLIA_CHAIN_ID } from "./config.mjs";
import {
  formatAddress,
  formatTokenBalance,
  formatUnlockTime,
  getErrorMessage,
  getPrimaryAction,
  hasSufficientFunding,
  isConfiguredAddress,
} from "./core.mjs";

function createElements() {
  const elements = new Map();

  return {
    elements,
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) {
          elements.set(selector, {
            textContent: "",
            dataset: {},
            disabled: false,
            addEventListener() {},
          });
        }
        return elements.get(selector);
      },
    },
  };
}

async function loadAppHarness({ publicClient, ethereum = null }) {
  const app = await readFile(new URL("./app.mjs", import.meta.url), "utf8");
  const { document, elements } = createElements();
  const body = app
    .replace(
      /^import[\s\S]*?from "\.\/core\.mjs";\n/,
      `const {
        createPublicClient, createWalletClient, custom, http, sepolia,
        loadContractAbis, FAUCET_ADDRESS, SEPOLIA_CHAIN_ID,
        formatAddress, formatTokenBalance, formatUnlockTime,
        getErrorMessage, getPrimaryAction, hasSufficientFunding,
        isConfiguredAddress, window, document,
      } = dependencies;\n`,
    )
    .replace(
      /\ninitialize\(\)\.catch/,
      "\nconst initialization = initialize().catch",
    )
    .concat(
      "\nreturn { elements, initialization, refreshEligibility, state };\n",
    );
  const dependencies = {
    createPublicClient: () => publicClient,
    createWalletClient: () => ({ writeContract() {} }),
    custom: () => ({}),
    http: () => ({}),
    sepolia: {},
    loadContractAbis: async () => ({ faucetAbi: [{}], erc20Abi: [{}] }),
    FAUCET_ADDRESS,
    SEPOLIA_CHAIN_ID,
    formatAddress,
    formatTokenBalance,
    formatUnlockTime,
    getErrorMessage,
    getPrimaryAction,
    hasSufficientFunding,
    isConfiguredAddress,
    window: { ethereum, open() {} },
    document,
  };

  return Function("dependencies", body)(dependencies);
}

function readFundedFaucet({ functionName }) {
  const values = {
    paxgInstance: "0x0000000000000000000000000000000000000001",
    usdcInstance: "0x0000000000000000000000000000000000000002",
    allowedPAXGAmount: 1n,
    allowedUSDCAmount: 1n,
    decimals: 6,
    balanceOf: 1_000_000n,
  };

  return Promise.resolve(values[functionName]);
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("matches the current faucet contract and Sepolia configuration", async () => {
  const [app, faucetArtifact, erc20Artifact] = await Promise.all([
    readFile(new URL("./app.mjs", import.meta.url), "utf8"),
    readFile(new URL("../out/Faucet.sol/Faucet.json", import.meta.url), "utf8"),
    readFile(new URL("../out/ERC20.sol/ERC20.json", import.meta.url), "utf8"),
  ]);
  const faucetNames = new Set(
    JSON.parse(faucetArtifact).abi
      .filter((item) => item.type === "function")
      .map((item) => item.name),
  );
  const erc20Names = new Set(
    JSON.parse(erc20Artifact).abi
      .filter((item) => item.type === "function")
      .map((item) => item.name),
  );

  assert.equal(isConfiguredAddress(FAUCET_ADDRESS), true);
  assert.equal(SEPOLIA_CHAIN_ID, 11_155_111);
  assert.match(app, /import \{ loadContractAbis \} from "\.\/abi\.mjs";/);
  assert.doesNotMatch(app, /import \{[^}]*FAUCET_ABI[^}]*\} from "\.\/config\.mjs";/s);

  for (const name of [
    "allowedPAXGAmount",
    "allowedUSDCAmount",
    "claimTestTokens",
    "getAllowedTime",
    "isAllowedForTransaction",
    "paxgInstance",
    "usdcInstance",
  ]) {
    assert.equal(
      faucetNames.has(name),
      true,
      `${name} is missing from the Faucet ABI`,
    );
  }

  for (const name of ["balanceOf", "decimals", "symbol"]) {
    assert.equal(
      erc20Names.has(name),
      true,
      `${name} is missing from the ERC20 ABI`,
    );
  }

  for (const integration of [
    "https://esm.sh/viem@2.48.11",
    "custom(window.ethereum)",
    "wallet_switchEthereumChain",
    "simulateContract",
    "writeContract",
    "waitForTransactionReceipt",
    "accountsChanged",
    "chainChanged",
    "paxgInstance",
    "usdcInstance",
    "allowedPAXGAmount",
    "allowedUSDCAmount",
    'functionName: "decimals"',
    'functionName: "balanceOf"',
    "refreshFaucetBalances",
    'eligibilityStatus: "idle"',
    'eligibilityStatus = "loading"',
    'eligibilityStatus = "ready"',
    'eligibilityStatus = "error"',
    "Checking eligibility…",
    "Eligibility unavailable",
  ]) {
    assert.match(app, new RegExp(integration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(
    app,
    /waitForTransactionReceipt[\s\S]*receipt\.status[\s\S]*refreshFaucetBalances\(\)/,
  );
});

test("wallet initialization failure preserves successful faucet balances", async () => {
  const ethereum = {
    on() {},
    request: async () => {
      throw new Error("wallet sync failed");
    },
  };
  const app = await loadAppHarness({
    ethereum,
    publicClient: { readContract: readFundedFaucet },
  });

  await app.initialization;

  assert.equal(app.state.fundingStatus, "ready");
  assert.equal(app.elements.paxgBalance.textContent, "1 PAXG");
  assert.equal(app.elements.usdcBalance.textContent, "1 USDC");
});

test("stale eligibility response cannot overwrite the current account", async () => {
  const accountA = "0x00000000000000000000000000000000000000a1";
  const accountB = "0x00000000000000000000000000000000000000b2";
  const eligibilityReads = new Map(
    [accountA, accountB].map((account) => [
      account,
      {
        isAllowedForTransaction: deferred(),
        getAllowedTime: deferred(),
      },
    ]),
  );
  const publicClient = {
    readContract(request) {
      if (request.args) {
        return eligibilityReads.get(request.args[0])[request.functionName].promise;
      }
      return readFundedFaucet(request);
    },
  };
  const app = await loadAppHarness({ publicClient });
  await app.initialization;

  app.state.account = accountA;
  app.state.chainId = SEPOLIA_CHAIN_ID;
  const accountARefresh = app.refreshEligibility();

  app.state.account = accountB;
  const accountBRefresh = app.refreshEligibility();
  eligibilityReads.get(accountB).isAllowedForTransaction.resolve(true);
  eligibilityReads.get(accountB).getAllowedTime.resolve(200n);
  await accountBRefresh;

  eligibilityReads.get(accountA).isAllowedForTransaction.resolve(false);
  eligibilityReads.get(accountA).getAllowedTime.resolve(100n);
  await accountARefresh;

  assert.equal(app.state.account, accountB);
  assert.equal(app.state.eligibilityStatus, "ready");
  assert.equal(app.state.eligible, true);
  assert.equal(app.state.unlockTime, 200n);
  assert.equal(app.elements.eligibility.textContent, "Available now");
});
