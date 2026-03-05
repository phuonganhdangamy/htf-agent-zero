-- database/policies.sql

-- Enable RLS on all tables
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

ALTER TABLE signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE memory_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_preferences ENABLE ROW LEVEL SECURITY;

-- For demo purposes, we will create permissive policies that allow all authenticated and anon users
-- to read/write all data, since this is a prototype and we only have one demo org.
-- In a real app, policies would check auth.uid() and org_id.

CREATE POLICY "Allow all access to company_profiles" ON company_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to facilities" ON facilities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to materials" ON materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to bill_of_materials" ON bill_of_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to supplier_materials" ON supplier_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to transport_routes" ON transport_routes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to signal_events" ON signal_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to risk_cases" ON risk_cases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to decision_packets" ON decision_packets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to action_runs" ON action_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to draft_artifacts" ON draft_artifacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to change_proposals" ON change_proposals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to memory_patterns" ON memory_patterns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to memory_entities" ON memory_entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to memory_preferences" ON memory_preferences FOR ALL USING (true) WITH CHECK (true);
