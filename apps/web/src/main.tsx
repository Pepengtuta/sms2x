import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import LoginPage from "./pages/LoginPage";
import OverviewPage from "./pages/OverviewPage";
import SendSmsPage from "./pages/SendSmsPage";
import OtpPage from "./pages/OtpPage";
import MessagesPage from "./pages/MessagesPage";
import MessageDetailPage from "./pages/MessageDetailPage";
import DevicesPage from "./pages/DevicesPage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import HealthPage from "./pages/HealthPage";
import DocsPage from "./pages/DocsPage";
import Layout from "./components/Layout";

function RequireAuth({ children }: { children: React.ReactNode }) {
  return localStorage.getItem("jwt") || localStorage.getItem("refreshToken") ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" replace />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="send" element={<SendSmsPage />} />
          <Route path="otp" element={<OtpPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:id" element={<MessageDetailPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="devices/:id" element={<DeviceDetailPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="docs" element={<DocsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

