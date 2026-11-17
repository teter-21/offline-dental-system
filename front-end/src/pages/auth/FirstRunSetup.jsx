import React, { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

function FirstRunSetup() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullname: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const desktop = window.magnoDesktop;

  useEffect(() => {
    let active = true;

    const checkSetup = async () => {
      if (
        !desktop?.isDesktop ||
        typeof desktop.getFirstRunStatus !== "function"
      ) {
        if (active) {
          setError(
            "Initial setup is available only " + "in the desktop application.",
          );
          setChecking(false);
        }
        return;
      }

      try {
        const result = await desktop.getFirstRunStatus();

        if (!active) return;

        if (!result.setupRequired) {
          navigate("/login", {
            replace: true,
          });
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to check setup status.");
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };

    void checkSetup();

    return () => {
      active = false;
    };
  }, [navigate, desktop]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) return;

    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 12) {
      setError(
        "Use a password or passphrase " + "with at least 12 characters.",
      );
      return;
    }

    setSaving(true);

    try {
      const result = await desktop.createFirstAdmin(form);

      if (!result.success) {
        throw new Error("Unable to initialize administrator account.");
      }

      window.alert(
        "Administrator account created successfully. " + "Please sign in.",
      );

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      setError(err.message || "Unable to create administrator account.");
    } finally {
      setSaving(false);
    }
  };

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f4f8fb",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      boxSizing: "border-box",
    },
    card: {
      width: "100%",
      maxWidth: "480px",
      background: "#ffffff",
      border: "1px solid #dbe6ed",
      padding: "32px",
      boxShadow: "0 3px 8px rgba(0,0,0,.12)",
    },
    heading: {
      margin: "0 0 8px",
      color: "#24425f",
      fontSize: "23px",
    },
    description: {
      fontSize: "13px",
      lineHeight: 1.6,
      color: "#647d91",
      marginBottom: "24px",
    },
    label: {
      display: "block",
      fontSize: "12px",
      fontWeight: 700,
      color: "#24425f",
      marginBottom: "7px",
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      height: "42px",
      padding: "10px 12px",
      border: "1px solid #dbe6ed",
      borderRadius: 0,
      fontSize: "13px",
      marginBottom: "17px",
    },
    button: {
      width: "100%",
      height: "44px",
      background: "#24425f",
      border: "none",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      marginTop: "10px",
    },
    error: {
      color: "#b42318",
      fontSize: "12px",
      lineHeight: 1.5,
      marginBottom: "12px",
    },
  };

  if (checking) {
    return (
      <div style={styles.page}>
        <p>Checking clinic setup...</p>
      </div>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.heading}>Magno Dental Management</h1>

        <p style={styles.description}>
          Welcome! Create the first administrator account to initialize your
          offline dental management system.
        </p>

        {error && (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="setup-fullname" style={styles.label}>
            Administrator Full Name
          </label>

          <input
            id="setup-fullname"
            name="fullname"
            value={form.fullname}
            onChange={handleChange}
            required
            maxLength={150}
            autoComplete="name"
            style={styles.input}
          />

          <label htmlFor="setup-email" style={styles.label}>
            Email Address
          </label>

          <input
            id="setup-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            maxLength={100}
            autoComplete="email"
            style={styles.input}
          />

          <label htmlFor="setup-password" style={styles.label}>
            Password
          </label>

          <input
            id="setup-password"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            minLength={12}
            required
            autoComplete="new-password"
            style={styles.input}
          />

          <label htmlFor="setup-confirm" style={styles.label}>
            Confirm Password
          </label>

          <input
            id="setup-confirm"
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            minLength={12}
            required
            autoComplete="new-password"
            style={styles.input}
          />

          <p style={styles.description}>
            Use a unique password or passphrase of at least 12 characters. Avoid
            common or predictable passwords.
          </p>

          <button
            type="submit"
            disabled={saving || (!!error && !desktop?.createFirstAdmin)}
            style={styles.button}
          >
            {saving
              ? "Creating Administrator..."
              : "Create Administrator Account"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default FirstRunSetup;
