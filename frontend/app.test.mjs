import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  FAUCET_ABI,
  FAUCET_ADDRESS,
  SEPOLIA_CHAIN_ID,
} from "./config.mjs";
import { ZERO_ADDRESS } from "./core.mjs";

test("matches the current faucet contract and Sepolia configuration", async () => {
  const app = await readFile(new URL("./app.mjs", import.meta.url), "utf8");
  const abiNames = new Set(FAUCET_ABI.map((item) => item.name));

  assert.equal(FAUCET_ADDRESS, ZERO_ADDRESS);
  assert.equal(SEPOLIA_CHAIN_ID, 11_155_111);

  for (const name of [
    "claimTestTokens",
    "isAllowedForTransaction",
    "getAllowedTime",
    "AlreadyClaimed",
    "InsufficientFunds",
    "TransferFailed",
  ]) {
    assert.equal(abiNames.has(name), true, `${name} is missing from the ABI`);
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
  ]) {
    assert.match(app, new RegExp(integration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
