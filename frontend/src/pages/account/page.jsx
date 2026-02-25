import { useState } from "react";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { startGoogleOAuthSignIn } from "../../auth/supabase-auth";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        d="M21.35 11.1H12v2.96h5.36c-.23 1.51-1.77 4.43-5.36 4.43a6.04 6.04 0 0 1 0-12.07c2.04 0 3.4.87 4.19 1.62l2.86-2.77C17.26 3.58 14.86 2.5 12 2.5a9.5 9.5 0 1 0 0 19c5.48 0 9.12-3.85 9.12-9.26 0-.62-.07-1.08-.17-1.14Z"
        fill="#4285F4"
      />
      <path
        d="M5.4 14.12 4.76 16.5A9.5 9.5 0 0 0 12 21.5c2.86 0 5.26-.94 7.01-2.56l-3.2-2.48c-.86.57-2 .97-3.81.97a5.67 5.67 0 0 1-5.4-3.31Z"
        fill="#34A853"
      />
      <path
        d="M4.76 7.5a9.57 9.57 0 0 0 0 9l3.24-2.38a5.67 5.67 0 0 1 0-3.73Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.58c1.96 0 3.3.85 4.06 1.56l2.96-2.89C17.25 3.62 14.86 2.5 12 2.5A9.5 9.5 0 0 0 4.76 7.5L8 9.88A5.67 5.67 0 0 1 12 6.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AccountAccessPage({
  onAuthenticated,
  oauthErrorMessage = "",
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isLogin = mode === "login";
  const ssoSectionLabel = t("auth.ssoSectionLabel");
  const manualSectionLabel = t("auth.manualSectionLabel");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError(t("auth.emailAndPasswordRequired"));
      return;
    }

    setIsSubmitting(true);
    setError("");
    setGoogleError("");
    setNotice("");

    try {
      const response = isLogin
        ? await api.login(email, password)
        : await api.register(email, password);

      if (!response.access_token) {
        setNotice(t("auth.accountCreatedNotice"));
        return;
      }

      api.setAccessToken(response.access_token);
      onAuthenticated(response.user);
    } catch (submitError) {
      setError(submitError.message || t("auth.authenticationFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleError("");
    setError("");
    setNotice("");
    setIsGoogleSubmitting(true);

    try {
      await startGoogleOAuthSignIn();
    } catch (oauthError) {
      const oauthMessage = oauthError?.message || "";
      if (
        oauthMessage.includes("VITE_SUPABASE_URL") ||
        oauthMessage.includes("VITE_SUPABASE_ANON_KEY")
      ) {
        setGoogleError(t("auth.googleAuthenticationUnavailable"));
      } else {
        setGoogleError(oauthMessage || t("auth.googleAuthenticationFailed"));
      }
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-sky-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-blue-200 bg-white p-7 shadow-[0_10px_30px_rgba(36,68,121,0.08)]">
        <h1 className="mb-2 text-[28px] text-slate-900">
          {t("common.appName")}
        </h1>
        <p className="mb-4 text-sm text-slate-600">
          {isLogin ? t("auth.loginSubtitle") : t("auth.registerSubtitle")}
        </p>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {ssoSectionLabel}
          </h2>
          {(oauthErrorMessage || googleError) && (
            <div className="mt-2 text-[13px] text-rose-700">
              {googleError || oauthErrorMessage}
            </div>
          )}
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleGoogleSignIn}
            disabled={isGoogleSubmitting || isSubmitting}
          >
            <GoogleLogo />
            <span>
              {isGoogleSubmitting
                ? t("auth.googlePleaseWait")
                : t("auth.googleButton")}
            </span>
          </button>
        </section>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {manualSectionLabel}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <section>
          <form className="flex flex-col gap-2.5" onSubmit={handleSubmit}>
            <label
              htmlFor="email"
              className="text-[13px] font-semibold text-slate-800"
            >
              {t("common.email")}
            </label>
            <input
              id="email"
              type="email"
              className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />

            <label
              htmlFor="password"
              className="text-[13px] font-semibold text-slate-800"
            >
              {t("common.password")}
            </label>
            <input
              id="password"
              type="password"
              className="rounded-lg border border-blue-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition-shadow focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />

            {error && (
              <div className="mt-1 text-[13px] text-rose-700">{error}</div>
            )}
            {notice && (
              <div className="mt-1 text-[13px] text-emerald-700">{notice}</div>
            )}

            <button
              type="submit"
              className="btn mt-1.5 border-sky-500 bg-sky-500 px-3.5 py-2.5 font-semibold text-white hover:border-sky-600 hover:bg-sky-600 disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t("auth.pleaseWait")
                : isLogin
                  ? t("auth.loginButton")
                  : t("auth.registerButton")}
            </button>
          </form>
        </section>

        <div className="mt-4 flex items-center gap-2 text-[13px] text-slate-600">
          {isLogin ? t("auth.needAccount") : t("auth.alreadyRegistered")}
          <button
            type="button"
            className="bg-transparent p-0 font-semibold text-sky-700"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setError("");
              setGoogleError("");
              setNotice("");
            }}
          >
            {isLogin ? t("auth.registerButton") : t("auth.loginButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
