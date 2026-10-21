// Runs once per server instance before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installModelRegistry } = await import("./lib/codex/provider");
    installModelRegistry();
  }
}
