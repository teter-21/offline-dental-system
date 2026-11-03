import { getAccessToken } from "../../utils/session.js";
import API_BASE_URL from "../../config/apiBase.js";
import React, { useMemo, useEffect, useState } from "react";
import axios from "axios";
import "../../css/Settings.css";

function Settings() {
  const [account, setAccount] = useState(null);

  const [form, setForm] = useState({
    fullname: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // This API will be provided by Electron's secure preload.
  // It is intentionally unavailable in an ordinary browser.
  const desktop = window.magnoDesktop;

  const desktopAvailable =
    typeof desktop?.createBackup === "function" &&
    typeof desktop?.restoreBackup === "function";

  const token = getAccessToken();

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  useEffect(() => {
    let active = true;

    const loadAccount = async () => {
      try {
        const response = await axios.get(API_BASE_URL + "/account", {
          headers,
        });

        if (!active) return;

        setAccount(response.data);

        setForm((current) => ({
          ...current,
          fullname: response.data.fullname || "",
          email: response.data.email || "",
        }));
      } catch (err) {
        if (active && !err?.nativeAlertHandled) {
          window.alert(
            err.response?.data?.message ||
              "Unable to load your account information.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAccount();

    return () => {
      active = false;
    };
  }, [headers]);

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (form.newPassword && !form.currentPassword) {
      window.alert("Enter your current password before changing it.");
      return;
    }

    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      window.alert("New password and confirmation do not match.");
      return;
    }

    setSaving(true);

    try {
      const response = await axios.put(
        API_BASE_URL + "/account",
        {
          fullname: form.fullname,
          email: form.email,
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        },
        { headers },
      );

      if (response.nativeAlertHandled) return;

      window.alert(response.data.message);

      setAccount((current) => ({
        ...current,
        fullname: form.fullname,
        email: form.email,
      }));

      setForm((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));

      // When a password is changed, the backend revokes
      // the active sessions. The app's existing auth
      // flow should redirect the user to login.
      if (response.data.sessionEnded) {
        window.alert("Your password was changed. Please log in again.");
      }
    } catch (err) {
      if (!err?.nativeAlertHandled) {
        window.alert(
          err.response?.data?.message || "Unable to save your changes.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    if (!desktopAvailable) {
      window.alert("Backup is available in the installed desktop application.");
      return;
    }

    if (backupBusy || restoreBusy) return;

    const confirmed = window.confirm(
      "Create a backup of the dental database and patient photographs?",
    );

    if (!confirmed) return;

    setBackupBusy(true);

    try {
      // Electron's main process will validate the
      // administrator's active session before executing.
      const result = await desktop.createBackup({
        token: getAccessToken(),
      });

      if (result?.cancelled) return;

      if (result?.success) {
        window.alert(
          "Backup completed and verified successfully." +
            (result.location ? `\nSaved to: ${result.location}` : ""),
        );
      } else {
        window.alert(result?.message || "Backup could not be completed.");
      }
    } catch (error) {
      console.error("Backup failed:", error);

      window.alert(error?.message || "Unable to create the backup.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!desktopAvailable) {
      window.alert(
        "Restore is available in the installed desktop application.",
      );
      return;
    }

    if (backupBusy || restoreBusy) return;

    const confirmed = window.confirm(
      "WARNING: Restoring a backup will replace the current " +
        "patient records, dental charts, treatments, billing " +
        "information, and photographs.\n\n" +
        "Any changes made after the selected backup may be lost.\n\n" +
        "Do you want to select a backup to restore?",
    );

    if (!confirmed) return;

    setRestoreBusy(true);

    try {
      // The Electron main process must:
      // 1. Verify administrator authorization.
      // 2. Show a native backup-selection dialog.
      // 3. Validate the backup and request final confirmation.
      // 4. Close the backend and SQLite safely.
      // 5. Restore and restart the application.
      const result = await desktop.restoreBackup({
        token: getAccessToken(),
      });

      if (result?.cancelled) return;

      if (result?.success) {
        window.alert(
          "The backup was restored successfully. " +
            "The application will reload.",
        );

        window.location.reload();
      } else {
        window.alert(result?.message || "Restore could not be completed.");
      }
    } catch (error) {
      console.error("Restore failed:", error);

      window.alert(error?.message || "Unable to restore the backup.");
    } finally {
      setRestoreBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="account-message">Loading account information...</div>
    );
  }

  return (
    <div className="account-page">
      <div className="account-header">
        <div>
          <h1>Settings</h1>
          <p>
            Manage your administrator account, password, and system backups.
          </p>
        </div>
      </div>

      {/* ACCOUNT SETTINGS */}
      <form className="account-form" onSubmit={handleSave}>
        <section className="account-card">
          <div className="account-profile-top">
            <div className="account-avatar">
              {account?.fullname?.charAt(0)?.toUpperCase() || "A"}
            </div>

            <div>
              <h2>{account?.fullname || "Administrator"}</h2>
              <p>{account?.email || "No email address"}</p>
              <span className="account-role">Administrator</span>
            </div>
          </div>

          <div className="account-section">
            <h3>Account Information</h3>

            <div className="account-grid">
              <label>
                Full Name
                <input
                  name="fullname"
                  value={form.fullname}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Email Address
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Account Type
                <input value="Administrator" disabled />
              </label>

              <label>
                Account ID
                <input value={account?.id || "—"} disabled />
              </label>
            </div>
          </div>

          <div className="account-section">
            <h3>Change Password</h3>

            <p className="account-help">
              Leave these fields empty if you only want to update your account
              information.
            </p>

            <div className="account-grid password-grid">
              <label>
                Current Password
                <input
                  type="password"
                  name="currentPassword"
                  value={form.currentPassword}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
              </label>

              <label>
                New Password
                <input
                  type="password"
                  name="newPassword"
                  value={form.newPassword}
                  onChange={handleChange}
                  minLength="6"
                  autoComplete="new-password"
                />
              </label>

              <label>
                Confirm New Password
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  minLength="6"
                  autoComplete="new-password"
                />
              </label>
            </div>
          </div>

          <div className="account-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      </form>

      {/* BACKUP AND RESTORE */}
      <section className="account-card settings-backup-card">
        <div className="account-section settings-backup-heading">
          <h3>System Backup & Restore</h3>

          <p className="account-help">
            Protect your clinic's information by creating backups of patient
            records, appointments, treatments, dental charts, billing records,
            and patient photographs.
          </p>
        </div>

        <div className="settings-backup-options">
          <div className="settings-backup-item">
            <div className="settings-backup-info">
              <h4>Backup System Data</h4>

              <p>
                Create a verified backup of the SQLite database and private
                patient photographs. Save a copy in a secure location.
              </p>
            </div>

            <button
              type="button"
              className="settings-backup-button"
              onClick={handleBackup}
              disabled={!desktopAvailable || backupBusy || restoreBusy}
            >
              {backupBusy ? "Backing Up..." : "Backup Data"}
            </button>
          </div>

          <div className="settings-backup-item">
            <div className="settings-backup-info">
              <h4>Restore System Data</h4>

              <p>
                Recover clinic information from a previously created backup.
                Restoring will replace the current records.
              </p>
            </div>

            <button
              type="button"
              className="settings-restore-button"
              onClick={handleRestore}
              disabled={!desktopAvailable || backupBusy || restoreBusy}
            >
              {restoreBusy ? "Restoring..." : "Restore Data"}
            </button>
          </div>
        </div>

        <div className="settings-backup-note">
          {desktopAvailable ? (
            <p>
              Backup and Restore are available. Keep your backup files in a
              secure location.
            </p>
          ) : (
            <p>
              Backup and Restore controls will become available when the system
              is running as an Electron desktop application.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export default Settings;
