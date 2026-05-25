// ============================================
// 📁 BACKEND/src/dtos/Add-user.dto.ts
// CÓDIGO COMPLETO
// ============================================

import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";

export class AddUserDto {
  @IsNotEmpty({ message: "Nombre(s) obligatorio" })
  @IsString({ message: "Nombre(s) debe ser un String" })
  nombres!: string;

  @IsNotEmpty({ message: "Apellido(s) obligatorio" })
  @IsString({ message: "Apellido(s) debe ser un string" })
  apellidos!: string;

  @IsNotEmpty({ message: "Correo electrónico es obligatorio" })
  @IsEmail({}, { message: "Ingrese un correo electrónico válido" })
  email!: string;

  @ValidateIf((o) => !o.login_method || o.login_method === 'email')
  @IsNotEmpty({ message: "La contraseña es obligatoria" })
  @IsString({ message: "La contraseña debe ser un string" })
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  contrasena!: string;

  @ValidateIf((o) => o.contrasena !== undefined)
  @IsString()
  confirmar_nueva_contrasena!: string;

  @IsOptional()
  @IsString()
  firebase_uid?: string;

  @IsOptional()
  @IsEnum(["email", "google"])
  login_method?: "email" | "google";

  @IsOptional()
  @IsString()
  foto_perfil?: string;
}