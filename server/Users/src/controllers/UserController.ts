// ============================================
// 📁 BACKEND/src/controllers/UserController.ts
// CÓDIGO COMPLETO CON GESTIÓN DE ESTADO ACTIVO
// ============================================


import { AuthenticatedRequest } from "../middlewares/auth";
import { UserService } from "../services/UserService";
import { throwHttpError } from "../utils/errors";
import { NextFunction, Request, Response } from "express";

const user_service = new UserService();

export class UserController {
  static async AddUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const usuario_nuevo = await user_service.AddUser(req.body);

      return res.status(201).json(usuario_nuevo);
    } catch (error) {
      next(error);
    }
  }

  static async deleteUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const cookies = req.headers.cookie;
      const id = Number(req.params.id);

      if (isNaN(id)) {
        throwHttpError("ID inválido", 400);
      }

      const result = await user_service.deleteUser(id, cookies);

      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async editUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        throwHttpError("ID inválido", 400);
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        throwHttpError("Debe enviar al menos un campo para actualizar", 400);
      }

      const usuario = await user_service.editUser(req.body, id);

      return res.status(200).json(usuario);
    } catch (error) {
      next(error);
    }
  }

  static async getUserById(req: AuthenticatedRequest, res: Response) {
    try {
      const id = Number(req.params.id);

      const usuario = await user_service.getUserById(id);

      return res.status(200).json(usuario);
    } catch (error: any) {
      if (error.message.includes("No se encontró")) {
        return res.status(404).json({
          message: "No se encontró al usuario con el id especificado",
        });
      }

      return res
        .status(400)
        .json({ message: "Ocurrió un error inesperado: " + error.message });
    }
  }

  static async login(req: AuthenticatedRequest, res: Response) {
    try {
      const data = req.body;
      const { message, token, usuario } = await user_service.login(
        data.email,
        data.contrasena,
      );

      console.log("🍪 Intentando setear cookie...");
      console.log("   Token generado:", token ? "SÍ" : "NO");

      res.cookie("token", token, {
        httpOnly: true,
        expires: new Date(Date.now() + 6 * 60 * 60 * 1000),
        secure: process.env.NODE_ENV === "production", // true en prod
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        maxAge: 6 * 60 * 60 * 1000,
        priority: "high",
      });

      console.log("✅ Cookie seteada");

      // ✅ NUEVO: Marcar usuario como activo
      await user_service.setUserActive(usuario.id, true);
      console.log("✅ Usuario marcado como activo");

      return res.status(200).json({
        message,
        usuario,
        token,
      });
    } catch (error: any) {
      console.error("❌ Error en login:", error.message);
      return res.status(400).json({ message: error.message });
    }
  }

  static async loginWithGoogle(req: AuthenticatedRequest, res: Response) {
    try {
      const { googleAccessToken } = req.body;

      if (!googleAccessToken) {
        return res.status(400).json({ message: "Token de Google requerido" });
      }

      const { message, token, usuario } = await user_service.loginWithGoogleToken(googleAccessToken);

      res.cookie("token", token, {
        httpOnly: true,
        expires: new Date(Date.now() + 6 * 60 * 60 * 1000),
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        maxAge: 6 * 60 * 60 * 1000,
        priority: "high",
      });

      await user_service.setUserActive(usuario.id, true);

      return res.status(200).json({
        message,
        usuario,
        token,
      });
    } catch (error: any) {
      console.error("Error en login con Google:", error.message);
      return res.status(400).json({ message: error.message });
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response) {
    try {
      // Obtener userId del body
      const userId = req.body.userId;

      if (userId) {
        // ✅ Marcar usuario como inactivo
        await user_service.setUserActive(userId, false);
        console.log("✅ Usuario marcado como inactivo");
      }

      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      });

      return res.status(200).json({ message: "Logout exitoso" });
    } catch (error: any) {
      console.error("❌ Error en logout:", error);
      return res.status(500).json({ message: "Error al cerrar sesión" });
    }
  }

  // ============================================
  // ✅ NUEVO: HEARTBEAT
  // ============================================

  static async heartbeat(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const userId = req.body.userId;

      if (!userId) {
        return res.status(400).json({ message: "userId requerido" });
      }

      // Actualizar último acceso y mantener activo
      await user_service.setUserActive(userId, true);

      return res.status(200).json({
        message: "Heartbeat recibido",
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // ✅ NUEVO: OBTENER USUARIOS ACTIVOS
  // ============================================

  static async getActiveUsers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const usuarios = await user_service.getActiveUsers();
      return res.status(200).json(usuarios);
    } catch (error) {
      next(error);
    }
  }

  static async getUserByEmail(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { email } = req.params;
      const usuario = await user_service.getUserByEmail(email);

      const { contrasena, ...usuarioSinPassword } = usuario;

      return res.status(200).json(usuarioSinPassword);
    } catch (error) {
      next(error);
    }
  }

  static async getUserByFirebaseUid(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { firebaseUid } = req.params;
      const usuario = await user_service.getUserByFirebaseUid(firebaseUid);

      const { contrasena, ...usuarioSinPassword } = usuario;

      return res.status(200).json(usuarioSinPassword);
    } catch (error) {
      next(error);
    }
  }

  static async findOrCreateUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const usuario = await user_service.findOrCreateUser(req.body);

      const { contrasena, ...usuarioSinPassword } = usuario;

      return res.status(200).json(usuarioSinPassword);
    } catch (error) {
      next(error);
    }
  }

  static async updateLastAccess(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const id = Number(req.params.id);

      if (isNaN(id)) {
        throwHttpError("ID inválido", 400);
      }

      await user_service.updateLastAccessById(id);

      return res.status(200).json({
        message: "Último acceso actualizado correctamente",
      });
    } catch (error) {
      next(error);
    }
  }
}
