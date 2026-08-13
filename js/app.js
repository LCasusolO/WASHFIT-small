const { createApp, ref, computed, onMounted, nextTick } = Vue;

// Función de compresión y redimensionado usando HTML5 Canvas
const compressImage = (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar proporcionalmente
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a Base64 JPEG comprimido
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = (error) => reject(error);
    };

    reader.onerror = (error) => reject(error);
  });
};

createApp({
  setup() {
    // Active Navigation state
    const activeView = ref('instructions');
    const activeModuleTab = ref('water');
    const mobileMenuOpen = ref(false);
    
    // REQUERIMIENTO: Iniciar sin la selección de sólo brechas
    const filterOnlyGaps = ref(false); 
    
    // REQUERIMIENTO: Estado para controlar el ordenamiento manual por columna Riesgo
    const sortRiskOrder = ref('none'); // 'none' | 'desc' | 'asc'

    const sidebarCollapsed = ref(false);

    // Estado reactivo para control de impresión consolidada completa desde Resumen
    const isPrintingAll = ref(false);

    // Estado y funciones para el visor modal (Lightbox) de fotografías
    const selectedPhoto = ref(null);

    const openPhotoModal = (photo) => {
      selectedPhoto.value = photo;
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const closePhotoModal = () => {
      selectedPhoto.value = null;
    };

    // Toast Notifications helper state
    const toast = ref({
      show: false,
      message: '',
      type: 'success'
    });

    const triggerToast = (message, type = 'success') => {
      toast.value.message = message;
      toast.value.type = type;
      toast.value.show = true;
      setTimeout(() => {
        toast.value.show = false;
      }, 4000);
    };

    const modulesList = [
      { id: 'water', name: 'Agua', shortName: 'Agua (W)', color: 'bg-paho-blue', hex: '#008DC9' },
      { id: 'sanitation', name: 'Saneamiento', shortName: 'Saneam. (S)', color: 'bg-emerald-600', hex: '#059669' },
      { id: 'waste', name: 'Residuos Hospitalarios', shortName: 'Residuos (HCWM)', color: 'bg-amber-600', hex: '#d97706' },
      { id: 'hygiene', name: 'Higiene de Manos', shortName: 'Higiene (H)', color: 'bg-purple-600', hex: '#7c3aed' },
      { id: 'cleaning', name: 'Limpieza Hospitalaria', shortName: 'Limpieza (EC)', color: 'bg-teal-600', hex: '#0d9488' }
    ];

    const generalInfo = ref({
      facilityName: 'Hospital Materno Infantil San José',
      district: 'Lima, Perú',
      latitude: -12.1485,
      longitude: -76.9841,
      level: 'Primer Nivel',
      type: 'Público',
      setting: 'Urbano',
      populationServed: 15000,
      ageGroups: {
        under5: null,
        age5to17: null,
        over18to59: null,
        over60: null,
      },
      sanitationSystem: null,
      selectedS9Option: null,
      evaluationDate: new Date().toISOString().substr(0, 10),
      summary: '',
      team: [
        { name: 'Dra. Elena Rostova', role: 'Directora de Epidemiología', institution: 'MINSA', responsibility: 'Coordinador WASH', email: 'elena.rostova@minsa.gob.pe', isEditing: false }
      ],
      photos: []
    });

    const indicators = ref(INDICATORS_DATA);

    const answeredCount = computed(() => {
      return indicators.value.filter(ind => ind.score !== null).length;
    });

    const progressPercentage = computed(() => {
      if (indicators.value.length === 0) return 0;
      return Math.round((answeredCount.value / indicators.value.length) * 100);
    });

    const totalGaps = computed(() => {
      return indicators.value.filter(ind => ind.score === 0 || ind.score === 1).length;
    });

    const totalScoreAchieved = computed(() => {
      return indicators.value.reduce((acc, ind) => {
        return acc + (ind.score !== null ? ind.score : 0);
      }, 0);
    });

    const overallCompliance = computed(() => {
      const evaluated = indicators.value.filter(ind => ind.score !== null);
      if (evaluated.length === 0) return 0;
      const maxPossible = evaluated.length * 2;
      const sum = evaluated.reduce((acc, ind) => acc + ind.score, 0);
      return Math.round((sum / maxPossible) * 100);
    });

    const getFilteredIndicatorsByModule = computed(() => {
      const dom = modulesList.find(d => d.id === activeModuleTab.value);
      if (!dom) return [];
      return indicators.value.filter(ind => ind.module === dom.name);
    });

    const getActiveModuleProgressPercentage = computed(() => {
      const name = getActiveModuleName.value;
      const total = getModuleTotalCount(name);
      if (total === 0) return 0;
      return Math.round((getModuleAnsweredCount(name) / total) * 100);
    });

    const toggleRiskSort = () => {
      if (sortRiskOrder.value === 'none') {
        sortRiskOrder.value = 'desc';
      } else if (sortRiskOrder.value === 'desc') {
        sortRiskOrder.value = 'asc';
      } else {
        sortRiskOrder.value = 'none';
      }
    };

    const getSortedGaps = computed(() => {
      let list = indicators.value;
      if (filterOnlyGaps.value) {
        list = list.filter(ind => ind.score === 0 || ind.score === 1);
      } else {
        list = list.filter(ind => ind.score !== null);
      }
      
      let result = [...list];

      if (sortRiskOrder.value !== 'none') {
        result.sort((a, b) => {
          const riskA = (a.severity && a.likelihood) ? (a.severity * a.likelihood) : 0;
          const riskB = (b.severity && b.likelihood) ? (b.severity * b.likelihood) : 0;
          return sortRiskOrder.value === 'desc' ? riskB - riskA : riskA - riskB;
        });
      }

      return result;
    });

    const trackingSummary = computed(() => {
      const gaps = indicators.value.filter(ind => ind.score === 0 || ind.score === 1);
      const counts = { noIniciado: 0, enProgreso: 0, completado: 0, retrasado: 0 };
      gaps.forEach(g => {
        if (g.trackingStatus === 'En Progreso') counts.enProgreso++;
        else if (g.trackingStatus === 'Completado') counts.completado++;
        else if (g.trackingStatus === 'Retrasado') counts.retrasado++;
        else counts.noIniciado++;
      });
      return counts;
    });

    const planProgressPercentage = computed(() => {
      const gaps = indicators.value.filter(ind => ind.score === 0 || ind.score === 1);
      if (gaps.length === 0) return 100;
      const completed = gaps.filter(g => g.trackingStatus === 'Completado').length;
      const inProgress = gaps.filter(g => g.trackingStatus === 'En Progreso').length;
      const score = (completed * 1.0) + (inProgress * 0.5);
      return Math.round((score / gaps.length) * 100);
    });

    const focusedCostId = ref(null);
    const isPopFocused = ref(false);

    const updatePopulation = (value) => {
      const cleanValue = value.replace(/,/g, '');
      if (cleanValue === '') {
        generalInfo.value.populationServed = null;
      } else {
        const parsed = parseInt(cleanValue, 10);
        generalInfo.value.populationServed = isNaN(parsed) ? null : parsed;
      }
    };

    const focusedAgeGroup = ref(null);

    const updateAgeGroup = (key, value) => {
      const cleanValue = value.replace(/,/g, '');
      if (cleanValue === '') {
        generalInfo.value.ageGroups[key] = null;
      } else {
        const parsed = parseInt(cleanValue, 10);
        generalInfo.value.ageGroups[key] = isNaN(parsed) ? null : parsed;
      }
    };

    const formatThousands = (val) => {
      if (val === null || val === undefined || val === '') return '';
      return new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
      }).format(val);
    };

    const updateCost = (ind, value) => {
      const cleanValue = value.replace(/,/g, '');
      if (cleanValue === '') {
        ind.cost = null;
      } else {
        const parsed = parseFloat(cleanValue);
        ind.cost = isNaN(parsed) ? null : parsed;
      }
    };

    const jmpCalculatedStatus = computed(() => {
      const getScore = (code) => {
        const item = indicators.value.find(i => i.code === code);
        return item && item.score !== null ? Number(item.score) : 0;
      };

      // 1. MÓDULO AGUA
      const a1 = getScore('A_1');
      const a3 = getScore('A_3');

      let water = { status: 'Sin Servicio', class: 'bg-red-50 text-red-800 border-red-300' };
      
      if (a1 === 2 && a3 === 2) {
        water = { status: 'Básico', class: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
      } else if (a1 >= 1) {
        water = { status: 'Limitado', class: 'bg-amber-50 text-amber-800 border-amber-300' };
      }

      // 2. MÓDULO SANEAMIENTO
      const s1 = getScore('S_1');
      const s2 = getScore('S_2');
      const s4 = getScore('S_4');
      const s5 = getScore('S_5');
      const s6 = getScore('S_6');
      const s7 = getScore('S_7');

      const hasImprovedToilets = (s1 >= 1 || s2 >= 1);
      const meetsAllBasicCriteria = (s1 === 2 || s2 === 2) && 
                                    s4 === 2 && 
                                    s5 === 2 && 
                                    s6 === 2 && 
                                    s7 === 2;

      let sanitation = { status: 'Sin Servicio', class: 'bg-red-50 text-red-800 border-red-300' };

      if (hasImprovedToilets) {
        if (meetsAllBasicCriteria) {
          sanitation = { status: 'Básico', class: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
        } else {
          sanitation = { status: 'Limitado', class: 'bg-amber-50 text-amber-800 border-amber-300' };
        }
      }

      // 3. MÓDULO HIGIENE DE MANOS
      const h1 = getScore('H_1');
      const h2 = getScore('H_2');
      const s3 = getScore('S_3');

      const handCarePoint = (h1 === 2);
      const handToilet = (h2 === 2 || s3 === 2);

      let hygiene = { status: 'Sin Servicio', class: 'bg-red-50 text-red-800 border-red-300' };

      if (handCarePoint && handToilet) {
        hygiene = { status: 'Básico', class: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
      } else if (handCarePoint || handToilet || h1 === 1 || h2 === 1 || s3 === 1) {
        hygiene = { status: 'Limitado', class: 'bg-amber-50 text-amber-800 border-amber-300' };
      }

      // 4. MÓDULO RESIDUOS HOSPITALARIOS
      const res1 = getScore('RES_1');
      const res2 = getScore('RES_2');
      const res14 = getScore('RES_14');

      const hasSegregation = (res1 === 2 || res2 === 2);
      const hasTreatment = (res14 === 2);

      let waste = { status: 'Sin Servicio', class: 'bg-red-50 text-red-800 border-red-300' };

      if (hasSegregation && hasTreatment) {
        waste = { status: 'Básico', class: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
      } else if (hasSegregation || hasTreatment || res1 === 1 || res2 === 1 || res14 === 1) {
        waste = { status: 'Limitado', class: 'bg-amber-50 text-amber-800 border-amber-300' };
      }

      // 5. MÓDULO LIMPIEZA HOSPITALARIA
      const l1 = getScore('L_1');
      const l5 = getScore('L_5');

      let cleaning = { status: 'Sin Servicio', class: 'bg-red-50 text-red-800 border-red-300' };

      if (l1 === 2 && l5 === 2) {
        cleaning = { status: 'Básico', class: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
      } else if (l1 >= 1 || l5 >= 1) {
        cleaning = { status: 'Limitado', class: 'bg-amber-50 text-amber-800 border-amber-300' };
      }

      return { water, sanitation, hygiene, waste, cleaning };
    });

    const radarChartData = computed(() => {
      const cx = 375;
      const cy = 240;
      const rMax = 150;
      const angles = [0, 1, 2, 3, 4].map(i => (i * 2 * Math.PI / 5) - Math.PI / 2);
      
      const levels = [20, 40, 60, 80, 100].map(levelPercent => {
        const r = rMax * (levelPercent / 100);
        return angles.map(angle => ({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle)
        }));
      });

      const axes = angles.map(angle => ({
        x1: cx,
        y1: cy,
        x2: cx + rMax * Math.cos(angle),
        y2: cy + rMax * Math.sin(angle)
      }));

      const points = modulesList.map((mod, i) => {
        const pct = getModulePercentage(mod.name);
        const r = rMax * (pct / 100);
        const angle = angles[i];
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        
        const labelRadius = rMax + 18;
        let lx = cx + labelRadius * Math.cos(angle);
        let ly = cy + labelRadius * Math.sin(angle);
        
        let anchor = 'middle';
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        if (cos > 0.2) {
          anchor = 'start';
        } else if (cos < -0.2) {
          anchor = 'end';
        } else {
          anchor = 'middle';
        }

        if (sin < -0.9) {
          ly -= 10;
        } else if (sin > 0.9) {
          ly += 12;
        } else if (sin < 0) {
          ly -= 5;
        } else {
          ly += 5;
        }

        return {
          x,
          y,
          lx,
          ly,
          anchor,
          pct,
          label: mod.name,
          color: mod.hex
        };
      });

      const polygonString = points.map(p => `${p.x},${p.y}`).join(' ');

      return {
        cx,
        cy,
        rMax,
        levels,
        axes,
        points,
        polygonString
      };
    });

    const getViewTitle = computed(() => {
      switch (activeView.value) {
        case 'instructions': return 'Instrucciones y Metodología';
        case 'general': return 'Paso 1: Datos Generales del Establecimiento';
        case 'assessment': return 'Paso 2: Evaluación de la Situación';
        case 'step3': return 'Paso 3: Evaluación del Riesgo';
        case 'step4': return 'Paso 4: Plan de Mejora';
        case 'step5': return 'Paso 5: Monitoreo y Revisión del Plan';
        case 'dashboard': return 'Resumen';
        default: return 'WASH-FIT Suite';
      }
    });

    const getActiveModuleName = computed(() => {
      const found = modulesList.find(d => d.id === activeModuleTab.value);
      return found ? found.name : 'Agua';
    });

    const getModuleAnsweredCount = (moduleName) => {
      return indicators.value.filter(i => i.module === moduleName && i.score !== null).length;
    };

    const getModuleScoreAchieved = (moduleName) => {
      return indicators.value
        .filter(i => i.module === moduleName && i.score !== null)
        .reduce((sum, i) => sum + i.score, 0);
    };

    const getModulePercentage = (moduleName) => {
      const answered = getModuleAnsweredCount(moduleName);
      if (answered === 0) return 0;
      const score = getModuleScoreAchieved(moduleName);
      return Math.round((score / (answered * 2)) * 100);
    };

    const navigateNextModule = () => {
      const currentIndex = modulesList.findIndex(d => d.id === activeModuleTab.value);
      const nextIndex = (currentIndex + 1) % modulesList.length;
      activeModuleTab.value = modulesList[nextIndex].id;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      triggerToast(`Navegando al módulo: ${modulesList[nextIndex].name}`, 'success');
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const clearCurrentModule = () => {
      const currentModuleName = getActiveModuleName.value;
      const moduleIndicators = indicators.value.filter(i => i.module === currentModuleName);
      
      moduleIndicators.forEach(ind => {
        ind.score = null;
        ind.notes = '';
        ind.problemDesc = '';
        ind.associatedRisks = '';
        ind.severity = null;
        ind.likelihood = null;
        ind.action = '';
        ind.targetDate = '';
        ind.resources = '';
        ind.responsible = '';
        ind.cost = null;
        ind.trackingStatus = 'No Iniciado';
        ind.revisionNotes = '';
        ind.indicatorChange = 'sin_cambios';
        ind.correctiveMeasures = '';
        ind.nextReviewDate = '';
        ind.monitoringComments = '';
      });
      
      triggerToast(`Se ha eliminado todo el llenado y seleccionado para el Módulo de ${currentModuleName}.`, 'success');
      
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const calculateRiskScore = (ind) => {
      if (ind.severity === null || ind.likelihood === null || ind.severity === '' || ind.likelihood === '') {
        return null;
      }
      return ind.severity * ind.likelihood;
    };

    const getRiskColorClass = (score) => {
      if (score === null || score === undefined) return 'bg-gray-50 text-gray-400 border-gray-200';
      if (score >= 15) return 'bg-red-50 text-red-900 border-red-300';
      if (score >= 8) return 'bg-amber-50 text-amber-900 border-amber-300';
      return 'bg-emerald-50 text-emerald-900 border-emerald-300';
    };

    const getRiskLabel = (score) => {
      if (score === null || score === undefined) return 'Sin evaluar';
      if (score >= 15) return 'Extremo';
      if (score >= 8) return 'Moderado';
      return 'Bajo';
    };

    const getStatusColorClass = (status) => {
      if (status === 'Completado') return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
      if (status === 'En Progreso') return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
      if (status === 'Retrasado') return 'bg-red-50 text-red-800 border-red-300 font-bold';
      return 'bg-paho-card text-paho-gray-dark border-paho-grid';
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const addTeamMember = () => {
      generalInfo.value.team.push({
        name: '',
        role: '',
        institution: '',
        responsibility: '',
        email: '',
        isEditing: true
      });
      triggerToast('Fila de integrante creada. Llene los datos y haga clic en "Confirmar".', 'success');
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const confirmTeamMember = (index) => {
      const member = generalInfo.value.team[index];
      if (!member.name.trim()) {
        triggerToast('El nombre del integrante es obligatorio.', 'error');
        return;
      }
      member.isEditing = false;
      triggerToast('Integrante confirmado y guardado en el equipo.', 'success');
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const editTeamMember = (index) => {
      generalInfo.value.team[index].isEditing = true;
      triggerToast('Modificando registro del integrante.', 'success');
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const removeTeamMember = (index) => {
      generalInfo.value.team.splice(index, 1);
      triggerToast('Integrante removido del equipo.', 'error');
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const shouldShowIndicator = (ind) => {
      if (ind.code === 'S_8') {
        if (generalInfo.value.sanitationSystem === 'alcantarillado') {
          return false;
        }
        return true; 
      }

      if (ind.code === 'S_9a' || ind.code === 'S_9b') {
        if (generalInfo.value.sanitationSystem === 'alcantarillado') {
          return false;
        }
        const s8 = indicators.value.find(i => i.code === 'S_8');
        const s8Evaluated = s8 && s8.score !== null;
        if (generalInfo.value.sanitationSystem === 'insitu' && s8Evaluated) {
          return generalInfo.value.selectedS9Option === ind.code;
        }
        return false; 
      }

      if (ind.code === 'S_13') {
        const s11 = indicators.value.find(i => i.code === 'S_11');
        return s11 && (s11.score === 1 || s11.score === 2);
      }

      return true;
    };

    const setIndicatorScore = (ind, score) => {
      if (ind.score === score) {
        ind.score = null;
        ind.problemDesc = '';
        ind.associatedRisks = '';
        ind.severity = null;
        ind.likelihood = null;
        ind.action = '';
        ind.targetDate = '';
        ind.resources = '';
        ind.responsible = '';
        ind.cost = null;
        ind.trackingStatus = 'No Iniciado';
        
        triggerToast(`Se desmarcó la puntuación del indicador ${ind.code}.`, 'info');
        
        nextTick(() => {
          if (window.lucide) window.lucide.createIcons();
        });
        return;
      }

      ind.score = score;

      if (ind.code === 'S_11' && score !== 1 && score !== 2) {
        const s13 = indicators.value.find(i => i.code === 'S_13');
        if (s13) {
          s13.score = null;
          s13.notes = '';
        }
      }

      if (score === 0 || score === 1) {
        if (ind.severity === undefined) ind.severity = null;
        if (ind.likelihood === undefined) ind.likelihood = null;
      }
      
      triggerToast(`Indicador ${ind.code} puntuado con éxito (${score} pts).`, 'success');
      
      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const setSanitationSystem = (type) => {
      generalInfo.value.sanitationSystem = type;
      if (type === 'alcantarillado') {
        generalInfo.value.selectedS9Option = null;
        const s8 = indicators.value.find(i => i.code === 'S_8');
        const s9a = indicators.value.find(i => i.code === 'S_9a');
        const s9b = indicators.value.find(i => i.code === 'S_9b');
        if (s8) s8.score = null;
        if (s9a) s9a.score = null;
        if (s9b) s9b.score = null;
      } else if (type === 'insitu' && !generalInfo.value.selectedS9Option) {
        generalInfo.value.selectedS9Option = 'S_9a';
      }
    };

    const getModuleTotalCount = (moduleName) => {
      return indicators.value.filter(i => i.module === moduleName && shouldShowIndicator(i)).length;
    };

    const triggerMockUpload = () => {
      const fileInputElement = document.getElementById('real-file-input');
      if (fileInputElement) {
        fileInputElement.click();
      }
    };

    // MODIFICADO: Procesa imágenes mediante compresión e intercala string Base64 permanente
    const handleFileChange = async (event) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      triggerToast('Procesando y optimizando imágenes...', 'info');

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          triggerToast(`El archivo "${file.name}" no es una imagen válida.`, 'error');
          continue;
        }

        try {
          // Comprime la imagen a máx 1200px (ancho/alto) y calidad 70%
          const compressedBase64 = await compressImage(file, 1200, 1200, 0.7);

          const cleanName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

          generalInfo.value.photos.push({
            name: `${cleanName}.jpg`,
            url: compressedBase64
          });
        } catch (error) {
          triggerToast(`Error al procesar la imagen "${file.name}".`, 'error');
        }
      }

      triggerToast('Evidencia fotográfica cargada y optimizada exitosamente.', 'success');
      event.target.value = '';

      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    // MODIFICADO: Eliminación directa sin necesidad de revocación de Blob
    const removePhoto = (index) => {
      generalInfo.value.photos.splice(index, 1);
      triggerToast('Evidencia fotográfica removida.', 'error');
    };

    const exportData = () => {
      const dataset = {
        generalInfo: generalInfo.value,
        indicators: indicators.value
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataset, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `WASH_FIT_Evaluacion_${generalInfo.value.facilityName.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      triggerToast('Configuración y evaluación exportada exitosamente.', 'success');
    };

    const importData = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (imported.generalInfo && imported.indicators) {
            if (imported.generalInfo.team) {
              imported.generalInfo.team.forEach(t => {
                if (t.isEditing === undefined) t.isEditing = false;
              });
            }
            imported.indicators.forEach(ind => {
              if (ind.trackingStatus === undefined) ind.trackingStatus = 'No Iniciado';
              if (ind.revisionNotes === undefined) ind.revisionNotes = '';
              if (ind.associatedRisks === undefined) ind.associatedRisks = '';
              if (ind.indicatorChange === undefined) ind.indicatorChange = 'sin_cambios';
              if (ind.correctiveMeasures === undefined) ind.correctiveMeasures = '';
              if (ind.nextReviewDate === undefined) ind.nextReviewDate = '';
              if (ind.monitoringComments === undefined) ind.monitoringComments = '';
            });
            generalInfo.value = imported.generalInfo;
            indicators.value = imported.indicators;
            triggerToast('Evaluación e importación completa.', 'success');
            nextTick(() => {
              if (window.lucide) window.lucide.createIcons();
            });
          } else {
            triggerToast('El archivo no tiene el formato estándar de WASH-FIT.', 'error');
          }
        } catch (err) {
          triggerToast('Error al procesar el archivo JSON importado.', 'error');
        }
      };
      reader.readAsText(file);
    };

    const switchView = (viewName) => {
      activeView.value = viewName;
      mobileMenuOpen.value = false;

      if (viewName === 'general') {
        nextTick(() => {
          if (mapInstance) {
            mapInstance.invalidateSize();
            if (generalInfo.value.latitude && generalInfo.value.longitude) {
              mapInstance.setView([generalInfo.value.latitude, generalInfo.value.longitude], mapInstance.getZoom());
            }
          } else {
            initMap();
          }
        });
      }

      nextTick(() => {
        if (window.lucide) window.lucide.createIcons();
      });
    };

    const printReport = () => {
      if (activeView.value === 'dashboard') {
        isPrintingAll.value = true;
        triggerToast('Generando reporte consolidado completo...', 'info');
        nextTick(() => {
          setTimeout(() => {
            window.print();
            setTimeout(() => {
              isPrintingAll.value = false;
            }, 500);
          }, 300);
        });
      } else {
        window.print();
      }
    };

    let mapInstance = null;
    let markerInstance = null;

    const initMap = () => {
      if (!window.L) return;

      nextTick(() => {
        const mapDom = document.getElementById('map-container');
        if (!mapDom) return;

        if (mapInstance) {
          mapInstance.invalidateSize();
          return;
        }

        const latInit = generalInfo.value.latitude || -12.1485;
        const lngInit = generalInfo.value.longitude || -76.9841;

        mapInstance = L.map('map-container').setView([latInit, lngInit], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance);

        markerInstance = L.marker([latInit, lngInit], { draggable: true }).addTo(mapInstance);

        const updateCoordinates = (lat, lng) => {
          generalInfo.value.latitude = parseFloat(lat.toFixed(6));
          generalInfo.value.longitude = parseFloat(lng.toFixed(6));
        };

        markerInstance.on('dragend', (e) => {
          const pos = markerInstance.getLatLng();
          updateCoordinates(pos.lat, pos.lng);
        });

        mapInstance.on('click', (e) => {
          markerInstance.setLatLng(e.latlng);
          updateCoordinates(e.latlng.lat, e.latlng.lng);
        });
      });
    };

    const onCoordinatesInput = () => {
      const lat = parseFloat(generalInfo.value.latitude);
      const lng = parseFloat(generalInfo.value.longitude);

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        if (mapInstance && markerInstance) {
          markerInstance.setLatLng([lat, lng]);
          mapInstance.setView([lat, lng], mapInstance.getZoom());
        }
      }
    };

    onMounted(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
      if (activeView.value === 'general') {
        initMap();
      }
    });

    const facilityValuation = computed(() => {
      const pct = overallCompliance.value;
      if (pct > 75) {
        return {
          label: 'Mejora Avanzada',
          colorClass: 'text-emerald-700'
        };
      } else if (pct >= 60) {
        return {
          label: 'En Proceso de Mejora',
          colorClass: 'text-amber-700'
        };
      } else {
        return {
          label: 'Requiere Mejoras Prioritarias',
          colorClass: 'text-rose-700'
        };
      }
    });

    return {
      activeView,
      activeModuleTab,
      mobileMenuOpen,
      sidebarCollapsed,
      filterOnlyGaps,
      sortRiskOrder,
      toggleRiskSort,
      calculateRiskScore,
      toast,
      modulesList,
      generalInfo,
      indicators,
      answeredCount,
      progressPercentage,
      totalGaps,
      totalScoreAchieved,
      overallCompliance,
      getFilteredIndicatorsByModule,
      getActiveModuleProgressPercentage,
      getSortedGaps,
      jmpCalculatedStatus,
      radarChartData,
      getViewTitle,
      getActiveModuleName,
      setIndicatorScore,
      getModuleTotalCount,
      getModuleAnsweredCount,
      getModuleScoreAchieved,
      getModulePercentage,
      navigateNextModule,
      getRiskColorClass,
      getRiskLabel,
      addTeamMember,
      confirmTeamMember,
      editTeamMember,
      removeTeamMember,
      triggerMockUpload,
      handleFileChange,
      removePhoto,
      exportData,
      importData,
      switchView,
      printReport,
      clearCurrentModule,
      onCoordinatesInput,
      trackingSummary,
      planProgressPercentage,
      getStatusColorClass,
      formatDate,
      isPopFocused,
      updatePopulation,
      focusedAgeGroup,
      updateAgeGroup,
      focusedCostId,
      formatThousands,
      updateCost,
      shouldShowIndicator,
      setSanitationSystem,
      facilityValuation,
      isPrintingAll,
      selectedPhoto,
      openPhotoModal,
      closePhotoModal
    };
  }
}).mount('#app');
