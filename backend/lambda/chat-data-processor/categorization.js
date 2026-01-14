/**
 * Question Categorization Module
 *
 * Provides AI-powered and keyword-based categorization for diabetes-related questions
 *
 * Flow:
 * 1. Primary: AI categorization using Claude Haiku (detects language + category)
 * 2. Fallback: Keyword-based classification when AI fails or returns invalid category
 *
 * Categories:
 * - 14 educational categories (general diabetes information)
 * - 4 safety categories (require human escalation)
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-west-2' });

// All valid categories
const CATEGORIES = [
  'type-1-diabetes',
  'type-2-diabetes',
  'gestational-diabetes',
  'prediabetes',
  'symptoms-diagnosis',
  'blood-sugar-management',
  'insulin-medication',
  'diet-nutrition',
  'exercise-lifestyle',
  'complications',
  'emergency-care',
  'insurance-coverage',
  'general-information',
  'non-diabetes-related',
  // Safety categories (questions that should escalate)
  'personal-medical-advice',
  'dosing-instructions',
  'result-interpretation',
  'emergency-medical'
];

/**
 * Categorize question AND detect language using AI (single Haiku call)
 * This replaces separate Comprehend language detection + Haiku categorization
 */
async function categorizeAndDetectLanguage(question, knownLanguage = null) {
  try {
    // Enhanced prompt with safety category distinctions
    const prompt = `Analyze this question and respond with TWO pieces of information in JSON format:
1. Language code: "en" for English or "es" for Spanish
2. Category: ONE of these categories: ${CATEGORIES.join(', ')}

CATEGORY RULES:

EDUCATIONAL CATEGORIES (general information, can answer):
- type-1-diabetes, type-2-diabetes, gestational-diabetes, prediabetes: General info about diabetes types
- symptoms-diagnosis: What symptoms look like (educational, NOT "do I have this?")
- blood-sugar-management: Understanding blood sugar, monitoring basics
- insulin-medication: Types of insulin/medications, how they work (NOT dosing)
- diet-nutrition: Meal planning, carb counting, food choices
- exercise-lifestyle: Exercise tips, lifestyle management
- complications: What complications can occur (educational)
- emergency-care: Recognizing emergencies, when to seek help (NOT active emergencies)
- insurance-coverage: Insurance, costs, assistance programs
- general-information: Basic diabetes questions
- non-diabetes-related: Weather, sports, politics, other topics

SAFETY CATEGORIES (should escalate to human):
- personal-medical-advice: "Should I take medication?", "Do I have diabetes?", treatment decisions
- dosing-instructions: "How much insulin?", "Should I change my dose?", specific dosing questions
- result-interpretation: "Is my A1C of X bad?", "What does my reading mean?", interpreting specific results
- emergency-medical: Active emergencies, "I'm having chest pain", "blood sugar 400 and vomiting"

KEY DISTINCTIONS:
- "What is hypoglycemia?" → emergency-care (educational)
- "I think I'm having hypoglycemia, what should I do?" → emergency-medical (active emergency)
- "What medications treat Type 2?" → insulin-medication (educational)
- "Should I take metformin?" → personal-medical-advice (treatment decision)
- "How does insulin work?" → insulin-medication (educational)
- "How much Lantus should I take?" → dosing-instructions (personal dosing)
- "What is a normal A1C?" → blood-sugar-management (educational)
- "Is my A1C of 8.1 bad?" → result-interpretation (personal result)

Examples:
- "What is diabetes?" → {"language": "en", "category": "general-information"}
- "What should I eat with diabetes?" → {"language": "en", "category": "diet-nutrition"}
- "Should I start taking insulin?" → {"language": "en", "category": "personal-medical-advice"}
- "Is my A1C of 7.8 bad?" → {"language": "en", "category": "result-interpretation"}
- "How much insulin should I take tonight?" → {"language": "en", "category": "dosing-instructions"}
- "I'm vomiting and my blood sugar is 450" → {"language": "en", "category": "emergency-medical"}
- "What's the weather?" → {"language": "en", "category": "non-diabetes-related"}
- "¿Qué debo comer?" → {"language": "es", "category": "diet-nutrition"}
- "¿Debo tomar metformina?" → {"language": "es", "category": "personal-medical-advice"}

Respond ONLY with valid JSON in this exact format: {"language": "en", "category": "category-name"}

Question: "${question}"`;

    const bedrockCommand = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 100,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    const response = await bedrockRuntime.send(bedrockCommand);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    const responseText = result.content[0].text.trim();

    // Parse JSON response
    const parsed = JSON.parse(responseText);
    const detectedLanguage = parsed.language || knownLanguage || 'en';
    const category = parsed.category?.toLowerCase();

    // Validate category
    if (CATEGORIES.includes(category)) {
      return { category, detectedLanguage };
    } else {
      // Fallback to keyword-based classification
      const fallbackCategory = classifyByKeywords(question, detectedLanguage);
      return { category: fallbackCategory, detectedLanguage };
    }

  } catch (error) {
    console.error('AI categorization and language detection failed, falling back:', error);
    // Use heuristic fallback for both language and category
    const detectedLanguage = knownLanguage || detectLanguageFallback(question);
    const category = classifyByKeywords(question, detectedLanguage);
    return { category, detectedLanguage };
  }
}

