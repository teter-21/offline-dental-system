import PatientImage from "./PatientImage.jsx";
import React, { useState } from "react";
import ViewVisitModal from "./ViewVisitModal";
import EditPatientModal from "./EditPatientModal";
import DentalChartModal from "./DentalChartModal";
import { FaEye, FaEdit, FaTooth } from "react-icons/fa";
import "../css/PatientRow.css";

function PatientRow({ patient, onUpdatePatient, onImageClick }) {
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDentalChart, setShowDentalChart] = useState(false);

  return (
    <div className="table-row">
      <span>{patient.id}</span>
      <span>
        <PatientImage image={patient.image} width="80" className="avatar" alt={patient.name}
          onClick={() => onImageClick?.(patient.image)} />
      </span>
      <span className="name">{patient.name}</span>
      <span className="muted">{patient.address}</span>
      <span className="muted">{patient.phone}</span>
      <span>{patient.age}</span>
      <span>{patient.occupation}</span>
      <span>{patient.status || "—"}</span>
      <span className="complaint">{patient.complain}</span>
      <span className="visit-actions">
        <button type="button" className="view-btn" title="View Patient Visits" onClick={() => setShowViewModal(true)}><FaEye /></button>
        <button type="button" className="dental-chart-btn" title="Dental Chart" onClick={() => setShowDentalChart(true)}><FaTooth /></button>
        <button type="button" className="edit-btn" title="Edit Patient" onClick={() => setShowEditModal(true)}><FaEdit /></button>
      </span>
      {showViewModal && <ViewVisitModal patient={patient} onClose={() => setShowViewModal(false)} />}
      {showEditModal && <EditPatientModal patient={patient} onClose={() => setShowEditModal(false)} onSave={onUpdatePatient} />}
      {showDentalChart && <DentalChartModal patient={patient} onClose={() => setShowDentalChart(false)} />}
    </div>
  );
}
export default PatientRow;
