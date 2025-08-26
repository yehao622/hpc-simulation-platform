// frontend/src/components/AIChat.tsx
// AI-powered monitoring chat interface

import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, Bot, User, Activity, AlertCircle, TrendingUp } from 'lucide-react';
import axios from 'axios';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  metadata?: any;
}

interface QuickQuery {
  label: string;
  query: string;
  icon: React.ReactNode;
}

const quickQueries: QuickQuery[] = [
  {
    label: "System Health",
    query: "What's the current system health status?",
    icon: <Activity className="w-4 h-4" />
  },
  {
    label: "Performance Analysis", 
    query: "Analyze recent performance trends and identify any issues",
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    label: "Check Anomalies",
    query: "Are there any performance anomalies or alerts I should know about?",
    icon: <AlertCircle className="w-4 h-4" />
  }
];

export default function AIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chat mutation for sending messages
  const chatMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await axios.post('/api/ai/chat', {
        query,
        stream: false
      });
      return response.data;
    },
    onSuccess: (data) => {
      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: 'ai',
        content: data.response,
        timestamp: new Date(data.timestamp),
        metadata: data.metadata
      };
      setMessages(prev => [...prev, aiMessage]);
    },
    onError: (error) => {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'ai', 
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (query?: string) => {
    const messageText = query || inputValue.trim();
    if (!messageText || chatMutation.isPending) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: messageText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    // Send to AI
    chatMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickQuery = (query: string) => {
    handleSendMessage(query);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 rounded-t-lg p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500 p-2 rounded-lg">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">SmartOps AI Assistant</h1>
            <p className="text-gray-400 text-sm">
              Ask me anything about system monitoring, performance, or simulation metrics
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 bg-gray-800 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <Bot className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium mb-2">Welcome to SmartOps AI</h3>
            <p className="mb-6">I'm here to help you monitor and analyze your HPC simulation platform.</p>
            
            {/* Quick Query Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
              {quickQueries.map((query, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickQuery(query.query)}
                  className="flex items-center gap-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-left"
                >
                  {query.icon}
                  <span className="text-sm">{query.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'ai' && (
              <div className="bg-blue-500 p-2 rounded-lg flex-shrink-0 h-fit">
                <Bot className="w-5 h-5" />
              </div>
            )}
            
            <div
              className={`max-w-[70%] p-3 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              <div className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
                {message.metadata?.processing_time && (
                  <span className="ml-2">
                    ({(message.metadata.processing_time * 1000).toFixed(0)}ms)
                  </span>
                )}
              </div>
            </div>
            
            {message.type === 'user' && (
              <div className="bg-gray-600 p-2 rounded-lg flex-shrink-0 h-fit">
                <User className="w-5 h-5" />
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {chatMutation.isPending && (
          <div className="flex gap-3 justify-start">
            <div className="bg-blue-500 p-2 rounded-lg flex-shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="bg-gray-700 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-200"></div>
                </div>
                <span className="text-gray-400 text-sm">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-gray-800 rounded-b-lg p-4 border-t border-gray-700">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about system health, performance metrics, or simulation analysis..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={chatMutation.isPending}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || chatMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        
        {/* Quick actions when input is empty */}
        {!inputValue && messages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => handleQuickQuery("Generate a performance report for the last hour")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-full transition-colors"
            >
              📊 Performance Report
            </button>
            <button
              onClick={() => handleQuickQuery("What's the current job queue status?")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-full transition-colors"
            >
              🔄 Queue Status
            </button>
            <button
              onClick={() => handleQuickQuery("Show me any system alerts or warnings")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-full transition-colors"
            >
              ⚠️ Alerts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
