-- database/seed.sql
-- Semiconductor-focused demo: meaningful supplier/material names; codes (SUPP_*, MAT_*, PO_*) kept as internal IDs.

-- One company: semiconductor-dependent manufacturer
INSERT INTO company_profiles (company_id, industry, annual_revenue, primary_products, risk_appetite, notification_threshold)
VALUES ('ORG_DEMO', 'Electronics Manufacturing', 500000000, '["Semiconductors", "Consumer Electronics"]', 'medium', 60);

-- Suppliers: names are user-facing; supplier_id is code.
INSERT INTO suppliers (supplier_id, supplier_name, tier, country, region, lat, lon, materials_supplied, criticality_score, single_source, lead_time_days, has_backup_supplier, backup_lead_time_days)
VALUES
('SUPP_044', 'Taiwan Semiconductor Corp', 1, 'Taiwan', 'Kaohsiung', 22.6273, 120.3014, '["MAT_001", "MAT_004"]', 92, true, 14, false, null),
('SUPP_012', 'Korea Tech Solutions', 2, 'South Korea', 'Seoul', 37.5665, 126.9780, '["MAT_001", "MAT_003"]', 60, false, 60, false, null),
('SUPP_021', 'Japan Electronics', 2, 'Japan', 'Tokyo', 35.6762, 139.6503, '["MAT_002", "MAT_003", "MAT_005"]', 70, false, 45, false, null);

-- Facilities
INSERT INTO facilities (facility_id, facility_type, country, lat, lon, production_capacity, inventory_buffer_days)
VALUES
('FAC_DE_01', 'assembly', 'Germany', 51.1657, 10.4515, 10000, 14),
('DC_DE_01', 'warehouse', 'Germany', 51.1657, 10.4515, null, 30);

-- Semiconductor materials: meaningful names for display; material_id is code.
INSERT INTO materials (material_id, material_name, category, commodity_linked)
VALUES
('MAT_001', '7nm Silicon Wafer', 'component', true),
('MAT_002', 'Organic Substrate', 'component', false),
('MAT_003', 'Wire Bond Gold', 'component', true),
('MAT_004', 'Mold Compound', 'component', false),
('MAT_005', 'EUV Photoresist', 'raw', true);

-- Product
INSERT INTO products (product_id, product_name, annual_volume, margin_percent, priority_level)
VALUES ('PROD_001', 'Premium Smartphone Model X', 2000000, 38.0, 'high');

-- BOM: product uses multiple materials (more complex reasoning)
INSERT INTO bill_of_materials (product_id, material_id, quantity_required, unit)
VALUES
('PROD_001', 'MAT_001', 1, 'pcs'),
('PROD_001', 'MAT_002', 1, 'pcs'),
('PROD_001', 'MAT_003', 0.02, 'pcs'),
('PROD_001', 'MAT_004', 0.1, 'pcs'),
('PROD_001', 'MAT_005', 0.001, 'pcs');

-- Transport routes
INSERT INTO transport_routes (route_id, origin_supplier_id, destination_facility_id, transport_mode, key_ports, transit_time_days)
VALUES
('ROUTE_001', 'SUPP_044', 'FAC_DE_01', 'sea', '["Shanghai Port", "Hamburg Port"]', 14),
('ROUTE_002', 'SUPP_021', 'FAC_DE_01', 'air', '["Narita", "Frankfurt"]', 3);

-- Open POs: mix of materials and suppliers (codes in DB; use names in UI/prompts)
INSERT INTO purchase_orders (po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk)
VALUES
('PO_8821', 'SUPP_044', 'MAT_001', 50000, '2026-03-20', 'ocean', 'open', 0.8),
('PO_8822', 'SUPP_044', 'MAT_001', 60000, '2026-04-05', 'ocean', 'open', 0.1),
('PO_8823', 'SUPP_021', 'MAT_002', 20000, '2026-03-28', 'air', 'open', 0.2),
('PO_8824', 'SUPP_044', 'MAT_004', 10000, '2026-04-12', 'ocean', 'open', 0.6),
('PO_8825', 'SUPP_021', 'MAT_005', 5000, '2026-04-01', 'air', 'open', 0.15);

