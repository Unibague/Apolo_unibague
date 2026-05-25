import axios from "axios";
import { getAuthToken, clearAuthToken } from "./authToken";

const EXAMS_BASE = import.meta.env.VITE_EXAMS_BASE;

export const examsApi = axios.create({
  baseURL: EXAMS_BASE ? `${EXAMS_BASE}/api/exams` : "/api/exams",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30000,
});

examsApi.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      config.headers["Content-Type"] = "multipart/form-data";
    }
    const token = getAuthToken();
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

examsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      clearAuthToken();
      localStorage.removeItem("usuario");
      const path = window.location.pathname;
      if (!path.includes("/login") && !path.includes("/register")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
