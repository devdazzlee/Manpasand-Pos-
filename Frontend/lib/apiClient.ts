import { API_BASE } from "@/config/constants";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes – large base64 image payloads need more time
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
      // Previously we auto-logged the user out here.
      // As per requirements, do NOT force logout automatically.
      // Just log the issue so the user can choose when to log out.
      console.warn("API returned 401 (unauthorized). Please check login/token.", error.response?.data);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
