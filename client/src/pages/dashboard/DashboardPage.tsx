// ============================================
// LMSDashboard.tsx - VERSIÓN CORREGIDA
// Sin botones anidados + Sin scroll lateral en vigilancia
// ============================================

// Importar componentes reutilizables
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { io, Socket } from "socket.io-client";
import NotificationItem from "../../components/NotificationItem";
import logoUniversidad from "../../../assets/logo-universidad.webp";
import logoUniversidadNoche from "../../../assets/logo-universidad-noche.webp";
import fondoImagen from "../../../assets/fondo.webp";

const ListaExamenes = lazy(() => import("./ExamListView"));
const MiPerfil = lazy(() => import("./ProfileView"));
const CrearExamen = lazy(() => import("./CreateExamView"));
const HomeContent = lazy(() => import("./HomeView"));
const VerExamen = lazy(() => import("./ExamDetailView"));
const VigilanciaExamenesLista = lazy(() => import("./ExamMonitorView"));
import ConfirmModal from "../../components/ConfirmModal";
import { usersService } from "../../services/authService";
import { usersApi } from "../../services/api";
import { getAuthToken, clearAuthToken } from "../../services/authToken";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import AnimatedPage from "../../components/AnimatedPage";
import {
  Home,
  Bell,
  FileEdit,
  List,
  Monitor,
  ChevronDown,
  User,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [tokenListo, setTokenListo] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [modal, setModal] = useState<{ visible: boolean; tipo: "exito" | "error" | "advertencia" | "info" | "confirmar"; titulo: string; mensaje: string; onConfirmar: () => void }>({ visible: false, tipo: "info", titulo: "", mensaje: "", onConfirmar: () => {} });
  const mostrarModal = (tipo: "exito" | "error" | "advertencia" | "info" | "confirmar", titulo: string, mensaje: string, onConfirmar: () => void) => setModal({ visible: true, tipo, titulo, mensaje, onConfirmar });
  const cerrarModal = () => setModal(prev => ({ ...prev, visible: false }));

  // Estado para notificaciones
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const unreadCount = notificaciones.filter((n) => !n.read).length;

  // Estado para el modo oscuro - lee desde localStorage al iniciar
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  // Guardar preferencia de modo oscuro y aplicar clase al <html>
  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // ============================================
  // OBTENER DATOS DEL USUARIO - CON REACTIVIDAD
  // ============================================

  const [usuarioData, setUsuarioData] = useState(() => {
    const usuarioStorage = localStorage.getItem("usuario");
    return usuarioStorage ? JSON.parse(usuarioStorage) : null;
  });

  // ============================================
  // VERIFICAR SESIÓN AL CARGAR Y PERIÓDICAMENTE
  // ============================================
  useEffect(() => {
    const verificarSesion = async () => {
      try {
        const usuarioStorage = localStorage.getItem("usuario");

        if (!usuarioStorage) {
          window.location.href = "/login";
          return;
        }

        const usuario = JSON.parse(usuarioStorage);

        if (!usuario.id) {
          localStorage.removeItem("usuario");
          window.location.href = "/login";
          return;
        }

        // Verificar expiración del token localmente antes de llamar al backend
        const token = getAuthToken();
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
              clearAuthToken();
              localStorage.removeItem("usuario");
              window.location.href = "/login";
              return;
            }
          } catch {
            // Si el token no es un JWT válido, dejarlo pasar — el backend lo rechazará
          }
        } else {
          // No hay token — redirigir a login
          localStorage.removeItem("usuario");
          window.location.href = "/login";
          return;
        }

        setTokenListo(true);

        // Verificar con el backend si la sesión es válida
        await usersApi.get(`/${usuario.id}`);

      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          // El interceptor ya maneja esto, pero por si acaso
          console.error("❌ Sesión inválida:", error);
          localStorage.removeItem("usuario");
          window.location.href = "/login";
        } else {
          // Error de red o del servidor — no cerrar sesión, se reintentará
          console.warn("⚠️ Error de red al verificar sesión (se reintentará):", error?.message);
        }
      }
    };

    // Verificar inmediatamente al cargar
    verificarSesion();

    // Verificar cada 10 minutos (reducido para minimizar falsos logout por errores de red)
    const verificacionInterval = setInterval(verificarSesion, 10 * 60 * 1000);

    return () => clearInterval(verificacionInterval);
  }, []);

  // Escuchar cambios en localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const usuarioStorage = localStorage.getItem("usuario");
      setUsuarioData(usuarioStorage ? JSON.parse(usuarioStorage) : null);
    };

    // Escuchar evento de storage (para otros tabs)
    window.addEventListener("storage", handleStorageChange);

    // Escuchar evento personalizado (para el mismo tab)
    window.addEventListener("usuarioActualizado", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("usuarioActualizado", handleStorageChange);
    };
  }, []);

  // Conexión WebSocket para notificaciones del dashboard del profesor
  useEffect(() => {
    if (!usuarioData?.id) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_professor_dashboard", usuarioData.id);
    });

    socket.on("exam_shared", (data: { nombreProfesorOrigen: string; nombreExamen: string; examId: number }) => {
      const nueva = {
        id: Date.now(),
        type: "exam_shared" as const,
        read: false,
        professorName: data.nombreProfesorOrigen,
        examName: data.nombreExamen,
        examId: String(data.examId),
        time: "Ahora",
      };
      setNotificaciones((prev) => [nueva, ...prev]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [usuarioData?.id]);

  // Cerrar sidebar mobile al cambiar de ruta
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  // Función auxiliar para capitalizar (Primera letra mayúscula, resto minúscula)
  const capitalizeWord = (word: string): string => {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };

  // Función para obtener nombre corto (Primer Nombre + Primer Apellido)
  const getNombreCorto = (): string => {
    if (!usuarioData) return "Usuario";

    // Obtener nombre y apellido del localStorage
    const nombre: string = usuarioData?.nombre || "";
    const apellido: string = usuarioData?.apellido || "";

    // Si tenemos nombre y apellido separados, usarlos directamente
    if (nombre && apellido) {
      // Tomar solo la primera palabra de cada uno y capitalizar
      const primerNombre = capitalizeWord(nombre.trim().split(" ")[0]);
      const primerApellido = capitalizeWord(apellido.trim().split(" ")[0]);

      return `${primerNombre} ${primerApellido}`;
    }

    // Fallback: si solo tenemos nombre completo
    if (nombre) {
      const partes: string[] = nombre
        .trim()
        .split(" ")
        .filter((p: string) => p.length > 0);
      if (partes.length > 1) {
        return `${capitalizeWord(partes[0])} ${capitalizeWord(partes[1])}`;
      }
      return capitalizeWord(partes[0]);
    }

    return "Usuario";
  };

  const nombreCorto = getNombreCorto();

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    setShowProfileMenu(false);
  };

  const handleLogout = async () => {
    try {
      if (usuarioData && usuarioData.id) {
        await usersApi.post("/logout", { userId: usuarioData.id });
      }
    } catch (error) {
      console.error("❌ Error al hacer logout:", error);
    } finally {
      clearAuthToken();
      localStorage.removeItem("usuario");
      window.location.href = "/login";
    }
  };

  const handleMenuItemClick = (path: string) => {
    navigate(path);
    setShowProfileMenu(false);
  };

  // Handlers para notificaciones
  const handleMarkAsRead = (id: number) => {
    setNotificaciones(
      notificaciones.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    );
  };

  const handleDeleteNotification = (id: number) => {
    setNotificaciones(notificaciones.filter((item) => item.id !== id));
  };

  const handleClearAllNotifications = () => {
    setNotificaciones([]);
  };

  const handleAcceptExam = (id: number, examId: string) => {
    mostrarModal("exito", "Examen aceptado", "Examen aceptado y agregado a tu lista", cerrarModal);
    handleDeleteNotification(id);
  };

  return (
    <div
      className="flex h-screen relative bg-cover bg-center transition-colors duration-300"
      style={{ backgroundImage: `url(${fondoImagen})` }}
    >
      {/* Overlay de fondo con diferentes colores según el tema */}
      <div className={`absolute inset-0 backdrop-blur-sm transition-all duration-300 ${
        darkMode
          ? "bg-gradient-to-br from-gray-900/95 via-slate-900/90 to-gray-900/95"
          : "bg-gradient-to-br from-white/88 via-gray-50/85 to-white/88"
      }`}></div>

      {/* Backdrop mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-40 flex flex-col transition-transform md:transition-all duration-300 ease-in-out w-64 ${sidebarCollapsed ? "md:w-16" : ""} ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${darkMode ? "bg-slate-900/80 backdrop-blur-md" : "bg-white border-r border-gray-200"}`}
      >
        {/* Botón de contraer/expandir flotante en el borde — oculto en mobile */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`hidden md:flex absolute -right-2.5 top-1/2 transform -translate-y-1/2 z-50 items-center justify-center w-5 h-12 rounded-full shadow-md border transition-all duration-200 ${
            darkMode 
              ? "bg-slate-800 border-slate-700 text-gray-400 hover:text-white hover:bg-slate-700" 
              : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
          title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
        >
          {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        {/* ✅ PERFIL - CAMBIADO DE BUTTON A DIV */}
        <div
          className={`p-4 ${darkMode ? "border-slate-800/50" : "border-gray-200"} relative`}
          ref={profileMenuRef}
        >
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className={`w-full flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2"} ${darkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-100/50"} rounded-lg p-1 transition-colors cursor-pointer`}
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-400 to-purple-500 shadow-lg">
              {usuarioData?.picture || usuarioData?.foto_perfil ? (
                <img
                  src={usuarioData.picture || usuarioData.foto_perfil}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-6 h-6 text-white" />
              )}
            </div>
            <div
              className={`flex-1 text-left min-w-0 transition-all duration-200 ease-in-out overflow-hidden ${
                sidebarCollapsed
                  ? "opacity-0 scale-95 w-0"
                  : "opacity-100 scale-100 delay-100"
              }`}
            >
              <div
                className={`font-semibold text-sm truncate ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                {nombreCorto}
              </div>
              <div
                className={`text-xs truncate ${darkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                Docente
              </div>
            </div>
            {!sidebarCollapsed && (
              <ChevronDown
                className={`w-4 h-4 ${darkMode ? "text-gray-400" : "text-gray-400"} transition-transform flex-shrink-0 ${showProfileMenu ? "rotate-180" : ""}`}
              />
            )}
          </div>

          {showProfileMenu && !sidebarCollapsed && (
            <div
              className={`absolute left-4 top-16 right-4 anim-slideDown ${darkMode ? "bg-slate-800/95 backdrop-blur-md border-slate-700/50" : "bg-white/95 backdrop-blur-md border-gray-200/50"} border rounded-lg shadow-2xl z-50 py-1`}
            >
              <button
                onClick={() => handleMenuItemClick("/profile")}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${darkMode ? "text-gray-200 hover:bg-slate-700/50" : "text-gray-700 hover:bg-gray-100/50"} transition-colors`}
              >
                <User className="w-4 h-4" />
                <span>Mi Perfil</span>
              </button>
              <button
                onClick={toggleTheme}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${darkMode ? "text-gray-200 hover:bg-slate-700/50" : "text-gray-700 hover:bg-gray-100/50"} transition-colors`}
              >
                {darkMode ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
                <span>Cambiar Tema</span>
              </button>
              <div
                className={`border-t ${darkMode ? "border-slate-700/50" : "border-gray-100/50"} my-1`}
              ></div>
              <button
                onClick={handleLogout}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${darkMode ? "text-red-400 hover:bg-red-900/20" : "text-red-600 hover:bg-red-50/50"} transition-colors`}
              >
                <LogOut className="w-4 h-4" />
                <span>Salir</span>
              </button>
            </div>
          )}
        </div>

        <nav className="p-4 space-y-1">
          <NavItem
            icon={Home}
            label="Inicio"
            collapsed={sidebarCollapsed}
            darkMode={darkMode}
            active={location.pathname === "/home" || location.pathname === "/"}
            onClick={() => navigate("/home")}
          />
          <NavItem
            icon={Bell}
            label="Notificaciones"
            collapsed={sidebarCollapsed}
            darkMode={darkMode}
            active={false}
            onClick={() => {}}
            badge={unreadCount}
            disabled
          />

          <div className="pt-4 pb-2">
            <div className="space-y-1">
              <NavItem
                icon={FileEdit}
                label="Nuevo Examen"
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                active={location.pathname === "/create-exam"}
                onClick={() => navigate("/create-exam")}
              />
              <NavItem
                icon={List}
                label="Lista de Exámenes"
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                active={["/exam-list", "/exam-detail", "/edit-exam"].includes(location.pathname)}
                onClick={() => navigate("/exam-list")}
              />
              <NavItem
                icon={Monitor}
                label="Vigilancia/Resultados"
                collapsed={sidebarCollapsed}
                darkMode={darkMode}
                active={location.pathname === "/monitor"}
                onClick={() => navigate("/monitor")}
              />
            </div>
          </div>
        </nav>

        {/* Footer Sidebar (Botones de acción) - Igual que en ExamSolver */}
        <div className={`p-3 mt-auto ${darkMode ? "bg-slate-900/50" : "bg-gray-50/50"}`}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center rounded-lg text-sm transition-colors ${
              sidebarCollapsed ? "justify-center p-2" : "px-3 py-2.5 gap-3"
            } ${
              darkMode
                ? "text-red-400 hover:bg-red-900/20"
                : "text-red-600 hover:bg-red-50"
            }`}
            title={sidebarCollapsed ? "Salir" : ""}
          >
            <div className={`relative flex-shrink-0 transition-transform duration-200 ${!sidebarCollapsed ? "" : "hover:scale-105"}`}>
              <LogOut className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-medium truncate transition-opacity duration-300">
                Salir
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content - SCROLL CONDICIONAL */}
      <div className={`flex-1 flex flex-col relative z-10 ${location.pathname === '/monitor' ? 'md:overflow-hidden overflow-auto' : 'overflow-auto'}`}>
        <header
          className="bg-transparent px-3 md:px-8 py-2 transition-colors duration-300 flex-shrink-0"
        >
          <div className="flex items-center justify-between md:justify-end gap-3">
            {/* Hamburguesa — solo mobile */}
            <button
              className={`md:hidden p-2 rounded-lg border shadow-md transition-colors flex-shrink-0 ${
                darkMode
                  ? "bg-slate-900/80 border-slate-700 text-gray-300 hover:bg-slate-800"
                  : "bg-white/80 border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => setIsMobileMenuOpen(v => !v)}
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center">
              <img
                src={darkMode ? logoUniversidadNoche : logoUniversidad}
                alt="Logo Universidad"
                className="h-10 md:h-14 w-auto object-contain transition-opacity duration-300 drop-shadow-lg"
              />
            </div>
          </div>
        </header>

        <main className={`flex-1 px-3 sm:px-5 md:px-8 py-4 md:py-6 min-h-0 ${location.pathname === '/monitor' ? 'md:overflow-hidden' : 'overflow-auto'}`}>
          {!tokenListo ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>}><Routes>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<AnimatedPage key="home"><HomeContent darkMode={darkMode} /></AnimatedPage>} />
            <Route path="notificaciones" element={
              <AnimatedPage key="notificaciones">
                <NotificationsContent
                  darkMode={darkMode}
                  notificaciones={notificaciones}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={handleDeleteNotification}
                  onClearAll={handleClearAllNotifications}
                  onAcceptExam={handleAcceptExam}
                />
              </AnimatedPage>
            } />
            <Route path="create-exam" element={
              <AnimatedPage key="create-exam">
                <CrearExamen
                  darkMode={darkMode}
                  onExamenCreado={() => navigate("/exam-list")}
                />
              </AnimatedPage>
            } />
            <Route path="editar-examen" element={
              <AnimatedPage key="editar-examen">
                <CrearExamen
                  darkMode={darkMode}
                  onExamenCreado={() => navigate("/exam-list")}
                />
              </AnimatedPage>
            } />
            <Route path="exam-detail" element={<AnimatedPage key="exam-detail"><VerExamen darkMode={darkMode} /></AnimatedPage>} />
            <Route path="exam-list" element={<AnimatedPage key="exam-list"><ListaExamenes darkMode={darkMode} onCrearExamen={() => navigate("/create-exam")} /></AnimatedPage>} />
            <Route path="monitor" element={<AnimatedPage key="monitor"><VigilanciaExamenesLista darkMode={darkMode} usuarioData={usuarioData} /></AnimatedPage>} />
            <Route path="profile" element={<AnimatedPage key="profile"><MiPerfil darkMode={darkMode} /></AnimatedPage>} />
          </Routes></Suspense>}
        </main>
      </div>

      {/* Botón de tema - Posición fija abajo a la derecha */}
      <button
        onClick={toggleTheme}
        className={`fixed bottom-6 right-6 z-20 p-3 rounded-full shadow-lg transition-all duration-300 ${
          darkMode
            ? "bg-slate-800/90 backdrop-blur-md text-yellow-400 hover:bg-slate-700/90 border border-slate-700/50"
            : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
        title={darkMode ? "Cambiar a modo día" : "Cambiar a modo noche"}
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <ConfirmModal
        {...modal}
        darkMode={darkMode}
        onCancelar={cerrarModal}
      />
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  collapsed = false,
  darkMode = false,
  onClick,
  badge,
  disabled = false,
}: {
  icon: any;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  darkMode?: boolean;
  onClick: () => void;
  badge?: number;
  disabled?: boolean;
}) {
  const showBadge = badge !== undefined && badge > 0;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full flex items-center rounded-lg text-sm transition-colors ${
        collapsed ? "justify-center px-2 py-2" : "px-3 py-2 gap-3"
      } ${
        disabled
          ? darkMode
            ? "text-gray-600 cursor-default"
            : "text-gray-400 cursor-default"
          : active
            ? darkMode
              ? "bg-slate-800/70 text-white font-medium shadow-lg"
              : "bg-[#2c3e50] text-white font-medium"
            : darkMode
              ? "text-gray-300 hover:bg-slate-800/50"
              : "text-gray-700 hover:bg-gray-50"
      }`}
      title={collapsed ? label : ""}
    >
      <div className="relative flex-shrink-0">
        <Icon className="w-5 h-5" />
        {showBadge && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 rounded-full w-2 h-2 border-2 border-slate-900"></span>
        )}
      </div>
      <span
        className={`whitespace-nowrap transition-all duration-200 ease-in-out overflow-hidden ${
          collapsed ? "opacity-0 w-0" : "opacity-100 delay-100"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

// ========== SECCIONES ==========

function NotificationsContent({
  darkMode,
  notificaciones,
  onMarkAsRead,
  onDelete,
  onClearAll,
  onAcceptExam,
}: {
  darkMode: boolean;
  notificaciones: any[];
  onMarkAsRead: (id: number) => void;
  onDelete: (id: number) => void;
  onClearAll: () => void;
  onAcceptExam: (id: number, examId: string) => void;
}) {
  const unreadCount = notificaciones.filter((n) => !n.read).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div
        className={`${darkMode ? "bg-slate-900/80 backdrop-blur-md border-slate-800/50" : "bg-white border-gray-200"} rounded-lg shadow-xl transition-colors duration-300 overflow-hidden border`}
      >
        <div
          className={`p-6 flex items-center justify-between ${darkMode ? "bg-slate-800/80" : "bg-[#1e293b]/90"}`}
        >
          <h2 className="text-lg font-semibold text-white">Notificaciones</h2>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${darkMode ? "bg-teal-900/40 text-teal-400" : "bg-teal-100 text-teal-700"}`}
              >
                {unreadCount} sin leer
              </span>
            )}
            {notificaciones.length > 0 && (
              <button
                onClick={onClearAll}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                title="Limpiar todas las notificaciones"
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>
        <div className="p-6 space-y-0">
          {notificaciones.length > 0 ? (
            notificaciones.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                darkMode={darkMode}
                onMarkAsRead={onMarkAsRead}
                onDelete={onDelete}
                onAcceptExam={onAcceptExam}
              />
            ))
          ) : (
            <p
              className={`text-center py-8 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              No tienes notificaciones
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
