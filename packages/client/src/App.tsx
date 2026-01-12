import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import ManagerDashboard from "./pages/ManagerDashboard";
import SwarmDetail from "./pages/SwarmDetail";
import SwarmDiscovery from "./pages/SwarmDiscovery";
import MySwarms from "./pages/MySwarms";
import MembershipDetail from "./pages/MembershipDetail";
import Settings from "./pages/Settings";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="manager"
          element={
            <ProtectedRoute>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="manager/swarms/:id"
          element={
            <ProtectedRoute>
              <SwarmDetail />
            </ProtectedRoute>
          }
        />
        <Route path="swarms" element={<SwarmDiscovery />} />
        <Route
          path="my-swarms"
          element={
            <ProtectedRoute>
              <MySwarms />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-swarms/:id"
          element={
            <ProtectedRoute>
              <MembershipDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
