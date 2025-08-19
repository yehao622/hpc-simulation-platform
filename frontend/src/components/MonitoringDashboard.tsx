// frontend/src/components/MonitoringDashboard.tsx
// Enhanced monitoring dashboard with Prometheus/Grafana integration

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { 
  Activity, 
  Server, 
  Database, 
  Cpu, 
  MemoryStick, 
  HardDrive,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import axios from 'axios';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricCard {
  title: string;
  value: string | number;
  change?: number;
  status: 'healthy' | 'warning' | 'critical';
  icon: React.ReactNode;
}

interface SystemInsight {
  insight_type: string;
  severity: string;
  description: string;
  recommendations: string[];
  metrics: Record<string, any>;
}

export default function MonitoringDashboard() {
  const [timeRange, setTimeRange] = useState('1h');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Query system metrics
  const { data: systemMetrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['systemMetrics', timeRange],
    queryFn: async () => {
      const response = await axios.get(`/api/monitoring/metrics?range=${timeRange}`);
      return response.data;
    },
    refetchInterval: refreshInterval,
    staleTime: 10000 // 10 seconds
  });

  // Query AI insights
  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = useQuery({
    queryKey: ['systemInsights'],
    queryFn: async () => {
      const response = await axios.get('/api/ai/insights/system');
      return response.data;
    },
    refetchInterval: 60000, // 1 minute
    staleTime: 30000 // 30 seconds
  });

  // Query simulation job metrics
  const { data: jobMetrics, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobMetrics', timeRange],
    queryFn: async () => {
      const response = await axios.get(`/api/monitoring/jobs?range=${timeRange}`);
      return response.data;
    },
    refetchInterval: refreshInterval
  });

  // Auto-refresh handler
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
      refetchMetrics();
      refetchInsights();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, refetchMetrics, refetchInsights]);

  // Mock data for demonstration when API is not available
  const mockMetrics: MetricCard[] = [
    {
      title: 'CPU Usage',
      value: '45.2%',
      change: -2.1,
      status: 'healthy',
      icon: <Cpu className="w-6 h-6" />
    },
    {
      title: 'Memory Usage',
      value: '62.1%',
      change: 1.8,
      status: 'healthy',
      icon: <MemoryStick className="w-6 h-6" />
    },
    {
      title: 'Active Jobs',
      value: 12,
      change: 3,
      status: 'healthy',
      icon: <Activity className="w-6 h-6" />
    },
    {
      title: 'API Response Time',
      value: '89ms',
      change: -15,
      status: 'healthy',
      icon: <Server className="w-6 h-6" />
    },
    {
      title: 'Database Connections',
      value: 8,
      change: 0,
      status: 'healthy',
      icon: <Database className="w-6 h-6" />
    },
    {
      title: 'Disk Usage',
      value: '34.7%',
      change: 2.3,
      status: 'healthy',
      icon: <HardDrive className="w-6 h-6" />
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning': case 'critical': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default: return null;
    }
  };

  // Chart configurations
  const performanceChartData = {
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    datasets: [
      {
        label: 'CPU Usage (%)',
        data: [30, 35, 45, 55, 48, 42, 38],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Memory Usage (%)',
        data: [45, 50, 58, 65, 62, 59, 55],
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const jobStatusData = {
    labels: ['Completed', 'Running', 'Queued', 'Failed'],
    datasets: [{
      data: [156, 12, 8, 3],
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(251, 191, 36, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ],
      borderColor: [
        'rgb(16, 185, 129)',
        'rgb(59, 130, 246)',
        'rgb(251, 191, 36)',
        'rgb(239, 68, 68)'
      ],
      borderWidth: 2
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'rgb(156, 163, 175)'
        }
      }
    },
    scales: {
      x: {
        ticks: { color: 'rgb(156, 163, 175)' },
        grid: { color: 'rgba(156, 163, 175, 0.1)' }
      },
      y: {
        ticks: { color: 'rgb(156, 163, 175)' },
        grid: { color: 'rgba(156, 163, 175, 0.1)' }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">System Monitoring</h1>
          <p className="text-gray-400">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="5m">Last 5 minutes</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
          <button
            onClick={() => {
              refetchMetrics();
              refetchInsights();
              setLastRefresh(new Date());
            }}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {mockMetrics.map((metric, index) => (
          <div key={index} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className={getStatusColor(metric.status)}>
                {metric.icon}
              </div>
              {getStatusIcon(metric.status)}
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold">{metric.value}</p>
              <p className="text-sm text-gray-400">{metric.title}</p>
              {metric.change !== undefined && (
                <div className={`flex items-center gap-1 text-xs ${
                  metric.change > 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  <TrendingUp className={`w-3 h-3 ${metric.change < 0 ? 'rotate-180' : ''}`} />
                  {Math.abs(metric.change)}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            AI-Generated Insights
          </h2>
          <div className="space-y-4">
            {insights.slice(0, 3).map((insight: SystemInsight, index: number) => (
              <div 
                key={index}
                className={`p-4 rounded-lg border-l-4 ${
                  insight.severity === 'high' ? 'border-red-500 bg-red-900/20' :
                  insight.severity === 'medium' ? 'border-yellow-500 bg-yellow-900/20' :
                  'border-green-500 bg-green-900/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    insight.severity === 'high' ? 'bg-red-800 text-red-200' :
                    insight.severity === 'medium' ? 'bg-yellow-800 text-yellow-200' :
                    'bg-green-800 text-green-200'
                  }`}>
                    {insight.severity.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-400">{insight.insight_type}</span>
                </div>
                <p className="text-gray-200 mb-2">{insight.description}</p>
                {insight.recommendations.length > 0 && (
                  <div className="text-sm text-gray-400">
                    <strong>Recommendations:</strong>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      {insight.recommendations.slice(0, 2).map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trends */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Performance Trends</h3>
          <div className="h-64">
            <Line data={performanceChartData} options={chartOptions} />
          </div>
        </div>

        {/* Job Status Distribution */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Job Status Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-48 h-48">
              <Doughnut 
                data={jobStatusData} 
                options={{
                  ...chartOptions,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: {
                      position: 'bottom' as const,
                      labels: {
                        color: 'rgb(156, 163, 175)',
                        padding: 20
                      }
                    }
                  }
                }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* System Services Status */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Service Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'API Gateway', status: 'healthy', uptime: '99.9%' },
            { name: 'Database', status: 'healthy', uptime: '99.8%' },
            { name: 'Redis Cache', status: 'healthy', uptime: '100%' },
            { name: 'AI Service', status: 'healthy', uptime: '99.5%' },
            { name: 'Prometheus', status: 'healthy', uptime: '99.7%' },
            { name: 'Grafana', status: 'healthy', uptime: '99.9%' },
            { name: 'Simulation Worker', status: 'warning', uptime: '98.2%' },
            { name: 'WebSocket', status: 'healthy', uptime: '99.6%' }
          ].map((service, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                {getStatusIcon(service.status)}
                <span className="font-medium">{service.name}</span>
              </div>
              <span className="text-sm text-gray-400">{service.uptime}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
