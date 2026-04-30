import asyncio
import json
import requests
import time
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as SessionManager

async def get_media_info():
    try:
        sessions = await SessionManager.request_async()
        all_sessions = sessions.get_sessions()
        
        if not all_sessions or len(all_sessions) == 0:
            return None
            
        # Oncelikli olarak 'Playing' (4) olan bir oturum ara
        active_session = None
        for s in all_sessions:
            pb = s.get_playback_info()
            if pb.playback_status == 4: # Playing
                active_session = s
                break
        
        # Eger çalan yoksa, en azindan 'Paused' (5) olan son oturumu alalim
        if not active_session:
            for s in all_sessions:
                pb = s.get_playback_info()
                if pb.playback_status == 5: # Paused
                    active_session = s
                    break
        
        if not active_session:
            return {"status": "stopped"}
            
        playback = active_session.get_playback_info()
        status_code = playback.playback_status
        
        # Ekstra Guvenlik: Eger durum playing veya paused degilse durdur
        if status_code not in [4, 5]:
            return {"status": "stopped"}
            
        info = await active_session.try_get_media_properties_async()
        return {
            "title": info.title or "Bilinmeyen",
            "artist": info.artist or "Sanatçı",
            "status": "playing" if status_code == 4 else "paused"
        }
    except Exception as e:
        print(f"Sistem medya hatası: {e}")
        return None

async def main():
    last_song = ""
    last_status = ""
    print("Medya Dinleyici Baslatildi... [Muzik]")
    
    while True:
        try:
            info = await get_media_info()
            
            if info and info.get('status') != "stopped":
                current_song = f"{info['title']} - {info['artist']}"
                current_status = info['status']
                
                if current_song != last_song or current_status != last_status:
                    print(f"Medya Guncellendi: {current_song} [{current_status}]")
                    requests.post("http://127.0.0.1:8000/media/update", json=info)
                    last_song = current_song
                    last_status = current_status
            else:
                # Durduruldu veya oturum yok
                if last_song != "":
                    print("Muzik Durduruldu/Kapatildi.")
                    requests.post("http://127.0.0.1:8000/media/update", json={"status": "stopped"})
                    last_song = ""
                    last_status = ""
        except Exception as e:
            print(f"Dongu hatası: {e}")
        
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
