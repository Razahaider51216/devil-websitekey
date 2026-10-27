export const MAIN_LOADER_URL = "https://devil-hub.dev/loader";
export function launchCode(key: string) {
  // Keys are server-issued ASCII tokens; reject arbitrary Lua rather than interpolating it.
  if (!/^DEVIL-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/.test(key)) throw new Error("Invalid key");
  return `script_key = "${key}";\nloadstring(game:HttpGet("${MAIN_LOADER_URL}"))()`;
}
