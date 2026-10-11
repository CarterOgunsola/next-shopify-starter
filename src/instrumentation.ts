import { refuseStrayTestProxy } from "./lib/e2e-mode";

// Runs once when the server starts.
export function register() {
  refuseStrayTestProxy(process.env);
}
