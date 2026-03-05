from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import date, datetime

class Supplier(BaseModel):
    id: Optional[str] = None
    supplier_id: str
    supplier_name: str
    tier: Optional[int] = None
    country: Optional[str] = None
    region: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    materials_supplied: Optional[List[str]] = None
    criticality_score: Optional[int] = None
    single_source: Optional[bool] = False
    lead_time_days: Optional[int] = None
    contract_value: Optional[float] = None
    has_backup_supplier: Optional[bool] = False
    backup_lead_time_days: Optional[int] = None
    switching_cost: Optional[str] = None
    ticker: Optional[str] = None
    is_public_company: Optional[bool] = False

class Facility(BaseModel):
    id: Optional[str] = None
    facility_id: str
    facility_type: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    production_capacity: Optional[float] = None
    primary_inputs: Optional[List[str]] = None
    inventory_buffer_days: Optional[int] = None
    products_produced: Optional[List[str]] = None
    daily_production_capacity: Optional[float] = None

class PurchaseOrder(BaseModel):
    id: Optional[str] = None
    po_id: str
    supplier_id: Optional[str] = None
    material_id: Optional[str] = None
    quantity: Optional[float] = None
    eta: Optional[date] = None
    ship_mode: Optional[str] = None
    status: Optional[str] = 'open'
    delay_risk: Optional[float] = None

class Inventory(BaseModel):
    id: Optional[str] = None
    material_id: Optional[str] = None
    facility_id: Optional[str] = None
    supplier_id: Optional[str] = None
    current_inventory_units: Optional[float] = None
    daily_usage: Optional[float] = None
    days_of_inventory_remaining: Optional[float] = None
    reorder_point: Optional[int] = None
    safety_stock_days: Optional[int] = None