-- Inventory: multiple materials, different cover days
INSERT INTO inventory (material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, safety_stock_days)
VALUES
('MAT_001', 'DC_DE_01', 'SUPP_044', 21000, 5000, 4.2, 10),
('MAT_002', 'DC_DE_01', 'SUPP_021', 8000, 600, 12.0, 7),
('MAT_004', 'DC_DE_01', 'SUPP_044', 5000, 600, 8.0, 5),
('MAT_005', 'DC_DE_01', 'SUPP_021', 2000, 200, 10.0, 5);

-- Memory preference
INSERT INTO memory_preferences (org_id, objectives, forbidden)
VALUES ('ORG_DEMO', '{"fill_rate_target": 0.95, "cost_cap_usd": 50000}', '["RU"]');

-- ─────────────────────────────────────────────────────────────────────────────
-- Taiwan-focused customer profile (ORG_TW_DEMO): industrial electronics manufacturer
-- Use OMNI_COMPANY_ID=ORG_TW_DEMO and VITE_DEFAULT_COMPANY_ID=ORG_TW_DEMO to run against this profile.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO company_profiles (company_id, industry, annual_revenue, primary_products, risk_appetite, notification_threshold)
VALUES ('ORG_TW_DEMO', 'Industrial Electronics Manufacturing', 150000000, '["Industrial Controllers", "Edge Devices"]', 'medium', 60);

INSERT INTO memory_preferences (org_id, objectives, approval_policy, forbidden)
VALUES (
  'ORG_TW_DEMO',
  '{"fill_rate_target": 0.97, "max_air_freight_share": 0.25, "cost_cap_usd_per_event": 75000, "min_days_of_cover_critical": 10}',
  '{"auto_approve_below_usd": 15000, "require_vp_approval_above_usd": 50000, "always_require_approval_for": ["supplier_switch", "air_freight_upgrade"]}',
  '["RU"]'
);

INSERT INTO suppliers (supplier_id, supplier_name, tier, country, region, lat, lon, materials_supplied, criticality_score, single_source, lead_time_days, contract_value, has_backup_supplier, backup_lead_time_days, switching_cost, ticker, is_public_company)
VALUES
  ('SUPP_TW_001', 'FormoChip Electronics', 1, 'Taiwan', 'Kaohsiung', 22.6273, 120.3014, '["MAT_TW_001", "MAT_TW_004"]', 95, true, 12, 120000000, true, 16, 'high', 'FCE', true),
  ('SUPP_MY_001', 'Peninsula Semi', 2, 'Malaysia', 'Penang', 5.4164, 100.3327, '["MAT_TW_001"]', 70, false, 16, 45000000, false, null, 'medium', null, false),
  ('SUPP_TW_002', 'Pacific Packaging Taichung', 2, 'Taiwan', 'Taichung', 24.1477, 120.6736, '["MAT_TW_002"]', 80, true, 6, 12000000, false, null, 'medium', null, false);

INSERT INTO facilities (facility_id, facility_type, country, lat, lon, production_capacity, primary_inputs, inventory_buffer_days, products_produced, daily_production_capacity)
VALUES
  ('FAC_EU_TW_01', 'assembly', 'Germany', 51.1657, 10.4515, 8000, '["MAT_TW_001", "MAT_TW_002", "MAT_TW_003", "MAT_TW_004"]', 10, '["PROD_TW_001"]', 400),
  ('DC_EU_TW_01', 'warehouse', 'Germany', 51.3, 10.2, null, '["MAT_TW_001", "MAT_TW_002", "MAT_TW_003", "MAT_TW_004"]', 20, '["PROD_TW_001"]', null);

