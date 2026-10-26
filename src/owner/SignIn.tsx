/** The branded sign-in, as the reference's owner-login page. */
import { useState, type FormEvent } from "react";
import {
  ApiError,
  signIn,
  type Account,
  type CloudConfig,
} from "../cloud/client";
import { ShopMark, Icon } from "./Icon";
import { Button, Field, InlineAlert, Input, PasswordInput } from "./ui";

export function SignIn({
  shopName,
  appName,
  logo,
  siteUrl,
  config,
  onSignedIn,
}: {
  shopName: string;
  appName: string;
  logo?: string;
  siteUrl?: string;
  config: CloudConfig;
  onSignedIn: (account: Account) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [formError, setFormError] = useState<{ title: string; text: string }>();
  const [busy, setBusy] = useState(false);
  // Hosted sign-in (AWS) can't take a password here: it goes to Forma's page.
  const hosted = config.mode === "aws";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(undefined);
    if (hosted) {
      location.assign(
        `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
      );
      return;
    }
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your email address";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      next.email = "Enter a valid email address";
    if (!password) next.password = "Enter your password";
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      const account = await signIn("login", email.trim(), password);
      if (account) onSignedIn(account);
      else setBusy(false);
    } catch (error) {
      setBusy(false);
      // The same message for an unknown email and a wrong password.
      const credentials =
        error instanceof ApiError &&
        [400, 401, 403, 404].includes(error.status);
      setFormError(
        credentials
          ? {
              title: "Invalid sign-in details",
              text: "Check the credentials and try again.",
            }
          : {
              title: "Couldn't sign in",
              text:
                error instanceof Error && error.message
                  ? error.message
                  : "Your workspace could not be reached. Try again.",
            },
      );
    }
  };

  return (
    <div className="ow-publicShell">
      <main className="ow-login" id="main">
        <div className="ow-loginBrand">
          <span className="ow-loginMark">
            <ShopMark logo={logo} name={shopName} size={48} />
          </span>
          <h1 className="ow-pageTitle">Shop owner sign in</h1>
          <p className="ow-muted">
            {appName ? `${shopName} · ${appName}` : shopName}
          </p>
        </div>

        <div className="ow-card ow-cardPad">
          <form
            className="ow-stack"
            onSubmit={(e) => void submit(e)}
            noValidate
          >
            {!hosted && (
              <>
                <Field label="Email address" error={errors.email}>
                  {(props) => (
                    <Input
                      {...props}
                      type="email"
                      autoComplete="username"
                      placeholder="owner@yourshop.in"
                      value={email}
                      disabled={busy}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrors((x) => ({ ...x, email: undefined }));
                      }}
                    />
                  )}
                </Field>
                <Field label="Password" error={errors.password}>
                  {(props) => (
                    <PasswordInput
                      {...props}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      disabled={busy}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrors((x) => ({ ...x, password: undefined }));
                      }}
                    />
                  )}
                </Field>
              </>
            )}
            {formError && (
              <InlineAlert tone="danger" title={formError.title}>
                {formError.text}
              </InlineAlert>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              icon="lock"
              loading={busy}
            >
              Sign in
            </Button>
          </form>
        </div>

        <InlineAlert tone="info" icon="shield">
          Use the Forma account that manages this shop. There is no
          self-registration. Need access? Ask the shop’s owner to add you to the
          website’s team.
        </InlineAlert>

        {siteUrl && (
          <p className="ow-loginBack">
            <a href={siteUrl}>
              <Icon name="arrowLeft" size={14} />
              Back to the customer app
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
