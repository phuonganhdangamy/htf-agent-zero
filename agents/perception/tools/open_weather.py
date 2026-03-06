import os
import json
import requests
from google.adk.tools import FunctionTool

@FunctionTool
def fetch_weather_alerts(locations: list[str]) -> str:
    """
    Fetches real-time weather alerts via OpenWeatherMap Geocoding + Current API.
    Requires OPENWEATHER_API_KEY.
    """
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        print("Warning: OPENWEATHER_API_KEY missing.")
        return json.dumps([])
        
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
                events.append({
                    "title": f"Weather in {loc}: {weather.get('main')}",
                    "summary": weather.get("description", "").capitalize(),
                    "source": "OpenWeather",
                    "lat": lat,
                    "lon": lon
                })
                
        return json.dumps(events)
    except Exception as e:
        print(f"Warning: OpenWeather API error: {str(e)}")
        return json.dumps([])
