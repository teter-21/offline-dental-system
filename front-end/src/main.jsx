import "./App.css";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import MainLayout from "./layout/MainLayout.jsx";
import AuthLayout from "./layout/AuthLayout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import "./utils/electronDialogFocus.js";

const Login = lazy(() => import("./pages/auth/Login.jsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const Patients = lazy(() => import("./pages/admin/PatientMngmt.jsx"));
const AddPatient = lazy(() => import("./pages/admin/AddPatient.jsx"));

const Queue = lazy(() => import("./pages/admin/QueueMngmt.jsx"));
const Billing = lazy(() => import("./pages/admin/Payment.jsx"));
const Reports = lazy(() => import("./pages/admin/Report.jsx"));
const Settings = lazy(() => import("./pages/admin/Settings.jsx"));

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  {
    element: <AuthLayout />,
    children: [{ path: "/login", element: <Login /> }],
  },
  {
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: "/Dashboard", element: <Dashboard /> },
      { path: "/PatientMngmt", element: <Patients /> },
      { path: "/AddPatient", element: <AddPatient /> },
      { path: "/Queue", element: <Queue /> },
      { path: "/Payment", element: <Billing /> },
      { path: "/Report", element: <Reports /> },
      { path: "/Settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense
      fallback={
        <div role="status" style={{ padding: "2rem" }}>
          Loading page…
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
