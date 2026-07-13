const SETUP_ERROR =
  "Forge ABI artifacts unavailable. Run forge build before serving the frontend.";

const FAUCET_ARTIFACT_URL = new URL(
  "./Faucet.json",
  import.meta.url,
);
const ERC20_ARTIFACT_URL = new URL(
  "./ERC20.json",
  import.meta.url,
);

export async function loadContractAbis(fetchImpl = fetch) {
  try {
    const responses = await Promise.all([
      fetchImpl(FAUCET_ARTIFACT_URL),
      fetchImpl(ERC20_ARTIFACT_URL),
    ]);

    if (responses.some((response) => !response.ok)) throw new Error();

    const [faucetArtifact, erc20Artifact] = await Promise.all(
      responses.map((response) => response.json()),
    );

    if (
      !Array.isArray(faucetArtifact?.abi) ||
      faucetArtifact.abi.length === 0 ||
      !Array.isArray(erc20Artifact?.abi) ||
      erc20Artifact.abi.length === 0
    ) {
      throw new Error();
    }

    return {
      faucetAbi: faucetArtifact.abi,
      erc20Abi: erc20Artifact.abi,
    };
  } catch {
    throw new Error(SETUP_ERROR);
  }
}
