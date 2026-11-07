import EditCoreConfig from "@/views/settings/EditCoreConfig.vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scope, type CoreConfig } from "@/plugins/api/interfaces";

const mocks = vi.hoisted(() => ({
  getCoreConfig: vi.fn(),
  hasScope: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/plugins/api", () => ({
  api: {
    getCoreConfig: mocks.getCoreConfig,
    providerManifests: { webserver: { documentation: "" } },
  },
}));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));

const oidcConfigEntry = {
  key: "auth_oidc_allow_registration",
  type: "boolean",
  value: false,
  default_value: false,
};

function configWithOidcPolicy(): CoreConfig {
  return {
    domain: "webserver",
    values: {
      base_url: {
        key: "base_url",
        type: "string",
        value: "http://localhost:8095",
        default_value: "",
      },
      external_url: {
        key: "external_url",
        type: "string",
        value: "",
        default_value: "",
      },
      auth_oidc_allow_registration: oidcConfigEntry,
    },
  } as unknown as CoreConfig;
}

function mountPage() {
  return mount(EditCoreConfig, {
    props: { domain: "webserver" },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        EditConfig: {
          props: ["configEntries"],
          template:
            '<div data-testid="config-entry-keys">{{ configEntries.map((entry) => entry.key).join(",") }}</div>',
        },
        OidcRegistrationPolicy: {
          template: '<div data-testid="oidc-policy" />',
        },
        ServerUrlsCard: true,
        SettingsHeaderCard: true,
        Spinner: true,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCoreConfig.mockResolvedValue(configWithOidcPolicy());
  mocks.hasScope.mockReturnValue(true);
});

describe("EditCoreConfig OIDC registration policy", () => {
  it("shows the dedicated policy only to users with users.manage", async () => {
    mocks.hasScope.mockReturnValue(false);
    const member = mountPage();
    await flushPromises();
    expect(member.find('[data-testid="oidc-policy"]').exists()).toBe(false);
    expect(
      member.get('[data-testid="config-entry-keys"]').text(),
    ).not.toContain("auth_oidc_allow_registration");
    member.unmount();

    mocks.hasScope.mockReturnValue(true);
    const admin = mountPage();
    await flushPromises();
    expect(admin.find('[data-testid="oidc-policy"]').exists()).toBe(true);
    expect(admin.get('[data-testid="config-entry-keys"]').text()).not.toContain(
      "auth_oidc_allow_registration",
    );
    expect(mocks.hasScope).toHaveBeenCalledWith(Scope.USERS_MANAGE);
    admin.unmount();
  });

  it("does not expose the policy when an older server omits it", async () => {
    mocks.getCoreConfig.mockResolvedValue({
      ...configWithOidcPolicy(),
      values: {
        base_url: configWithOidcPolicy().values.base_url,
        external_url: configWithOidcPolicy().values.external_url,
      },
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="oidc-policy"]').exists()).toBe(false);
  });
});
