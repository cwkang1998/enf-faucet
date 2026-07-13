import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("provides the complete responsive faucet shell", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("./index.html", import.meta.url), "utf8"),
    readFile(new URL("./style.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<title>Sepolia Test Token Faucet<\/title>/);
  assert.match(html, /Sepolia Testnet/);
  assert.match(html, /100 PAXG/);
  assert.match(html, /10,000 USDC/);

  for (const id of [
    "walletValue",
    "networkValue",
    "eligibilityValue",
    "actionButton",
    "statusMessage",
    "contractValue",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/);
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:disabled/);
});
