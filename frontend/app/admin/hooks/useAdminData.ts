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
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const metrics = await getAdminMetrics();
        setData(metrics);
      } catch (err) {
        console.error('Error fetching admin metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

export function useConversationChart() {
  const [data, setData] = useState<ConversationChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const chartData = await getConversationChart();
        setData(chartData);
      } catch (err) {
        console.error('Error fetching conversation chart:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

export function useLanguageSplit() {
  const [data, setData] = useState<LanguageSplit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const split = await getLanguageSplit();
        setData(split);
      } catch (err) {
        console.error('Error fetching language split:', err);
        setError(err instanceof Error ? err.message : 'Failed to load language data');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

export function useEscalationRequests() {
  const [data, setData] = useState<EscalationRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const requests = await getEscalationRequests();
        setData(requests);
      } catch (err) {
        console.error('Error fetching escalation requests:', err);
        setError(err instanceof Error ? err.message : 'Failed to load escalation requests');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

export function useFrequentlyAskedQuestions() {
  const [data, setData] = useState<FAQResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const faq = await getFrequentlyAskedQuestions();
        setData(faq);
      } catch (err) {
        console.error('Error fetching FAQ:', err);
        setError(err instanceof Error ? err.message : 'Failed to load FAQ');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

export function useUnansweredQuestions() {
  const [data, setData] = useState<FAQResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData(skipLoading = false) {
      try {
        if (!skipLoading) {
          setLoading(true);
        }
        setError(null);
        const questions = await getUnansweredQuestions();
        setData(questions);
      } catch (err) {
        console.error('Error fetching unanswered questions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load unanswered questions');
      } finally {
        if (!skipLoading) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    // Refresh data every 30 seconds for real-time updates (without showing loading state)
    const interval = setInterval(() => fetchData(true), 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

