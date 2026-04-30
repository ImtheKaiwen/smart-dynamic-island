from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import asyncio
from agent import SmartAgent

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = SmartAgent()
active_tasks = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Teknik terimleri Türkçeleştirme haritası
TOOL_MAPPING = {
    "run_terminal_command": "Komut çalıştırılıyor...",
    "list_directory": "Dosyalar taranıyor...",
    "create_file": "Dosya oluşturuluyor...",
    "send_message": "Mesaj iletiliyor..."
}

def extract_text(content):
    if isinstance(content, str): return content
    if isinstance(content, list):
        texts = [part['text'] if isinstance(part, dict) and 'text' in part else str(part) for part in content]
        return " ".join(texts)
    return str(content)

UNREAD_FILE = "unread_messages.json"

def load_unread():
    if os.path.exists(UNREAD_FILE):
        try:
            with open(UNREAD_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def save_unread(messages):
    with open(UNREAD_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

@app.get("/unread")
async def get_unread():
    return load_unread()

@app.post("/unread/add")
async def add_unread(msg: dict):
    from datetime import datetime
    messages = load_unread()
    if "timestamp" not in msg:
        msg["timestamp"] = datetime.now().isoformat()
    messages.append(msg)
    save_unread(messages)
    return {"status": "ok"}

@app.post("/send_direct")
async def send_direct(data: dict):
    # AI'yı aradan çıkarıp direkt mesajı dosyaya yazıyoruz
    to_who = data.get("to")
    content = data.get("message")
    msg_data = {"to": to_who, "message": content, "timestamp": "now", "via": "direct"}
    
    with open("sent_messages.json", "a", encoding="utf-8") as f:
        f.write(json.dumps(msg_data, ensure_ascii=False) + "\n")
    return {"status": "ok"}

@app.post("/unread/clear")
async def clear_unread(data: dict):
    msg_index = data.get("msg_index", -1)
    messages = load_unread()
    
    # Okunanlari arşive ekle
    try:
        with open("received_history.json", "a", encoding="utf-8") as f:
            if msg_index == -1:
                for m in messages:
                    f.write(json.dumps(m, ensure_ascii=False) + "\n")
                messages = []
            elif 0 <= msg_index < len(messages):
                msg = messages.pop(msg_index)
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")
    except:
        pass

    save_unread(messages)
    return {"status": "ok"}

@app.post("/media/update")
async def update_media(data: dict):
    # WebSocket üzerinden frontend'e gönder
    await manager.broadcast({
        "status": "music_update",
        "title": data.get("title", ""),
        "artist": data.get("artist", ""),
        "media_status": data.get("status", "")
    })
    return {"status": "ok"}

@app.post("/media/command")
async def media_command(data: dict):
    command = data.get("command")
    if command:
        import subprocess
        import os
        import sys
        
        # Mutlak yollari cok dikkatli hesapla
        backend_path = os.path.dirname(os.path.abspath(__file__))
        
        # Windows venv yolu: backend/venv/Scripts/python.exe
        python_exe = os.path.join(backend_path, "venv", "Scripts", "python.exe")
        script_path = os.path.join(backend_path, "media_control.py")
        
        # Eğer venv yoksa (global python kullaniliyorsa) sys.executable'a düs
        if not os.path.exists(python_exe):
            python_exe = sys.executable

        print(f"Medya Komutu: {command} | Path: {python_exe}")
        
        try:
            # Yeni bir islem olarak arka planda calistir
            subprocess.Popen([python_exe, script_path, command], 
                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        except Exception as e:
            print(f"Hata: Medya komutu calistirilamadi: {e}")
            
    return {"status": "ok"}

@app.websocket("/ws/thinking")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    client_id = id(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)
            
            if request.get("type") == "cancel":
                if client_id in active_tasks:
                    active_tasks[client_id].cancel()
                continue

            query = request.get("query")
            if query:
                if client_id in active_tasks:
                    active_tasks[client_id].cancel()

                async def run_agent():
                    last_response = "İşlem tamamlandı."
                    try:
                        async for step in agent.run(query):
                            if "agent" in step:
                                node_data = step["agent"]
                                msg = node_data["messages"][-1]
                                if hasattr(msg, "tool_calls") and msg.tool_calls:
                                    tool_name = msg.tool_calls[0]['name']
                                    friendly_name = TOOL_MAPPING.get(tool_name, "İşlem yapılıyor...")
                                    await websocket.send_json({"status": "thinking", "message": friendly_name})
                                else:
                                    last_response = extract_text(msg.content)
                                    await websocket.send_json({"status": "complete", "message": last_response})
                            
                            elif "router" in step:
                                await websocket.send_json({"status": "thinking", "message": "İstek analiz ediliyor..."})
                            elif "tools" in step:
                                await websocket.send_json({"status": "thinking", "message": "Sonuç inceleniyor..."})

                        
                        # Garanti: Döngü biterse ama complete gönderilmediyse gönder
                        # (Bazen LangGraph döngüyü sessizce bitirebilir)
                    except asyncio.CancelledError:
                        print("User cancelled")
                    except Exception as e:
                        print(f"Error: {e}")
                        await websocket.send_json({"status": "error", "message": "Bir sorun oluştu, lütfen tekrar deneyin."})
                    finally:
                        # Task bittiğinde her durumda UI'ı resetleyecek bir mesaj gönderilebilir
                        pass

                task = asyncio.create_task(run_agent())
                active_tasks[client_id] = task

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        if client_id in active_tasks:
            active_tasks[client_id].cancel()
    except Exception as e:
        manager.disconnect(websocket)
        print(f"Global error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
