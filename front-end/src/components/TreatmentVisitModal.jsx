import React, { useEffect, useState } from "react";
import api from "../api";
import MultiServiceSelect from "./MultiServiceSelect";
import "../css/TreatmentVisitModal.css";

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const localTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

function defaultValues(patient, visit) {
  return {
    visit_date: visit?.visit_date?.slice(0, 10) || localDate(),
    visit_time: visit?.visit_time?.slice(0, 5) || localTime(),
    procedure_name: visit?.procedure_name ?? patient?.service ?? "",
    complain: visit?.complain ?? patient?.complain ?? patient?.reason ?? "",
    description: visit?.description ?? "",
    amount_paid: visit?.amount_paid == null ? "" : String(visit.amount_paid),
    balance: visit?.balance == null ? "" : String(visit.balance),
  };
}

/** Existing visit form, used for either creating a patient visit or editing it. */
function TreatmentVisitModal({
  patient,
  initialVisit = null,
  onClose,
  onCompleted,
}) {
  const isEdit = Boolean(initialVisit?.id);
  const [formData, setFormData] = useState(() =>
    defaultValues(patient, initialVisit),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFormData(defaultValues(patient, initialVisit));
    setError("");
    // Reset only when a different patient/visit is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id, initialVisit?.id]);

  if (!patient?.id) return null;
  const name = patient.name || patient.patient_name || "Patient";

  const handleChange = (event) => {
    const { name: field, value } = event.target;
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (
      !formData.visit_date ||
      !formData.visit_time ||
      !formData.procedure_name.trim()
    ) {
      setError("Date, time, and at least one service are required.");
      return;
    }
    if (
      ["amount_paid", "balance"].some(
        (field) =>
          formData[field] !== "" &&
          (!Number.isFinite(Number(formData[field])) ||
            Number(formData[field]) < 0),
      )
    ) {
      setError("Payment amounts must be non-negative numbers.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = { ...formData, patient_id: patient.id };
      const response = isEdit
        ? await api.put(`/visits/${initialVisit.id}`, payload)
        : await api.post("/add-visit", payload);
      await onCompleted?.(response.data);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to save the visit record.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="treatment-modal-overlay"
      onMouseDown={() => !saving && onClose()}
    >
      <div
        className="treatment-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit Visit Record" : "Save Visit Record"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="treatment-modal-header">
          <div>
            <span className="treatment-modal-label">
              {isEdit ? "CORRECT TREATMENT HISTORY" : "PATIENT TREATMENT"}
            </span>
            <h2>{isEdit ? "Edit Visit Record" : "Save Visit Record"}</h2>
            <p>
              Patient #{patient.id} • {name}
            </p>
          </div>
          <button
            type="button"
            className="treatment-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close visit form"
          >
            ×
          </button>
        </div>

        <div className="treatment-patient-summary">
          <div>
            <span>Patient</span>
            <strong>{name}</strong>
          </div>
          <div>
            <span>Patient ID</span>
            <strong>P{String(patient.id).padStart(3, "0")}</strong>
          </div>
          <div>
            <span>Record</span>
            <strong>
              {isEdit ? `Visit #${initialVisit.id}` : "New visit"}
            </strong>
          </div>
        </div>

        <form className="treatment-form" onSubmit={handleSubmit}>
          <div className="treatment-form-row">
            <div className="treatment-form-group">
              <label htmlFor="visit-date">Visit Date</label>
              <input
                id="visit-date"
                type="date"
                name="visit_date"
                value={formData.visit_date}
                onChange={handleChange}
                required
                disabled={saving}
              />
            </div>
            <div className="treatment-form-group">
              <label htmlFor="visit-time">Visit Time</label>
              <input
                id="visit-time"
                type="time"
                name="visit_time"
                value={formData.visit_time}
                onChange={handleChange}
                required
                disabled={saving}
              />
            </div>
          </div>
          <div className="treatment-form-group">
            <label>Services Performed (select one or more)</label>
            <MultiServiceSelect
              idPrefix={`visit-service-${patient.id}`}
              value={formData.procedure_name}
              onChange={(value) =>
                setFormData((previous) => ({
                  ...previous,
                  procedure_name: value,
                }))
              }
            />
          </div>
          <div className="treatment-form-group">
            <label htmlFor="visit-complaint">Complaint</label>
            <input
              id="visit-complaint"
              type="text"
              name="complain"
              value={formData.complain}
              onChange={handleChange}
              placeholder="Patient complaint"
              disabled={saving}
            />
          </div>
          <div className="treatment-form-group">
            <label htmlFor="visit-description">Treatment / Description</label>
            <textarea
              id="visit-description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="4"
              disabled={saving}
              placeholder="Treatment performed, findings, or dentist notes..."
            />
          </div>
          <div className="treatment-form-row">
            <div className="treatment-form-group">
              <label htmlFor="visit-paid">Amount Paid (₱)</label>
              <input
                id="visit-paid"
                type="number"
                min="0"
                step="0.01"
                name="amount_paid"
                value={formData.amount_paid}
                onChange={handleChange}
                placeholder="0.00"
                disabled={saving}
              />
            </div>
            <div className="treatment-form-group">
              <label htmlFor="visit-balance">Balance (₱)</label>
              <input
                id="visit-balance"
                type="number"
                min="0"
                step="0.01"
                name="balance"
                value={formData.balance}
                onChange={handleChange}
                placeholder="0.00"
                disabled={saving}
              />
            </div>
          </div>
          {error && (
            <p className="treatment-form-error" role="alert">
              {error}
            </p>
          )}
          {isEdit && (
            <p className="treatment-form-note">
              Payments already recorded in Billing are preserved. Amount Paid
              cannot be lower than those payments.
            </p>
          )}
          <div className="treatment-form-actions">
            <button
              type="button"
              className="treatment-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="treatment-save" disabled={saving}>
              {saving
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Save Visit Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TreatmentVisitModal;
