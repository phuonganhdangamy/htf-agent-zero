from fastapi import APIRouter, HTTPException
from backend.services import erp_service
from backend.models.erp import PurchaseOrder, Supplier, Facility, Inventory

router = APIRouter()

@router.get("/purchase-orders")
def get_purchase_orders():
    return erp_service.get_purchase_orders()

@router.get("/purchase-orders/{po_id}")
def get_purchase_order(po_id: str):
    po = erp_service.get_purchase_order_by_id(po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
    return po

@router.put("/purchase-orders/{po_id}")
def update_purchase_order(po_id: str, updates: dict):
    return erp_service.update_purchase_order(po_id, updates)

@router.get("/inventory")
def get_inventory():
    return erp_service.get_inventory()

@router.get("/inventory/{material_id}")
def get_inventory_by_material(material_id: str):
    return erp_service.get_inventory_by_material(material_id)

@router.get("/suppliers")
def get_suppliers():
    return erp_service.get_suppliers()

@router.get("/suppliers/{supplier_id}")
def get_supplier(supplier_id: str):
    supplier = erp_service.get_supplier_by_id(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@router.get("/facilities")
def get_facilities():
    return erp_service.get_facilities()

@router.get("/bom/{product_id}")
def get_bom(product_id: str):
    return erp_service.get_bom(product_id)
