/**
 * Logos of outside tokens, keyed by contract address (lowercase), never by symbol alone: anyone can name a token KNTQ.
 * Every token the site lists (the SDK's deployment assets on every network, the ecosystem vault's tokens, the bridge's
 * coins) should have a logo, here or among the built-in marks in ui.tsx: add it in the same change that lists the token.
 */
export const LOGO_BY_ADDRESS: Record<string, string> = {
  "0xe45a355d9e9cad2ad85f2d03e3ee3102a036acf0": "/tokens/kntq.png", // KNTQ, Elysium mainnet (Kinetiq's mark)
  "0x2bd92af06c47a8ad26101a7e2084aff66b5f2c1f": "/tokens/kntq.png", // KNTQ, Elysium testnet
};
