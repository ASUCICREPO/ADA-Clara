/**
 * Shared Constants for Admin Analytics
 *
 * Contains display names and mappings for diabetes question categories
 * Used across multiple analytics functions to ensure consistency
 */

/**
 * Display names for all 18 question categories (14 educational + 4 safety)
 * Safety categories are marked with ⚠️ to indicate escalation
 */
const CATEGORY_DISPLAY_NAMES = {
  // Educational categories (14)
  'type-1-diabetes': 'Type 1 Diabetes',
  'type-2-diabetes': 'Type 2 Diabetes',
  'gestational-diabetes': 'Gestational Diabetes',
  'prediabetes': 'Prediabetes',
  'symptoms-diagnosis': 'Symptoms & Diagnosis',
  'blood-sugar-management': 'Blood Sugar Management',
  'insulin-medication': 'Insulin & Medication',
  'diet-nutrition': 'Diet & Nutrition',
  'exercise-lifestyle': 'Exercise & Lifestyle',
  'complications': 'Complications',
  'emergency-care': 'Emergency Care',
  'insurance-coverage': 'Insurance & Coverage',
  'general-information': 'General Information',
  'non-diabetes-related': 'Non-Diabetes Related',

  // Safety categories (4) - require human escalation
  'personal-medical-advice': 'Personal Medical Advice ⚠️',
  'dosing-instructions': 'Dosing Instructions ⚠️',
  'result-interpretation': 'Result Interpretation ⚠️',
  'emergency-medical': 'Emergency Medical ⚠️'
};

module.exports = {
  CATEGORY_DISPLAY_NAMES
};
