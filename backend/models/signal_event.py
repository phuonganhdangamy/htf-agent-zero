from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class SignalEvent(BaseModel):
    id: Optional[str] = None
    event_id: str
    event_type: Optional[str] = None
    subtype: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    start_date: Optional[datetime] = None
    confidence_score: Optional[float] = None
    company_exposed: Optional[bool] = None
    supplier_id: Optional[str] = None
    facility_id: Optional[str] = None
    evidence_links: Optional[List[str]] = None
    signal_sources: Optional[List[str]] = None
    tone: Optional[float] = None
    risk_category: Optional[str] = None
    forecasted: Optional[bool] = False
