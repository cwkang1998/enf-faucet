# Faucet frontend

This is a static Sepolia frontend for the `Faucet` contract. It uses viem from an ESM CDN and has no frontend install or build step. At runtime, the browser loads the contract ABIs from the Forge artifacts in `out/`.

## Configure

Replace `FAUCET_ADDRESS` in `config.mjs` with the deployed Sepolia faucet address.

## Run

From the repository root:

```sh
forge build
python3 -m http.server 8000
```

Run `forge build` before starting the static server so that `out/Faucet.sol/Faucet.json` and `out/ERC20.sol/ERC20.json` exist. Open <http://localhost:8000/frontend/>. Serve the repository root over HTTP instead of opening `index.html` directly because the page uses JavaScript modules and fetches those ABI artifacts at runtime.

## Manual check

1. Connect a browser wallet.
2. Switch to Sepolia when prompted.
3. Confirm that the live PAXG and USDC faucet balances load and display with the correct token decimals.
4. Confirm that eligibility loads.
5. If either balance is below its configured claim amount, confirm that the claim button is disabled and displays `Faucet needs funding`.
6. When both token balances are sufficient, claim the test tokens and approve the transaction.
7. Wait for confirmation and confirm the next claim time appears and the displayed faucet balances refresh.
