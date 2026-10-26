/** Settings, as the reference's owner-settings page. */
import { useCallback, useEffect, useState } from "react";
import type { PushDevice } from "../apps/api-types";
import * as api from "../apps/api";
import { errorText } from "../apps/app-helpers";
import {
  deviceLabel,
  existingSubscription,
  keyBytes,
  pushSupported,
  PUSH_WORKER,
} from "../apps/push";
import { useOwner, type ThemePref } from "./context";
import {
  defaultValuesFor,
  displayNameOf,
  formatRelativeTime,
  isValidPreset,
  readRewardPresets,
  readStored,
  writeRewardPresets,
  writeStored,
  type PresetMode,
  type RewardPresets,
} from "./format";
import { isIos, useInstallPrompt } from "./install";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DefinitionList,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  InlineAlert,
  Input,
  PageHeader,
  Segmented,
  Skeleton,
  Switch,
} from "./ui";
import { Icon } from "./Icon";

export function Settings() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Notifications, account and appearance."
      />
      <div className="ow-split">
        <div className="ow-stack">
          <NotificationSettings />
          <AccountSettings />
          <RewardPresetsCard />
        </div>
        <div className="ow-stack">
          <AppearanceSettings />
          <InstallCard />
          <AboutCard />
        </div>
      </div>
    </>
  );
}

const deviceKey = (siteId: string) => `forma-owner-device:${siteId}`;

/**
 * Four states, four different things said: a browser that can't, one that
 * needs installing first (iPhone), one that blocked us, and the switch.
 */
