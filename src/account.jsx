import React, { useState } from "react";
import { supabase } from "./supabase.js";
import { Icon } from "./Icon.jsx";

const SYNC_LABELS = {
  syncing: "Synchronisation…",
  synced: "Synchronisé",
  error: "Sync en échec",
  off: "Sync en pause",
};

const BENEFITS = [
  {
    icon: "repeat",
    title: "Synchronisé",
    text: "Tu valides une prière sur ton téléphone, ton ordinateur le sait déjà.",
  },
  {
    icon: "shield",
    title: "Sauvegardé",
    text: "Effacer les données du navigateur ne fait plus tout perdre.",
  },
  {
    icon: "download",
    title: "Toujours exportable",
    text: "Tes données restent les tiennes, export complet en un clic.",
  },
];

// Page Compte : connexion, création de compte et mot de passe oublié.
// App reçoit les changements de session via onAuthStateChange, pas besoin
// de remonter le résultat ici.
export function AccountSection({ session, syncStatus, onSignOut }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setMessage("");
  };

  if (session) {
    return (
      <section className="welcome account-hero">
        <span className="account-avatar" aria-hidden="true">
          {(session.user.email || "?")[0].toUpperCase()}
        </span>
        <h1 className="account-title">{session.user.email}</h1>
        <p className="account-sync">
          <span className={`sync-badge ${syncStatus}`}>
            {SYNC_LABELS[syncStatus]}
          </span>
        </p>
        <p className="welcome-lead">
          Ta progression est rattachée à ton compte. Chaque validation est
          synchronisée automatiquement entre tes appareils, et l’export
          complet reste disponible dans Réglages.
        </p>
        <div className="button-row account-actions">
          <button className="button secondary" onClick={onSignOut}>
            Se déconnecter
          </button>
        </div>
      </section>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage(
          "Si un compte existe pour cette adresse, tu vas recevoir un lien pour choisir un nouveau mot de passe.",
        );
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage(
          "Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.",
        );
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(
        err?.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : `La connexion a échoué : ${err?.message || "erreur inconnue"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="welcome account-hero">
      <span className="eyebrow">
        <span /> TON WIRD, PARTOUT
      </span>
      <h1>
        Ta progression te suit.
        <br />
        <em>sur tous tes appareils.</em>
      </h1>
      <p className="welcome-lead">
        Un compte pour retrouver tes sourates, ton cycle et tes réglages,
        que tu ouvres Wird sur ton téléphone ou ton ordinateur. Sans compte,
        tout reste dans ce navigateur.
      </p>
      <div className="welcome-steps">
        {BENEFITS.map((b) => (
          <div key={b.icon}>
            <span className="step-icon">
              <Icon name={b.icon} size={12} />
            </span>
            <strong>{b.title}</strong>
            <p>{b.text}</p>
          </div>
        ))}
      </div>
      <form className="auth-card" onSubmit={submit}>
        {mode === "reset" ? (
          <>
            <h2>Mot de passe oublié</h2>
            <p className="auth-hint">
              Entre l’adresse email de ton compte, tu recevras un lien pour
              choisir un nouveau mot de passe.
            </p>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && <p className="form-notice">{message}</p>}
            <button className="button primary auth-submit" disabled={busy}>
              Envoyer le lien
            </button>
            <button
              type="button"
              className="text-button auth-back"
              onClick={() => switchMode("signin")}
            >
              Retour à la connexion
            </button>
          </>
        ) : (
          <>
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Connexion ou création de compte"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                className={mode === "signin" ? "active" : ""}
                onClick={() => switchMode("signin")}
              >
                Connexion
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={mode === "signup" ? "active" : ""}
                onClick={() => switchMode("signup")}
              >
                Créer un compte
              </button>
            </div>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span>Mot de passe</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && <p className="form-notice">{message}</p>}
            <button className="button primary auth-submit" disabled={busy}>
              {mode === "signin" ? "Se connecter" : "Créer mon compte"}
            </button>
            {mode === "signin" && (
              <button
                type="button"
                className="text-button auth-back"
                onClick={() => switchMode("reset")}
              >
                Mot de passe oublié ?
              </button>
            )}
          </>
        )}
      </form>
    </section>
  );
}

const plural = (n, s) => `${n} ${s}${n > 1 ? "s" : ""}`;

const summarize = (state) => ({
  surahs: state?.known?.length ?? 0,
  validations: state?.history?.length ?? 0,
  cycle: (state?.cycles ?? 0) + 1,
});

// Choix entre la progression de l'appareil et celle du compte quand les
// deux ont de vraies données à la première connexion.
export function SyncConflictChoice({ localState, remote, onChoose }) {
  const local = summarize(localState);
  const dist = summarize(remote.state);
  const syncedAt = new Date(remote.updated_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const options = [
    {
      choice: "local",
      icon: "device",
      title: "Cet appareil",
      stats: `${plural(local.surahs, "sourate")} · ${plural(local.validations, "validation")} · cycle ${local.cycle}`,
      detail: null,
    },
    {
      choice: "remote",
      icon: "cloud",
      title: "Ton compte",
      stats: `${plural(dist.surahs, "sourate")} · ${plural(dist.validations, "validation")} · cycle ${dist.cycle}`,
      detail: `synchronisée le ${syncedAt}`,
    },
  ];
  return (
    <div className="conflict-choice">
      <p className="conflict-lead">
        Cet appareil et ton compte contiennent chacun une progression. Celle
        que tu choisis remplacera l’autre partout.
      </p>
      <div className="conflict-grid">
        {options.map((o) => (
          <button
            key={o.choice}
            type="button"
            className="conflict-card"
            onClick={() => onChoose(o.choice)}
          >
            <span className="step-icon">
              <Icon name={o.icon} size={13} />
            </span>
            <strong>{o.title}</strong>
            <span className="conflict-stats">{o.stats}</span>
            {o.detail && <span className="conflict-date">{o.detail}</span>}
            <span className="conflict-cta">
              Garder cette version <Icon name="arrow" size={12} />
            </span>
          </button>
        ))}
      </div>
      <p className="conflict-note">
        Fermer cette fenêtre te déconnecte sans synchroniser, rien n’est
        écrasé.
      </p>
    </div>
  );
}

// Affiché après un clic sur le lien de réinitialisation reçu par email :
// la session est alors une session de récupération.
export function PasswordRecoveryForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone("Nouveau mot de passe enregistré. Tu es connecté.");
    } catch (err) {
      setError(
        `Le changement a échoué : ${err?.message || "erreur inconnue"}. Redemande un lien si celui-ci a expiré.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field">
        <span>Nouveau mot de passe</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="auth-field">
        <span>Confirme le mot de passe</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="button primary" type="submit" disabled={busy}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
