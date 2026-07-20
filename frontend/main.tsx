import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  getDefaultConfig,
  lightTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";

import { FaucetApp } from "./app";
import { WALLETCONNECT_PROJECT_ID } from "./config";
import "./style.css";

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ||
  WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = getDefaultConfig({
  appName: "Sepolia Test Token Faucet",
  projectId,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient();
const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Frontend root element not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={sepolia}
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#315bd6",
            borderRadius: "medium",
          })}
        >
          <FaucetApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
