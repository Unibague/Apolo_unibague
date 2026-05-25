import { usersApi } from "./api";
import { setAuthToken } from "./authToken";

// ============================================
// TIPOS
// ============================================

export interface CreateUserPayload {
  nombres: string;
  apellidos: string;
  email: string;
  contrasena: string;
  confirmar_nueva_contrasena: string;
  login_method: "email" | "google";
  foto_perfil?: string;
}

export interface BackendUser {
  id: number;
  nombres: string;
  apellidos: string;
  email: string;
  login_method: "email" | "google";
  foto_perfil?: string;
}

export interface LocalUser {
  id: number;
  username: string;
  nombre: string;
  apellido: string;
  email: string;
  loginMethod: "email" | "google";
  picture: string;
  backendId: number;
}

// ============================================
// SERVICIO DE BACKEND (API)
// ============================================

export const usersService = {
  createUser: async (payload: CreateUserPayload): Promise<BackendUser> => {
    try {
      const response = await usersApi.post("/", payload);
      return response.data;
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Error al crear el usuario";
      throw new Error(msg);
    }
  },

  loginUser: async (
    email: string,
    password: string,
  ): Promise<{ usuario: BackendUser; token: string }> => {
    try {
      const response = await usersApi.post("/login", {
        email,
        contrasena: password,
      });
      if (response.data.token) setAuthToken(response.data.token);
      return { usuario: response.data.usuario, token: response.data.token };
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Error al iniciar sesión";
      throw new Error(msg);
    }
  },

  loginWithGoogleToken: async (
    googleAccessToken: string,
  ): Promise<{ usuario: BackendUser; token: string }> => {
    try {
      const response = await usersApi.post("/login-google", {
        googleAccessToken,
      });
      if (response.data.token) setAuthToken(response.data.token);
      return { usuario: response.data.usuario, token: response.data.token };
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Error al iniciar sesión con Google";
      throw new Error(msg);
    }
  },

  updateLastAccess: async (userId: number): Promise<void> => {
    try {
      await usersApi.patch(`/${userId}/update-access`);
    } catch {
      // no crítico
    }
  },

  getUserByEmail: async (email: string): Promise<BackendUser> => {
    try {
      const response = await usersApi.get(`/email/${email}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) throw new Error("Usuario no encontrado");
      throw new Error(error.response?.data?.message || error.message || "Error al buscar usuario");
    }
  },
};

// ============================================
// SERVICIO DE AUTENTICACIÓN
// ============================================

function toLocalUser(backendUser: BackendUser, email: string, method: "email" | "google", picture = ""): LocalUser {
  return {
    id: backendUser.id,
    backendId: backendUser.id,
    username: email,
    nombre: backendUser.nombres,
    apellido: backendUser.apellidos,
    email,
    loginMethod: method,
    picture: backendUser.foto_perfil || picture,
  };
}

export const authService = {
  registerWithEmail: async (
    nombre: string,
    apellido: string,
    email: string,
    password: string,
  ): Promise<LocalUser> => {
    const backendUser = await usersService.createUser({
      nombres: nombre,
      apellidos: apellido,
      email,
      contrasena: password,
      confirmar_nueva_contrasena: password,
      login_method: "email",
    });

    await usersService.loginUser(email, password);

    const localUser = toLocalUser(backendUser, email, "email");
    localStorage.setItem("usuario", JSON.stringify(localUser));
    return localUser;
  },

  loginWithEmail: async (email: string, password: string): Promise<LocalUser> => {
    const { usuario } = await usersService.loginUser(email, password);
    const localUser = toLocalUser(usuario, email, "email");
    localStorage.setItem("usuario", JSON.stringify(localUser));
    return localUser;
  },

  loginWithGoogle: async (googleAccessToken: string): Promise<LocalUser> => {
    const { usuario } = await usersService.loginWithGoogleToken(googleAccessToken);
    const localUser = toLocalUser(usuario, usuario.email, "google");
    localStorage.setItem("usuario", JSON.stringify(localUser));
    return localUser;
  },

  getCurrentUser: (): LocalUser | null => {
    try {
      const str = localStorage.getItem("usuario");
      return str ? (JSON.parse(str) as LocalUser) : null;
    } catch {
      return null;
    }
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem("usuario");
  },
};
