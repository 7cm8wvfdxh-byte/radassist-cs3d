// Shared Gemini chat state hook
// Manages messages, analyzing state, and AI calls
// Used by both AIPanel (desktop) and MobileApp (mobile)

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { analyzeWithGemini, buildConversationHistory } from '../lib/geminiClient';
import { getSystemPrompt } from '../lib/promptTemplates';

interface UseGeminiChatOptions {
  initialMessage?: string;
}

export function useGeminiChat(opts?: UseGeminiChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    opts?.initialMessage
      ? [{ role: 'system', content: opts.initialMessage, timestamp: new Date() }]
      : []
  );
  const [analyzing, setAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addUserMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', content, timestamp: new Date() },
    ]);
  };

  const addAssistantMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content, timestamp: new Date() },
    ]);
  };

  /** Send a prompt to Gemini and append both user + assistant messages */
  const sendPrompt = async (opts: {
    prompt: string;
    imageBase64: string | null;
    systemPrompt?: string;
    modality?: string;
    userMessage?: string;
  }) => {
    setAnalyzing(true);

    if (opts.userMessage) {
      addUserMessage(opts.userMessage);
    }

    const history = buildConversationHistory(messages);
    const result = await analyzeWithGemini({
      prompt: opts.prompt,
      imageBase64: opts.imageBase64,
      systemPrompt: opts.systemPrompt || getSystemPrompt(opts.modality),
      history,
    });

    addAssistantMessage(result);
    setAnalyzing(false);
    return result;
  };

  /** Send a follow-up question (with current image context) */
  const sendFollowUp = async (opts: {
    question: string;
    imageBase64: string | null;
    modality?: string;
    contextInfo?: string;
  }) => {
    setAnalyzing(true);
    addUserMessage(opts.question);

    const history = buildConversationHistory([
      ...messages,
      { role: 'user', content: opts.question, timestamp: new Date() },
    ]);

    const prompt = opts.contextInfo
      ? `${opts.contextInfo}\n\nKullanici sorusu: ${opts.question}`
      : opts.question;

    const result = await analyzeWithGemini({
      prompt,
      imageBase64: opts.imageBase64,
      modality: opts.modality,
      history,
    });

    addAssistantMessage(result);
    setAnalyzing(false);
    return result;
  };

  const clearMessages = () => {
    setMessages(
      opts?.initialMessage
        ? [{ role: 'system', content: opts.initialMessage, timestamp: new Date() }]
        : []
    );
  };

  return {
    messages,
    setMessages,
    analyzing,
    setAnalyzing,
    scrollRef,
    addUserMessage,
    addAssistantMessage,
    sendPrompt,
    sendFollowUp,
    clearMessages,
  };
}
