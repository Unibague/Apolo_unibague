.PHONY: help build up down restart logs ps shell-postgres shell-exams shell-users shell-attempts \
        backup restore frontend-build deploy update clean

# Default — muestra ayuda
help:
	@echo "WebExams — comandos disponibles:"
	@echo ""
	@echo "  Build & ejecución:"
	@echo "    make build           Construye las imágenes Docker (sin levantar)"
	@echo "    make up              Levanta todo el stack (postgres + 3 servicios + nginx)"
	@echo "    make down            Detiene y elimina los containers (NO borra volúmenes)"
	@echo "    make restart         Reinicia todos los containers"
	@echo "    make ps              Lista containers corriendo"
	@echo ""
	@echo "  Logs:"
	@echo "    make logs            Logs en tiempo real de TODO"
	@echo "    make logs-exams      Logs solo del servicio Exams"
	@echo "    make logs-users      Logs solo del servicio Users"
	@echo "    make logs-attempts   Logs solo del servicio ExamsAttempts"
	@echo "    make logs-postgres   Logs solo de Postgres"
	@echo ""
	@echo "  Frontend:"
	@echo "    make frontend-build  Compila el cliente Vite (genera client/dist/)"
	@echo ""
	@echo "  Deploy:"
	@echo "    make deploy          Build + frontend + up (deploy completo)"
	@echo "    make update          Pull + rebuild + restart (actualizar versión)"
	@echo ""
	@echo "  Acceso a containers:"
	@echo "    make shell-postgres  Abre cliente psql dentro del container"
	@echo "    make shell-exams     Abre shell en el container exams"
	@echo "    make shell-users     Abre shell en el container users"
	@echo "    make shell-attempts  Abre shell en el container attempts"
	@echo ""
	@echo "  Backup:"
	@echo "    make backup          Backup completo (BDs + uploads) a backups/"
	@echo "    make restore FILE=backups/db-2026-04-30.sql.gz   Restaura las BDs"
	@echo ""
	@echo "  Limpieza:"
	@echo "    make clean           Borra containers, volúmenes Y datos (¡destructivo!)"

# ── Build ──
build:
	docker compose build

# ── Levantar ──
up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

ps:
	docker compose ps

# ── Logs ──
logs:
	docker compose logs -f --tail=200

logs-exams:
	docker compose logs -f --tail=200 apolo-exams

logs-users:
	docker compose logs -f --tail=200 apolo-users

logs-attempts:
	docker compose logs -f --tail=200 apolo-attempts

logs-postgres:
	docker compose logs -f --tail=200 apolo-postgres

# ── Frontend (se construye en el host, dist/ se monta como volumen en nginx) ──
frontend-build:
	npm install --prefix client
	npm run build --prefix client

# ── Deploy completo ──
deploy: frontend-build build up
	@echo ""
	@echo "✅ Deploy listo. La app debería estar disponible en http://localhost"
	@echo "   Logs: make logs"

# ── Actualizar (después de un git pull) ──
update:
	git pull
	$(MAKE) frontend-build
	docker compose build
	docker compose up -d
	@echo "✅ Actualización completada"

# ── Shells ──
shell-postgres:
	docker compose exec apolo-postgres psql -U $$(grep -m1 '^DB_USER=' .env | cut -d= -f2)

shell-exams:
	docker compose exec apolo-exams sh

shell-users:
	docker compose exec apolo-users sh

shell-attempts:
	docker compose exec apolo-attempts sh

# ── Backup ──
backup:
	@mkdir -p backups
	@echo "📦 Respaldando bases de datos..."
	@docker compose exec -T apolo-postgres pg_dumpall -U $$(grep -m1 '^DB_USER=' .env | cut -d= -f2) \
		| gzip > backups/db-$$(date +%Y-%m-%d_%H%M).sql.gz
	@echo "📦 Respaldando uploads..."
	@docker compose exec -T apolo-exams tar czf - -C /app/uploads . \
		> backups/uploads-$$(date +%Y-%m-%d_%H%M).tar.gz
	@echo "✅ Backup creado en backups/"
	@ls -lh backups/ | tail -5

# ── Restore (usa: make restore FILE=backups/db-XXX.sql.gz) ──
restore:
	@if [ -z "$(FILE)" ]; then echo "❌ Uso: make restore FILE=backups/db-XXX.sql.gz"; exit 1; fi
	@echo "⚠️  Restaurando $(FILE) — esto sobrescribe las BDs actuales."
	@read -p "¿Continuar? (y/N) " ok && [ "$$ok" = "y" ]
	gunzip -c $(FILE) | docker compose exec -T apolo-postgres psql -U $$(grep -m1 '^DB_USER=' .env | cut -d= -f2)
	@echo "✅ Restore completado"

# ── Limpieza destructiva (borra TODO, incluida la BD) ──
clean:
	@echo "⚠️  Esto borra containers, imágenes Y volúmenes (todos los datos)."
	@read -p "¿Estás SEGURO? (escribe SI) " ok && [ "$$ok" = "SI" ] || exit 1
	docker compose down -v --rmi local
	@echo "✅ Todo limpio"
