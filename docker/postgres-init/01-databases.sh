#!/bin/bash
# Se ejecuta SOLO la primera vez que el container arranca con un volumen vacío
# (mecanismo estándar de /docker-entrypoint-initdb.d de la imagen postgres).
#
# POSTGRES_DB (= USERS_DB_NAME) ya la crea la propia imagen automáticamente.
# Aquí creamos las otras 2 BDs que usan Exams y ExamsAttempts. POSTGRES_USER
# actúa como superusuario de la instancia, así que no hace falta GRANT extra.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE "$EXAMS_DB_NAME";
    CREATE DATABASE "$ATTEMPTS_DB_NAME";
EOSQL
