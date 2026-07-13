# Faucet frontend

This is a static Sepolia frontend for the `Faucet` contract. It uses viem from an ESM CDN and has no install or build step.

## Configure

Replace `FAUCET_ADDRESS` in `config.mjs` with the deployed Sepolia faucet address.

## Run

From the repository root:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/frontend/>. Serve the files over HTTP instead of opening `index.html` directly because the page uses JavaScript modules.

## Manual check

1. Connect a browser wallet.
2. Switch to Sepolia when prompted.
3. Confirm that eligibility loads.
4. Claim the test tokens and approve the transaction.
5. Wait for confirmation and confirm the next claim time appears.
