-- Remove bad seed row: supplier_id '4', country Canada, criticality 500 (out of 0-100 range)
DELETE FROM suppliers WHERE supplier_id = '4';
