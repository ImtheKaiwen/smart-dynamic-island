import asyncio
import sys
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as SessionManager

async def control_media(command):
    sessions = await SessionManager.request_async()
    current_session = sessions.get_current_session()
    if current_session:
        if command == "play_pause":
            # Durum kontrolü yapıp tersini uygula
            info = current_session.get_playback_info()
            if info.playback_status == 4: # Playing
                await current_session.try_pause_async()
            else:
                await current_session.try_play_async()
        elif command == "next":
            await current_session.try_skip_next_async()
        elif command == "prev":
            await current_session.try_skip_previous_async()
        return True
    return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(control_media(sys.argv[1]))
