// Reloads the page after consent is withdrawn: a vendor script that already
// ran can't be unloaded. Its own module so tests can watch for it.
export function reloadPage(): void {
  window.location.reload();
}