INSERT INTO materials (material_id, material_name, category, commodity_linked)
VALUES
  ('MAT_TW_001', '7nm Control MCU Wafer', 'component', true),
  ('MAT_TW_002', 'Custom Molded Packaging Shell', 'component', false),
  ('MAT_TW_003', 'High-Temp Capacitor Set', 'component', false),
  ('MAT_TW_004', 'Underfill & Mold Compound', 'component', false);

INSERT INTO products (product_id, product_name, annual_volume, margin_percent, priority_level)
VALUES ('PROD_TW_001', 'Edge Control Unit Z7', 250000, 32.0, 'high');

INSERT INTO bill_of_materials (product_id, material_id, quantity_required, unit)
VALUES
  ('PROD_TW_001', 'MAT_TW_001', 1.0, 'pcs'),
  ('PROD_TW_001', 'MAT_TW_002', 1.0, 'pcs'),
  ('PROD_TW_001', 'MAT_TW_003', 4.0, 'pcs'),
  ('PROD_TW_001', 'MAT_TW_004', 0.05, 'kg');

INSERT INTO supplier_materials (material_id, supplier_id, supplying_facility_id, contract_type, primary_supplier, share_percent, lead_time_days)
VALUES
  ('MAT_TW_001', 'SUPP_TW_001', null, 'annual_take_or_pay', true, 0.8, 12),
  ('MAT_TW_001', 'SUPP_MY_001', null, 'spot_plus_frame', false, 0.2, 16),
  ('MAT_TW_002', 'SUPP_TW_002', null, 'annual', true, 1.0, 6),
  ('MAT_TW_004', 'SUPP_TW_001', null, 'annual', true, 1.0, 10);

INSERT INTO transport_routes (route_id, origin_supplier_id, destination_facility_id, transport_mode, key_ports, key_airports, transit_time_days, incoterms)
VALUES
  ('ROUTE_TW_SEA_01', 'SUPP_TW_001', 'FAC_EU_TW_01', 'sea', '["Kaohsiung", "Rotterdam"]', '[]', 18, 'FOB Kaohsiung'),
  ('ROUTE_TW_AIR_01', 'SUPP_TW_001', 'FAC_EU_TW_01', 'air', '[]', '["Kaohsiung Intl", "Frankfurt"]', 3, 'FCA Kaohsiung'),
  ('ROUTE_TW2_EU_01', 'SUPP_TW_002', 'FAC_EU_TW_01', 'sea', '["Taichung", "Hamburg"]', '[]', 20, 'FOB Taichung');

INSERT INTO purchase_orders (po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk)
VALUES
  ('PO_TW_1001', 'SUPP_TW_001', 'MAT_TW_001', 30000, '2026-03-20', 'ocean', 'open', 0.75),
  ('PO_TW_1002', 'SUPP_TW_001', 'MAT_TW_001', 40000, '2026-04-05', 'ocean', 'open', 0.25),
  ('PO_MY_2001', 'SUPP_MY_001', 'MAT_TW_001', 10000, '2026-04-10', 'air', 'open', 0.15),
  ('PO_TW_3001', 'SUPP_TW_002', 'MAT_TW_002', 28000, '2026-03-25', 'ocean', 'open', 0.5);

INSERT INTO inventory (material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, reorder_point, safety_stock_days)
VALUES
  ('MAT_TW_001', 'DC_EU_TW_01', 'SUPP_TW_001', 18000, 2500, 7.2, 20000, 12),
  ('MAT_TW_002', 'DC_EU_TW_01', 'SUPP_TW_002', 32000, 2200, 14.5, 25000, 10),
  ('MAT_TW_003', 'DC_EU_TW_01', null, 60000, 3500, 17.1, 40000, 8),
  ('MAT_TW_004', 'DC_EU_TW_01', 'SUPP_TW_001', 12000, 900, 13.3, 9000, 7);
