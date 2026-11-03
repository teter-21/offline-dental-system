import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import "../../css/AddPatient.css";
import { FaUser, FaMapMarkerAlt, FaInfoCircle, FaCamera } from "react-icons/fa";
import { buildFullName } from "../../utils/nameFormatter";
function AddPatient() {
  const navigate = useNavigate();

  /* FORM DATA */

  const [formData, setFormData] = useState({
    lastName: "",
    firstName: "",
    middleName: "",
    age: "",
    contactNo: "",
    occupation: "",
    gender: "",
    address: "",
    city: "",
    complaint: "",
    civilStatus: "Single",
  });
  const [image, setImage] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
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
        "Camera access is unavailable. Use localhost and allow camera access, or choose a file.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Video is mounted on the next render.
    } catch {
      setCameraError(
        "Could not access the camera. Check browser permissions or choose a file instead.",
      );
    }
  };
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current
        .play()
        .catch(() => setCameraError("Unable to start the camera preview."));
    }
  }, [cameraOpen]);
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth)
      return setCameraError("Camera is still starting. Please try again.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setCameraError("Could not capture photo.");
        if (blob.size > 2 * 1024 * 1024)
          return setCameraError("Photo exceeds 2 MB. Try a smaller image.");
        setImage(
          new File([blob], `patient-camera-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );
        stopCamera();
      },
      "image/jpeg",
      0.85,
    );
  };

  /* HANDLE INPUT CHANGE */

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  /* HANDLE IMAGE */

  const handleImageChange = (e) => {
    const selectedImage = e.target.files[0];
    if (selectedImage) {
      setImage(selectedImage);
    }
  };

  /* HANDLE SUBMIT */

  const handleSubmit = async () => {
    /* BUILD FULL NAME */

    const fullname = buildFullName(
      formData.lastName,
      formData.firstName,
      formData.middleName,
    );

    /* CREATE FORM DATA */

    const data = new FormData();
    data.append("name", fullname);
    data.append("age", formData.age);
    data.append("phone", formData.contactNo);
    data.append("occupation", formData.occupation);
    data.append("gender", formData.gender);

    /* Send the selected civil status. */

    data.append("status", formData.civilStatus);
    data.append("complain", formData.complaint);

    /* ADDRESS */

    const fullAddress = formData.city
      ? `${formData.address}, ${formData.city}`
      : formData.address;
    data.append("address", fullAddress);

    /* IMAGE */

    if (image) {
      data.append("image", image);
    }

    /* SEND TO SERVER */

    try {
      await api.post("/add-patient", data, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      window.alert("Patient Added Successfully!");

      /* Go to the patient list; it fetches the latest records automatically. */
      stopCamera();
      navigate("/PatientMngmt");
    } catch (err) {
      console.error("Add patient error:", err);
      if (!err?.nativeAlertHandled)
        window.alert(err.response?.data?.message || "Unable to add patient.");
    }
  };

  /* RENDER */

  return (
    <div className="overlay">
      <div className="modal">
        {/* HEADER */}
        <div className="header">
          <div className="header-left">
            <h2>Add New Patient</h2>
          </div>
        </div>
        <p className="subtitle">Enter the details of the new patient.</p>
        {/* PATIENT INFORMATION */}
        <div className="section">
          <div className="section-title">
            <span>
              <FaUser />
            </span>

            <h4>Patient Information</h4>

            <div className="line"></div>
          </div>
          <div className="grid-2">
            {/* NAME */}
            <div className="name-row">
              {/* LAST NAME */}

              <div className="input-group">
                <label>Last Name</label>

                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Enter Last Name"
                  required
                />
              </div>

              {/* FIRST NAME */}

              <div className="input-group">
                <label>First Name</label>

                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="Enter First Name"
                  required
                />
              </div>

              {/* MIDDLE NAME */}

              <div className="input-group">
                <label>Middle Name</label>

                <input
                  type="text"
                  name="middleName"
                  value={formData.middleName}
                  onChange={handleChange}
                  placeholder="Enter Middle Name"
                />
              </div>
            </div>
            {/* AGE */}
            <div>
              <label>Age</label>

              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="Enter Age"
                min="0"
              />
            </div>
            {/* GENDER */}
            <div>
              <label>Gender</label>

              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="Male"
                    checked={formData.gender === "Male"}
                    onChange={handleChange}
                  />
                  Male
                </label>

                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="Female"
                    checked={formData.gender === "Female"}
                    onChange={handleChange}
                  />
                  Female
                </label>
              </div>
            </div>
            {/* PHONE */}
            <div>
              <label>Phone Number</label>

              <input
                type="text"
                name="contactNo"
                value={formData.contactNo}
                onChange={handleChange}
                placeholder="Enter Phone Number"
              />
            </div>
            {/* OCCUPATION */}
            <div>
              <label>Occupation</label>

              <input
                type="text"
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
                placeholder="Enter Occupation"
              />
            </div>
            {/* IMAGE */}
            <div className="full-width">
              <label>Upload Patient Image</label>
              <input
                type="file"
                name="patientImg"
                accept="image/*"
                onChange={handleImageChange}
              />{" "}
              <button
                type="button"
                onClick={cameraOpen ? stopCamera : openCamera}
                style={{
                  marginLeft: 12,
                  marginTop: 10,
                  padding: "8px 12px",
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
                    padding: "8px 12px",
                    fontSize: 14,
                    marginLeft: 6,
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
                    style={{
                      display: "block",
                      maxWidth: "100%",
                      width: 320,
                      background: "#222",
                    }}
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
                  style={{ display: "block", color: "#b42318" }}
                >
                  {cameraError}
                </small>
              )}
              <span className="reminder">
                {" "}
                Take a photo or upload an image (2MB max){" "}
              </span>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        {/* ADDRESS */}
        <div className="section">
          <div className="section-title">
            <span>
              <FaMapMarkerAlt />
            </span>

            <h4>Address</h4>

            <div className="line"></div>
          </div>

          <div className="grid-2">
            {/* ADDRESS */}

            <div>
              <label>Address</label>

              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Enter Address"
              />
            </div>

            {/* CITY */}

            <div>
              <label>City</label>

              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Enter City"
              />
            </div>
          </div>
        </div>
        {/* ADDITIONAL INFORMATION */}
        <div className="section">
          <div className="section-title">
            <span>
              <FaInfoCircle />
            </span>

            <h4>Additional Information</h4>

            <div className="line"></div>
          </div>

          <div className="grid-2">
            {/* COMPLAINT */}

            <div>
              <label>Complaint</label>

              <input
                type="text"
                name="complaint"
                value={formData.complaint}
                onChange={handleChange}
                placeholder="Enter Complaint"
              />
            </div>

            {/* CIVIL STATUS */}

            <div>
              <label>Civil Status</label>

              <select
                name="civilStatus"
                value={formData.civilStatus}
                onChange={handleChange}
              >
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
                <option value="Divorced">Divorced</option>
                <option value="Annulled">Annulled</option>
              </select>
            </div>
          </div>
        </div>
        {/* BUTTONS */}
        <div className="footer-save-canc">
          <button className="cancel" type="button">
            Cancel
          </button>

          <button className="save" type="button" onClick={handleSubmit}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
export default AddPatient;
