import LinkedAuthProviders from "@/components/profile/LinkedAuthProviders.vue";
import {
  AuthProviderType,
  type AuthProvider,
  type UserAuthProvider,
} from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthProviders: vi.fn(),
  getToken: vi.fn(),
  getUserAuthProviders: vi.fn(),
  hasScope: vi.fn(),
  startOidcLink: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  unlinkOidcProvider: vi.fn(),
}));

vi.mock("@/plugins/api", () => ({
  api: {
    getAuthProviders: mocks.getAuthProviders,
    getUserAuthProviders: mocks.getUserAuthProviders,
    startOidcLink: mocks.startOidcLink,
    unlinkOidcProvider: mocks.unlinkOidcProvider,
  },
  ApiCommandError: class ApiCommandError extends Error {},
}));
vi.mock("@/plugins/auth", () => ({
  authManager: { getToken: mocks.getToken, hasScope: mocks.hasScope },
}));
vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock("vue-sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const oidcLink: UserAuthProvider = {
  link_id: "oidc-link",
  user_id: "current-user",
  provider_type: AuthProviderType.OIDC,
  provider_user_id: "",
  created_at: "2026-01-01T00:00:00Z",
};
const builtinLink: UserAuthProvider = {
  ...oidcLink,
  link_id: "builtin-link",
  provider_type: AuthProviderType.BUILTIN,
};
const oidcProvider: AuthProvider = {
  provider_id: "oidc",
  provider_type: AuthProviderType.OIDC,
  requires_redirect: true,
};

enableAutoUnmount(afterEach);

const stubs = {
  AlertDialog: {
    props: ["open"],
    emits: ["update:open"],
    template: '<div v-if="open"><slot /></div>',
  },
  AlertDialogAction: {
    emits: ["click"],
    template: "<button @click=\"$emit('click')\"><slot /></button>",
  },
  AlertDialogCancel: { template: "<button><slot /></button>" },
  AlertDialogContent: { template: "<div><slot /></div>" },
  AlertDialogDescription: { template: "<p><slot /></p>" },
  AlertDialogFooter: { template: "<footer><slot /></footer>" },
  AlertDialogHeader: { template: "<header><slot /></header>" },
  AlertDialogTitle: { template: "<h2><slot /></h2>" },
  Button: {
    props: ["disabled"],
    emits: ["click"],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  Card: { template: "<section><slot /></section>" },
  CardContent: { template: "<div><slot /></div>" },
  CardDescription: { template: "<p><slot /></p>" },
  CardHeader: { template: "<header><slot /></header>" },
  CardTitle: { template: "<h2><slot /></h2>" },
};

function mountSection() {
  return mount(LinkedAuthProviders, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasScope.mockReturnValue(true);
  mocks.getToken.mockReturnValue("active-ma-session");
  mocks.getUserAuthProviders.mockResolvedValue([builtinLink]);
  mocks.getAuthProviders.mockResolvedValue([oidcProvider]);
  mocks.startOidcLink.mockResolvedValue({
    authorization_url: "https://issuer.example/authorize",
  });
  mocks.unlinkOidcProvider.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LinkedAuthProviders", () => {
  it("starts linking only after confirmation and keeps the current session", async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      document: { body: { innerText: "" } },
      location: { replace: vi.fn() },
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const wrapper = mountSection();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.link_openid_connect")!
      .trigger("click");
    expect(mocks.startOidcLink).not.toHaveBeenCalled();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.continue_to_provider")!
      .trigger("click");
    await flushPromises();

    expect(mocks.startOidcLink).toHaveBeenCalledExactlyOnceWith(
      "active-ma-session",
    );
    expect(popup.location.replace).toHaveBeenCalledWith(
      "https://issuer.example/authorize",
    );
    expect(mocks.getToken()).toBe("active-ma-session");

    popup.document.body.innerText = "Account linked";
    await vi.waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("auth.oidc_link_success");
  });

  it("reports a duplicate-link callback failure without clearing the MA session", async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      document: { body: { innerText: "" } },
      location: { replace: vi.fn() },
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const wrapper = mountSection();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.link_openid_connect")!
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.continue_to_provider")!
      .trigger("click");
    await flushPromises();
    popup.document.body.innerText =
      "Authentication Failed: This OIDC identity is already linked";

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith("auth.oidc_link_failed");
    expect(mocks.getToken()).toBe("active-ma-session");
    expect(mocks.unlinkOidcProvider).not.toHaveBeenCalled();
  });

  it("confirms unlinking and reports a stale-session error", async () => {
    mocks.getUserAuthProviders.mockResolvedValue([builtinLink, oidcLink]);
    mocks.unlinkOidcProvider.mockRejectedValue(
      new Error("Please sign in again to change account security"),
    );
    const wrapper = mountSection();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.unlink")!
      .trigger("click");
    expect(mocks.unlinkOidcProvider).not.toHaveBeenCalled();

    await wrapper
      .findAll("button")
      .filter((button) => button.text() === "auth.unlink")
      .at(-1)!
      .trigger("click");
    await flushPromises();

    expect(mocks.unlinkOidcProvider).toHaveBeenCalledExactlyOnceWith(
      "oidc-link",
    );
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Please sign in again to change account security",
    );
  });

  it("prevents unlinking the only usable login method", async () => {
    mocks.getUserAuthProviders.mockResolvedValue([oidcLink]);
    const wrapper = mountSection();
    await flushPromises();

    const unlinkButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "auth.unlink");
    expect(unlinkButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("auth.last_usable_login_method");
    expect(mocks.unlinkOidcProvider).not.toHaveBeenCalled();
  });

  it("hides account controls when the user lacks own-provider scope", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = mountSection();
    await flushPromises();

    expect(wrapper.find("section").exists()).toBe(false);
    expect(mocks.getUserAuthProviders).not.toHaveBeenCalled();
  });
});
