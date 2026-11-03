import React, { useState, useEffect, useRef } from "react";
import api from "../api";
import "../css/EditPatientModal.css";
import { buildFullName, splitFullName } from "../utils/nameFormatter";
import { FaCamera } from "react-icons/fa";
function EditPatientModal({ patient, onClose, onSave }) {
  const patientName = splitFullName(patient.name);
  const [formData, setFormData] = useState({
    lastName: patientName.lastName,
    firstName: patientName.firstName,
    middleName: patientName.middleName,
    age: patient.age || "",
    occupation: patient.occupation || "",
    address: patient.address || "",
    phone: patient.phone || "",
    gender: patient.gender || "",
    status: patient.status || "",
    complain: patient.complain || "",
  });
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };
  const closeModal = () => {
    stopCamera();
    onClose();
  };
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  const openCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera unavailable. Use localhost or HTTPS and allow camera permissions.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(
        "Unable to access camera. Check browser permissions or choose a file.",
      );
    }
  };
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current
        .play()
        .catch(() => setCameraError("Unable to start camera preview."));
    }
  }, [cameraOpen]);
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraError("Camera is still loading. Try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setCameraError("Unable to capture the photo.");
        if (blob.size > 2 * 1024 * 1024)
          return setCameraError("Photo exceeds 2 MB.");
        setImage(
          new File([blob], `patient-camera-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );
        setCameraError("");
        stopCamera();
      },
      "image/jpeg",
      0.85,
    );
  };

  const handleChange = (e) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullname = buildFullName(
      formData.lastName,
      formData.firstName,
      formData.middleName,
    );
    if (!fullname.trim()) {
      window.alert("Please enter the patient's name.");
      return;
    }
    const data = new FormData();
    data.append("name", fullname);
    data.append("age", formData.age);
    data.append("occupation", formData.occupation);
    data.append("address", formData.address);
    data.append("phone", formData.phone);
    data.append("gender", formData.gender);
    data.append("status", formData.status);
    data.append("complain", formData.complain);
    if (image) {
      data.append("image", image);
    }
    try {
      setSaving(true);
      await api.put(`/update-patient/${patient.id}`, data);
      if (onSave) {
        await onSave();
      }
      closeModal();
    } catch (err) {
      console.error("Update patient error:", err);
      if (!err?.nativeAlertHandled)
        window.alert(
          err.response?.data?.message || "Unable to update patient.",
        );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="edit-modal-overlay" onMouseDown={closeModal}>
      <form
        className="edit-modal"
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="edit-modal-header">
          <div>
            <h2>Update Patient</h2>
            <p>Update the patient's personal and contact information.</p>
          </div>

          <button
            type="button"
            className="edit-modal-close"
            onClick={closeModal}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="edit-modal-body">
          <div className="edit-section-title">Personal Information</div>

          <div className="edit-name-grid">
            <div className="edit-field">
              <label>Last Name</label>
              <input
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>

            <div className="edit-field">
              <label>First Name</label>
              <input
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>

            <div className="edit-field">
              <label>Middle Name</label>
              <input
                name="middleName"
                value={formData.middleName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="edit-two-column">
            <div className="edit-field">
              <label>Age</label>
              <input
                type="number"
                min="0"
                name="age"
                value={formData.age}
                onChange={handleChange}
              />
            </div>

            <div className="edit-field">
              <label>Gender</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div className="edit-two-column">
            <div className="edit-field">
              <label>Phone Number</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="edit-field">
              <label>Occupation</label>
              <input
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="edit-field">
            <label>Address</label>
            <input
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
          </div>

          <div className="edit-section-title">Clinic Information</div>

          <div className="edit-two-column">
            <div className="edit-field">
              <label>Civil Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="">Select civil status</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
                <option value="Divorced">Divorced</option>
                <option value="Annulled">Annulled</option>
              </select>
            </div>

            <div className="edit-field">
              <label>Patient Image</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif"
                onChange={(e) => {
                  setImage(e.target.files?.[0] || null);
                  stopCamera();
                }}
              />
              <button
                type="button"
                onClick={cameraOpen ? stopCamera : openCamera}
                disabled={saving}
                style={{
                  marginTop: 10,
                  marginLeft: 12,
                  padding: "2px 6px",
                  fontSize: 14,
                }}
              >
                {cameraOpen ? "Cancel Camera" : <FaCamera />}
              </button>

              {cameraOpen && (
                <button
                  type="button"
                  onClick={capturePhoto}
                  style={{
                    marginTop: 10,
                    marginLeft: 12,
                    padding: "2px 6px",
                    fontSize: 14,
                  }}
                >
                  Capture Photo
                </button>
              )}

              {cameraOpen && (
                <div style={{ marginTop: 10, marginLeft: 12 }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", maxWidth: 320, display: "block" }}
                  />
                </div>
              )}
              {image && (
                <small style={{ display: "block", marginTop: 6 }}>
                  Selected photo: {image.name}
                </small>
              )}
              {cameraError && (
                <small
                  role="alert"
                  style={{ display: "block", color: "#b42318", marginTop: 6 }}
                >
                  {cameraError}
                </small>
              )}
            </div>
          </div>

          <div className="edit-field">
            <label>Complaint</label>
            <textarea
              name="complain"
              rows="3"
              value={formData.complain}
              onChange={handleChange}
            />
          </div>

          {patient.image && !image && (
            <p className="edit-current-image">
              Current image: <strong>{patient.image}</strong>
            </p>
          )}
        </div>

        <div className="edit-modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={closeModal}
            disabled={saving}
          >
            Cancel
          </button>

          <button type="submit" className="save-btn" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
export default EditPatientModal;
