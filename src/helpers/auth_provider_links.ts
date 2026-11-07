import {
  AuthProviderType,
  type AuthProvider,
  type UserAuthProvider,
} from "@/plugins/api/interfaces";

/**
 * Return whether removing one link would leave another currently usable login.
 * The server enforces the same rule when the unlink command is run.
 */
export function canUnlinkAuthProvider(
  linkId: string,
  links: UserAuthProvider[],
  availableProviders: AuthProvider[],
): boolean {
  return links.some(
    (link) =>
      link.link_id !== linkId &&
      isUsableLoginLink(link.provider_type, availableProviders),
  );
}

function isUsableLoginLink(
  providerType: AuthProviderType,
  availableProviders: AuthProvider[],
): boolean {
  if (providerType === AuthProviderType.BUILTIN) return true;

  const providerId =
    providerType === AuthProviderType.OAUTH_HOMEASSISTANT
      ? "homeassistant"
      : providerType === AuthProviderType.OIDC
        ? "oidc"
        : null;

  return (
    !!providerId && availableProviders.some((p) => p.provider_id === providerId)
  );
}
