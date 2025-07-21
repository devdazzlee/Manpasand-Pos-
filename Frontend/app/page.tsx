"use client";

import { useState, useEffect } from "react";
import { LoginForm } from "@/components/login-form";
import { Dashboard } from "@/components/dashboard";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
    setChecking(false);
  }, []);

  const handleLogin = (
    jwt: string,
    _branch: string, // you can ignore/remove this param
    user: { email: string; role: string; branch_id: string | null }
  ) => {
    console.log(jwt, _branch, user);
    localStorage.setItem("token", jwt);
    localStorage.setItem("branch", user.branch_id ?? "Not Found");
    localStorage.setItem("role", user.role);
    setToken(jwt);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setToken(null);
  };
  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner className="w-12 h-12" />
      </div>
    );
  }
  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <Dashboard onLogout={handleLogout} />;
}
