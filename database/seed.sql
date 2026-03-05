-- database/seed.sql

-- One company: a semiconductor-dependent manufacturer, medium risk appetite
INSERT INTO company_profiles (company_id, industry, annual_revenue, primary_products, risk_appetite, notification_threshold)
VALUES ('ORG_DEMO', 'Electronics Manufacturing', 500000000, '["Semiconductors", "Consumer Electronics"]', 'medium', 60);

-- Three suppliers: SUPP_044 (single-source, Kaohsiung Taiwan, criticality 92), SUPP_012 (backup, South Korea, lead time 60d), SUPP_021 (backup, Japan, lead time 45d)
INSERT INTO suppliers (supplier_id, supplier_name, tier, country, region, lat, lon, materials_supplied, criticality_score, single_source, lead_time_days, has_backup_supplier, backup_lead_time_days)
VALUES 
('SUPP_044', 'Taiwan Semiconductor Corp', 1, 'Taiwan', 'Kaohsiung', 22.6273, 120.3014, '["MAT_001"]', 92, true, 14, false, null),
('SUPP_012', 'Korea Tech Solutions', 2, 'South Korea', 'Seoul', 37.5665, 126.9780, '["MAT_001"]', 60, false, 60, false, null),
('SUPP_021', 'Japan Electronics', 2, 'Japan', 'Tokyo', 35.6762, 139.6503, '["MAT_001"]', 70, false, 45, false, null);

-- Two facilities: FAC_DE_01 (assembly plant, Germany), DC_DE_01 (warehouse, Germany)
INSERT INTO facilities (facility_id, facility_type, country, lat, lon, production_capacity, inventory_buffer_days)
VALUES 
('FAC_DE_01', 'assembly', 'Germany', 51.1657, 10.4515, 10000, 14),
('DC_DE_01', 'warehouse', 'Germany', 51.1657, 10.4515, null, 30);

-- One material: MAT_001 (microchip, commodity-linked)
INSERT INTO materials (material_id, material_name, category, commodity_linked)
VALUES ('MAT_001', 'High-Performance Microchip', 'component', true);

-- One product: PROD_001 (high margin 38%, priority high)
INSERT INTO products (product_id, product_name, annual_volume, margin_percent, priority_level)
VALUES ('PROD_001', 'Premium Smartphone Model X', 2000000, 38.0, 'high');

-- One BOM entry linking PROD_001 -> MAT_001
INSERT INTO bill_of_materials (product_id, material_id, quantity_required, unit)
VALUES ('PROD_001', 'MAT_001', 1, 'pcs');

-- One transport route: SUPP_044 -> FAC_DE_01 via sea, Shanghai Port, 14 days transit
INSERT INTO transport_routes (route_id, origin_supplier_id, destination_facility_id, transport_mode, key_ports, transit_time_days)
VALUES ('ROUTE_001', 'SUPP_044', 'FAC_DE_01', 'sea', '["Shanghai Port", "Hamburg Port"]', 14);

-- Two open POs: PO_8821 (ETA 2026-03-20, ocean, at-risk), PO_8822 (ETA 2026-04-05, ocean, normal)
INSERT INTO purchase_orders (po_id, supplier_id, material_id, quantity, eta, ship_mode, status, delay_risk)
VALUES 
('PO_8821', 'SUPP_044', 'MAT_001', 50000, '2026-03-20', 'ocean', 'open', 0.8),
('PO_8822', 'SUPP_044', 'MAT_001', 60000, '2026-04-05', 'ocean', 'open', 0.1);

-- Inventory for MAT_001 at DC_DE_01: 4.2 days of cover remaining, safety stock 10 days
INSERT INTO inventory (material_id, facility_id, supplier_id, current_inventory_units, daily_usage, days_of_inventory_remaining, safety_stock_days)
VALUES ('MAT_001', 'DC_DE_01', 'SUPP_044', 21000, 5000, 4.2, 10);

-- Memory preference for the demo org
INSERT INTO memory_preferences (org_id, objectives, forbidden)
VALUES ('ORG_DEMO', '{"fill_rate_target": 0.95, "cost_cap_usd": 50000}', '["RU"]');
