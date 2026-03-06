import { useState, useEffect, useRef } from 'react';
import {
    Activity,
    Shield,
    Brain,
    Zap,
    RefreshCcw,
    Database,
    ChevronRight,
    Terminal,
    Cpu,
    Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
    COMPANY_PROFILE,
    SUPPLY_CHAIN_SNAPSHOT,
    runPerceptionAgent,
    runReasoningAgent,
    runPlanningAgent,
    runActionAgent,
    runReflectionAgent
} from '../services/geminiService';

interface LogEntry {
    agent: string;
    data: any;
    reasoning: string;
    timestamp: string;
}

interface MemoryEntry {
    pattern: string;
    recommended_actions: string[];
    confidence: number;
}

export default function LiveSimulation() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isSimulating, setIsSimulating] = useState(false);
    const [currentStep, setCurrentStep] = useState<number | null>(null);
    const [memory, setMemory] = useState<MemoryEntry[]>([
        {
            pattern: "Taiwan Strait geopolitical tension",
            recommended_actions: ["ACTIVATE_BACKUP_SUPPLIER", "INCREASE_SAFETY_STOCK"],
            confidence: 0.7
        }
    ]);

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const addLog = (agent: string, data: any, reasoning: string) => {
        setLogs(prev => [...prev, {
            agent,
            data,
            reasoning,
            timestamp: new Date().toLocaleTimeString()
        }]);
    };

    const startSimulation = async () => {
        setIsSimulating(true);
        setLogs([]);

        try {
            // Step 1: Perception
            setCurrentStep(1);
            console.log("Starting Perception Agent...");
            const perception = await runPerceptionAgent();
            if (!perception || !perception.event_id) throw new Error("Perception Agent failed to generate valid event.");
            addLog("Perception Agent", perception, perception.reasoning);
            await new Promise(r => setTimeout(r, 1500));

            // Step 2: Reasoning
            setCurrentStep(2);
            console.log("Starting Reasoning Agent...");
            const reasoning = await runReasoningAgent(perception);
            if (!reasoning || !reasoning.case_id) throw new Error("Reasoning Agent failed to generate valid case.");
            addLog("Risk Reasoning Agent", reasoning, reasoning.reasoning);
            await new Promise(r => setTimeout(r, 1500));

            // Step 3: Planning
            setCurrentStep(3);
            console.log("Starting Planning Agent...");
            const planning = await runPlanningAgent(reasoning);
            if (!planning || !planning.plans) throw new Error("Planning Agent failed to generate valid plans.");
            addLog("Planning Agent", planning, planning.reasoning);
            await new Promise(r => setTimeout(r, 1500));

            // Step 4: Action
            setCurrentStep(4);
            console.log("Starting Action Agent...");
            const action = await runActionAgent(planning);
            if (!action || !action.action_id) throw new Error("Action Agent failed to generate valid action.");
            addLog("Action Agent", action, action.reasoning);
            await new Promise(r => setTimeout(r, 1500));

            // Step 5: Reflection
            setCurrentStep(5);
            console.log("Starting Reflection Agent...");
            const reflection = await runReflectionAgent(action, reasoning);
            if (!reflection || !reflection.outcome) throw new Error("Reflection Agent failed to generate valid outcome.");
            addLog("Reflection Agent", reflection, reflection.reasoning);
            await new Promise(r => setTimeout(r, 1500));

            // Step 6: Memory Update
            setCurrentStep(6);
            console.log("Updating Memory...");
            if (reflection.outcome === "success" || reflection.prediction_accuracy > 0.8) {
                const newMemory: MemoryEntry = {
                    pattern: perception.event_type + " in " + perception.location,
                    recommended_actions: [action.action_type],
                    confidence: Math.min(1, 0.5 + reflection.prediction_accuracy / 2)
                };
                setMemory(prev => [newMemory, ...prev].slice(0, 5));
                addLog("Memory Module", newMemory, "Updating patterns based on successful mitigation.");
            }

        } catch (error: any) {
            console.error("Simulation failed:", error);
            addLog("System Error", {
                error: error.message || "Unknown error",
                details: "The simulation encountered a problem communicating with the AI agents."
            }, "The simulation was interrupted. Please check your API key and network connection.");
        } finally {
            setIsSimulating(false);
            setCurrentStep(null);
        }
    };

    const apiKeyExists = !!import.meta.env.VITE_GEMINI_API_KEY;

    return (
        <div className="bg-slate-50 text-slate-900 font-sans h-full overflow-y-auto">
            {/* Header */}
            <header className="border-b border-slate-200 p-6 flex justify-between items-center bg-white sticky top-0 z-50">
                <div>
                    <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-2 text-slate-900">
                        <Cpu className="w-6 h-6 text-blue-600" /> OMNI <span className="font-light text-slate-400">/ LIVE SIMULATION</span>
                    </h1>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Autonomous Multi-Agent System</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">API Status</p>
                        <p className="text-xs font-mono flex items-center gap-2 font-semibold">
                            <span className={`w-2 h-2 rounded-full ${apiKeyExists ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            {apiKeyExists ? 'KEY_DETECTED' : 'KEY_MISSING'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Status</p>
                        <p className="text-xs font-mono flex items-center gap-2 font-semibold">
                            <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                            {isSimulating ? 'PROCESSING_CYCLE' : 'SYSTEM_IDLE'}
                        </p>
                    </div>
                    <button
                        onClick={startSimulation}
                        disabled={isSimulating}
                        className={`px-6 py-2 border rounded-md font-mono text-xs uppercase tracking-widest font-bold transition-all
              ${isSimulating
                                ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-sm'}`}
                    >
                        {isSimulating ? 'Simulating...' : 'Run Cycle'}
                    </button>
                </div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-88px)]">
                {/* Left Sidebar: Business State */}
                <aside className="lg:col-span-3 border-r border-slate-200 p-6 bg-white">
                    <section className="mb-8">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Company Profile</h2>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Entity</span>
                                <span className="font-mono font-semibold">{COMPANY_PROFILE.company_name}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Appetite</span>
                                <span className="font-mono font-semibold uppercase">{COMPANY_PROFILE.risk_appetite}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500">Cost Cap</span>
                                <span className="font-mono font-semibold">${COMPANY_PROFILE.cost_cap_usd.toLocaleString()}</span>
                            </div>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Active Suppliers</h2>
                        <div className="space-y-4">
                            {SUPPLY_CHAIN_SNAPSHOT.suppliers.map(s => (
                                <div key={s.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-mono text-xs font-bold text-slate-800">{s.id}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.single_source ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                                            {s.single_source ? 'SINGLE_SOURCE' : 'BACKUP'}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><Globe size={14} /> {s.location}</p>
                                    <div className="mt-3 flex justify-between items-center pt-2 border-t border-slate-200/50">
                                        <span className="text-xs text-slate-500 font-semibold">Criticality Focus</span>
                                        <span className="font-mono text-sm font-bold text-rose-600">{s.criticality_score}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Memory Patterns</h2>
                        <div className="space-y-3">
                            {memory.map((m, i) => (
                                <div key={i} className="text-xs p-3 border border-slate-200 bg-blue-50/50 rounded-lg shadow-sm text-slate-700">
                                    <p className="text-[10px] font-bold text-blue-600 mb-1">PATTERN_{i + 1}</p>
                                    <p className="font-semibold leading-tight">{m.pattern}</p>
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.confidence * 100}%` }}></div>
                                        </div>
                                        <span className="font-mono font-bold text-slate-600">{Math.round(m.confidence * 100)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </aside>

                {/* Center: Agent Flow */}
                <section className="lg:col-span-6 border-r border-slate-200 flex flex-col bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white shadow-sm flex items-center justify-between z-10 sticky top-0">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Activity size={18} className="text-blue-600" /> Agent Execution Flow
                        </h2>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5, 6].map(s => (
                                <div key={s} className={`w-2 h-2 rounded-full transition-colors ${currentStep === s ? 'bg-blue-600 animate-pulse' : 'bg-slate-300'}`}></div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <AnimatePresence mode="popLayout">
                            {logs.length === 0 && !isSimulating && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-20"
                                >
                                    <Terminal className="w-16 h-16 mb-4 text-slate-300" />
                                    <p className="font-mono text-sm font-semibold">AWAITING_COMMAND<br /><span className="text-xs opacity-70">INITIATE_SIMULATION_CYCLE</span></p>
                                </motion.div>
                            )}

                            {logs.map((log, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="relative overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm"
                                >
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>

                                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2 text-blue-700">
                                                {getAgentIcon(log.agent)}
                                                <span className="font-mono text-xs font-bold uppercase tracking-wider">{log.agent}</span>
                                            </div>
                                            <span className="font-mono text-[10px] text-slate-400 font-semibold">{log.timestamp}</span>
                                        </div>
                                        <p className="text-sm text-slate-700 font-medium italic mt-2 border-l-2 border-slate-300 pl-3">
                                            "{log.reasoning}"
                                        </p>
                                    </div>

                                    <div className="p-4 bg-slate-900 text-green-400 font-mono text-[11px] overflow-x-auto">
                                        <pre>{JSON.stringify(log.data, null, 2)}</pre>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        <div ref={logEndRef} className="h-4" />
                    </div>
                </section>

                {/* Right Sidebar: Live Analytics */}
                <aside className="lg:col-span-3 p-6 bg-white">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 border-b border-slate-100 pb-2">Live Risk Matrix</h2>

                    <div className="aspect-square border border-slate-200 bg-slate-50 relative mb-10 rounded-lg shadow-inner overflow-hidden">
                        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                            <div className="border-r border-b border-slate-200 bg-emerald-50/30"></div>
                            <div className="border-b border-slate-200 bg-amber-50/30"></div>
                            <div className="border-r border-slate-200 bg-amber-50/30"></div>
                            <div className="bg-rose-50/30"></div>
                        </div>

                        <div className="absolute bottom-2 left-0 w-full text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Probability &rarr;</div>
                        <div className="absolute top-0 left-2 h-full flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180">&larr; Impact</div>

                        {/* Risk Points */}
                        {logs.filter(l => l.agent === "Risk Reasoning Agent").map((l, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute w-5 h-5 bg-rose-500 rounded-full border-2 border-white shadow-md z-10"
                                style={{
                                    left: `${l.data.probability_score * 100}%`,
                                    bottom: `${l.data.impact_score * 100}%`,
                                    transform: 'translate(-50%, 50%)'
                                }}
                            >
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap bg-slate-800 text-white px-2.5 py-1 rounded shadow-lg text-[10px] font-mono font-bold">
                                    SCORE: {l.data.risk_score}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Supply Chain Health</h3>
                            <div className="space-y-4">
                                <HealthMetric label="Fill Rate Target" value="95%" status="nominal" />
                                <HealthMetric label="Inventory Days" value="4.2d" status="critical" />
                                <HealthMetric label="Safety Stock" value="10d" status="warning" />
                            </div>
                        </div>

                        <div className="p-5 border border-slate-200 bg-slate-900 text-slate-300 rounded-xl shadow-md">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 border-b border-slate-700 pb-2">System Directives</h3>
                            <ul className="text-xs font-mono font-medium space-y-3">
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> MONITOR_GLOBAL_SIGNALS</li>
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> PROTECT_PROD_001_MARGIN</li>
                                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-blue-400 shrink-0" /> MINIMIZE_LEAD_TIME_VARIANCE</li>
                            </ul>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}

function getAgentIcon(agent: string) {
    switch (agent) {
        case 'Perception Agent': return <Globe className="w-5 h-5" />;
        case 'Risk Reasoning Agent': return <Brain className="w-5 h-5" />;
        case 'Planning Agent': return <Zap className="w-5 h-5" />;
        case 'Action Agent': return <Shield className="w-5 h-5" />;
        case 'Reflection Agent': return <RefreshCcw className="w-5 h-5" />;
        case 'Memory Module': return <Database className="w-5 h-5" />;
        default: return <Activity className="w-5 h-5" />;
    }
}

function HealthMetric({ label, value, status }: { label: string, value: string, status: 'nominal' | 'warning' | 'critical' }) {
    const statusColor = {
        nominal: 'bg-emerald-500 shadow-emerald-500/50',
        warning: 'bg-amber-500 shadow-amber-500/50',
        critical: 'bg-rose-500 shadow-rose-500/50'
    }[status];

    return (
        <div className="flex justify-between items-center p-3 border border-slate-100 bg-slate-50 rounded-lg">
            <span className="text-xs font-semibold text-slate-600">{label}</span>
            <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-slate-800">{value}</span>
                <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${statusColor}`}></div>
            </div>
        </div>
    );
}
