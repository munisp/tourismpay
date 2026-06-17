/**
 * GDS Platform — Standalone App Entry
 * Runs independently from TourismPay on its own port (4000).
 */
import { useState } from "react";
import GDSDashboard from "./pages/GDSDashboard";
import { useAuth } from "./hooks/useAuth";

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  // Dev mode: auto-login as admin
  const devLogin = () => {
    localStorage.setItem("gds_token", "dev-token");
    localStorage.setItem("gds_user", JSON.stringify({
      id: "dev_admin",
      email: "admin@gds.tourismpay.com",
      name: "GDS Admin",
      role: "gds_admin",
    }));
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Africa GDS Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Global Distribution System — Standalone</p>
          <p className="text-xs text-gray-400 mt-1">Integrated with TourismPay via API</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="agent@agency.com"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={devLogin}
              className="w-full bg-gray-100 text-gray-700 rounded-lg py-2 text-xs font-medium hover:bg-gray-200"
            >
              Dev Mode: Login as GDS Admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-indigo-700">Africa GDS</h1>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Standalone</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.name}</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{user?.role}</span>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-700">Logout</button>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <GDSDashboard />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-6 py-3 text-center text-xs text-gray-400">
        GDS Platform v1.0 — Integrated with TourismPay via REST API (Port 4000)
      </footer>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}
