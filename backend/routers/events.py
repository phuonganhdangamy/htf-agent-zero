from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from backend.services.supabase_client import supabase

router = APIRouter()

class IngestEventRequest(BaseModel):
    event_id: str
    event_type: str
    country: Optional[str] = None
    region: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    start_date: Optional[str] = None
    confidence_score: Optional[float] = None
    company_exposed: Optional[bool] = None
    evidence_links: Optional[List[str]] = None
    signal_sources: Optional[List[str]] = None
    headline: Optional[str] = None

@router.post("/events/ingest")
def ingest_event(request: IngestEventRequest):
    # Store normalized event to Supabase
    data = request.dict()
    # Assuming 'headline' goes somewhere else or just into 'subtype'
    if 'headline' in data:
        data['subtype'] = data.pop('headline')
        
    res = supabase.table("signal_events").insert(data).execute()
    return {"status": "success", "event": res.data[0] if res.data else None}

@router.get("/events")
def get_events(limit: int = 50, type: Optional[str] = None, country: Optional[str] = None):
    query = supabase.table("signal_events").select("*")
    if type:
        query = query.eq("event_type", type)
    if country:
        query = query.eq("country", country)
    res = query.order("created_at", desc=True).limit(limit).execute()
    return res.data

@router.get("/events/{event_id}")
def get_event(event_id: str):
    res = supabase.table("signal_events").select("*").eq("id", event_id).execute() # assuming we query by UUID id
    if not res.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return res.data[0]

@router.get("/clusters")
def get_clusters():
    # Placeholder if we used an event_clusters table
    # For now simply grouping events or returning unique clusters
    pass

@router.get("/clusters/{cluster_id}")
def get_cluster(cluster_id: str):
    pass
