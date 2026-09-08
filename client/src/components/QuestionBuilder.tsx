import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Copy, Image as ImageIcon, X, Check, ChevronDown, AlertCircle, HelpCircle, ChevronUp, Pencil, GripVertical, Upload } from 'lucide-react';
import EditorTexto from './TextEditor';

interface CrearPreguntasProps {
  darkMode: boolean;
  preguntasIniciales?: Pregunta[];
  onPreguntasChange?: (preguntas: Pregunta[]) => void;
  onValidationChange?: (isValid: boolean) => void;
}

type TipoPregunta = 'seleccion-multiple' | 'rellenar-espacios' | 'conectar' | 'abierta' | 'subir-archivo';
type MetodoEvaluacionAbierta = 'palabras-clave' | 'texto-exacto' | 'manual';

interface OpcionSeleccion {
  id: string;
  texto: string;
  esCorrecta: boolean;
}

interface ParConexion {
  id: string;
  izquierda: string;
  derecha: string;
}

interface PalabraSeleccionada {
  indice: number;
  palabra: string;
}

export interface Pregunta {
  id: string;
  tipo: TipoPregunta;
  titulo: string;
  imagen: string | null;
  puntos: number;
  calificacionParcial?: boolean;
  opciones?: OpcionSeleccion[];
  // Nuevos campos para rellenar espacios
  textoCompleto?: string;
  palabrasSeleccionadas?: PalabraSeleccionada[];
  paresConexion?: ParConexion[];
  respuestasCorrectas?: { [key: string]: string };
  // Campos para pregunta abierta
  metodoEvaluacion?: MetodoEvaluacionAbierta;
  palabrasClave?: string[];
  textoExacto?: string;
}

// --- CONSTANTES DE ESTILO (Igual que en ExamenPreguntas) ---
const COLOR_THEMES = [
  { border: "border-l-blue-500", gradient: "from-blue-500 to-indigo-600" },
  { border: "border-l-emerald-500", gradient: "from-emerald-500 to-teal-600" },
  { border: "border-l-orange-500", gradient: "from-orange-500 to-red-600" },
  { border: "border-l-purple-500", gradient: "from-purple-500 to-fuchsia-600" },
  { border: "border-l-pink-500", gradient: "from-pink-500 to-rose-600" },
  { border: "border-l-cyan-500", gradient: "from-cyan-500 to-blue-600" },
  { border: "border-l-yellow-500", gradient: "from-yellow-500 to-amber-600" },
];

const getTheme = (index: number) => COLOR_THEMES[index % COLOR_THEMES.length];