/**
 * Fallback keyword-based categorization
 */
function classifyByKeywords(question, language = 'en') {
  const lowerQuestion = question.toLowerCase();

  // Safety category patterns (check first - highest priority)
  const safetyPatterns = {
    // Emergency medical (check first - highest priority)
    'emergency-medical': [
      'chest pain', 'dolor pecho', 'vomiting', 'vomitando', 'unconscious', 'inconsciente',
      'can\'t breathe', 'no puedo respirar', 'passing out', 'desmayando', 'severe pain',
      'blood sugar 400', 'azúcar 400', 'blood sugar 500', 'azúcar 500', 'blood sugar 600',
      'feeling faint', 'mareo', 'can\'t stop shaking', 'severe abdominal', 'confusion and',
      'won\'t wake up'
    ],
    // Dosing instructions (check before personal-medical-advice)
    'dosing-instructions': [
      'how much insulin', 'cuánta insulina', 'how many units', 'cuántas unidades',
      'what dose', 'qué dosis', 'increase dose', 'aumentar dosis', 'decrease dose',
      'increase my insulin', 'decrease my insulin', 'dose of', 'dosis de',
      'insulin-to-carb ratio', 'units of', 'unidades de', 'how much novolog',
      'how much lantus', 'how much humalog'
    ],
    // Result interpretation (check before blood-sugar-management)
    'result-interpretation': [
      'is my', 'es mi', 'my a1c is', 'mi a1c es', 'my blood sugar is', 'mi azúcar es',
      'my reading is', 'mi lectura es', 'my fasting', 'mi ayuno',
      'is this normal', 'es esto normal', 'is this bad', 'es esto malo', 'is this good', 'es esto bueno',
      'is that okay', 'está bien', 'is that high', 'es alto', 'is that low', 'es bajo',
      'blood sugar of', 'azúcar de', 'a1c of', 'reading of', 'lectura de',
      'fasting glucose is', 'glucosa en ayunas es'
    ],
    // Personal medical advice (check last among safety)
    'personal-medical-advice': [
      'should i start', 'debo empezar', 'should i stop', 'debo dejar',
      'do i have', 'tengo diabetes', 'am i diabetic', 'soy diabético',
      'can i stop', 'puedo dejar', 'switch to', 'cambiar a',
      'should i see', 'debo ver', 'do i need to go on', 'necesito tomar',
      'should i take medication', 'debo tomar medicamento'
    ]
  };

  // Check safety patterns first
  for (const [category, keywords] of Object.entries(safetyPatterns)) {
    for (const keyword of keywords) {
      if (lowerQuestion.includes(keyword)) {
        return category;
      }
    }
  }

  // Educational category patterns (ordered by specificity)
  const keywordPatterns = {
    'type-1-diabetes': [
      'type 1', 'tipo 1', 't1d', 'insulin dependent', 'insulino dependiente',
      'autoimmune', 'autoinmune', 'juvenile diabetes', 'diabetes juvenil'
    ],
    'type-2-diabetes': [
      'type 2', 'tipo 2', 't2d', 'adult onset', 'diabetes adulto',
      'insulin resistance', 'resistencia insulina'
    ],
    'gestational-diabetes': [
      'gestational', 'gestacional', 'pregnancy', 'embarazo', 'pregnant', 'embarazada'
    ],
    'prediabetes': [
      'prediabetes', 'prediabético', 'borderline', 'pre diabetes', 'pre diabetic'
    ],
    'insurance-coverage': [
      'insurance', 'seguro', 'coverage', 'cobertura', 'afford', 'pagar',
      'medicare', 'medicaid', 'expensive', 'caro', 'assistance program',
      'programa de asistencia', 'how much does', 'cuánto cuesta', 'cost of'
    ],
    'symptoms-diagnosis': [
      'symptom', 'síntoma', 'diagnos', 'diagnóstico', 'signs of', 'señales de',
      'thirsty', 'sed', 'urinate', 'orinar', 'tired', 'cansado',
      'blurred vision', 'visión borrosa', 'what are signs', 'cuáles son los signos'
    ],
    'emergency-care': [
      'what is hypoglycemia', 'qué es hipoglucemia', 'what is ketoacidosis',
      'what is dka', 'signs of low blood sugar', 'treat low blood sugar',
      'when should i go to', 'cuándo debo ir', 'recognize emergency',
      'reconocer emergencia'
    ],
    'exercise-lifestyle': [
      'exercise', 'ejercicio', 'workout', 'entrenamiento', 'physical activity', 'actividad física',
      'lifestyle', 'estilo vida', 'weight', 'peso', 'fitness', 'lift weights', 'levantar pesas'
    ],
    'diet-nutrition': [
      'diet', 'dieta', 'nutrition', 'nutrición', 'meal', 'comida',
      'carb', 'carbohidrato', 'carbohydrate',
      'should i eat', 'puedo comer', 'what to eat', 'qué comer',
      'can i eat', 'debo comer', 'food', 'alimento',
      'glycemic index', 'índice glucémico', 'count carbs', 'contar carbohidratos'
    ],
    'complications': [
      'complication', 'complicación', 'neuropathy', 'neuropatía', 'retinopathy', 'retinopatía',
      'kidney disease', 'enfermedad renal', 'diabetic foot', 'pie diabético',
      'heart disease', 'enfermedad cardíaca', 'wound', 'herida'
    ],
    'blood-sugar-management': [
      'what is normal', 'qué es normal', 'what is a1c', 'qué es a1c',
      'how do i check', 'cómo verifico', 'how often should i test', 'con qué frecuencia',
      'target range', 'rango objetivo', 'what is cgm', 'qué es cgm',
      'glucometer', 'glucómetro', 'monitor blood sugar', 'monitorear azúcar'
    ],
    'insulin-medication': [
      'types of insulin', 'tipos de insulina', 'what is insulin', 'qué es insulina',
      'how does insulin work', 'cómo funciona insulina', 'insulin pump', 'bomba de insulina',
      'what is metformin', 'qué es metformina', 'rapid acting', 'acción rápida',
      'long acting', 'acción prolongada', 'what medications', 'qué medicamentos'
    ]
  };

  // Check each category for keyword matches
  for (const [category, keywords] of Object.entries(keywordPatterns)) {
    for (const keyword of keywords) {
      if (lowerQuestion.includes(keyword)) {
        return category;
      }
    }
  }

  // Check if question mentions diabetes-related terms
  // If yes → general-information (generic diabetes question)
  // If no → non-diabetes-related (catch-all for off-topic)
  const diabetesKeywords = [
    'diabetes', 'diabetic', 'diabético', 'insulin', 'insulina',
    'glucose', 'glucosa', 'blood sugar', 'azúcar sangre', 'a1c',
    'hemoglobin', 'hemoglobina', 'pancreas', 'páncreas', 'metformin', 'metformina'
  ];

  const isDiabetesRelated = diabetesKeywords.some(keyword =>
    lowerQuestion.includes(keyword)
  );

  return isDiabetesRelated ? 'general-information' : 'non-diabetes-related';
}

/**
 * Simple language detection fallback using common Spanish patterns
 */
function detectLanguageFallback(text) {
  const spanishPatterns = [
    '¿', '¡', 'qué', 'cómo', 'dónde', 'cuándo', 'por qué',
    'diabetes', 'azúcar', 'insulina', 'medicamento'
  ];

  const lowerText = text.toLowerCase();
  const hasSpanishPattern = spanishPatterns.some(pattern =>
    lowerText.includes(pattern)
  );

  return hasSpanishPattern ? 'es' : 'en';
}

module.exports = {
  categorizeAndDetectLanguage,
  classifyByKeywords,
  detectLanguageFallback,
  CATEGORIES
};
