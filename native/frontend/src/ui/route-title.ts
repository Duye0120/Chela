export function routeTitle(title: string) {
  window.dispatchEvent(new CustomEvent("chela-route-title", { detail: { page: location.hash.slice(1).split("/")[0], title } }));
}
