from backend.services.supabase_client import supabase

def get_suppliers():
    response = supabase.table("suppliers").select("*").execute()
    return response.data

def get_supplier_by_id(supplier_id: str):
    response = supabase.table("suppliers").select("*").eq("supplier_id", supplier_id).execute()
    return response.data[0] if response.data else None

def get_facilities():
    response = supabase.table("facilities").select("*").execute()
    return response.data

def get_inventory():
    response = supabase.table("inventory").select("*").execute()
    return response.data

def get_inventory_by_material(material_id: str):
    response = supabase.table("inventory").select("*").eq("material_id", material_id).execute()
    return response.data

def get_purchase_orders():
    response = supabase.table("purchase_orders").select("*").execute()
    return response.data

def get_purchase_order_by_id(po_id: str):
    response = supabase.table("purchase_orders").select("*").eq("po_id", po_id).execute()
    return response.data[0] if response.data else None

def update_purchase_order(po_id: str, updates: dict):
    response = supabase.table("purchase_orders").update(updates).eq("po_id", po_id).execute()
    return response.data[0] if response.data else None

def get_bom(product_id: str):
    response = supabase.table("bill_of_materials").select("*").eq("product_id", product_id).execute()
    return response.data
