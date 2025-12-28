/**
 * Validation Service for Admin Analytics API
 * Provides comprehensive parameter validation and sanitization
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enumValues?: string[];
  customValidator?: (value: any) => boolean;
  sanitizer?: (value: any) => any;
}

export class ValidationService {
  
  /**
   * Validate query parameters for dashboard endpoint
   */
  validateDashboardParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'startDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'endDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'type',
        type: 'enum',
        required: false,
        enumValues: ['chat', 'escalation', 'performance', 'user']
      },
      {
        field: 'granularity',
        type: 'enum',
        required: false,
        enumValues: ['hourly', 'daily', 'weekly', 'monthly']
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate query parameters for conversation analytics
   */
  validateConversationParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'startDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'endDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'language',
        type: 'enum',
        required: false,
        enumValues: ['en', 'es', 'all']
      },
      {
        field: 'limit',
        type: 'number',
        required: false,
        min: 1,
        max: 1000,
        sanitizer: (value) => Math.min(Math.max(parseInt(value) || 50, 1), 1000)
      },
      {
        field: 'offset',
        type: 'number',
        required: false,
        min: 0,
        sanitizer: (value) => Math.max(parseInt(value) || 0, 0)
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate conversation ID parameter
   */
  validateConversationId(conversationId: string): ValidationResult {
    const errors: string[] = [];

    if (!conversationId) {
      errors.push('Conversation ID is required');
    } else if (typeof conversationId !== 'string') {
      errors.push('Conversation ID must be a string');
    } else if (conversationId.length < 10 || conversationId.length > 100) {
      errors.push('Conversation ID must be between 10 and 100 characters');
    } else if (!/^[a-zA-Z0-9-_]+$/.test(conversationId)) {
      errors.push('Conversation ID contains invalid characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: conversationId?.trim()
    };
  }

  /**
   * Validate question analysis parameters
   */
  validateQuestionParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'startDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'endDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'category',
        type: 'string',
        required: false,
        max: 50,
        sanitizer: (value) => value?.trim()
      },
      {
        field: 'limit',
        type: 'number',
        required: false,
        min: 1,
        max: 100,
        sanitizer: (value) => Math.min(Math.max(parseInt(value) || 20, 1), 100)
      },
      {
        field: 'includeUnanswered',
        type: 'boolean',
        required: false,
        sanitizer: (value) => value === 'true' || value === true
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate escalation analytics parameters
   */
  validateEscalationParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'startDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'endDate',
        type: 'date',
        required: false,
        sanitizer: (value) => this.sanitizeDate(value)
      },
      {
        field: 'priority',
        type: 'enum',
        required: false,
        enumValues: ['low', 'medium', 'high', 'critical']
      },
      {
        field: 'status',
        type: 'enum',
        required: false,
        enumValues: ['pending', 'in_progress', 'resolved', 'cancelled']
      },
      {
        field: 'granularity',
        type: 'enum',
        required: false,
        enumValues: ['hourly', 'daily', 'weekly', 'monthly']
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate search parameters
   */
  validateSearchParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'query',
        type: 'string',
        required: true,
        min: 1,
        max: 500,
        sanitizer: (value) => value?.trim()
      },
      {
        field: 'searchIn',
        type: 'array',
        required: false,
        customValidator: (value) => {
          if (!value) return true;
          const validTypes = ['conversations', 'questions', 'messages'];
          const searchTypes = Array.isArray(value) ? value : value.split(',');
          return searchTypes.every((type: string) => validTypes.includes(type.trim()));
        }
      },
      {
        field: 'fuzzyMatch',
        type: 'boolean',
        required: false,
        sanitizer: (value) => value === 'true' || value === true
      },
      {
        field: 'caseSensitive',
        type: 'boolean',
        required: false,
        sanitizer: (value) => value === 'true' || value === true
      },
      {
        field: 'maxResults',
        type: 'number',
        required: false,
        min: 1,
        max: 1000,
        sanitizer: (value) => Math.min(Math.max(parseInt(value) || 100, 1), 1000)
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate export parameters
   */
  validateExportParams(params: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'format',
        type: 'enum',
        required: false,
        enumValues: ['json', 'csv', 'xlsx']
      },
      {
        field: 'dataTypes',
        type: 'array',
        required: false,
        customValidator: (value) => {
          if (!value) return true;
          const validTypes = ['conversations', 'messages', 'questions', 'escalations'];
          const dataTypes = Array.isArray(value) ? value : value.split(',');
          return dataTypes.every((type: string) => validTypes.includes(type.trim()));
        }
      },
      {
        field: 'maxRecords',
        type: 'number',
        required: false,
        min: 1,
        max: 100000,
        sanitizer: (value) => Math.min(Math.max(parseInt(value) || 10000, 1), 100000)
      },
      {
        field: 'compressOutput',
        type: 'boolean',
        required: false,
        sanitizer: (value) => value === 'true' || value === true
      }
    ];

    return this.validateParams(params, rules);
  }

  /**
   * Validate date range
   */
  validateDateRange(startDate?: string, endDate?: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedStartDate: string | undefined;
    let sanitizedEndDate: string | undefined;

    if (startDate) {
      const sanitizedStart = this.sanitizeDate(startDate);
      if (!sanitizedStart) {
        errors.push('Invalid start date format. Use YYYY-MM-DD');
      } else {
        sanitizedStartDate = sanitizedStart;
      }
    }

    if (endDate) {
      const sanitizedEnd = this.sanitizeDate(endDate);
      if (!sanitizedEnd) {
        errors.push('Invalid end date format. Use YYYY-MM-DD');
      } else {
        sanitizedEndDate = sanitizedEnd;
      }
    }

    // Validate date range logic
    if (sanitizedStartDate && sanitizedEndDate) {
      const start = new Date(sanitizedStartDate);
      const end = new Date(sanitizedEndDate);
      
      if (start > end) {
        errors.push('Start date must be before or equal to end date');
      }
      
      // Check if date range is too large (more than 1 year)
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        errors.push('Date range cannot exceed 365 days');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: {
        startDate: sanitizedStartDate,
        endDate: sanitizedEndDate
      }
    };
  }

  // Private helper methods

  private validateParams(params: any, rules: ValidationRule[]): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: any = {};

    for (const rule of rules) {
      const value = params[rule.field];
      const fieldErrors = this.validateField(value, rule);
      
      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors.map(error => `${rule.field}: ${error}`));
      } else if (value !== undefined && value !== null) {
        // Apply sanitizer if provided
        sanitizedData[rule.field] = rule.sanitizer ? rule.sanitizer(value) : value;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined
    };
  }

  private validateField(value: any, rule: ValidationRule): string[] {
    const errors: string[] = [];

    // Check required fields
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push('is required');
      return errors;
    }

    // Skip validation for optional empty fields
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push('must be a string');
        } else {
          if (rule.min && value.length < rule.min) {
            errors.push(`must be at least ${rule.min} characters long`);
          }
          if (rule.max && value.length > rule.max) {
            errors.push(`must be no more than ${rule.max} characters long`);
          }
          if (rule.pattern && !rule.pattern.test(value)) {
            errors.push('has invalid format');
          }
        }
        break;

      case 'number':
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) {
          errors.push('must be a valid number');
        } else {
          if (rule.min !== undefined && numValue < rule.min) {
            errors.push(`must be at least ${rule.min}`);
          }
          if (rule.max !== undefined && numValue > rule.max) {
            errors.push(`must be no more than ${rule.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push('must be a boolean value (true/false)');
        }
        break;

      case 'date':
        if (!this.isValidDate(value)) {
          errors.push('must be a valid date in YYYY-MM-DD format');
        }
        break;

      case 'enum':
        if (rule.enumValues && !rule.enumValues.includes(value)) {
          errors.push(`must be one of: ${rule.enumValues.join(', ')}`);
        }
        break;

      case 'array':
        // Arrays can come as comma-separated strings or actual arrays
        const arrayValue = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
        if (!Array.isArray(arrayValue)) {
          errors.push('must be an array or comma-separated string');
        }
        break;
    }

    // Custom validation
    if (rule.customValidator && !rule.customValidator(value)) {
      errors.push('failed custom validation');
    }

    return errors;
  }

  private isValidDate(dateString: string): boolean {
    if (typeof dateString !== 'string') return false;
    
    // Check format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    
    // Check if it's a valid date
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
  }

  private sanitizeDate(dateString: string): string | null {
    if (!dateString || typeof dateString !== 'string') return null;
    
    // Try to parse and format the date
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    
    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
  }
}

// Singleton instance
export const validationService = new ValidationService();