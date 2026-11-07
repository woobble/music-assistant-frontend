# Local OpenID Connect integration testing

The frontend uses the server's public `auth/providers` discovery, starts login
through `auth/authorization_url`, and leaves OIDC token validation and MA token
issuance to the server. Run it against the `feature/oidc-auth` server branch and
the matching `music-assistant-models` checkout described in the server's
[`oidc-auth.md`](../../../music-assistant-server/docs/development/oidc-auth.md).

## Configure Pocket ID

Create a confidential OpenID Connect client in Pocket ID for Music Assistant.
Enable the Authorization Code flow, set its client ID and secret in the
server's **Settings → System → Webserver** OIDC fields, and use these scopes:

```text
openid profile email
```

Register this exact redirect URI with Pocket ID:

```text
<callback-base>/auth/callback?provider_id=oidc
```

`<callback-base>` is the server's configured `external_url`; when that is empty,
it is the configured `base_url`. Keep the query parameter and its value exactly
as shown. The browser's current host and the frontend dev-server URL do not
change the OIDC callback URI. Use HTTPS for a normal setup; the backend permits
HTTP only for loopback addresses in local tests.

The backend uses the token endpoint's advertised `client_secret_basic` or
`client_secret_post` method. Do not put the client secret in the frontend or in
the redirect URI. Keep OIDC registration disabled unless users should be able
to create regular Music Assistant accounts through this issuer.

## Run the frontend against the fork

1. Start the forked backend with its OIDC issuer, client ID, secret, and scopes
   configured. Ensure the redirect URI above is reachable from the browser and
   from Pocket ID.
2. Start the frontend with `pnpm dev`, connect it to the forked server, and
   check that **Sign in with OpenID Connect** appears only while the server
   advertises the `oidc` login provider.
3. Complete sign-in in the popup. If popups are blocked, the frontend falls
   back to the same-tab redirect and resumes from the MA token in the return
   URL. The server callback remains the fixed URI registered with Pocket ID.
4. While signed in, use **Profile → Linked authentication providers** to link
   and unlink an identity. Unlinking requires a session created within the
   previous five minutes and another usable sign-in method must remain.
5. As an administrator, use **Settings → System → Webserver** to change the
   OpenID Connect registration policy. It is guarded by the `users.manage`
   scope and is independent of Home Assistant self-registration.

For deterministic protocol coverage, the backend's `MockOIDCIssuer` fixture
requires no Pocket ID installation or live credentials. The frontend checks
are `pnpm test:run`, `pnpm lint`, and `pnpm build`.

## Cross-origin account linking

The link-start endpoint sets an HttpOnly, state-specific cookie and returns an
authorization URL. The backend supports credentialed CORS for the Music
Assistant Remote Access origin, configured server URLs, loopback and private
network origins, and fixed Home Assistant origins. It echoes only those trusted
origins on both preflight and `POST`; arbitrary origins are rejected. Browser
third-party-cookie restrictions can still affect the callback binding cookie
when the frontend and server are on different sites, so verify this flow in the
browsers the deployment supports.
