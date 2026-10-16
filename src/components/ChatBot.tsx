import React, { useState, useRef, useEffect } from 'react';
import { X, Send, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import ChatBotIcon from './ChatBotIcon';
import { generateDualChatReplies, type ChatProvider } from '../utils/chatApi';
import { testGeminiConnection } from '../utils/geminiApi';
import { testNemotronConnection } from '../utils/nemotronApi';
import type { ProviderTestResult } from '../utils/providerErrors';
import type { ChatTurn } from '../utils/siteKnowledge';

// Define types for our messages
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  /** Which AI model produced this reply (bot messages only) */
  provider?: ChatProvider;
}

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I\'m your RentRight Assistant. I can help you find student PGs, calculate your 30% rent affordability budget, answer questions about security deposits, or schedule property viewings. How can I assist you today?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState<ProviderTestResult | null>(null);
  const [nemotronResult, setNemotronResult] = useState<ProviderTestResult | null>(null);
  const [checkingConn, setCheckingConn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Banner only when BOTH configured providers are offline. A single down
  // provider (e.g. Gemini quota) is shown per-chip but does NOT claim the
  // whole assistant is offline, since the other can still answer.
  const allProvidersDown =
    geminiResult?.status === 'offline' && nemotronResult?.status === 'offline';

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Probe both Gemini and Nemotron. Runs on mount and via the banner's Retry
  // button (e.g. after a Gemini quota window resets) so the user is not stuck
  // on offline answers until a full reload.
  const runConnectionChecks = async () => {
    setCheckingConn(true);
    try {
      // Each probe returns a structured result and never throws (it catches
      // transport/quota/auth internally).
      const [gem, nem] = await Promise.all([
        testGeminiConnection(),
        testNemotronConnection(),
      ]);
      setGeminiResult(gem);
      setNemotronResult(nem);
    } finally {
      setCheckingConn(false);
    }
  };

  useEffect(() => {
    runConnectionChecks();
  }, []);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Conversation history for the models (last turns, alternated user/assistant)
  const buildHistory = (msgs: Message[]): ChatTurn[] =>
    msgs
      .filter((m) => m.provider !== 'Offline')
      .map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text
      }));

  const handleSendMessage = async () => {
    if (inputValue.trim() === '') return;
    
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    
    const history = buildHistory(messages);

    try {
      // Ask BOTH Gemini and NVIDIA Nemotron (grounded in RentRight site data)
      const replies = await generateDualChatReplies(userMessage.text, history);

      const botMessages: Message[] = replies.map((reply, idx) => ({
        id: (Date.now() + idx + 1).toString(),
        text: reply.text,
        sender: 'bot' as const,
        timestamp: new Date(),
        provider: reply.provider
      }));

      setMessages(prevMessages => [...prevMessages, ...botMessages]);
      if (replies.length === 1 && replies[0].provider === 'Offline') {
        // Everything failed — refresh per-provider status so the chips and
        // banner explain *why* (quota / auth / network) instead of guessing.
        runConnectionChecks();
      }
    } catch (error) {
      console.error('Error generating response:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const renderStatusChip = (r: ProviderTestResult | null, label: string) => {
    const dot =
      !r
        ? 'bg-white/40'
        : r.status === 'online'
        ? 'bg-emerald-400'
        : r.status === 'degraded'
        ? 'bg-amber-300'
        : 'bg-red-400';
    const text = !r ? (checkingConn ? 'checking…' : '—') : r.status;
    const title = r?.message || (checkingConn ? 'Checking connection…' : 'Pending');
    return (
      <span
        title={title}
        className="inline-flex items-center gap-1 text-[9px] font-medium text-violet-100"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}: {text}
      </span>
    );
  };

  return (
    <>
      {/* Chat toggle button */}
      {!isOpen && <ChatBotIcon onClick={toggleChat} />}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 w-80 sm:w-96 h-[26rem] bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-gray-200 z-50">
          {allProvidersDown && (
            <div className="absolute top-0 left-0 right-0 bg-red-100 text-red-800 px-4 py-2 text-sm flex items-center justify-between gap-2 z-10">
              <span className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
                API connection issue. Using offline answers.
              </span>
              <button
                type="button"
                onClick={runConnectionChecks}
                disabled={checkingConn}
                className="text-xs font-semibold underline underline-offset-2 disabled:opacity-60 shrink-0"
              >
                {checkingConn ? 'Checking...' : 'Retry'}
              </button>
            </div>
          )}
          {/* Chat header */}
          <div className="bg-violet-600 text-white p-3 font-medium flex justify-between items-center">
            <div className="leading-tight">
              <span className="font-bold text-sm block">RentRight Rental Assistant</span>
              <span className="text-[10px] text-violet-200">
                Gemini + NVIDIA Nemotron · answers from RentRight site data
              </span>
              <div className="flex items-center gap-3 mt-1">
                {renderStatusChip(geminiResult, 'Gemini')}
                {renderStatusChip(nemotronResult, 'Nemotron')}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleChat}
              className="h-8 w-8 p-0 text-white hover:bg-purple-700 rounded-full"
            >
              <X size={18} />
            </Button>
          </div>
          
          {/* Messages container */}
          <div className="flex-1 p-4 overflow-y-auto">
            {messages.map(message => (
              <div 
                key={message.id} 
                className={`mb-4 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div 
                  className={`inline-block p-3 rounded-lg max-w-[85%] ${
                    message.sender === 'user' 
                      ? 'bg-purple-600 text-white rounded-br-none' 
                      : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}
                >
                  {message.sender === 'bot' && message.provider && (
                    <span
                      className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1.5 ${
                        message.provider === 'Gemini'
                          ? 'bg-blue-100 text-blue-700'
                          : message.provider === 'Nemotron'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {message.provider === 'Nemotron' ? 'NVIDIA Nemotron' : message.provider}
                    </span>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{message.text}</div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input area */}
          <div className="border-t border-gray-200 p-3 flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 border border-gray-300 rounded-l-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-600"
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || inputValue.trim() === ''}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-l-none rounded-r-lg px-3 py-2"
            >
              {isLoading ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Send size={18} />
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
