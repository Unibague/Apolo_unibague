import axios from "axios";
import { clearAuthToken } from "./authToken";

const USERS_BASE = import.meta.env.VITE_USERS_BASE
  ? `${import.meta.env.VITE_USERS_BASE}/api/users`
  : "/api/users";

export const usersApi = axios.create({
  baseURL: USERS_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 10000,
});

const ATTEMPTS_BASE = import.meta.env.VITE_ATTEMPTS_BASE;

export const examsAttemptsApi = axios.create({
  baseURL: ATTEMPTS_BASE ? `${ATTEMPTS_BASE}/api/exam` : "/api/exam",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 10000,
});

function handleUnauthorized() {
  clearAuthToken();
  localStorage.removeItem("usuario");
  const path = window.location.pathname;
  if (!path.includes("/login") && !path.includes("/register")) {
    window.location.href = "/login";
  }
}

[usersApi, examsAttemptsApi].forEach((api) => {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 || error.response?.status === 403) {
        handleUnauthorized();
      }
      return Promise.reject(error);
    },
  );
});
