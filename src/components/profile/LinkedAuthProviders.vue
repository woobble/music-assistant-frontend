<template>
  <Card v-if="canManageProviders">
    <CardHeader>
      <CardTitle>{{ $t("auth.linked_auth_providers") }}</CardTitle>
      <CardDescription>
        {{ $t("auth.linked_auth_providers_description") }}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div
        v-if="loading"
        class="text-sm text-muted-foreground"
        aria-live="polite"
      >
        {{ $t("auth.loading_linked_auth_providers") }}
      </div>
      <div v-else-if="loadFailed" class="text-sm text-destructive" role="alert">
        {{ $t("auth.linked_auth_providers_load_failed") }}
      </div>
      <template v-else>
        <p v-if="oidcLinks.length === 0" class="text-sm text-muted-foreground">
          {{ $t("auth.no_linked_oidc_providers") }}
        </p>
        <div
          v-for="link in oidcLinks"
          :key="link.link_id"
          class="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="font-medium">{{ $t("auth.openid_connect") }}</p>
            <p class="text-sm text-muted-foreground">
              {{ $t("auth.linked_on", { date: formatDate(link.created_at) }) }}
            </p>
          </div>
          <div class="flex flex-col items-start gap-2 sm:items-end">
            <Button
              variant="outline"
              size="sm"
              :disabled="!canUnlink(link) || unlinkingLinkId !== null"
              @click="confirmUnlink(link)"
            >
              {{ $t("auth.unlink") }}
            </Button>
            <p
              v-if="!canUnlink(link)"
              class="max-w-xs text-xs text-muted-foreground"
            >
              {{ $t("auth.last_usable_login_method") }}
            </p>
          </div>
        </div>

        <p v-if="!hasOpenIdConnectAuth" class="text-sm text-muted-foreground">
          {{ $t("auth.oidc_not_available") }}
        </p>
        <Button
          v-else-if="oidcLinks.length === 0"
          variant="outline"
          :disabled="linking"
          @click="showLinkDialog = true"
        >
          {{ $t("auth.link_openid_connect") }}
        </Button>
      </template>
    </CardContent>

    <AlertDialog v-model:open="showLinkDialog">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("auth.link_openid_connect")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("auth.link_openid_connect_confirmation") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="linking">
            {{ $t("cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction :disabled="linking" @click="startLinking">
            {{ $t("auth.continue_to_provider") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog v-model:open="showUnlinkDialog">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("auth.unlink_openid_connect")
          }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t("auth.unlink_openid_connect_confirmation") }}
            {{ $t("auth.recent_session_required") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="unlinkingLinkId !== null">
            {{ $t("cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            :disabled="unlinkingLinkId !== null"
            @click="unlinkProvider"
          >
            {{ $t("auth.unlink") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>
</template>

<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canUnlinkAuthProvider } from "@/helpers/auth_provider_links";
import { api, ApiCommandError } from "@/plugins/api";
import {
  AuthProviderType,
  Scope,
  type AuthProvider,
  type UserAuthProvider,
} from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

const { t } = useI18n();
const canManageProviders = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_OWN),
);
const links = ref<UserAuthProvider[]>([]);
const availableProviders = ref<AuthProvider[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const linking = ref(false);
const showLinkDialog = ref(false);
const showUnlinkDialog = ref(false);
const selectedLink = ref<UserAuthProvider | null>(null);
const unlinkingLinkId = ref<string | null>(null);
let linkPopup: Window | null = null;
let linkPopupPoll: number | undefined;
let linkPopupTimeout: number | undefined;
let startingLinkIds = new Set<string>();
let linkPopupFinishing = false;

const oidcLinks = computed(() =>
  links.value.filter((link) => link.provider_type === AuthProviderType.OIDC),
);
const hasOpenIdConnectAuth = computed(() =>
  availableProviders.value.some((provider) => provider.provider_id === "oidc"),
);

function canUnlink(link: UserAuthProvider): boolean {
  return canUnlinkAuthProvider(
    link.link_id,
    links.value,
    availableProviders.value,
  );
}

function formatDate(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
}

async function loadAuthMethods(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;
  try {
    const [nextLinks, nextProviders] = await Promise.all([
      api.getUserAuthProviders(),
      api.getAuthProviders(),
    ]);
    links.value = nextLinks;
    availableProviders.value = nextProviders;
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

function confirmUnlink(link: UserAuthProvider): void {
  selectedLink.value = link;
  showUnlinkDialog.value = true;
}

async function unlinkProvider(): Promise<void> {
  const link = selectedLink.value;
  if (!link || !canUnlink(link)) return;

  unlinkingLinkId.value = link.link_id;
  try {
    const removed = await api.unlinkOidcProvider(link.link_id);
    if (!removed) throw new Error(t("auth.oidc_unlink_failed"));
    await loadAuthMethods();
    toast.success(t("auth.oidc_unlink_success"));
  } catch (error) {
    const message =
      error instanceof ApiCommandError && error.details
        ? error.details
        : error instanceof Error
          ? error.message
          : t("auth.oidc_unlink_failed");
    toast.error(message);
  } finally {
    showUnlinkDialog.value = false;
    selectedLink.value = null;
    unlinkingLinkId.value = null;
  }
}

async function startLinking(): Promise<void> {
  if (linking.value || !hasOpenIdConnectAuth.value) return;
  showLinkDialog.value = false;

  // Open during the user gesture so popup blockers do not strand the flow.
  const popup = window.open(
    "about:blank",
    "ma-oidc-link",
    "popup,width=520,height=680",
  );
  linkPopup = popup;
  startingLinkIds = new Set(oidcLinks.value.map((link) => link.link_id));
  linking.value = true;

  try {
    const token = authManager.getToken();
    if (!token) throw new Error(t("auth.oidc_link_failed"));
    const response = await api.startOidcLink(token);
    const authorizationUrl = new URL(response.authorization_url);
    if (!/^https?:$/.test(authorizationUrl.protocol)) {
      throw new Error(t("auth.oidc_link_failed"));
    }

    if (!popup) {
      window.location.assign(authorizationUrl.href);
      return;
    }
    popup.location.replace(authorizationUrl.href);
    watchLinkPopup();
  } catch (error) {
    closeLinkPopup(true);
    toast.error(
      error instanceof Error ? error.message : t("auth.oidc_link_failed"),
    );
    linking.value = false;
  }
}

function watchLinkPopup(): void {
  linkPopupFinishing = false;
  linkPopupPoll = window.setInterval(() => {
    if (!linkPopup || linkPopup.closed) {
      finishLinkPopup();
      return;
    }

    try {
      const pageText = linkPopup.document.body?.innerText.toLowerCase() ?? "";
      if (pageText.includes("account linked")) {
        void finishLinkPopup(true);
      } else if (pageText.includes("authentication failed")) {
        closeLinkPopup(true);
        linking.value = false;
        toast.error(t("auth.oidc_link_failed"));
      }
    } catch {
      // The issuer and the fixed callback may be on another origin.
    }
  }, 500);
  linkPopupTimeout = window.setTimeout(
    () => {
      closeLinkPopup(true);
      linking.value = false;
      toast.error(t("auth.oidc_link_expired"));
    },
    10 * 60 * 1000,
  );
}

async function finishLinkPopup(completed = false): Promise<void> {
  if (linkPopupFinishing) return;
  const popupClosed = !linkPopup || linkPopup.closed;
  if (!completed && !popupClosed) return;
  linkPopupFinishing = true;
  closeLinkPopup(true);

  const previousIds = startingLinkIds;
  startingLinkIds = new Set();
  await loadAuthMethods();
  const addedLink = oidcLinks.value.some(
    (link) => !previousIds.has(link.link_id),
  );
  linking.value = false;
  if (completed || addedLink) {
    toast.success(t("auth.oidc_link_success"));
  } else if (!loadFailed.value) {
    toast.error(t("auth.oidc_link_not_completed"));
  }
  linkPopupFinishing = false;
}

function closeLinkPopup(close: boolean): void {
  if (linkPopupPoll !== undefined) window.clearInterval(linkPopupPoll);
  if (linkPopupTimeout !== undefined) window.clearTimeout(linkPopupTimeout);
  linkPopupPoll = undefined;
  linkPopupTimeout = undefined;
  if (close && linkPopup && !linkPopup.closed) linkPopup.close();
  linkPopup = null;
}

onMounted(() => {
  if (canManageProviders.value) void loadAuthMethods();
  else loading.value = false;
});

onUnmounted(() => closeLinkPopup(true));
</script>
