import { API_BASE } from "@/config/constants";
import axios, { AxiosResponse, InternalAxiosRequestConfig, AxiosError } from "axios";

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get token from localStorage
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors and auto-refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 unauthorized errors
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // If we're already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Check if we have saved credentials
        const savedUsername = localStorage.getItem("savedUsername");
        const savedPassword = localStorage.getItem("savedPassword");
        const rememberPassword = localStorage.getItem("rememberPassword") === "true";

        if (savedUsername && savedPassword && rememberPassword) {
          console.log("🔄 Token expired. Attempting automatic re-authentication...");

          // Attempt to re-login with saved credentials
          const loginResponse = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: savedUsername,
              password: savedPassword,
            }),
          });

          if (loginResponse.ok) {
            const loginData = await loginResponse.json();
            const newToken = loginData.data?.token;

            if (newToken) {
              // Update token in localStorage
              localStorage.setItem("token", newToken);

              // Update branch and role if available
              if (loginData.data?.branch) {
                localStorage.setItem("branch", loginData.data.branch);
              }
              if (loginData.data?.user?.role) {
                localStorage.setItem("role", loginData.data.user.role);
              }

              console.log("✅ Token refreshed successfully");

              // Process queued requests
              processQueue(null, newToken);

              // Retry the original request with new token
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              isRefreshing = false;
              return apiClient(originalRequest);
            }
          } else {
            const errorData = await loginResponse.json().catch(() => ({}));
            console.error("❌ Auto re-login failed:", errorData.message || "Invalid credentials");
            throw new Error(errorData.message || "Auto re-login failed");
          }
        } else {
          console.warn("⚠️ No saved credentials found. User needs to login manually.");
          throw new Error("No saved credentials for auto re-login");
        }
      } catch (refreshError: any) {
        console.error("❌ Token refresh failed:", refreshError.message);
        processQueue(refreshError, null);

        // Clear token and redirect to login
        localStorage.removeItem("token");
        localStorage.removeItem("branch");
        localStorage.removeItem("role");

        // Trigger page reload to show login form
        if (typeof window !== "undefined") {
          window.location.reload();
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
