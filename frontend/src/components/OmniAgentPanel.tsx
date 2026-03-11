import { useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import axios from 'axios';
import { DEFAULT_COMPANY_ID } from '../lib/config';

export default function OmniAgentPanel() {
    const [messages, setMessages] = useState<{ role: 'user' | 'agent', content: string }[]>([
        { role: 'agent', content: 'Hello Administrator. I am Omni, your autonomous supply chain resilience agent. How can I assist you today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        try {
            // Use streaming endpoint for faster perceived response
            const response = await fetch(`${apiBase}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, org_id: DEFAULT_COMPANY_ID }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No stream reader');
            const decoder = new TextDecoder();
            let fullText = '';

            // Add empty agent message that we'll stream into
            setMessages(prev => [...prev, { role: 'agent', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') break;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.text) {
                                fullText += parsed.text;
                                setMessages(prev => {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = { role: 'agent', content: fullText };
                                    return updated;
                                });
                            }
                            if (parsed.error) {
                                fullText += `\n[Error: ${parsed.error}]`;
                            }
                        } catch {
                            // skip malformed chunks
                        }
                    }
                }
            }

            // If streaming produced nothing, fallback to non-streaming
            if (!fullText) {
                const fallback = await axios.post(`${apiBase}/api/chat`, {
                    message: userMsg,
                    org_id: DEFAULT_COMPANY_ID,
                });
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'agent', content: fallback.data?.response ?? 'No response.' };
                    return updated;
                });
            }
        } catch (err: any) {
            setMessages(prev => {
                // Update last message if it was our empty streaming placeholder
                const last = prev[prev.length - 1];
                if (last?.role === 'agent' && !last.content) {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'agent', content: `Error: ${err.message}` };
                    return updated;
                }
                return [...prev, { role: 'agent', content: `Error: ${err.message}` }];
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                    <Bot size={28} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 leading-tight">Omni Agent Interface</h1>
                    <p className="text-sm text-slate-500">Supply chain assistant — answers from your live data</p>
                </div>
            </div>

            <div className="flex-1 glass-panel overflow-hidden flex flex-col">
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((m, idx) => (
                        <div key={idx} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
                            {m.role === 'agent' && (
                                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                                    <Bot size={18} />
                                </div>
                            )}

                            <div className={`px-5 py-3.5 rounded-2xl max-w-[80%] text-sm ${m.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-tl-sm'
                                }`}>
                                {m.content.split('\n').map((line, i) => (
                                    <p key={i} className={line ? 'mb-2' : 'mb-4'}>{line}</p>
                                ))}
                            </div>

                            {m.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0">
                                    AD
                                </div>
                            )}
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0">
                                <Sparkles size={18} className="animate-spin" />
                            </div>
                            <div className="px-5 py-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm rounded-tl-sm flex items-center gap-2 text-slate-500 text-sm">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                </div>
                                Looking up your data...
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="flex items-center p-2 bg-white border border-slate-300 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                        <input
                            type="text"
                            className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-2 text-slate-700 placeholder-slate-400 outline-none"
                            placeholder="E.g., What are our current risks? Which suppliers are single-source?"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
