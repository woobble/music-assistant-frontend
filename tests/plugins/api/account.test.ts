import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandOptions } from "@/plugins/api/commandOptions";
import { AccountApi } from "@/plugins/api/account";

describe("account API", () => {
  it("sends role updates with the shared error-handling options", async () => {
    const calls: Array<{
      command: string;
      args?: Record<string, unknown>;
      options?: CommandOptions;
    }> = [];
    const api = new AccountApi(
      async <Result>(
        command: string,
        args?: Record<string, unknown>,
        options?: CommandOptions,
      ): Promise<Result> => {
        calls.push({ command, args, options });
        return { role_id: "custom" } as Result;
      },
      () => "test-device",
    );

    await api.updateRole("custom", { name: "Editors", scopes: ["read"] });

    expect(calls).toEqual([
      {
        command: "auth/role/update",
        args: { role_id: "custom", name: "Editors", scopes: ["read"] },
        options: { suppressGlobalError: true },
      },
    ]);
  });

  it("preserves token creation response validation", async () => {
    const api = new AccountApi(
      async <Result>(): Promise<Result> => {
        return { success: false, token: "" } as Result;
      },
      () => "test-device",
    );

    await expect(api.createToken("app")).rejects.toThrow(
      "Failed to create token",
    );
  });

  it("uses the backend's OIDC account commands and confirmation arguments", async () => {
    const calls: Array<{
      command: string;
      args?: Record<string, unknown>;
      options?: CommandOptions;
    }> = [];
    const api = new AccountApi(
      async <Result>(
        command: string,
        args?: Record<string, unknown>,
        options?: CommandOptions,
      ): Promise<Result> => {
        calls.push({ command, args, options });
        if (command === "auth/user/providers") return [] as Result;
        if (command === "auth/oidc/unlink") return true as Result;
        return { enabled: true } as Result;
      },
      () => "test-device",
    );

    await api.getUserAuthProviders();
    await api.unlinkOidcProvider("link-1");
    await api.getOidcRegistrationPolicy();
    await api.setOidcRegistrationPolicy(true);

    expect(calls).toEqual([
      {
        command: "auth/user/providers",
        args: undefined,
        options: { suppressGlobalError: true },
      },
      {
        command: "auth/oidc/unlink",
        args: { link_id: "link-1", confirmed: true },
        options: { suppressGlobalError: true },
      },
      {
        command: "auth/oidc/registration_policy",
        args: undefined,
        options: { suppressGlobalError: true },
      },
      {
        command: "auth/oidc/registration_policy/set",
        args: { enabled: true },
        options: { suppressGlobalError: true },
      },
    ]);
  });

  it("starts the browser-only link flow with the active MA bearer session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ authorization_url: "https://issuer.example/auth" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = new AccountApi(
      async <Result>() => [] as Result,
      () => "test-device",
    );

    await expect(
      api.startOidcLink("https://music.example.com", "ma-session-token"),
    ).resolves.toEqual({
      authorization_url: "https://issuer.example/auth",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://music.example.com/auth/oidc/link/start"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        mode: "cors",
        body: JSON.stringify({ confirmed: true }),
        headers: expect.objectContaining({
          Authorization: "Bearer ma-session-token",
        }),
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());
});
