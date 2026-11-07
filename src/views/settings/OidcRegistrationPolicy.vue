<template>
  <Card v-if="available" class="mb-6">
    <CardHeader>
      <CardTitle>{{ $t("auth.oidc_registration_policy") }}</CardTitle>
      <CardDescription>
        {{ $t("auth.oidc_registration_policy_description") }}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <Alert variant="warning">
        <AlertTitle>{{
          $t("auth.oidc_registration_warning_title")
        }}</AlertTitle>
        <AlertDescription>
          {{ $t("auth.oidc_registration_warning") }}
        </AlertDescription>
      </Alert>
      <div class="flex items-center justify-between gap-4">
        <label
          for="oidc-registration-enabled"
          class="cursor-pointer text-sm font-medium"
        >
          {{ $t("auth.allow_oidc_registration") }}
        </label>
        <Switch
          id="oidc-registration-enabled"
          :model-value="enabled"
          :disabled="saving"
          @update:model-value="setEnabled"
        />
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/plugins/api";
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

const available = ref(false);
const enabled = ref(false);
const saving = ref(false);
const { t } = useI18n();

async function setEnabled(nextValue: boolean): Promise<void> {
  if (saving.value || nextValue === enabled.value) return;
  saving.value = true;
  try {
    const policy = await api.setOidcRegistrationPolicy(nextValue);
    enabled.value = policy.enabled;
  } catch {
    toast.error(t("auth.oidc_registration_policy_failed"));
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const policy = await api.getOidcRegistrationPolicy();
    enabled.value = policy.enabled;
    available.value = true;
  } catch {
    // Older servers omit this command. The setting stays unavailable there.
  }
});
</script>
