/**
 * Phone and computer notifications for the owner. Turning them on asks the
 * browser's permission (only ever from the button press), registers the small
 * Forma service worker, subscribes with the server's key and saves the device.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../studio/Icon";
import type { App } from "./model";
import type { PushDevice } from "./api-types";
import * as api from "./api";
import {
  deviceLabel,
  existingSubscription,
  keyBytes,
  pushSupported,
  PUSH_WORKER,
} from "./push";
import { ConfirmButton, LoadError } from "./AppUi";
import { errorText, when } from "./app-helpers";

export function PushSettings({ siteId, app }: { siteId: string; app: App }) {
  const [devices, setDevices] = useState<PushDevice[]>();
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "">(
    () => (pushSupported() ? Notification.permission : ""),
  );
  const [subscribed, setSubscribed] = useState(false);
  const load = useCallback(() => {
    setLoadError("");
    api
      .listDevices(siteId)
      .then((r) => setDevices(r.devices))
      .catch((e) =>
        setLoadError(errorText(e, "Your devices could not be loaded.")),
      );
  }, [siteId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!pushSupported()) return;
    existingSubscription()
      .then((s) => setSubscribed(!!s))
      .catch(() => {});
  }, []);
  const notifying = app.tables.filter((t) => t.notify);

  const turnOn = async () => {
    setError("");
    setNotice("");
    // Ask first, straight from the press: browsers only allow it from a gesture.
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
      await api.addDevice(siteId, subscription.toJSON(), deviceLabel());
      setSubscribed(true);
      setNotice(
        "Notifications are on for this device. Send a test to check it works.",
      );
      load();
    } catch (e) {
      setError(
        errorText(e, "Notifications could not be turned on. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { sent } = await api.sendTestPush(siteId);
      setNotice(
        sent
          ? `Test sent to ${sent} ${sent === 1 ? "device" : "devices"}. It should arrive in a few seconds.`
          : "No device received the test. Turn notifications on for a device first.",
      );
    } catch (e) {
      setError(errorText(e, "The test could not be sent."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (device: PushDevice) => {
    setError("");
    setNotice("");
    try {
      await api.removeDevice(siteId, device.id);
      setDevices((list) => list?.filter((d) => d.id !== device.id));
      setNotice(`${device.label} won't get notifications any more.`);
    } catch (e) {
      setError(errorText(e, "The device could not be removed."));
    }
  };

  return (
    <>
      <section className="commerce-panel app-push">
        <h2>Get told when something arrives</h2>
        <p className="commerce-muted">
          {notifying.length
            ? `You'll get a notification on this device when a visitor adds ${notifying
                .map((t) => t.singular.toLowerCase())
                .join(" or ")} — tap it to open the record here.`
            : "None of your tables tell you about new records yet. Turn on “Tell me about new records” for a table in the app builder."}
        </p>
        {error && (
          <p className="commerce-notice error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="commerce-notice" role="status">
            {notice}
          </p>
        )}
        {!permission ? (
          <p className="app-push-state">
            This browser can't show notifications. Try Chrome, Edge or Firefox
            on a computer or Android phone. On iPhone and iPad, add Forma to
            your home screen first, then open it from there.
          </p>
        ) : permission === "denied" ? (
          <p className="app-push-state">
            Notifications are blocked for Forma in this browser. Open the site
            settings (the icon next to the address), allow notifications, then
            come back and turn them on.
          </p>
        ) : (
          <div className="commerce-actions">
            {subscribed && permission === "granted" ? (
              <>
                <span className="app-push-on">
                  <Icon name="check" size={15} /> On for this browser
                </span>
                {/* The same browser may have been set up for another site. */}
                <button
                  type="button"
                  className="commerce-button secondary"
                  disabled={busy}
                  onClick={() => void turnOn()}
                >
                  Not getting them? Connect again
                </button>
              </>
            ) : (
              <button
                type="button"
                className="commerce-button"
                disabled={busy}
                onClick={() => void turnOn()}
              >
                <Icon name="bell" size={15} /> Turn on notifications on this
                device
              </button>
            )}
          </div>
        )}
      </section>
      <section className="commerce-panel">
        <div className="app-list-head">
          <h2>Devices</h2>
          <button
            type="button"
            className="commerce-button secondary"
            disabled={busy || !devices?.length}
            onClick={() => void test()}
          >
            <Icon name="send" size={15} /> Send a test
          </button>
        </div>
        {loadError ? (
          <LoadError message={loadError} onRetry={load} />
        ) : !devices ? (
          <p role="status" className="commerce-muted">
            Loading devices…
          </p>
        ) : !devices.length ? (
          <p className="commerce-muted">
            No devices yet. Turn notifications on from each phone or computer
            you want them on.
          </p>
        ) : (
          <ul className="app-devices">
            {devices.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.label}</strong>
                  <small>Added {when(d.createdAt)}</small>
                </span>
                <ConfirmButton
                  label="Remove"
                  question={`Stop notifications on ${d.label}?`}
                  confirm="Remove"
                  onConfirm={() => void remove(d)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