export default function CrearPreguntas({ darkMode, preguntasIniciales = [], onPreguntasChange, onValidationChange }: CrearPreguntasProps) {
  const [preguntas, setPreguntas] = useState<Pregunta[]>(preguntasIniciales);
  const [preguntasEditando, setPreguntasEditando] = useState<Set<string>>(new Set());
  const [mostrarSelectorTipo, setMostrarSelectorTipo] = useState<string | null>(null);
  const [mostrarClaveRespuesta, setMostrarClaveRespuesta] = useState<string | null>(null);
  const [puntosTemp, setPuntosTemp] = useState<{[key: string]: string}>({});
  const [palabraClaveTemp, setPalabraClaveTemp] = useState<string>('');
  // Animaciones de entrada/salida de preguntas
  const [preguntasNuevas, setPreguntasNuevas] = useState<Set<string>>(new Set());
  const [preguntasCerrando, setPreguntasCerrando] = useState<Set<string>>(new Set());
  const [preguntasTransicionando, setPreguntasTransicionando] = useState<Set<string>>(new Set());
  const [imageError, setImageError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Notificar al padre cuando cambien las preguntas
  useEffect(() => {
    if (onPreguntasChange) {
      onPreguntasChange(preguntas);
    }
  }, [preguntas, onPreguntasChange]);

  // Verificar validación de preguntas y notificar al padre
  useEffect(() => {
    if (onValidationChange) {
      const todasConfiguradas = preguntas.every(pregunta => {
        if (pregunta.tipo === 'seleccion-multiple') {
          return pregunta.opciones?.some(o => o.esCorrecta) || false;
        }
        if (pregunta.tipo === 'abierta') {
          if (pregunta.metodoEvaluacion === 'manual') return true;
          if (pregunta.metodoEvaluacion === 'palabras-clave') {
            return pregunta.palabrasClave && pregunta.palabrasClave.length > 0;
          }
          if (pregunta.metodoEvaluacion === 'texto-exacto') {
            return pregunta.textoExacto && pregunta.textoExacto.trim() !== '';
          }
          return false;
        }
        if (pregunta.tipo === 'rellenar-espacios') {
          return pregunta.palabrasSeleccionadas && pregunta.palabrasSeleccionadas.length > 0;
        }
        if (pregunta.tipo === 'conectar') {
          return pregunta.paresConexion && pregunta.paresConexion.length > 0 &&
                 pregunta.paresConexion.every(p => p.izquierda && p.derecha);
        }
        if (pregunta.tipo === 'subir-archivo') {
          return true;
        }
        return false;
      });
      onValidationChange(todasConfiguradas && preguntas.length > 0);
    }
  }, [preguntas, onValidationChange]);

  const toggleEditarPregunta = useCallback((id: string) => {
    setPreguntasTransicionando(prev => new Set(prev).add(id));
    setTimeout(() => {
      setPreguntasEditando(prev => {
        const nuevo = new Set(prev);
        if (nuevo.has(id)) nuevo.delete(id);
        else nuevo.add(id);
        return nuevo;
      });
      setPreguntasTransicionando(prev => { const s = new Set(prev); s.delete(id); return s; });
      marcarComoNueva(id);
    }, 180);
  }, []);

  const marcarComoNueva = useCallback((id: string) => {
    setPreguntasNuevas(prev => new Set(prev).add(id));
    setTimeout(() => {
      setPreguntasNuevas(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 350);
  }, []);

  const crearNuevaPregunta = useCallback(() => {
    const nuevaPregunta: Pregunta = {
      id: Date.now().toString(),
      tipo: 'seleccion-multiple',
      titulo: '',
      imagen: null,
      puntos: 1,
      calificacionParcial: false,
      opciones: [{ id: '1', texto: 'Opción 1', esCorrecta: false }]
    };
    setPreguntas(prev => [...prev, nuevaPregunta]);
    setPreguntasEditando(prev => new Set(prev).add(nuevaPregunta.id));
    marcarComoNueva(nuevaPregunta.id);
  }, [marcarComoNueva]);

  const duplicarPregunta = useCallback((id: string) => {
    setPreguntas(prev => {
      const pregunta = prev.find(p => p.id === id);
      if (!pregunta) return prev;
      const nuevaPregunta = { ...pregunta, id: Date.now().toString() };
      return [...prev, nuevaPregunta];
    });
  }, []);

  const eliminarPregunta = useCallback((id: string) => {
    setPreguntasCerrando(prev => new Set(prev).add(id));
    setTimeout(() => {
      setPreguntas(prev => prev.filter(p => p.id !== id));
      setPreguntasEditando(prev => { const s = new Set(prev); s.delete(id); return s; });
      setPreguntasCerrando(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 220);
  }, []);

  const moverPregunta = useCallback((index: number, direccion: 'arriba' | 'abajo') => {
    const nuevoIndex = direccion === 'arriba' ? index - 1 : index + 1;
    setPreguntas(prev => {
      if (nuevoIndex < 0 || nuevoIndex >= prev.length) return prev;
      const nuevasPreguntas = [...prev];
      [nuevasPreguntas[index], nuevasPreguntas[nuevoIndex]] = [nuevasPreguntas[nuevoIndex], nuevasPreguntas[index]];
      return nuevasPreguntas;
    });
  }, []);

  const actualizarPregunta = useCallback((id: string, cambios: Partial<Pregunta>) => {
    setPreguntas(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p));
  }, []);

  const cambiarTipoPregunta = useCallback((id: string, nuevoTipo: TipoPregunta) => {
    let cambios: Partial<Pregunta> = { tipo: nuevoTipo };

    switch (nuevoTipo) {
      case 'seleccion-multiple':
        cambios.opciones = [{ id: '1', texto: 'Opción 1', esCorrecta: false }];
        cambios.calificacionParcial = false;
        break;
      case 'rellenar-espacios':
        cambios.textoCompleto = '';
        cambios.palabrasSeleccionadas = [];
        cambios.calificacionParcial = false;
        break;
      case 'conectar':
        cambios.paresConexion = [{ id: '1', izquierda: '', derecha: '' }];
        cambios.respuestasCorrectas = {};
        cambios.calificacionParcial = false;
        break;
      case 'abierta':
        cambios.metodoEvaluacion = 'manual';
        cambios.palabrasClave = [];
        cambios.textoExacto = '';
        cambios.calificacionParcial = false;
        break;
      case 'subir-archivo':
        cambios.calificacionParcial = false;
        break;
    }

    actualizarPregunta(id, cambios);
    setMostrarSelectorTipo(null);
  }, [actualizarPregunta]);

  const agregarOpcion = useCallback((id: string) => {
    setPreguntas(prev => {
      const pregunta = prev.find(p => p.id === id);
      if (!pregunta?.opciones || pregunta.opciones.length >= 10) return prev;
      const nuevaOpcion: OpcionSeleccion = {
        id: Date.now().toString(),
        texto: `Opción ${pregunta.opciones.length + 1}`,
        esCorrecta: false
      };
      return prev.map(p => p.id === id ? { ...p, opciones: [...p.opciones!, nuevaOpcion] } : p);
    });
  }, []);

  const eliminarOpcion = useCallback((preguntaId: string, opcionId: string) => {
    setPreguntas(prev => prev.map(p => 
      p.id === preguntaId && p.opciones 
        ? { ...p, opciones: p.opciones.filter(o => o.id !== opcionId) } 
        : p
    ));
  }, []);

  const actualizarOpcion = useCallback((preguntaId: string, opcionId: string, texto: string) => {
    setPreguntas(prev => prev.map(p => 
      p.id === preguntaId && p.opciones 
        ? { ...p, opciones: p.opciones.map(o => o.id === opcionId ? { ...o, texto } : o) } 
        : p
    ));
  }, []);

  const toggleRespuestaCorrecta = useCallback((preguntaId: string, opcionId: string) => {
    setPreguntas(prev => prev.map(p => 
      p.id === preguntaId && p.opciones 
        ? { ...p, opciones: p.opciones.map(o => 
            o.id === opcionId ? { ...o, esCorrecta: !o.esCorrecta } : o
          ) } 
        : p
    ));
  }, []);

  const agregarParConexion = useCallback((id: string) => {
    setPreguntas(prev => {
      const pregunta = prev.find(p => p.id === id);
      if (!pregunta?.paresConexion || pregunta.paresConexion.length >= 10) return prev;
      const nuevoPar: ParConexion = {
        id: Date.now().toString(),
        izquierda: '',
        derecha: ''
      };
      return prev.map(p => p.id === id ? { ...p, paresConexion: [...p.paresConexion!, nuevoPar] } : p);
    });
  }, []);

  const eliminarParConexion = useCallback((preguntaId: string, parId: string) => {
    setPreguntas(prev => prev.map(p => 
      p.id === preguntaId && p.paresConexion 
        ? { ...p, paresConexion: p.paresConexion.filter(par => par.id !== parId) } 
        : p
    ));
  }, []);

  const actualizarParConexion = useCallback((preguntaId: string, parId: string, lado: 'izquierda' | 'derecha', valor: string) => {
    setPreguntas(prev => prev.map(p => 
      p.id === preguntaId && p.paresConexion 
        ? { ...p, paresConexion: p.paresConexion.map(par => 
            par.id === parId ? { ...par, [lado]: valor } : par
          ) } 
        : p
    ));
  }, []);

  // ========== NUEVAS FUNCIONES PARA RELLENAR ESPACIOS ==========
  
  const actualizarTextoCompleto = useCallback((preguntaId: string, nuevoTexto: string) => {
    setPreguntas(prev => prev.map(p => {
      if (p.id !== preguntaId) return p;
      const palabrasNuevas = nuevoTexto.split(/\s+/).filter(w => w.trim().length > 0);
      const palabrasSeleccionadasActualizadas = (p.palabrasSeleccionadas || []).filter(ps => {
        if (ps.indice >= palabrasNuevas.length) return false;
        return palabrasNuevas[ps.indice] === ps.palabra;
      });
      return { ...p, textoCompleto: nuevoTexto, palabrasSeleccionadas: palabrasSeleccionadasActualizadas };
    }));
  }, []);

  const manejarDobleClicPalabra = (preguntaId: string, e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const posicionClick = textarea.selectionStart;

    setPreguntas(prev => prev.map(p => {
      if (p.id !== preguntaId || !p.textoCompleto) return p;
      const texto = p.textoCompleto;

      let inicio = posicionClick;
      let fin = posicionClick;
      while (inicio > 0 && !/\s/.test(texto[inicio - 1])) inicio--;
      while (fin < texto.length && !/\s/.test(texto[fin])) fin++;

      const palabraSeleccionada = texto.substring(inicio, fin).trim();
      if (!palabraSeleccionada || palabraSeleccionada.length === 0) return p;

      const textoAntes = texto.substring(0, inicio);
      const palabrasAntes = textoAntes.split(/\s+/).filter(w => w.trim().length > 0);
      const indice = palabrasAntes.length;

      const palabrasSeleccionadas = p.palabrasSeleccionadas || [];
      const yaSeleccionada = palabrasSeleccionadas.find(ps => ps.indice === indice);

      if (yaSeleccionada) {
        return { ...p, palabrasSeleccionadas: palabrasSeleccionadas.filter(ps => ps.indice !== indice) };
      } else if (palabrasSeleccionadas.length < 10) {
        return {
          ...p,
          palabrasSeleccionadas: [...palabrasSeleccionadas, { indice, palabra: palabraSeleccionada }]
            .sort((a, b) => a.indice - b.indice)
        };
      }
      return p;
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(posicionClick, posicionClick);
    }, 0);
  };

  const eliminarPalabraSeleccionada = useCallback((preguntaId: string, indice: number) => {
    setPreguntas(prev => prev.map(p =>
      p.id === preguntaId && p.palabrasSeleccionadas
        ? { ...p, palabrasSeleccionadas: p.palabrasSeleccionadas.filter(ps => ps.indice !== indice) }
        : p
    ));
  }, []);

  const generarTextoConEspacios = (pregunta: Pregunta): string => {
    if (!pregunta.textoCompleto) return '';

    const palabras = pregunta.textoCompleto.split(/\s+/);
    const palabrasSeleccionadas = pregunta.palabrasSeleccionadas || [];
    
    return palabras.map((palabra, idx) => {
      const estaSeleccionada = palabrasSeleccionadas.some(p => p.indice === idx);
      return estaSeleccionada ? '___' : palabra;
    }).join(' ');
  };

  const toggleCalificacionParcial = useCallback((preguntaId: string) => {
    setPreguntas(prev => prev.map(p =>
      p.id === preguntaId ? { ...p, calificacionParcial: !p.calificacionParcial } : p
    ));
  }, []);

  // ========== FUNCIONES PARA PREGUNTA ABIERTA ==========
  
  const cambiarMetodoEvaluacion = useCallback((preguntaId: string, metodo: MetodoEvaluacionAbierta) => {
    actualizarPregunta(preguntaId, { metodoEvaluacion: metodo });
  }, [actualizarPregunta]);

  const agregarPalabraClave = (preguntaId: string) => {
    if (palabraClaveTemp.trim() === '') return;
    
    setPreguntas(prev => prev.map(p => {
      if (p.id !== preguntaId) return p;
      const palabrasActuales = p.palabrasClave || [];
      if (palabrasActuales.length >= 15) return p;
      return { ...p, palabrasClave: [...palabrasActuales, palabraClaveTemp.trim()] };
    }));
    setPalabraClaveTemp('');
  };

  const eliminarPalabraClave = useCallback((preguntaId: string, index: number) => {
    setPreguntas(prev => prev.map(p =>
      p.id === preguntaId && p.palabrasClave
        ? { ...p, palabrasClave: p.palabrasClave.filter((_, i) => i !== index) }
        : p
    ));
  }, []);

  const actualizarTextoExacto = useCallback((preguntaId: string, texto: string) => {
    actualizarPregunta(preguntaId, { textoExacto: texto });
  }, [actualizarPregunta]);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

  const handleImagenCarga = (preguntaId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(`Tipo de archivo no permitido: "${file.type || file.name.split('.').pop()}". Solo se aceptan JPEG, PNG, GIF, WEBP o BMP.`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageError('La imagen supera el límite de 10 MB.');
      return;
    }

    setImageError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      actualizarPregunta(preguntaId, { imagen: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const eliminarImagen = (preguntaId: string) => {
    actualizarPregunta(preguntaId, { imagen: null });
  };

  const tiposPregunta = [
    { tipo: 'seleccion-multiple' as TipoPregunta, nombre: 'Opción múltiple', icono: '◉' },
    { tipo: 'rellenar-espacios' as TipoPregunta, nombre: 'Rellenar espacios', icono: '_' },
    { tipo: 'conectar' as TipoPregunta, nombre: 'Conectar', icono: '⟷' },
    { tipo: 'abierta' as TipoPregunta, nombre: 'Párrafo', icono: '≡' },
    { tipo: 'subir-archivo' as TipoPregunta, nombre: 'Subir archivo', icono: '📎' }
  ];

  const renderizarPreguntaEdicion = (pregunta: Pregunta, index: number) => {
    const permiteCalificacionParcial = ['seleccion-multiple', 'rellenar-espacios', 'conectar', 'abierta'].includes(pregunta.tipo);
    const theme = getTheme(index);

    return (
      <div
        className={`rounded-lg border-l-4 ${theme.border} p-3 sm:p-6 mb-4 bg-raised shadow-sm`}
      >
        {/* Header con botón de colapsar */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-medium text-primary">
            Pregunta {index + 1}
          </div>
          <button
            onClick={() => toggleEditarPregunta(pregunta.id)}
            className="p-2 rounded-lg transition-colors hover:bg-ui-hover text-action"
            title="Cerrar edición"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de tipo de pregunta */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-action">
            Seleccione el tipo de pregunta
          </label>
          <div className="relative">
            <button
              onClick={() => setMostrarSelectorTipo(mostrarSelectorTipo === pregunta.id ? null : pregunta.id)}
              className="flex items-center gap-2 px-4 py-3 rounded-lg border w-full justify-between bg-raised border-ui text-primary"
            >
              <div className="flex items-center gap-2">
                <span>{tiposPregunta.find(t => t.tipo === pregunta.tipo)?.icono}</span>
                <span>{tiposPregunta.find(t => t.tipo === pregunta.tipo)?.nombre}</span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </button>

            {mostrarSelectorTipo === pregunta.id && (
              <div className="absolute left-0 right-0 mt-2 rounded-lg border shadow-lg z-10 bg-raised border-ui">
                {tiposPregunta.map((tipo) => (
                  <button
                    key={tipo.tipo}
                    onClick={() => cambiarTipoPregunta(pregunta.id, tipo.tipo)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      pregunta.tipo === tipo.tipo
                        ? 'bg-raised text-primary'
                        : 'hover:bg-ui-hover text-primary'
                    }`}
                  >
                    <span className="text-xl">{tipo.icono}</span>
                    <span>{tipo.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor de pregunta e imagen */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-action">
            Pregunta
          </label>
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <div className="flex-1 w-full">
              <EditorTexto
                value={pregunta.titulo}
                onChange={(html) => actualizarPregunta(pregunta.id, { titulo: html })}
                darkMode={darkMode}
                placeholder="Escribe tu pregunta aquí..."
                minHeight="80px"
              />
            </div>

            <label className={`flex flex-row sm:flex-col items-center gap-2 sm:gap-1.5 px-4 py-2.5 rounded-lg cursor-pointer transition-all border-2 border-dashed sm:self-start sm:mt-0 w-full sm:w-auto justify-center ${
              darkMode
                ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700 text-gray-300 hover:text-white'
                : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-600'
            }`}>
              <ImageIcon className="w-5 h-5" />
              <span className="text-xs font-medium whitespace-nowrap">Subir imagen</span>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp"
                className="hidden"
                onChange={(e) => handleImagenCarga(pregunta.id, e)}
              />
            </label>
          </div>
          {imageError && (
            <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs dark:bg-red-900/30 dark:border-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{imageError}</span>
            </div>
          )}
        </div>

        {pregunta.imagen && (
          <div className="mb-4 relative">
            <img src={pregunta.imagen} alt="Pregunta" className="w-full max-w-3xl mx-auto rounded-lg" />
            <button
              onClick={() => eliminarImagen(pregunta.id)}
              className="absolute top-2 right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Contenido según tipo de pregunta */}
        {pregunta.tipo === 'seleccion-multiple' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-action">
              Opciones
            </label>
            <div className="space-y-2">
              {pregunta.opciones?.map((opcion, index) => (
                <div key={opcion.id} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleRespuestaCorrecta(pregunta.id, opcion.id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-all ${
                      opcion.esCorrecta
                        ? 'bg-green-500 border-green-500'
                        : darkMode 
                          ? 'border-gray-500 hover:border-green-400' 
                          : 'border-gray-400 hover:border-green-500'
                    }`}
                    title={opcion.esCorrecta ? 'Respuesta correcta' : 'Marcar como correcta'}
                  >
                    {opcion.esCorrecta && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <input
                    type="text"
                    value={opcion.texto}
                    onChange={(e) => actualizarOpcion(pregunta.id, opcion.id, e.target.value)}
                    className="flex-1 px-3 py-2 rounded border bg-raised border-ui text-primary"
                  />
                  {pregunta.opciones && pregunta.opciones.length > 1 && (
                    <button
                      onClick={() => eliminarOpcion(pregunta.id, opcion.id)}
                      className={`p-2 ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {pregunta.opciones && pregunta.opciones.length < 10 ? (
                <button
                  onClick={() => agregarOpcion(pregunta.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm text-accent ${
                    darkMode ? 'hover:text-blue-300' : 'hover:text-blue-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 ${
                    darkMode ? 'border-gray-500' : 'border-gray-400'
                  }`} />
                  <span>Agregar una opción</span>
                </button>
              ) : (
                <p className="text-sm italic text-muted">
                  Máximo 10 opciones alcanzado
                </p>
              )}
            </div>
          </div>
        )}

        {pregunta.tipo === 'rellenar-espacios' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-action">
              Texto completo
            </label>
            <div className="relative">
              {/* Capa de fondo con resaltado de palabras seleccionadas */}
              {pregunta.textoCompleto && pregunta.palabrasSeleccionadas && pregunta.palabrasSeleccionadas.length > 0 && (
                <div 
                  className={`absolute inset-0 px-4 py-3 rounded-lg pointer-events-none whitespace-pre-wrap break-words overflow-hidden`}
                  style={{ 
                    lineHeight: '1.5',
                    zIndex: 1,
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    letterSpacing: 'normal',
                    wordSpacing: 'normal'
                  }}
                  aria-hidden="true"
                >
                  {pregunta.textoCompleto.split(/(\s+)/).map((parte, idx) => {
                    // Si es un espacio, renderizarlo tal cual
                    if (/\s+/.test(parte)) {
                      return <span key={idx}>{parte}</span>;
                    }
                    
                    // Calcular el índice real de la palabra (sin contar espacios)
                    const palabrasAnteriores = pregunta.textoCompleto!
                      .substring(0, pregunta.textoCompleto!.indexOf(parte, idx > 0 ? pregunta.textoCompleto!.split(/(\s+)/).slice(0, idx).join('').length : 0))
                      .split(/\s+/)
                      .filter(p => p.trim().length > 0);
                    const indicePalabra = palabrasAnteriores.length;
                    
                    const estaSeleccionada = pregunta.palabrasSeleccionadas?.some(p => p.indice === indicePalabra);
                    
                    return (
                      <span 
                        key={idx}
                        className={estaSeleccionada 
                          ? darkMode 
                            ? 'bg-blue-500/30 border-b-2 border-blue-400 rounded-sm' 
                            : 'bg-blue-200/60 border-b-2 border-blue-500 rounded-sm'
                          : ''
                        }
                        style={{ color: 'transparent' }}
                      >
                        {parte}
                      </span>
                    );
                  })}
                </div>
              )}
              
              {/* Textarea editable encima */}
              <textarea
                value={pregunta.textoCompleto || ''}
                onChange={(e) => actualizarTextoCompleto(pregunta.id, e.target.value)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  manejarDobleClicPalabra(pregunta.id, e);
                }}
                placeholder="Escribe el texto aquí y luego haz doble clic en las palabras que quieres convertir en espacios en blanco..."
                rows={5}
                className="w-full px-4 py-3 rounded-lg border resize-none relative bg-transparent border-ui text-primary placeholder-gray-400"
                style={{ 
                  lineHeight: '1.5',
                  zIndex: 2,
                  position: 'relative',
                  backgroundColor: 'transparent',
                  fontSize: '16px'
                }}
              />
            </div>
            
            <div className={`mt-3 space-y-2`}>
              <p className="text-sm flex items-center gap-2 text-action">
                <span className="font-medium">💡 Instrucciones:</span>
                <span>Haz doble clic en cualquier palabra para seleccionarla como espacio en blanco. Máximo 10 palabras.</span>
              </p>
              
              {pregunta.textoCompleto && pregunta.palabrasSeleccionadas && pregunta.palabrasSeleccionadas.length > 0 && (
                <div className={`flex items-center gap-2 flex-wrap p-3 rounded-lg ${
                  darkMode ? 'bg-slate-600/50' : 'bg-blue-50'
                }`}>
                  <span className="text-sm font-medium text-secondary">
                    Espacios seleccionados ({pregunta.palabrasSeleccionadas.length}/10):
                  </span>
                  {pregunta.palabrasSeleccionadas.map((ps, idx) => (
                    <span 
                      key={idx}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium text-primary border border-blue-400 ${
                        darkMode ? 'bg-blue-500/40' : 'bg-blue-200'
                      }`}
                    >
                      <span>{ps.palabra}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          eliminarPalabraSeleccionada(pregunta.id, ps.indice);
                        }}
                        className={`hover:opacity-70 transition-opacity ${
                          darkMode ? 'text-white' : 'text-gray-700'
                        }`}
                        title="Eliminar"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {pregunta.palabrasSeleccionadas && pregunta.palabrasSeleccionadas.length >= 10 && (
                <p className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  ⚠️ Máximo de 10 espacios alcanzado
                </p>
              )}
            </div>
          </div>
        )}

        {pregunta.tipo === 'conectar' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-action">
              Pares de conexión
            </label>
            <div className="space-y-3">
              {pregunta.paresConexion?.map((par) => (
                <div key={par.id} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={par.izquierda}
                    onChange={(e) => actualizarParConexion(pregunta.id, par.id, 'izquierda', e.target.value)}
                    placeholder="Elemento izquierdo"
                    className="flex-1 px-3 py-2 rounded border bg-raised border-ui text-primary"
                  />
                  <span className="hidden sm:block text-2xl text-primary">⟷</span>
                  <input
                    type="text"
                    value={par.derecha}
                    onChange={(e) => actualizarParConexion(pregunta.id, par.id, 'derecha', e.target.value)}
                    placeholder="Elemento derecho"
                    className="flex-1 px-3 py-2 rounded border bg-raised border-ui text-primary"
                  />
                  {pregunta.paresConexion && pregunta.paresConexion.length > 1 && (
                    <button
                      onClick={() => eliminarParConexion(pregunta.id, par.id)}
                      className={`self-end sm:self-auto p-2 ${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {pregunta.paresConexion && pregunta.paresConexion.length < 10 ? (
                <button
                  onClick={() => agregarParConexion(pregunta.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm text-accent ${
                    darkMode ? 'hover:text-blue-300' : 'hover:text-blue-700'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar par</span>
                </button>
              ) : (
                <p className="text-sm italic text-muted">
                  Máximo 10 pares alcanzado
                </p>
              )}
            </div>
          </div>
        )}

        {pregunta.tipo === 'abierta' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-action">
              Método de evaluación
            </label>
            <div className="space-y-4">
              {/* Selector de método de evaluación */}
              <div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => cambiarMetodoEvaluacion(pregunta.id, 'manual')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      pregunta.metodoEvaluacion === 'manual'
                        ? darkMode
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-blue-600 bg-blue-50 text-gray-900'
                        : 'border-ui text-secondary hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm font-medium">Manual</div>
                    <div className={`text-sm mt-1 ${
                      pregunta.metodoEvaluacion === 'manual'
                        ? darkMode ? 'text-blue-300' : 'text-blue-600'
                        : darkMode ? 'text-gray-500' : 'text-gray-500'
                    }`}>
                      Calificación manual del profesor
                    </div>
                  </button>
                  
                  <button
                    onClick={() => cambiarMetodoEvaluacion(pregunta.id, 'palabras-clave')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      pregunta.metodoEvaluacion === 'palabras-clave'
                        ? darkMode
                          ? 'border-green-500 bg-green-500/10 text-white'
                          : 'border-green-600 bg-green-50 text-gray-900'
                        : 'border-ui text-secondary hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm font-medium">Palabras clave</div>
                    <div className={`text-sm mt-1 ${
                      pregunta.metodoEvaluacion === 'palabras-clave'
                        ? darkMode ? 'text-green-300' : 'text-green-600'
                        : darkMode ? 'text-gray-500' : 'text-gray-500'
                    }`}>
                      Busca términos en la respuesta
                    </div>
                  </button>
                  
                  <button
                    onClick={() => cambiarMetodoEvaluacion(pregunta.id, 'texto-exacto')}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                      pregunta.metodoEvaluacion === 'texto-exacto'
                        ? darkMode
                          ? 'border-purple-500 bg-purple-500/10 text-white'
                          : 'border-purple-600 bg-purple-50 text-gray-900'
                        : 'border-ui text-secondary hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm font-medium">Respuesta exacta</div>
                    <div className={`text-sm mt-1 ${
                      pregunta.metodoEvaluacion === 'texto-exacto'
                        ? darkMode ? 'text-purple-300' : 'text-purple-600'
                        : darkMode ? 'text-gray-500' : 'text-gray-500'
                    }`}>
                      Comparación textual exacta
                    </div>
                  </button>
                </div>
              </div>

              {/* Configuración según el método seleccionado */}
              {pregunta.metodoEvaluacion === 'palabras-clave' && (
                <div className="p-4 rounded-lg border bg-raised border-ui">
                  <p className="text-sm font-medium mb-3 text-secondary">
                    Define las palabras clave que deben aparecer (máximo 15):
                  </p>
                  
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={palabraClaveTemp}
                      onChange={(e) => setPalabraClaveTemp(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          agregarPalabraClave(pregunta.id);
                        }
                      }}
                      placeholder="Escribe una palabra clave..."
                      disabled={(pregunta.palabrasClave?.length || 0) >= 15}
                      className="flex-1 px-3 py-2 rounded border bg-raised border-ui text-primary placeholder-gray-400 disabled:opacity-50"
                    />
                    <button
                      onClick={() => agregarPalabraClave(pregunta.id)}
                      disabled={(pregunta.palabrasClave?.length || 0) >= 15}
                      className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white"
                    >
                      Agregar
                    </button>
                  </div>

                  {pregunta.palabrasClave && pregunta.palabrasClave.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {pregunta.palabrasClave.map((palabra, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                            darkMode 
                              ? 'bg-green-900/30 border border-green-700 text-green-300' 
                              : 'bg-green-100 border border-green-300 text-green-800'
                          }`}
                        >
                          <span className="text-sm font-medium">{palabra}</span>
                          <button
                            onClick={() => eliminarPalabraClave(pregunta.id, index)}
                            className="hover:opacity-70"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm italic text-muted">
                      No hay palabras clave definidas. Agrega al menos una.
                    </p>
                  )}

                  {pregunta.palabrasClave && pregunta.palabrasClave.length >= 15 && (
                    <p className={`text-sm mt-2 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      ⚠️ Máximo de 15 palabras clave alcanzado
                    </p>
                  )}

                  <p className="text-sm mt-3 text-muted">
                    💡 El sistema buscará estas palabras en la respuesta del estudiante. 
                    Se otorgarán puntos proporcionales según cuántas palabras clave se encuentren.
                  </p>
                </div>
              )}

              {pregunta.metodoEvaluacion === 'texto-exacto' && (
                <div className="p-4 rounded-lg border bg-raised border-ui">
                  <p className="text-sm font-medium mb-3 text-secondary">
                    Define la respuesta exacta esperada:
                  </p>
                  
                  <textarea
                    value={pregunta.textoExacto || ''}
                    onChange={(e) => {
                      if (e.target.value.length <= 3000) {
                        actualizarTextoExacto(pregunta.id, e.target.value);
                      }
                    }}
                    placeholder="Escribe la respuesta exacta que esperas del estudiante..."
                    maxLength={3000}
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg border resize-none bg-raised border-ui text-primary placeholder-gray-400"
                  />

                  {pregunta.textoExacto && pregunta.textoExacto.trim() !== '' ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className={`text-sm ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                        Respuesta configurada ({pregunta.textoExacto.length}/3000 caracteres)
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      <span className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                        Define la respuesta esperada (máximo 3000 caracteres)
                      </span>
                    </div>
                  )}

                  <p className="text-sm mt-3 text-muted">
                    💡 La respuesta del estudiante debe coincidir exactamente con este texto 
                    (se ignorarán espacios extra y mayúsculas/minúsculas).
                  </p>
                </div>
              )}

              {pregunta.metodoEvaluacion === 'manual' && (
                <div className="p-4 rounded-lg border bg-raised border-ui">
                  <p className="text-sm text-secondary">
                    Esta pregunta será calificada manualmente por el profesor.
                    No se requiere configuración de respuesta correcta.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {pregunta.tipo === 'subir-archivo' && (
          <div className="mb-4">
            <div className="p-4 rounded-lg border bg-raised border-ui">
              <div className="flex items-start gap-3">
                <Upload className="w-5 h-5 mt-0.5 shrink-0 text-action" />
                <div className="space-y-1">
                  <p className="text-sm text-secondary">
                    El estudiante deberá subir un archivo como respuesta. Esta pregunta siempre se
                    califica <span className="font-medium">manualmente</span>: revisarás el archivo
                    entregado y le asignarás el puntaje y la retroalimentación desde la vista de
                    calificación.
                  </p>
                  <p className="text-sm text-muted">
                    Formatos aceptados: PDF, Word, Excel, PowerPoint, texto, Markdown, CSV,
                    imágenes, comprimidos (ZIP/RAR/7z) y archivos de código o notebooks
                    (ipynb, py, js, ts, java, c, cpp, html, css, json, xml, sql, etc.).
                    Tamaño máximo por archivo: 20 MB.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clave de respuesta y puntos */}
        <div className="mb-4">
          <button
            onClick={() => setMostrarClaveRespuesta(mostrarClaveRespuesta === pregunta.id ? null : pregunta.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-accent hover:bg-ui-hover"
          >
            <Check className="w-4 h-4" />
            <span className="font-medium">Configuración de puntos</span>
            <span className="text-sm text-muted">
              ({pregunta.puntos} {pregunta.puntos === 1 ? 'punto' : 'puntos'})
            </span>
            {pregunta.tipo === 'rellenar-espacios' && (!pregunta.palabrasSeleccionadas || pregunta.palabrasSeleccionadas.length === 0) && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700'
              }`}>
                Sin espacios
              </span>
            )}
          </button>

          {mostrarClaveRespuesta === pregunta.id && (
            <div className="mt-3 p-4 rounded-lg border bg-raised border-ui">
              {pregunta.tipo === 'seleccion-multiple' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-secondary">
                      Puntos de la pregunta:
                    </label>
                    <input
                      type="text"
                      value={puntosTemp[pregunta.id] !== undefined ? puntosTemp[pregunta.id] : pregunta.puntos}
                      onChange={(e) => {
                        const valor = e.target.value;
                        if (valor === '' || /^[0-9]*[.,]?[0-9]*$/.test(valor)) {
                          setPuntosTemp({...puntosTemp, [pregunta.id]: valor});
                        }
                      }}
                      onFocus={() => {
                        if (puntosTemp[pregunta.id] === undefined) {
                          setPuntosTemp({...puntosTemp, [pregunta.id]: String(pregunta.puntos)});
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={() => {
                        const valor = puntosTemp[pregunta.id] || String(pregunta.puntos);
                        const numero = parseFloat(valor.replace(',', '.'));

                        if (valor === '' || isNaN(numero) || numero < 0) {
                          actualizarPregunta(pregunta.id, { puntos: 1 });
                          setPuntosTemp({...puntosTemp, [pregunta.id]: '1'});
                        } else {
                          actualizarPregunta(pregunta.id, { puntos: numero });
                          const temp = {...puntosTemp};
                          delete temp[pregunta.id];
                          setPuntosTemp(temp);
                        }
                      }}
                      className="w-32 px-3 py-2 rounded border bg-raised border-ui text-primary"
                    />
                  </div>

                  {(pregunta.opciones?.filter(o => o.esCorrecta).length || 0) >= 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-sm font-medium text-secondary">
                        Calificación parcial:
                      </label>
                      <div className="relative group">
                        <HelpCircle className="w-5 h-5 text-muted cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-normal" style={{ minWidth: '280px' }}>
                          Se otorgarán puntos proporcionales por respuestas parcialmente correctas
                          <div className="absolute left-3 -bottom-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCalificacionParcial(pregunta.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-all w-40 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'border-teal-500 bg-teal-500/10' 
                            : 'border-slate-700 bg-slate-700/10'
                          : darkMode
                            ? 'border-slate-600 hover:border-slate-500'
                            : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'bg-teal-500 border-teal-500' 
                            : 'bg-slate-700 border-slate-700'
                          : darkMode
                            ? 'border-gray-500'
                            : 'border-gray-400'
                      }`}>
                        {pregunta.calificacionParcial && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {pregunta.calificacionParcial ? 'Activada' : 'Desactivada'}
                      </span>
                    </button>
                  </div>
                  )}
                </div>
              )}

              {/* Input de puntos y opción de calificación parcial - NO para selección múltiple */}
              {pregunta.tipo !== 'seleccion-multiple' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-secondary">
                    Puntos de la pregunta:
                  </label>
                  <input
                    type="text"
                    value={puntosTemp[pregunta.id] !== undefined ? puntosTemp[pregunta.id] : pregunta.puntos}
                    onChange={(e) => {
                      const valor = e.target.value;
                      if (valor === '' || /^[0-9]*[.,]?[0-9]*$/.test(valor)) {
                        setPuntosTemp({...puntosTemp, [pregunta.id]: valor});
                      }
                    }}
                    onFocus={() => {
                      if (puntosTemp[pregunta.id] === undefined) {
                        setPuntosTemp({...puntosTemp, [pregunta.id]: String(pregunta.puntos)});
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={() => {
                      const valor = puntosTemp[pregunta.id] || String(pregunta.puntos);
                      const numero = parseFloat(valor.replace(',', '.'));
                      
                      if (valor === '' || isNaN(numero) || numero < 0) {
                        actualizarPregunta(pregunta.id, { puntos: 0 });
                        setPuntosTemp({...puntosTemp, [pregunta.id]: '0'});
                      } else {
                        actualizarPregunta(pregunta.id, { puntos: numero });
                        const temp = {...puntosTemp};
                        delete temp[pregunta.id];
                        setPuntosTemp(temp);
                      }
                    }}
                    className="w-32 px-3 py-2 rounded border bg-raised border-ui text-primary"
                  />
                </div>

                {/* Opción de calificación parcial */}
                {permiteCalificacionParcial &&
                 ((pregunta.tipo === 'rellenar-espacios' && (pregunta.palabrasSeleccionadas?.length || 0) >= 2) ||
                  (pregunta.tipo === 'conectar' && (pregunta.paresConexion?.length || 0) >= 2)) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-sm font-medium text-secondary">
                        Calificación parcial:
                      </label>
                      <div className="relative group">
                        <HelpCircle className="w-5 h-5 text-muted cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg" style={{ minWidth: '280px' }}>
                          Se otorgarán puntos proporcionales por respuestas parcialmente correctas
                          <div className="absolute left-3 -bottom-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCalificacionParcial(pregunta.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-all w-40 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'border-teal-500 bg-teal-500/10' 
                            : 'border-slate-700 bg-slate-700/10'
                          : darkMode
                            ? 'border-slate-600 hover:border-slate-500'
                            : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'bg-teal-500 border-teal-500' 
                            : 'bg-slate-700 border-slate-700'
                          : darkMode
                            ? 'border-gray-500'
                            : 'border-gray-400'
                      }`}>
                        {pregunta.calificacionParcial && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {pregunta.calificacionParcial ? 'Activada' : 'Desactivada'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Calificación parcial para pregunta abierta */}
                {pregunta.tipo === 'abierta' && pregunta.metodoEvaluacion === 'palabras-clave' && (pregunta.palabrasClave?.length || 0) >= 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-sm font-medium text-secondary">
                        Calificación parcial:
                      </label>
                      <div className="relative group">
                        <HelpCircle className="w-5 h-5 text-muted cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg" style={{ minWidth: '280px' }}>
                          {pregunta.metodoEvaluacion === 'palabras-clave' 
                            ? 'Se otorgarán puntos proporcionales según cuántas palabras clave se encuentren en la respuesta del estudiante'
                            : 'La respuesta del estudiante debe coincidir exactamente con el texto especificado para obtener puntos (sin puntos parciales)'}
                          <div className="absolute left-3 -bottom-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCalificacionParcial(pregunta.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 transition-all w-40 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'border-teal-500 bg-teal-500/10' 
                            : 'border-slate-700 bg-slate-700/10'
                          : darkMode
                            ? 'border-slate-600 hover:border-slate-500'
                            : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        pregunta.calificacionParcial
                          ? darkMode 
                            ? 'bg-teal-500 border-teal-500' 
                            : 'bg-slate-700 border-slate-700'
                          : darkMode
                            ? 'border-gray-500'
                            : 'border-gray-400'
                      }`}>
                        {pregunta.calificacionParcial && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {pregunta.calificacionParcial ? 'Activada' : 'Desactivada'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            onClick={() => duplicarPregunta(pregunta.id)}
            className="p-2 rounded-lg transition-colors hover:bg-ui-hover text-secondary"
            title="Duplicar"
          >
            <Copy className="w-5 h-5" />
          </button>
          <button
            onClick={() => eliminarPregunta(pregunta.id)}
            className="p-2 rounded-lg transition-colors hover:bg-ui-hover text-secondary"
            title="Eliminar"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderizarPreguntaVista = (pregunta: Pregunta, index: number) => {
    const tieneRespuestasConfiguradas = () => {
      if (pregunta.tipo === 'seleccion-multiple') {
        return pregunta.opciones?.some(o => o.esCorrecta) || false;
      }
      if (pregunta.tipo === 'abierta') {
        if (pregunta.metodoEvaluacion === 'manual') return true;
        if (pregunta.metodoEvaluacion === 'palabras-clave') {
          return pregunta.palabrasClave && pregunta.palabrasClave.length > 0;
        }
        if (pregunta.metodoEvaluacion === 'texto-exacto') {
          return pregunta.textoExacto && pregunta.textoExacto.trim() !== '';
        }
        return false;
      }
      if (pregunta.tipo === 'rellenar-espacios') {
        return pregunta.palabrasSeleccionadas && pregunta.palabrasSeleccionadas.length > 0;
      }
      if (pregunta.tipo === 'conectar') {
        return pregunta.paresConexion && pregunta.paresConexion.length > 0 &&
               pregunta.paresConexion.every(p => p.izquierda && p.derecha);
      }
      if (pregunta.tipo === 'subir-archivo') {
        return true;
      }
      return false;
    };

    const configurada = tieneRespuestasConfiguradas();
    const theme = getTheme(index);

    return (
      <div
        className={`group relative rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden mb-6 border-ui ${
          darkMode
            ? "bg-slate-800/60 hover:border-blue-700/80"
            : "bg-white hover:shadow-lg hover:border-blue-300"
        } ${dragIndex === index ? 'opacity-40 scale-[0.98]' : ''}`}
      >
        {/* Contenido de la pregunta */}
        <div
          onClick={() => toggleEditarPregunta(pregunta.id)}
          className="relative cursor-pointer min-w-0"
        >
          {/* Drag Handle */}
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              setDragIndex(index);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragOverIndex(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg cursor-grab active:cursor-grabbing z-20 opacity-0 group-hover:opacity-100 transition-opacity ${
              darkMode ? 'hover:bg-slate-700 text-slate-500 hover:text-slate-300' : 'hover:bg-gray-100 text-gray-300 hover:text-gray-500'
            }`}
            title="Arrastrar para reordenar"
          >
            <GripVertical className="w-5 h-5" />
          </div>

          {/* Indicador de Vista Previa / Edición */}
          <div className="absolute top-0 right-0 px-4 py-2 rounded-bl-2xl text-sm font-medium flex items-center gap-2 transition-colors z-10 bg-raised text-muted group-hover:bg-blue-500 group-hover:text-white">
              <span>Vista previa</span>
              <Pencil className="w-4 h-4" />
          </div>

          {/* Barra lateral de estado (decorativa) con color dinámico */}
          <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${theme.gradient}`}></div>

          <div className="p-3 sm:p-6 md:p-8 pl-5 sm:pl-8 md:pl-10">
          {/* Encabezado de la Pregunta */}
          <div className="flex items-start gap-4 mb-6">
            <span className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm shrink-0 transition-all duration-300 ${
              configurada
                ? (darkMode ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50" : "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200")
                : "bg-raised text-secondary"
            }`}>
              {index + 1}
            </span>
            <div className="flex-1">
              <div
                className={`text-xl font-medium font-serif leading-snug text-primary prose prose-sm max-w-none ${darkMode ? "prose-invert" : ""}`}
                dangerouslySetInnerHTML={{ __html: pregunta.titulo || '<span class="opacity-50">Pregunta sin título</span>' }}
              />
              
              <div className="flex flex-wrap gap-2 mt-3">
                <span className={`inline-block text-sm font-semibold px-3 py-1.5 rounded text-muted ${darkMode ? "bg-slate-700/50" : "bg-white border border-gray-100"}`}>
                  {pregunta.puntos} {pregunta.puntos === 1 ? "punto" : "puntos"}
                </span>
                {!configurada && (
                  <span className={`inline-block text-sm font-semibold px-3 py-1.5 rounded ${darkMode ? "bg-yellow-900/30 text-yellow-400 border border-yellow-700/50" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
                    ⚠️ Sin configurar
                  </span>
                )}
                {pregunta.calificacionParcial && (
                  <span className={`inline-block text-sm font-semibold px-3 py-1.5 rounded ${darkMode ? "bg-teal-900/30 text-teal-400 border border-teal-700/50" : "bg-teal-50 text-teal-700 border border-teal-200"}`}>
                    📊 Parcial
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Imagen Opcional */}
          {pregunta.imagen && (
            <div className={`mb-6 rounded-xl overflow-hidden border flex justify-center p-4 border-ui ${darkMode ? "bg-slate-900/50" : "bg-white"}`}>
              <img
                src={pregunta.imagen}
                alt="Referencia visual"
                className="max-h-80 object-contain rounded-lg shadow-sm"
              />
            </div>
          )}

          {/* Cuerpo de la pregunta según tipo */}
          <div className="mt-4">
            {pregunta.tipo === 'seleccion-multiple' && (
              <div className="grid grid-cols-1 gap-3">
                {pregunta.opciones?.map((option) => (
                  <div
                    key={option.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 border-ui ${darkMode ? "bg-slate-800/40" : "bg-white"}`}
                  >
                    <div className="w-5 h-5 rounded border-2 flex items-center justify-center border-ui">
                    </div>
                    <span className="flex-1 font-medium text-secondary">
                      {option.texto}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {pregunta.tipo === 'rellenar-espacios' && (
              <div className={`p-6 rounded-xl border leading-loose text-lg border-ui ${darkMode ? "bg-slate-800/50" : "bg-white"}`}>
                {generarTextoConEspacios(pregunta).split("___").map((parte, idx, arr) => (
                  <span key={idx}>
                    <span className="text-secondary">{parte}</span>
                    {idx < arr.length - 1 && (
                      <span className="relative inline-block mx-1">
                        <input
                          type="text"
                          disabled
                          className="w-32 px-2 py-1 text-center border-b-2 outline-none rounded-t font-medium bg-raised border-ui text-muted"
                        />
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {pregunta.tipo === 'conectar' && (
              <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-800/50 border-slate-700/80" : "bg-white border-gray-200"}`}>
                <div className="flex flex-col md:flex-row justify-between gap-8 md:gap-12">
                  {/* Columna A */}
                  <div className="flex-1 space-y-4">
                    <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 text-center">Columna A</div>
                    {pregunta.paresConexion?.map((par, idx) => (
                      <div
                        key={`a-${par.id}`}
                        className={`p-4 rounded-xl border-2 flex items-center justify-between border-ui ${darkMode ? "bg-slate-800/80" : "bg-white"}`}
                      >
                        <span className="font-medium text-secondary">{par.izquierda}</span>
                        <div className={`w-3 h-3 rounded-full border-2 ${darkMode ? "bg-slate-700 border-slate-500" : "bg-white border-gray-300"}`}></div>
                      </div>
                    ))}
                  </div>
                  {/* Columna B */}
                  <div className="flex-1 space-y-4">
                    <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2 text-center">Columna B</div>
                    {pregunta.paresConexion?.map((par, idx) => (
                      <div
                        key={`b-${par.id}`}
                        className={`p-4 rounded-xl border-2 flex items-center border-ui ${darkMode ? "bg-slate-800/80" : "bg-white"}`}
                      >
                        <div className={`w-3 h-3 rounded-full border-2 mr-auto ${darkMode ? "bg-slate-700 border-slate-500" : "bg-white border-gray-300"}`}></div>
                        <span className="font-medium text-right flex-1 text-secondary">{par.derecha}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {pregunta.tipo === 'abierta' && (
              <div className="flex flex-col gap-3">
                <textarea
                  disabled
                  className={`w-full min-h-[140px] p-4 rounded-xl border-2 outline-none resize-y placeholder-slate-400 border-ui text-primary ${darkMode ? "bg-slate-800/70" : "bg-gray-50"}`}
                  placeholder="El estudiante escribirá su respuesta aquí..."
                />
                {pregunta.metodoEvaluacion && (
                  <div className="flex justify-end">
                    <span className={`text-sm px-3 py-1.5 rounded-full border ${
                      pregunta.metodoEvaluacion === 'palabras-clave'
                        ? (darkMode ? "bg-green-900/30 text-green-400 border-green-700" : "bg-green-100 text-green-700 border-green-300")
                        : pregunta.metodoEvaluacion === 'texto-exacto'
                          ? (darkMode ? "bg-purple-900/30 text-purple-400 border-purple-700" : "bg-purple-100 text-purple-700 border-purple-300")
                          : (darkMode ? "bg-blue-900/30 text-blue-400 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-300")
                    }`}>
                      {pregunta.metodoEvaluacion === 'palabras-clave'
                        ? 'Evaluación por palabras clave'
                        : pregunta.metodoEvaluacion === 'texto-exacto'
                          ? 'Evaluación por respuesta exacta'
                          : 'Evaluación manual'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {pregunta.tipo === 'subir-archivo' && (
              <div className="flex flex-col gap-3">
                <div className={`w-full min-h-[140px] p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center border-ui ${darkMode ? "bg-slate-800/70 text-slate-400" : "bg-gray-50 text-gray-500"}`}>
                  <Upload className="w-8 h-8" />
                  <span className="text-sm">El estudiante subirá aquí su archivo de respuesta</span>
                </div>
                <div className="flex justify-end">
                  <span className={`text-sm px-3 py-1.5 rounded-full border ${darkMode ? "bg-blue-900/30 text-blue-400 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-300"}`}>
                    Evaluación manual
                  </span>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {preguntas.map((pregunta, index) => {
        const isNew = preguntasNuevas.has(pregunta.id);
        const isClosing = preguntasCerrando.has(pregunta.id);
        const isEditing = preguntasEditando.has(pregunta.id);
        const isTransitioning = preguntasTransicionando.has(pregunta.id);
        return (
          <div
            key={pregunta.id}
            className={`${isClosing ? 'anim-collapseUp' : isTransitioning ? 'anim-fadeOut' : isNew ? 'anim-slideDown' : ''}`}
            onDragOver={(e) => {
              if (dragIndex === null || isEditing) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverIndex(index);
            }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === index) {
                setDragIndex(null);
                setDragOverIndex(null);
                return;
              }
              const nuevasPreguntas = [...preguntas];
              const [moved] = nuevasPreguntas.splice(dragIndex, 1);
              nuevasPreguntas.splice(index, 0, moved);
              setPreguntas(nuevasPreguntas);
              setDragIndex(null);
              setDragOverIndex(null);
            }}
          >
            {/* Drop indicator line */}
            {dragOverIndex === index && dragIndex !== null && dragIndex !== index && (
              <div className={`h-1 rounded-full mx-4 mb-2 transition-all ${darkMode ? 'bg-blue-500' : 'bg-blue-400'}`} />
            )}
            {isEditing
              ? renderizarPreguntaEdicion(pregunta, index)
              : renderizarPreguntaVista(pregunta, index)}
          </div>
        );
      })}

      <button
        onClick={crearNuevaPregunta}
        className={`w-full py-4 rounded-lg border-2 border-dashed transition-colors border-ui text-action ${
          darkMode
            ? 'hover:border-slate-500 hover:text-gray-300'
            : 'hover:border-gray-400 hover:text-gray-700'
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" />
          <span className="font-medium">Agregar pregunta</span>
        </div>
      </button>

      {/* Estilos globales */}
      <style>{`
        .prose ul,
        .prose ol {
          padding-left: 2em !important;
          margin: 0.5em 0 !important;
          list-style-position: outside !important;
        }
        
        .prose ul {
          list-style-type: disc !important;
        }
        
        .prose ol {
          list-style-type: decimal !important;
        }
        
        .prose li {
          display: list-item !important;
          margin: 0.25em 0 !important;
        }
        
        .prose ul li {
          list-style-type: disc !important;
        }
        
        .prose ol li {
          list-style-type: decimal !important;
        }

        .prose p {
          font-weight: normal !important;
        }

        .prose h1,
        .prose h2,
        .prose h3,
        .prose h4,
        .prose h5,
        .prose h6 {
          font-weight: normal !important;
        }

        .prose a {
          color: #3b82f6;
          text-decoration: underline;
        }

        .prose strong {
          font-weight: 700 !important;
        }

        .prose em {
          font-style: italic !important;
        }

        .prose u {
          text-decoration: underline !important;
        }

        .prose s {
          text-decoration: line-through !important;
        }

        .prose [style*="text-align: center"] {
          text-align: center;
        }

        .prose [style*="text-align: right"] {
          text-align: right;
        }

        .prose [style*="text-align: justify"] {
          text-align: justify;
        }
      `}</style>
    </div>
  );
}