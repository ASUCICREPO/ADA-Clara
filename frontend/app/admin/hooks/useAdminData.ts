/**
 * Admin Data Hooks
 * Custom hooks for fetching admin dashboard data
 */

import { useState, useEffect } from 'react';
import {
  getAdminMetrics,
  getConversationChart,
  getLanguageSplit,
  getEscalationRequests,
  getFrequentlyAskedQuestions,
  getUnansweredQuestions,
  type AdminMetrics,
  type ConversationChartData,
  type LanguageSplit,
  type EscalationRequestsResponse,
  type FAQResponse,
} from '../../../lib/api/admin.service';

export function useAdminMetrics() {
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const metrics = await getAdminMetrics();
        setData(metrics);
      } catch (err) {
        console.error('Error fetching admin metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useConversationChart() {
  const [data, setData] = useState<ConversationChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const chartData = await getConversationChart();
        setData(chartData);
      } catch (err) {
        console.error('Error fetching conversation chart:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useLanguageSplit() {
  const [data, setData] = useState<LanguageSplit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const split = await getLanguageSplit();
        setData(split);
      } catch (err) {
        console.error('Error fetching language split:', err);
        setError(err instanceof Error ? err.message : 'Failed to load language data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useEscalationRequests() {
  const [data, setData] = useState<EscalationRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const requests = await getEscalationRequests();
        setData(requests);
      } catch (err) {
        console.error('Error fetching escalation requests:', err);
        setError(err instanceof Error ? err.message : 'Failed to load escalation requests');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useFrequentlyAskedQuestions() {
  const [data, setData] = useState<FAQResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const faq = await getFrequentlyAskedQuestions();
        setData(faq);
      } catch (err) {
        console.error('Error fetching FAQ:', err);
        setError(err instanceof Error ? err.message : 'Failed to load FAQ');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useUnansweredQuestions() {
  const [data, setData] = useState<FAQResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const questions = await getUnansweredQuestions();
        setData(questions);
      } catch (err) {
        console.error('Error fetching unanswered questions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load unanswered questions');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { data, loading, error };
}

