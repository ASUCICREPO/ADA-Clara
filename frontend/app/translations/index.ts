export const translations = {
  en: {
    welcome: {
      title: 'Welcome to ADA Clara!',
      intro: "Hi, I'm Clara, your diabetes information assistant! I'm here to help you understand diabetes using trusted resources from the American Diabetes Association. Whether you have questions about symptoms, management, nutrition, or prevention, I'm here to help. What would you like to know?",
    },
    disclaimer: {
      title: 'Important Medical Information',
      text: 'Clara provides general information only and does not offer medical advice, diagnosis, or treatment. Always consult your healthcare provider for medical decisions. In emergencies, call',
    },
    quickQuestions: {
      title: 'Quick Questions',
      questions: [
        { label: 'What is Diabetes?', question: 'What is diabetes and what are the different types?' },
        { label: 'Blood Sugar Levels', question: 'What should my blood sugar levels be and how do I monitor them?' },
        { label: 'Symptoms & Signs', question: 'What are the common symptoms and warning signs of diabetes?' },
        { label: 'Diet & Nutrition', question: 'What foods should I eat and avoid if I have diabetes?' },
        { label: 'Exercise Tips', question: 'How does exercise affect diabetes and what activities are recommended?' },
        { label: 'Prevention', question: 'How can I prevent diabetes or reduce my risk?' },
      ],
    },
    input: {
      placeholder: 'Ask a question about diabetes…',
      send: 'Send',
    },
  },
  es: {
    welcome: {
      title: '¡Bienvenido a ADA Clara!',
      intro: '¡Hola, soy Clara, tu asistente de información sobre diabetes! Estoy aquí para ayudarte a entender la diabetes utilizando recursos confiables de la Asociación Americana de Diabetes. Ya sea que tengas preguntas sobre síntomas, manejo, nutrición o prevención, estoy aquí para ayudar. ¿Qué te gustaría saber?',
    },
    disclaimer: {
      title: 'Información Médica Importante',
      text: 'Clara proporciona solo información general y no ofrece consejos médicos, diagnósticos ni tratamientos. Siempre consulta a tu proveedor de atención médica para decisiones médicas. En emergencias, llama al',
    },
    quickQuestions: {
      title: 'Preguntas Rápidas',
      questions: [
        { label: '¿Qué es la Diabetes?', question: '¿Qué es la diabetes y cuáles son los diferentes tipos?' },
        { label: 'Niveles de Azúcar', question: '¿Cuáles deberían ser mis niveles de azúcar en sangre y cómo los monitoreo?' },
        { label: 'Síntomas y Señales', question: '¿Cuáles son los síntomas comunes y señales de advertencia de la diabetes?' },
        { label: 'Dieta y Nutrición', question: '¿Qué alimentos debo comer y evitar si tengo diabetes?' },
        { label: 'Consejos de Ejercicio', question: '¿Cómo afecta el ejercicio a la diabetes y qué actividades se recomiendan?' },
        { label: 'Prevención', question: '¿Cómo puedo prevenir la diabetes o reducir mi riesgo?' },
      ],
    },
    input: {
      placeholder: 'Haz una pregunta sobre diabetes…',
      send: 'Enviar',
    },
  },
};

export type TranslationKey = keyof typeof translations.en;

