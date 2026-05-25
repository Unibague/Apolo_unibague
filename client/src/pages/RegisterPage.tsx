import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Moon, Sun, ChevronLeft } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import logoUniversidad from '../../assets/logo-universidad.webp';
import logoUniversidadNoche from '../../assets/logo-universidad-noche.webp';
import fondoImagen from '../../assets/fondo.webp';
import { authService } from '../services/authService';

// ============================================
// INTERFACES
// ============================================
interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

// ============================================
// COMPONENTE REGISTER
// ============================================
export default function RegisterPage() {
  // Estados del formulario
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    label: '',
    color: ''
  });
  
  const navigate = useNavigate();

  // Estado para el modo oscuro - lee desde localStorage al iniciar
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Guardar preferencia y aplicar clase al <html>
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Verificar si ya hay una sesión activa
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      navigate('/');
    }
  }, [navigate]);

  // ============================================
  // FUNCIONES
  // ============================================

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  /**
   * Calcular la fuerza de la contraseña
   */
  const calculatePasswordStrength = (password: string): PasswordStrength => {
    let score = 0;
    
    if (!password) {
      return { score: 0, label: '', color: '' };
    }

    // Criterios de evaluación
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Determinar nivel
    let label = '';
    let color = '';

    if (score <= 1) {
      label = 'Muy débil';
      color = '#ef4444';
    } else if (score === 2) {
      label = 'Débil';
      color = '#f97316';
    } else if (score === 3) {
      label = 'Aceptable';
      color = '#eab308';
    } else if (score === 4) {
      label = 'Fuerte';
      color = '#84cc16';
    } else {
      label = 'Muy fuerte';
      color = '#22c55e';
    }

    return { score, label, color };
  };

  /**
   * Manejar cambios en los inputs
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    setFormData({
      ...formData,
      [name]: value
    });

    // Calcular fuerza de contraseña al cambiar
    if (name === 'password') {
      const strength = calculatePasswordStrength(value);
      setPasswordStrength(strength);
    }
  };

  /**
   * Validar formulario antes de enviar
   */
  const validateForm = (): boolean => {
    // Verificar campos vacíos
    if (!formData.nombre || !formData.apellido || !formData.email || 
        !formData.password || !formData.confirmPassword) {
      setError('Todos los campos son obligatorios');
      return false;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Por favor ingresa un correo electrónico válido');
      return false;
    }

    // Validar longitud de contraseña
    if (formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return false;
    }

    // Validar fuerza de contraseña
    if (passwordStrength.score < 3) {
      setError('La contraseña debe ser al menos "Aceptable" (amarillo). Usa mayúsculas, minúsculas, números y caracteres especiales.');
      return false;
    }

    // Validar que las contraseñas coincidan
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return false;
    }

    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    setLoading(true);
    try {
      await authService.registerWithEmail(
        formData.nombre,
        formData.apellido,
        formData.email,
        formData.password,
      );
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'Error al registrar usuario. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const googleRegister = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await authService.loginWithGoogle(tokenResponse.access_token);
        navigate('/');
      } catch (err: any) {
        setError(err.message || 'Error al registrarse con Google.');
      } finally {
        setLoadingGoogle(false);
        setLoading(false);
      }
    },
    onError: () => {
      setError('No se pudo completar el registro con Google.');
      setLoadingGoogle(false);
      setLoading(false);
    },
  });

  const handleGoogleRegister = () => {
    setError('');
    setLoadingGoogle(true);
    setLoading(true);
    googleRegister();
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 md:p-8 bg-cover bg-center relative transition-all duration-300"
      style={{ backgroundImage: `url(${fondoImagen})` }}
    >
      {/* Overlay — mismo estilo que LandingPage */}
      <div className={`absolute inset-0 backdrop-blur-sm transition-all duration-300 ${
        darkMode
          ? 'bg-gradient-to-br from-gray-900/95 via-slate-900/90 to-gray-900/95'
          : 'bg-gradient-to-br from-white/88 via-gray-50/85 to-white/88'
      }`} />

      {/* Botón volver a inicio */}
      <button
        onClick={() => navigate('/')}
        className={`fixed top-6 left-6 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl border transition-all duration-300 hover:scale-105 text-sm font-medium ${
          darkMode
            ? 'bg-slate-800/80 backdrop-blur-xl border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
            : 'bg-white/90 backdrop-blur-sm border-slate-200 text-slate-600 shadow-slate-300/60 hover:bg-white hover:text-slate-900'
        }`}
        title="Volver al inicio"
      >
        <ChevronLeft className="w-4 h-4" />
        Inicio
      </button>

      {/* Botón de tema */}
      <button
        onClick={toggleTheme}
        className={`fixed bottom-6 right-6 z-20 p-4 rounded-full shadow-2xl border transition-all duration-300 hover:scale-110 hover:rotate-12 ${
          darkMode
            ? 'bg-slate-800/80 backdrop-blur-xl border-slate-600 text-yellow-400 hover:bg-slate-700'
            : 'bg-white/90 backdrop-blur-sm border-slate-200 text-slate-600 shadow-slate-300/60 hover:bg-white'
        }`}
        title={darkMode ? "Cambiar a modo día" : "Cambiar a modo noche"}
      >
        {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>
      
      {/* Contenedor principal */}
      <div className="rounded-xl shadow-2xl w-full max-w-6xl z-10 relative overflow-hidden transition-colors duration-300 bg-surface anim-scaleIn">
        <div className="grid md:grid-cols-2">
          
          {/* ============================================ */}
          {/* SECCIÓN IZQUIERDA - FORMULARIO */}
          {/* ============================================ */}
          <div className="px-4 sm:px-8 md:px-10 py-6 md:py-12 border-b md:border-b-0 md:border-r transition-colors duration-300 border-ui">
            {/* Logo */}
            <div className="mb-4 md:mb-6 flex items-center justify-center px-4 md:px-6 transition-all duration-300" style={{ height: '90px' }}>
              <img
                src={darkMode ? logoUniversidadNoche : logoUniversidad}
                alt="Universidad de Ibagué"
                className="max-w-full max-h-full object-contain transition-all duration-300"
              />
            </div>

            {/* Título */}
            <h2 className={`text-2xl font-bold text-center mb-6 transition-all duration-300 ${
              darkMode ? 'text-blue-400' : 'text-[#003876]'
            }`}>
              Crear Cuenta
            </h2>

            {/* Formulario */}
            <form onSubmit={handleRegister} className="max-w-md mx-auto">
              {/* Nombre y Apellido */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    placeholder="Nombre"
                    required
                    disabled={loading}
                    className={`w-full px-4 py-3.5 border rounded-lg text-base outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-raised border-ui text-primary ${
                      darkMode
                        ? 'placeholder-gray-400 focus:border-blue-500'
                        : 'focus:border-[#003876] focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <input
                    type="text"
                    name="apellido"
                    value={formData.apellido}
                    onChange={handleChange}
                    placeholder="Apellido"
                    required
                    disabled={loading}
                    className={`w-full px-4 py-3.5 border rounded-lg text-base outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-raised border-ui text-primary ${
                      darkMode
                        ? 'placeholder-gray-400 focus:border-blue-500'
                        : 'focus:border-[#003876] focus:bg-white'
                    }`}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="mb-4">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Correo electrónico"
                  required
                  disabled={loading}
                  className={`w-full px-4 py-3.5 border rounded-lg text-base outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-400 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-[#003876] focus:bg-white'
                  }`}
                />
              </div>

              {/* Contraseña */}
              <div className="mb-4">
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Contraseña"
                  required
                  disabled={loading}
                  className={`w-full px-4 py-3.5 border rounded-lg text-base outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-400 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-[#003876] focus:bg-white'
                  }`}
                />
              </div>

              {/* Confirmar Contraseña */}
              <div className="mb-4">
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirmar contraseña"
                  required
                  disabled={loading}
                  className={`w-full px-4 py-3.5 border rounded-lg text-base outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-white placeholder-gray-400 focus:border-blue-500'
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-[#003876] focus:bg-white'
                  }`}
                />
              </div>

              {/* Indicador de fuerza de contraseña */}
              <div className="mb-5">
                {/* Barra de progreso */}
                <div className={`w-full h-2 rounded-full overflow-hidden mb-2 ${
                  darkMode ? 'bg-slate-700' : 'bg-gray-200'
                }`}>
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: formData.password ? `${(passwordStrength.score / 5) * 100}%` : '0%',
                      backgroundColor: formData.password ? passwordStrength.color : (darkMode ? '#475569' : '#d1d5db')
                    }}
                  />
                </div>
                
                {/* Etiquetas */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: formData.password ? passwordStrength.color : (darkMode ? '#9ca3af' : '#9ca3af') }}
                  >
                    {formData.password ? passwordStrength.label : 'Sin contraseña'}
                  </span>
                  <span className="text-xs text-action">
                    Mínimo: Aceptable
                  </span>
                </div>
                
                {/* Requisitos */}
                <div className="text-xs space-y-1 text-action">
                  <div className="flex items-center gap-1">
                    <span className={formData.password.length >= 8 ? 'text-green-600' : (darkMode ? 'text-gray-500' : 'text-gray-400')}>
                      {formData.password.length >= 8 ? '✓' : '○'}
                    </span>
                    <span>Mínimo 8 caracteres</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password) ? 'text-green-600' : (darkMode ? 'text-gray-500' : 'text-gray-400')}>
                      {/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password) ? '✓' : '○'}
                    </span>
                    <span>Mayúsculas y minúsculas</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={/\d/.test(formData.password) ? 'text-green-600' : (darkMode ? 'text-gray-500' : 'text-gray-400')}>
                      {/\d/.test(formData.password) ? '✓' : '○'}
                    </span>
                    <span>Al menos un número</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={/[^a-zA-Z0-9]/.test(formData.password) ? 'text-green-600' : (darkMode ? 'text-gray-500' : 'text-gray-400')}>
                      {/[^a-zA-Z0-9]/.test(formData.password) ? '✓' : '○'}
                    </span>
                    <span>Caracteres especiales (!@#$%)</span>
                  </div>
                </div>
              </div>

              {/* Mensaje de error */}
              {error && (
                <div className={`px-4 py-3 rounded-lg mb-5 text-center text-sm transition-colors duration-300 ${
                  darkMode 
                    ? 'bg-red-900/30 text-red-400' 
                    : 'bg-red-50 text-red-600'
                }`}>
                  {error}
                </div>
              )}

              {/* Botón Registrarse */}
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 rounded-lg text-base font-semibold transition-all duration-300 mb-5 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  darkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-[#003876] text-white hover:bg-[#00508f]'
                }`}
              >
                {loading ? 'Registrando...' : 'Registrarse'}
              </button>

              {/* Enlace a login */}
              <div className="text-center">
                <span className="text-base text-action">
                  ¿Ya tienes cuenta?{' '}
                </span>
                <Link
                  to="/login"
                  className={`text-base font-medium no-underline hover:underline ${
                    darkMode ? 'text-blue-400' : 'text-[#003876]'
                  }`}
                >
                  Inicia sesión
                </Link>
              </div>
            </form>
          </div>

          {/* ============================================ */}
          {/* SECCIÓN DERECHA - REGISTRO CON GOOGLE */}
          {/* ============================================ */}
          <div className="px-4 sm:px-8 md:px-10 py-8 md:py-12 flex flex-col justify-center items-center">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold mb-2 text-primary">
                Registro Rápido
              </h3>
              <p className="text-base text-action">
                Crea tu cuenta con Google
              </p>
            </div>

            {/* Botón Google */}
            <button
              type="button"
              onClick={handleGoogleRegister}
              disabled={loading}
              className={`w-full max-w-sm px-8 py-5 border rounded-lg text-lg font-medium flex items-center justify-center gap-3 transition-all duration-300 hover:shadow-xl hover:scale-[1.03] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-raised border-ui ${
                darkMode
                  ? 'text-gray-200 hover:bg-slate-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:shadow-xl'
              }`}
            >
              {loadingGoogle ? (
                <>
                  <svg className="anim-spin-slow w-6 h-6" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Abriendo Google...
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
                    <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                  </svg>
                  Registrarse con Google
                </>
              )}
            </button>

            {/* Términos y condiciones */}
            <div className="mt-8 text-center text-sm max-w-xs text-action">
              <p>
                Al registrarte, aceptas nuestros términos de servicio y política de privacidad
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}