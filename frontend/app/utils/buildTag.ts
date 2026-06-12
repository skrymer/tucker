export function formatBuildTag(
  version: string,
  frontendSha: string,
  backendSha?: string | null,
): string {
  if (backendSha && backendSha !== frontendSha) {
    return `v${version} (fe ${frontendSha} · be ${backendSha})`
  }
  return `v${version} (${frontendSha})`
}
