import { ComprehendClient, DetectDominantLanguageCommand } from '@aws-sdk/client-comprehend';

export interface ComprehendConfig {
  region?: string;
}

export interface LanguageDetectionResult {
  languageCode: string;
  score: number;
}

export class ComprehendService {
  private client: ComprehendClient;

  constructor(config: ComprehendConfig = {}) {
    this.client = new ComprehendClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1'
    });
  }

  /**
   * Detect the dominant language in text
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    try {
      const command = new DetectDominantLanguageCommand({ Text: text });
      const result = await this.client.send(command);
      
      const dominantLanguage = result.Languages?.[0];
      
      if (dominantLanguage && dominantLanguage.Score && dominantLanguage.Score > 0.7) {
        return {
          languageCode: dominantLanguage.LanguageCode || 'en',
          score: dominantLanguage.Score
        };
      }
      
      // Default to English if confidence is low
      return {
        languageCode: 'en',
        score: 0.5
      };
    } catch (error) {
      console.error('Language detection failed:', error);
      // Fallback to English
      return {
        languageCode: 'en',
        score: 0.0
      };
    }
  }

  /**
   * Check if detected language is Spanish
   */
  async isSpanish(text: string, threshold: number = 0.7): Promise<boolean> {
    const result = await this.detectLanguage(text);
    return result.languageCode === 'es' && result.score >= threshold;
  }

  /**
   * Health check - test Comprehend connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.detectLanguage('health check test');
      return true;
    } catch (error) {
      console.error('Comprehend health check failed:', error);
      return false;
    }
  }
}