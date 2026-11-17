import React, { useCallback, useEffect, useState } from "react";
import { formatDateOnly } from "../utils/dateUtils";
import api from "../api";
import TreatmentVisitModal from "./TreatmentVisitModal";
import "../css/ViewVisitModal.css";

const pesos = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ViewVisitModal({ patient, onClose }) {
  const [visits, setVisits] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadVisits = useCallback(async () => {
    try {
      const response = await api.get(`/visits/${patient.id}`);
      setVisits(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (err) {
      setError(
        err.response?.data?.message || "Unable to load treatment history.",
      );
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);
  const totalPaid = visits.reduce(
    (sum, visit) => sum + Number(visit.amount_paid || 0),
    0,
  );
  const totalBalance = visits.reduce(
    (sum, visit) => sum + Number(visit.balance || 0),
    0,
  );

  return (
    <div className="viewv-modal-overlay">
      <div
        className="viewv-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Treatment History"
      >
        <div className="modal-header">
          <div>
            <h2>Treatment History</h2>
            <p>
              {patient.name} (P{String(patient.id).padStart(3, "0")})
            </p>
          </div>
          <div className="visit-history-summary">
            <span>Paid: ₱{pesos(totalPaid)}</span>
            <span>Balance: ₱{pesos(totalBalance)}</span>
          </div>
        </div>
        {error && (
          <p className="visit-history-error" role="alert">
            {error}
          </p>
        )}
        <div className="table-container">
          <table className="visit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Time</th>
                <th>Procedure</th>
                <th>Complaint</th>
                <th>Description</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    Loading...
                  </td>
                </tr>
              ) : visits.length > 0 ? (
                visits.map((visit, index) => (
                  <tr key={visit.id}>
                    <td>{index + 1}</td>
                    <td>{formatDateOnly(visit.visit_date)}</td>
                    <td>{visit.visit_time}</td>
                    <td className="procedure">
                      {visit.procedure_name
                        ?.split("|")
                        .map((item) => item.trim())
                        .join(" | ") || "-"}
                    </td>
                    <td>{visit.complain || "-"}</td>
                    <td className="desc" title={visit.description || ""}>
                      {visit.description || "-"}
                    </td>
                    <td className="paid">₱{pesos(visit.amount_paid)}</td>
                    <td className="balance">₱{pesos(visit.balance)}</td>
                    <td>
                      <button
                        type="button"
                        className="visit-edit-button"
                        onClick={() => setEditing(visit)}
                        aria-label={`Edit visit ${visit.id}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="no-data">
                    No treatment history
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {editing && (
        <TreatmentVisitModal
          patient={patient}
          initialVisit={editing}
          onClose={() => setEditing(null)}
          onCompleted={loadVisits}
        />
      )}
    </div>
  );
}

export default ViewVisitModal;
