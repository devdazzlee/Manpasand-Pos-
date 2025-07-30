import { API_BASE } from "@/config/constants";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

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

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    // Handle 401 unauthorized errors
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem("token");

      // Redirect to login or trigger logout
      window.location.href = "/";
    }

    return Promise.reject(error);
  }
);

export default apiClient;
