import { canUnlinkAuthProvider } from "@/helpers/auth_provider_links";
import {
  AuthProviderType,
  type AuthProvider,
  type UserAuthProvider,
} from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

const links: UserAuthProvider[] = [
  {
    link_id: "oidc-link",
    user_id: "user-1",
    provider_type: AuthProviderType.OIDC,
    provider_user_id: "",
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("canUnlinkAuthProvider", () => {
  it("does not allow removing the only usable login method", () => {
    expect(canUnlinkAuthProvider("oidc-link", links, [])).toBe(false);
  });

  it("allows removal when a builtin password remains", () => {
    expect(
      canUnlinkAuthProvider(
        "oidc-link",
        [
          ...links,
          {
            ...links[0],
            link_id: "builtin-link",
            provider_type: AuthProviderType.BUILTIN,
          },
        ],
        [],
      ),
    ).toBe(true);
  });

  it("counts Home Assistant only when the server advertises it", () => {
    const homeAssistantLink = {
      ...links[0],
      link_id: "ha-link",
      provider_type: AuthProviderType.OAUTH_HOMEASSISTANT,
    };
    const available: AuthProvider[] = [
      {
        provider_id: "homeassistant",
        provider_type: AuthProviderType.OAUTH_HOMEASSISTANT,
        requires_redirect: true,
      },
    ];

    expect(
      canUnlinkAuthProvider(
        "oidc-link",
        [...links, homeAssistantLink],
        available,
      ),
    ).toBe(true);
    expect(
      canUnlinkAuthProvider("oidc-link", [...links, homeAssistantLink], []),
    ).toBe(false);
  });

  it("matches the backend's serialized authentication provider values", () => {
    expect(AuthProviderType.BUILTIN).toBe("builtin");
    expect(AuthProviderType.OAUTH_HOMEASSISTANT).toBe("homeassistant");
    expect(AuthProviderType.OIDC).toBe("oidc");
  });
});