function NotificationSettings() {
  const ctx = useOwner();
  const toast = useToast();
  const { siteId, setDeviceCount } = ctx;
  const [devices, setDevices] = useState<PushDevice[]>();
  const [loadError, setLoadError] = useState("");
  const [pushError, setPushError] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "">(
    () => (pushSupported() ? Notification.permission : ""),
  );
  const [subscribed, setSubscribed] = useState(false);
  const [thisDevice, setThisDevice] = useState(() =>
    readStored(deviceKey(siteId)),
  );

  const load = useCallback(() => {
    api
      .listDevices(siteId)
      .then((r) => {
        setDevices(r.devices);
        setDeviceCount(r.devices.length);
        setLoadError("");
      })
      .catch((e) => setLoadError(errorText(e, "Something went wrong.")));
  }, [siteId, setDeviceCount]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!pushSupported()) return;
    existingSubscription()
      .then((s) => setSubscribed(!!s))
      .catch(() => {});
  }, []);

  const state = !pushSupported()
    ? isIos()
      ? "needs-install"
      : "unsupported"
    : permission === "denied"
      ? "denied"
      : permission === "granted"
        ? "granted"
        : "default";
  const isSubscribed =
    subscribed && !!thisDevice && !!devices?.some((d) => d.id === thisDevice);
  const canToggle = state === "default" || state === "granted";

  const turnOn = async () => {
    setPushError("");
    // Ask straight from the press: browsers only allow it from a gesture.
    const asked = Notification.requestPermission();
    setBusy(true);
    try {
      const result = await asked;
      setPermission(result);
      if (result !== "granted") return;
      const registration = await navigator.serviceWorker.register(PUSH_WORKER);
      await navigator.serviceWorker.ready;
      const { publicKey } = await api.loadPushKey();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const { device } = await api.addDevice(
        siteId,
        subscription.toJSON(),
        deviceLabel(),
      );
      writeStored(deviceKey(siteId), device.id);
      setThisDevice(device.id);
      setSubscribed(true);
      toast("success", "Notifications on", "Send a test to check this device.");
      load();
    } catch (e) {
      setPushError(
        errorText(e, "Notifications could not be turned on. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (device: PushDevice) => {
    setBusy(true);
    try {
      await api.removeDevice(siteId, device.id);
      if (device.id === thisDevice) {
        writeStored(deviceKey(siteId), null);
        setThisDevice(null);
      }
      toast(
        "warning",
        "Device removed",
        `${device.label} will no longer be notified.`,
      );
      load();
    } catch (e) {
      setPushError(errorText(e, "The device could not be removed."));
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const { sent } = await api.sendTestPush(siteId);
      if (sent)
        toast("success", "Test notification sent", "Check your device.");
      else
        toast(
          "warning",
          "Nothing was sent",
          "Turn notifications on for a device first.",
        );
    } catch (e) {
      setPushError(errorText(e, "The test could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const notifying = ctx.model.app.tables.filter((t) => t.notify);
  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="bell" tone="success" />}
        title="Push notifications"
        description={`Get alerted the moment ${
          notifying.length
            ? `a ${notifying.map((t) => t.singular.toLowerCase()).join(" or ")} arrives`
            : "something arrives"
        }.`}
        badge={
          state === "granted" && isSubscribed ? (
            <Badge tone="approved">Enabled</Badge>
          ) : state === "denied" ? (
            <Badge tone="rejected">Blocked</Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )
        }
      />
      <CardBody>
        <div className="ow-stack">
          {canToggle && (
            <Switch
              label="Notify me on this device"
              description={
                isSubscribed
                  ? `${deviceLabel()} · subscribed`
                  : "Turning this on asks the browser for permission."
              }
              checked={isSubscribed}
              disabled={busy}
              onChange={(on) => {
                if (on) void turnOn();
                else {
                  const mine = devices?.find((d) => d.id === thisDevice);
                  if (mine) void remove(mine);
                }
              }}
            />
          )}
          {state === "unsupported" && (
            <InlineAlert
              tone="warning"
              title="This browser cannot receive notifications"
            >
              Web Push is not available here. Open the owner app in Chrome, Edge
              or Firefox, or install it to your home screen on iOS.
            </InlineAlert>
          )}
          {state === "needs-install" && (
            <InlineAlert tone="info" title="Install the app first">
              {`On iPhone and iPad, notifications only work after you add ${ctx.shopName} to your home screen. Tap Share, then “Add to Home Screen”, and open it from there.`}
            </InlineAlert>
          )}
          {state === "denied" && (
            <InlineAlert
              tone="warning"
              title="Notifications are blocked"
              icon="bellOff"
            >
              The app cannot ask again — the browser remembers your choice. Open
              the padlock icon beside the address bar, set Notifications to
              Allow, then reload this page.
            </InlineAlert>
          )}
          {pushError && <InlineAlert tone="danger">{pushError}</InlineAlert>}
          {!notifying.length && (
            <InlineAlert tone="info">
              None of this app’s tables send notifications yet. Turn on “Tell me
              about new records” for a table in the app builder.
            </InlineAlert>
          )}
          <div>
            <p className="ow-cardTitle ow-gapBottom">Subscribed devices</p>
            {!devices && !loadError ? (
              <div className="ow-stackSm">
                <Skeleton shape="block" />
              </div>
            ) : loadError && !devices ? (
              <ErrorState
                title="Could not load your devices"
                description={loadError}
                onRetry={load}
              />
            ) : !devices?.length ? (
              <EmptyState
                icon="bellOff"
                tone="neutral"
                title="No device is subscribed"
                description="Nothing will be alerted when a customer submits a purchase."
                action={
                  canToggle ? (
                    <Button
                      variant="primary"
                      icon="bell"
                      disabled={busy}
                      onClick={() => void turnOn()}
                    >
                      Notify me on this device
                    </Button>
                  ) : (
                    <p className="ow-subtle">
                      This browser cannot receive notifications — see the panel
                      above.
                    </p>
                  )
                }
              />
            ) : (
              <ul className="ow-devices">
                {devices.map((d) => {
                  const mine = d.id === thisDevice;
                  return (
                    <li key={d.id} className="ow-deviceRow">
                      <IconTile
                        icon={
                          /android|iphone|ipad/i.test(d.label)
                            ? "smartphone"
                            : "monitor"
                        }
                        tone={mine ? "success" : "muted"}
                      />
                      <div className="ow-grow ow-minw0">
                        <p className="ow-deviceName">
                          <span>{d.label}</span>
                          {mine && <Badge tone="brand">This device</Badge>}
                        </p>
                        <p className="ow-subtle">{`Subscribed ${formatRelativeTime(d.createdAt)}`}</p>
                      </div>
                      {mine && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void test()}
                        >
                          Send test
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void remove(d)}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {devices &&
              devices.length > 0 &&
              !devices.some((d) => d.id === thisDevice) && (
                <div className="ow-gapTop">
                  <Button size="sm" disabled={busy} onClick={() => void test()}>
                    Send a test to every device
                  </Button>
                </div>
              )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Forma accounts own the sign-in; the password is changed on the account page. */
function AccountSettings() {
  const ctx = useOwner();
  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="shield" tone="info" />}
        title="Account"
      />
      <CardBody>
        <div className="ow-stack">
          <div className="ow-fieldRow">
            <Field label="Display name">
              {(props) => (
                <Input
                  {...props}
                  value={displayNameOf(ctx.account.email)}
                  readOnly
                />
              )}
            </Field>
            <Field label="Email">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={ctx.account.email}
                  readOnly
                />
              )}
            </Field>
          </div>
          <p className="ow-fieldHint">
            You sign in to this shop with your Forma account. Your name comes
            from your email address.
          </p>
        </div>
      </CardBody>
      <CardFooter>
        <div className="ow-spacer" />
        <ButtonLink href="/account" icon="lock">
          Change password
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}

const MODE_SEGMENTS: { value: PresetMode; label: string }[] = [
  { value: "percent", label: "Percentage" },
  { value: "amount", label: "Fixed amount" },
];
type Drafts = Record<PresetMode, string[]>;
const draftsFrom = (saved: RewardPresets): Drafts => ({
  percent:
    saved.mode === "percent" ? saved.values : defaultValuesFor("percent"),
  amount: saved.mode === "amount" ? saved.values : defaultValuesFor("amount"),
});

/** Kept on this device for this shop: a typing shortcut, not shop data. */
function RewardPresetsCard() {
  const ctx = useOwner();
  const toast = useToast();
  const [saved] = useState(() => readRewardPresets(ctx.siteId));
  const [mode, setMode] = useState<PresetMode>(saved.mode);
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(saved));
  const [errors, setErrors] = useState<(string | undefined)[]>([]);
  const [canPersist, setCanPersist] = useState(true);
  const values = drafts[mode];
  const symbol =
    ctx.model.app.currency === "INR" ? "₹" : ctx.model.app.currency;

  const reset = () => {
    const current = readRewardPresets(ctx.siteId);
    setMode(current.mode);
    setDrafts(draftsFrom(current));
    setErrors([]);
  };
  const save = () => {
    const failures = values.map((v) =>
      isValidPreset(v, mode)
        ? undefined
        : mode === "percent"
          ? "1–100, up to two decimals."
          : "A rupee amount, up to two decimals.",
    );
    if (failures.some(Boolean)) return setErrors(failures);
    setErrors([]);
    const trimmed = values.map((v) => v.trim());
    const persisted = writeRewardPresets(ctx.siteId, { mode, values: trimmed });
    setCanPersist(persisted);
    if (persisted) {
      setDrafts((d) => ({ ...d, [mode]: trimmed }));
      toast("success", "Presets saved", "They appear in the approve dialog.");
    } else
      toast(
        "error",
        "Could not save presets",
        "This browser is blocking site storage.",
      );
  };

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="wallet" />}
        title="Reward presets"
        description="Shown as quick-set buttons in the approve dialog."
      />
      <CardBody>
        <div className="ow-stack">
          <div className="ow-field">
            <span className="ow-label">Preset type</span>
            <Segmented
              label="Preset type"
              value={mode}
              options={MODE_SEGMENTS}
              onChange={(next) => {
                setMode(next);
                setErrors([]);
              }}
            />
          </div>
          <div className="ow-fieldRow ow-presetRow">
            {values.map((value, i) => (
              <Field
                key={`preset-${i}`}
                label={`Preset ${i + 1}`}
                error={errors[i]}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={value}
                    {...(mode === "percent"
                      ? { suffix: "%" }
                      : { prefix: symbol })}
                    onChange={(e) => {
                      const next = [...values];
                      next[i] = e.target.value;
                      setDrafts((d) => ({ ...d, [mode]: next }));
                      setErrors([]);
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
          {!canPersist && (
            <InlineAlert
              tone="warning"
              title="Presets cannot be saved on this device"
            >
              Site storage is blocked, so the defaults are used. Everything else
              works as normal.
            </InlineAlert>
          )}
          <p className="ow-fieldHint">
            {mode === "percent"
              ? "Each preset fills the field with that share of the purchase."
              : "Each preset fills the field with that sum. One above the purchase amount is refused when you approve, like any other figure."}{" "}
            Presets are a convenience only, and are kept on this device. The
            reward amount is always typed and confirmed by you before an
            approval is recorded.
          </p>
        </div>
      </CardBody>
      <CardFooter>
        <div className="ow-spacer" />
        <Button onClick={reset}>Reset</Button>
        <Button variant="primary" onClick={save}>
          Save presets
        </Button>
      </CardFooter>
    </Card>
  );
}

function AppearanceSettings() {
  const { theme } = useOwner();
  const options: { value: ThemePref; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <Card padded className="ow-stack">
      <h3 className="ow-sectionTitle">Appearance</h3>
      <Switch
        label="Dark theme"
        description={
          theme.pref === "system"
            ? "Following this device's setting."
            : "Chosen by you on this device."
        }
        checked={theme.resolved === "dark"}
        onChange={(on) => theme.setPref(on ? "dark" : "light")}
      />
      <div className="ow-field">
        <span className="ow-label">Theme</span>
        <Segmented
          label="Theme"
          value={theme.pref}
          options={options}
          onChange={theme.setPref}
        />
      </div>
    </Card>
  );
}

function InstallCard() {
  const ctx = useOwner();
  const { canPrompt, isInstalled, needsManualInstructions, promptInstall } =
    useInstallPrompt();
  return (
    <Card padded className="ow-stack">
      <h3 className="ow-sectionTitle">Install the app</h3>
      <p className="ow-muted">
        Installing gives you a home-screen icon that opens straight to your
        shop, and — on iPhone and iPad — is required for notifications to work
        at all.
      </p>
      {isInstalled ? (
        <InlineAlert tone="success" title="Already installed">
          You are using the installed app on this device.
        </InlineAlert>
      ) : needsManualInstructions ? (
        <InlineAlert tone="info" title="Add to Home Screen">
          Tap the Share button in Safari, then choose “Add to Home Screen”.
        </InlineAlert>
      ) : canPrompt ? (
        <Button
          variant="primary"
          block
          icon="download"
          onClick={() => void promptInstall()}
        >
          {`Install ${ctx.shopName}`}
        </Button>
      ) : (
        <p className="ow-subtle">
          This browser has not offered an install prompt. Look for an install
          icon in the address bar, or use the browser menu.
        </p>
      )}
    </Card>
  );
}

function AboutCard() {
  const ctx = useOwner();
  const app = ctx.model.app;
  return (
    <Card padded className="ow-stack">
      <h3 className="ow-sectionTitle">About</h3>
      <DefinitionList
        items={[
          { term: "Shop", value: ctx.shopName },
          { term: "App", value: app.install.name || ctx.shopName },
          {
            term: "Website",
            value: ctx.data.info?.published ? (
              <Badge tone="approved">Live</Badge>
            ) : (
              <Badge tone="neutral">Not published yet</Badge>
            ),
          },
          { term: "Signed in as", value: ctx.account.email },
        ]}
      />
      <a
        className="ow-link ow-subtle"
        href={`/editor?site=${encodeURIComponent(ctx.siteId)}`}
      >
        Edit the website in Forma <Icon name="externalLink" size={12} />
      </a>
      <Button variant="dangerQuiet" block icon="logOut" onClick={ctx.signOut}>
        Sign out
      </Button>
    </Card>
  );
}
