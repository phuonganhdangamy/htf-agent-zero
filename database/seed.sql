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
