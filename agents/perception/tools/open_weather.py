import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_weather_alerts(locations: list) -> str:
    """
    Fetches real-time weather alerts via OpenWeatherMap Geocoding + Current API.
    Requires OPENWEATHER_API_KEY.
    """
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        return json.dumps([{"error": "OPENWEATHER_API_KEY missing in environment variables."}])
        
    events = []
    
    try:
        for loc in locations[:5]:
            # Use geocoding to get lat/lon
            geo_url = "http://api.openweathermap.org/geo/1.0/direct"
            res = requests.get(geo_url, params={"q": loc, "limit": 1, "appid": api_key}, timeout=10)
            res.raise_for_status()
            geo_data = res.json()
            
            if not geo_data:
                continue
                
            lat = geo_data[0]["lat"]
            lon = geo_data[0]["lon"]
            
            # Using standard weather API which provides basic condition codes
            wx_url = "https://api.openweathermap.org/data/2.5/weather"
            wx_res = requests.get(wx_url, params={"lat": lat, "lon": lon, "appid": api_key}, timeout=10)
            wx_res.raise_for_status()
            wx_data = wx_res.json()
            
            for weather in wx_data.get("weather", []):
                wid = weather.get("id", 800)
                severity = "Low"
                # Thunderstorms (2xx), extreme rain (504), snow (6xx)
                if wid < 600 or wid in [771, 781]: 
                    severity = "Medium"
                
                events.append({
                    "title": f"Weather in {loc}: {weather.get('main')}",
                    "description": weather.get("description", "").capitalize(),
                    "source": "OpenWeather",
                    "severity": severity,
                    "lat": lat,
                    "lon": lon
                })
                
        return json.dumps(events)
    except Exception as e:
        return json.dumps([{"error": f"OpenWeather API error: {str(e)}"}])
