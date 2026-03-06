import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronDown, ChevronRight, Plus, Save } from 'lucide-react';

const DEFAULT_COMPANY_ID = 'ORG_DEMO';

interface MemoryPreferences {
  id?: string;
  org_id: string;
  objectives?: {
    industry?: string;
    risk_appetite?: string;
    cost_cap?: number;
    cost_cap_usd?: number;
    fill_rate_target?: number;
    notification_threshold?: number;
    lead_time_sensitivity?: string;
    supplier_concentration_threshold?: number;
    contract_structures?: string[];
    customer_slas?: { customer: string; sla_days: number }[];
  };
}

interface Supplier {
  id: string;
  supplier_id: string;
  supplier_name: string;
  country: string;
  tier: number;
  criticality_score: number;
  single_source: boolean;
  lead_time_days: number;
}

interface Facility {
  id: string;
  facility_id: string;
  facility_type: string;
  country: string;
  production_capacity?: number;
  inventory_buffer_days?: number;
}

export default function Configuration() {
  const [companyOpen, setCompanyOpen] = useState(true);
  const [suppliersOpen, setSuppliersOpen] = useState(true);
  const [facilitiesOpen, setFacilitiesOpen] = useState(true);

  const [prefs, setPrefs] = useState<MemoryPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [form, setForm] = useState({
    industry: '',
    risk_appetite: 'medium',
    cost_cap: 50000,
    fill_rate_target: 0.95,
    notification_threshold: 60,
    lead_time_sensitivity: 'medium',
    supplier_concentration_threshold: 0.5,
    contract_structures: [] as string[],
    customer_slas: [] as { customer: string; sla_days: number }[],
  });
  const [newSlaCustomer, setNewSlaCustomer] = useState('');
  const [newSlaDays, setNewSlaDays] = useState(7);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: '',
    supplier_name: '',
    country: '',
    tier: 1,
    criticality_score: 50,
    single_source: false,
    lead_time_days: 14,
  });

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilityModal, setFacilityModal] = useState(false);
  const [facilityForm, setFacilityForm] = useState({
    facility_id: '',
    facility_type: 'plant',
    country: '',
    production_capacity: 0,
    inventory_buffer_days: 14,
  });

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        setPrefsLoading(true);
        const { data, error } = await supabase
          .from('memory_preferences')
          .select('*')
          .eq('org_id', DEFAULT_COMPANY_ID)
          .maybeSingle();
        if (error) throw error;
        setPrefs(data || null);
        const obj = data?.objectives || {};
        setForm({
          industry: obj.industry ?? '',
          risk_appetite: obj.risk_appetite ?? 'medium',
          cost_cap: obj.cost_cap ?? obj.cost_cap_usd ?? 50000,
          fill_rate_target: obj.fill_rate_target ?? 0.95,
          notification_threshold: obj.notification_threshold ?? 60,
          lead_time_sensitivity: obj.lead_time_sensitivity ?? 'medium',
          supplier_concentration_threshold: obj.supplier_concentration_threshold ?? 0.5,
          contract_structures: obj.contract_structures ?? [],
          customer_slas: obj.customer_slas ?? [],
        });
      } catch (e) {
        console.error(e);
      } finally {
        setPrefsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        setSuppliersLoading(true);
        const { data, error } = await supabase.from('suppliers').select('*').order('supplier_id');
        if (error) throw error;
        setSuppliers(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setSuppliersLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        setFacilitiesLoading(true);
        const { data, error } = await supabase.from('facilities').select('*').order('facility_id');
        if (error) throw error;
        setFacilities(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setFacilitiesLoading(false);
      }
    })();
  }, []);

  const saveCompanyProfile = async () => {
    if (!supabase) return;
    setPrefsSaving(true);
    try {
      const objectives = {
        ...(prefs?.objectives || {}),
        industry: form.industry,
        risk_appetite: form.risk_appetite,
        cost_cap: form.cost_cap,
        cost_cap_usd: form.cost_cap,
        fill_rate_target: form.fill_rate_target,
        notification_threshold: form.notification_threshold,
        lead_time_sensitivity: form.lead_time_sensitivity,
        supplier_concentration_threshold: form.supplier_concentration_threshold,
        contract_structures: form.contract_structures,
        customer_slas: form.customer_slas,
      };
      const { error } = await supabase.from('memory_preferences').upsert(
        { org_id: DEFAULT_COMPANY_ID, objectives, last_updated: new Date().toISOString() },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
      setPrefs((p) => (p ? { ...p, objectives } : { org_id: DEFAULT_COMPANY_ID, objectives }));
    } catch (e) {
      console.error(e);
    } finally {
      setPrefsSaving(false);
    }
  };

  const addSupplier = async () => {
    if (!supabase || !supplierForm.supplier_id || !supplierForm.supplier_name) return;
    try {
      const { error } = await supabase.from('suppliers').insert({
        supplier_id: supplierForm.supplier_id,
        supplier_name: supplierForm.supplier_name,
        country: supplierForm.country,
        tier: supplierForm.tier,
        criticality_score: supplierForm.criticality_score,
        single_source: supplierForm.single_source,
        lead_time_days: supplierForm.lead_time_days,
      });
      if (error) throw error;
      setSupplierModal(false);
      setSupplierForm({ supplier_id: '', supplier_name: '', country: '', tier: 1, criticality_score: 50, single_source: false, lead_time_days: 14 });
      const { data } = await supabase.from('suppliers').select('*').order('supplier_id');
      setSuppliers(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const addFacility = async () => {
    if (!supabase || !facilityForm.facility_id) return;
    try {
      const { error } = await supabase.from('facilities').insert({
        facility_id: facilityForm.facility_id,
        facility_type: facilityForm.facility_type,
        country: facilityForm.country,
        production_capacity: facilityForm.production_capacity,
        inventory_buffer_days: facilityForm.inventory_buffer_days,
      });
      if (error) throw error;
      setFacilityModal(false);
      setFacilityForm({ facility_id: '', facility_type: 'plant', country: '', production_capacity: 0, inventory_buffer_days: 14 });
      const { data } = await supabase.from('facilities').select('*').order('facility_id');
      setFacilities(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Configuration</h1>
      <p className="text-sm text-slate-500">Company profile, suppliers, and facilities. All data is read from and saved to Supabase.</p>

      {/* Company Profile */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setCompanyOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-5 py-4 text-left font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100"
        >
          {companyOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          Company Profile
        </button>
        {companyOpen && (
          <div className="p-5 border-t border-slate-200">
            {prefsLoading ? (
              <p className="text-slate-500">Loading memory_preferences...</p>
            ) : !supabase ? (
              <p className="text-amber-600">Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Industry</label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. Electronics Manufacturing"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Risk appetite</label>
                  <select
                    value={form.risk_appetite}
                    onChange={(e) => setForm((f) => ({ ...f, risk_appetite: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Cost cap (USD)</label>
                  <input
                    type="number"
                    value={form.cost_cap}
                    onChange={(e) => setForm((f) => ({ ...f, cost_cap: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Fill rate target (0–1)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={form.fill_rate_target}
                    onChange={(e) => setForm((f) => ({ ...f, fill_rate_target: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notification threshold</label>
                  <input
                    type="number"
                    value={form.notification_threshold}
                    onChange={(e) => setForm((f) => ({ ...f, notification_threshold: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-3">Hyper-Personalization</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Lead-time sensitivity</label>
                      <select
                        value={form.lead_time_sensitivity}
                        onChange={(e) => setForm((f) => ({ ...f, lead_time_sensitivity: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="low">Low — flexible delivery windows</option>
                        <option value="medium">Medium — standard 30-60 day lead times</option>
                        <option value="high">High — fast-activate suppliers required</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Max supplier concentration (0–1)</label>
                      <input
                        type="number" step="0.05" min="0.1" max="1.0"
                        value={form.supplier_concentration_threshold}
                        onChange={(e) => setForm((f) => ({ ...f, supplier_concentration_threshold: Number(e.target.value) || 0.5 }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g. 0.4 = max 40% from one supplier"
                      />
                      <p className="text-xs text-slate-400 mt-1">Max share from any single supplier (e.g. 0.4 = 40%)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Preferred contract structures</label>
                      <div className="flex flex-wrap gap-2">
                        {['fixed_price', 'spot', 'consignment', 'framework'].map(opt => (
                          <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.contract_structures.includes(opt)}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                contract_structures: e.target.checked
                                  ? [...f.contract_structures, opt]
                                  : f.contract_structures.filter(c => c !== opt),
                              }))}
                            />
                            {opt.replace('_', ' ')}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Customer SLAs</label>
                      <div className="space-y-1 mb-2">
                        {form.customer_slas.map((sla, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 font-medium">{sla.customer}</span>
                            <span className="text-slate-500">{sla.sla_days}d</span>
                            <button onClick={() => setForm((f) => ({ ...f, customer_slas: f.customer_slas.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text" placeholder="Customer name"
                          value={newSlaCustomer}
                          onChange={(e) => setNewSlaCustomer(e.target.value)}
                          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <input
                          type="number" placeholder="Days" min={1} max={365}
                          value={newSlaDays}
                          onChange={(e) => setNewSlaDays(Number(e.target.value) || 7)}
                          className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <button
                          onClick={() => {
                            if (!newSlaCustomer.trim()) return;
                            setForm((f) => ({ ...f, customer_slas: [...f.customer_slas, { customer: newSlaCustomer.trim(), sla_days: newSlaDays }] }));
                            setNewSlaCustomer(''); setNewSlaDays(7);
                          }}
                          className="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium"
                        >+ Add</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={saveCompanyProfile}
                    disabled={prefsSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={16} /> Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suppliers */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setSuppliersOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100"
        >
          <span className="flex items-center gap-2">
            {suppliersOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            Suppliers
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setSupplierModal(true); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Add Supplier
          </button>
        </button>
        {suppliersOpen && (
          <div className="p-5 border-t border-slate-200 overflow-x-auto">
            {suppliersLoading ? (
              <p className="text-slate-500">Loading suppliers...</p>
            ) : !supabase ? (
              <p className="text-amber-600">Supabase not configured.</p>
            ) : suppliers.length === 0 ? (
              <p className="text-slate-500">No suppliers in suppliers table.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="pb-2 pr-4">supplier_id</th>
                    <th className="pb-2 pr-4">supplier_name</th>
                    <th className="pb-2 pr-4">country</th>
                    <th className="pb-2 pr-4">tier</th>
                    <th className="pb-2 pr-4">criticality_score</th>
                    <th className="pb-2 pr-4">single_source</th>
                    <th className="pb-2">lead_time_days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="py-2">
                      <td className="py-2 pr-4 font-mono">{s.supplier_id}</td>
                      <td className="py-2 pr-4">{s.supplier_name}</td>
                      <td className="py-2 pr-4">{s.country}</td>
                      <td className="py-2 pr-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">Tier {s.tier}</span>
                      </td>
                      <td className="py-2 pr-4">{s.criticality_score}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.single_source ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                          {s.single_source ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2">{s.lead_time_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Facilities */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setFacilitiesOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100"
        >
          <span className="flex items-center gap-2">
            {facilitiesOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            Facilities
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setFacilityModal(true); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Add Facility
          </button>
        </button>
        {facilitiesOpen && (
          <div className="p-5 border-t border-slate-200 overflow-x-auto">
            {facilitiesLoading ? (
              <p className="text-slate-500">Loading facilities...</p>
            ) : !supabase ? (
              <p className="text-amber-600">Supabase not configured.</p>
            ) : facilities.length === 0 ? (
              <p className="text-slate-500">No facilities in facilities table.</p>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="pb-2 pr-4">facility_id</th>
                    <th className="pb-2 pr-4">facility_type</th>
                    <th className="pb-2 pr-4">country</th>
                    <th className="pb-2 pr-4">production_capacity</th>
                    <th className="pb-2">inventory_buffer_days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facilities.map((f) => (
                    <tr key={f.id} className="py-2">
                      <td className="py-2 pr-4 font-mono">{f.facility_id}</td>
                      <td className="py-2 pr-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">{f.facility_type}</span>
                      </td>
                      <td className="py-2 pr-4">{f.country}</td>
                      <td className="py-2 pr-4">{f.production_capacity ?? '—'}</td>
                      <td className="py-2">{f.inventory_buffer_days ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {supplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSupplierModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-4">Add Supplier</h3>
            <div className="space-y-3">
              <input type="text" placeholder="supplier_id" value={supplierForm.supplier_id} onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="text" placeholder="supplier_name" value={supplierForm.supplier_name} onChange={(e) => setSupplierForm((f) => ({ ...f, supplier_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="text" placeholder="country" value={supplierForm.country} onChange={(e) => setSupplierForm((f) => ({ ...f, country: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="tier" value={supplierForm.tier} onChange={(e) => setSupplierForm((f) => ({ ...f, tier: Number(e.target.value) || 1 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="criticality_score" value={supplierForm.criticality_score} onChange={(e) => setSupplierForm((f) => ({ ...f, criticality_score: Number(e.target.value) || 0 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={supplierForm.single_source} onChange={(e) => setSupplierForm((f) => ({ ...f, single_source: e.target.checked }))} />
                Single source
              </label>
              <input type="number" placeholder="lead_time_days" value={supplierForm.lead_time_days} onChange={(e) => setSupplierForm((f) => ({ ...f, lead_time_days: Number(e.target.value) || 0 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addSupplier} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Insert</button>
              <button onClick={() => setSupplierModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Facility Modal */}
      {facilityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setFacilityModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-4">Add Facility</h3>
            <div className="space-y-3">
              <input type="text" placeholder="facility_id" value={facilityForm.facility_id} onChange={(e) => setFacilityForm((f) => ({ ...f, facility_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <select value={facilityForm.facility_type} onChange={(e) => setFacilityForm((f) => ({ ...f, facility_type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="plant">plant</option>
                <option value="warehouse">warehouse</option>
                <option value="dc">dc</option>
                <option value="assembly">assembly</option>
              </select>
              <input type="text" placeholder="country" value={facilityForm.country} onChange={(e) => setFacilityForm((f) => ({ ...f, country: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="production_capacity" value={facilityForm.production_capacity} onChange={(e) => setFacilityForm((f) => ({ ...f, production_capacity: Number(e.target.value) || 0 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="inventory_buffer_days" value={facilityForm.inventory_buffer_days} onChange={(e) => setFacilityForm((f) => ({ ...f, inventory_buffer_days: Number(e.target.value) || 0 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addFacility} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Insert</button>
              <button onClick={() => setFacilityModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
