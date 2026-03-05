import { useState } from 'react';
import { Bot, Send, Sparkles, AlertCircle } from 'lucide-react';
import axios from 'axios';

export default function OmniAgentPanel() {
    const [messages, setMessages] = useState<{ role: 'user' | 'agent', content: string }[]>([
        { role: 'agent', content: 'Hello Administrator. I am Omni, your autonomous supply chain resilience agent. How can I assist you today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        try {
            const response = await axios.post('http://localhost:8000/api/agent/run', {
                company_id: 'C-001',
                trigger: userMsg,
                context: {}
            });

            setMessages(prev => [...prev, {
                role: 'agent',
                content: `I have initiated the Omni pipeline analysis for that trigger. Pipeline Status: ${response.data.status || 'running'} \n\nPlease check the Risk Cases and Actions Dashboard for generated mitigation proposals.`
            }]);
        } catch (err: any) {
            setMessages(prev => [...prev, {
                role: 'agent',
                content: `Error invoking agent pipeline: ${err.message}`
            }]);
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
                    <p className="text-sm text-slate-500">Autonomous reasoning and action execution layer</p>
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
                                Running Omni reasoning pipeline...
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
                            placeholder="E.g., Evaluate supply chain risk for upcoming Kaohsiung port strike..."
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
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 px-2">
                        <AlertCircle size={14} className="text-amber-500" />
                        Agent actions are gated by human-in-the-loop approvals. No direct DB commits occur without authorization.
                    </div>
                </div>
            </div>
        </div>
    );
}
