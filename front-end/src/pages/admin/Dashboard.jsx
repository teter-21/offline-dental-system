import React, { useEffect, useState } from "react";
import "../../css/Dashboard.css";

import api from "../../api";
import { useAutoRefresh } from "../../utils/useAutoRefresh";

import MonthlyGraph from "../../components/MonthlyGraph";
import TreatmentCalendar from "../../components/TreatmentCalendar";
import PatientManagement from "../../components/PatientTable";

import {
  FaUsers,
  FaTooth,
  FaClock,
  FaMoneyBillWave,
  FaArrowRight,
} from "react-icons/fa";

import { Link } from "react-router-dom";

function Dashboard() {
  const [stats, setStats] = useState({
    totalPatients: 0,

    monthTreatments: 0,

    todayTreatments: 0,

    totalRevenue: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await api.get("/dashboard-summary");

      setStats(res.data);
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  useAutoRefresh(loadDashboard);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(Number(value || 0));
  };

  return (
    <div className="dashboard">
      {/* PAGE HEADER */}

      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>

          <p>Welcome back, Here's what's happening at your clinic today.</p>
        </div>
      </div>

      {/* STATISTICS */}

      <div className="stats-container">
        {/* TOTAL PATIENTS */}

        <div className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <div className="dashboard-stat-icon blue">
              <FaUsers />
            </div>

            <span className="stat-label">Patients</span>
          </div>

          <h2>{loading ? "..." : stats.totalPatients}</h2>

          <p>Total registered patients</p>
        </div>

        {/* TREATMENTS THIS MONTH */}

        <div className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <div className="dashboard-stat-icon orange">
              <FaClock />
            </div>

            <span className="stat-label">This Month</span>
          </div>

          <h2>{loading ? "..." : stats.monthTreatments}</h2>

          <p>Recorded treatment visits this month</p>
        </div>

        {/* TODAY'S TREATMENTS */}

        <div className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <div className="dashboard-stat-icon green">
              <FaTooth />
            </div>

            <span className="stat-label">Today</span>
          </div>

          <h2>{loading ? "..." : stats.todayTreatments}</h2>

          <p>Treatment visits recorded today</p>
        </div>

        {/* REVENUE */}

        <div className="dashboard-stat-card">
          <div className="dashboard-stat-top">
            <div className="dashboard-stat-icon purple">
              <FaMoneyBillWave />
            </div>

            <span className="stat-label">Revenue</span>
          </div>

          <h2>{loading ? "..." : formatCurrency(stats.totalRevenue)}</h2>

          <p>Total recorded payments</p>
        </div>
      </div>

      {/* ANALYTICS */}

      <div className="dashboard-grid">
        <MonthlyGraph />

        <TreatmentCalendar />
      </div>

      {/* PATIENT TABLE */}

      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <div>
            <h2>Recent Patients</h2>

            <p>Recently registered patient records</p>
          </div>

          <Link to="/PatientMngmt" className="section-link">
            View All
            <FaArrowRight />
          </Link>
        </div>

        <PatientManagement />
      </div>
    </div>
  );
}

export default Dashboard;
