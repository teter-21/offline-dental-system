import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaClock, FaTooth } from "react-icons/fa";
import api from "../api";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import "../css/Dashboard.css";

const toDateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")].join("-");

function calendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const offset = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, index) => new Date(year, month, index - offset + 1));
}

function formatLongDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
  });
}
function formatTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})/);
  if (!match) return "—";
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}
const pesos = (value) => Number(value || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function TreatmentCalendar() {
  const today = new Date();
  const todayKey = toDateKey(today);
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const lastRequest = useRef(0);

  const loadTreatments = useCallback(async ({ background = false } = {}) => {
    const request = ++lastRequest.current;
    if (!background) setLoading(true);
    try {
      const start_date = toDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
      const end_date = toDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0));
      const response = await api.get("/treatments/calendar", { params: { start_date, end_date } });
      if (lastRequest.current !== request) return;
      setVisits(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (err) {
      if (lastRequest.current !== request) return;
      setError(err.response?.data?.message || "Unable to load treatment records.");
      if (!background) setVisits([]);
    } finally {
      if (lastRequest.current === request) setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    void loadTreatments();
    return () => { lastRequest.current += 1; };
  }, [loadTreatments]);
  useAutoRefresh(loadTreatments);

  const visitsByDay = useMemo(() => {
    const result = new Map();
    visits.forEach((visit) => {
      const day = String(visit.visit_date || "").slice(0, 10);
      if (!result.has(day)) result.set(day, []);
      result.get(day).push(visit);
    });
    return result;
  }, [visits]);

  const changeMonth = (delta) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    setSelectedDate(toDateKey(next));
    setCurrentMonth(next);
  };
  const goToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  };

  const dayVisits = visitsByDay.get(selectedDate) || [];
  const uniquePatients = new Set(dayVisits.map((visit) => visit.patient_id)).size;

  return (
    <div className="appointment-calendar-card treatment-calendar-card">
      <div className="appointment-calendar-header">
        <div><h3>Treatment Calendar</h3>
          <p className="sub-text">{visits.length} recorded treatment visit{visits.length === 1 ? "" : "s"} this month</p>
        </div>
      </div>
      <div className="calendar-toolbar">
        <div className="calendar-month-navigation">
          <button type="button" className="calendar-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month"><FaChevronLeft /></button>
          <strong>{currentMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</strong>
          <button type="button" className="calendar-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month"><FaChevronRight /></button>
        </div>
        <button type="button" className="calendar-today-btn" onClick={goToday}>Today</button>
      </div>
      <div className="calendar-content">
        <div className="calendar-grid-wrapper">
          <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {calendarDays(currentMonth).map((day) => {
              const dateKey = toDateKey(day);
              const count = visitsByDay.get(dateKey)?.length || 0;
              const sameMonth = day.getMonth() === currentMonth.getMonth();
              return (
                <button key={dateKey} type="button" disabled={!sameMonth}
                  className={["calendar-day", !sameMonth && "outside-month", dateKey === todayKey && "today",
                    dateKey === selectedDate && "selected", count > 0 && "has-treatments"].filter(Boolean).join(" ")}
                  onClick={() => setSelectedDate(dateKey)}
                  aria-label={`${formatLongDate(dateKey)}, ${count} treatment visit${count === 1 ? "" : "s"}`}>
                  <span className="calendar-day-number">{day.getDate()}</span>
                  {count > 0 && <><span className="calendar-day-count">{count}</span>
                    <span className="calendar-status-dots"><span className="calendar-status-dot treatment" title="Recorded treatment" /></span></>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="calendar-details" aria-live="polite">
          <div className="calendar-details-header">
            <div><span>Recorded treatments for</span><h4>{formatLongDate(selectedDate)}</h4></div>
            <strong title="Number of visits">{dayVisits.length}</strong>
          </div>
          {loading ? <div className="calendar-empty">Loading treatments...</div> :
            error ? <div className="calendar-empty" role="alert">{error}</div> :
              dayVisits.length === 0 ? <div className="calendar-empty"><FaCalendarAlt /><p>No treatments recorded on this date.</p></div> :
                <div className="calendar-appointments treatment-day-visits">
                  <p className="treatment-patient-count">{uniquePatients} patient{uniquePatients === 1 ? "" : "s"} treated</p>
                  {dayVisits.map((visit) => (
                    <div className="calendar-appointment treatment-day-visit" key={visit.id}>
                      <div className="calendar-appointment-time"><FaClock /> {formatTime(visit.visit_time)}</div>
                      <div className="calendar-appointment-info">
                        <strong>{visit.patient_name} (P{String(visit.patient_id).padStart(3, "0")})</strong>
                        <span className="treatment-procedure"><FaTooth /> {visit.procedure_name}</span>
                        {visit.complain && <span>Complaint: {visit.complain}</span>}
                        {visit.description && <span>Notes: {visit.description}</span>}
                        <span>Paid: ₱{pesos(visit.amount_paid)} · Balance: ₱{pesos(visit.balance)}</span>
                      </div>
                    </div>
                  ))}
                </div>}
        </div>
      </div>
      <div className="calendar-legend"><span><i className="calendar-status-dot treatment" /> Date with recorded treatments</span></div>
    </div>
  );
}
export default TreatmentCalendar;
