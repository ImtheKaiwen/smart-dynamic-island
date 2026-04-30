import subprocess
import os
import json
from langchain_core.tools import tool

@tool
def run_terminal_command(command: str):
    """Executes a terminal command and returns the output. Use this for creating folders, listing files, etc."""
    try:
        # text=True yerine byte olarak alıp manuel decode ediyoruz (errors='replace' ile hata önlenir)
        result = subprocess.run(command, shell=True, capture_output=True, timeout=10)
        stdout = result.stdout.decode('cp1254', errors='replace').strip()
        stderr = result.stderr.decode('cp1254', errors='replace').strip()
        
        if result.returncode == 0:
            return f"KOMUT BAŞARIYLA ÇALIŞTIRILDI. Çıktı: {stdout if stdout else 'İşlem tamamlandı (Çıktı yok)'}"
        else:
            return f"HATA OLUŞTU: {stderr}"
    except Exception as e:
        return f"İSTİSNA OLUŞTU: {str(e)}"


@tool
def list_directory(path: str = "."):
    """Lists files and folders in a given directory path."""
    try:
        items = os.listdir(path)
        if not items:
            return f"Dizin '{path}' boş."
        return f"'{path}' dizinindeki öğeler: {', '.join(items)}"
    except Exception as e:
        return f"Hata: {str(e)}"

@tool
def create_file(filename: str, content: str = ""):
    """Creates a new file with the specified content."""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"'{filename}' dosyası başarıyla oluşturuldu."
    except Exception as e:
        return f"Hata: {str(e)}"

@tool
def send_message(to_who: str, content: str):
    """Bir kişiye mesaj gönderir. 'to_who' alıcı ismi, 'content' mesaj içeriğidir."""
    try:
        from datetime import datetime
        msg_data = {
            "to": to_who, 
            "message": content, 
            "timestamp": datetime.now().isoformat(),
            "via": "direct"
        }
        with open("sent_messages.json", "a", encoding="utf-8") as f:
            f.write(json.dumps(msg_data, ensure_ascii=False) + "\n")
        return f"MESAJ GÖNDERİLDİ: {to_who} kişisine '{content}' iletildi."
    except Exception as e:
        return f"HATA OLUŞTU: Mesaj gönderilemedi. {str(e)}"

@tool
def get_message_history(contact_name: str = None, days_limit: int = None):
    """
    Mesaj geçmişini getirir. 
    'contact_name': Sadece bu kişiyle olan mesajları getirir (Opsiyonel).
    'days_limit': Sadece son X gündeki mesajları getirir (Opsiyonel).
    """
    try:
        from datetime import datetime, timedelta
        all_history = []
        
        # Dosyaları oku
        for filename in ["sent_messages.json", "received_history.json"]:
            if os.path.exists(filename):
                with open(filename, "r", encoding="utf-8") as f:
                    for line in f.readlines():
                        try:
                            msg = json.loads(line)
                            all_history.append(msg)
                        except: continue

        if not all_history:
            return "Henüz bir mesaj geçmişi bulunamadı."

        # 1. Kişi Filtresi
        if contact_name:
            c_lower = contact_name.lower()
            all_history = [
                m for m in all_history 
                if (m.get("to") and c_lower in m["to"].lower()) or 
                   (m.get("from") and c_lower in m["from"].lower())
            ]

        # 2. Tarih Filtresi
        if days_limit:
            cutoff = datetime.now() - timedelta(days=days_limit)
            filtered_by_date = []
            for m in all_history:
                ts = m.get("timestamp")
                if ts and ts != "now":
                    try:
                        msg_date = datetime.fromisoformat(ts)
                        if msg_date >= cutoff:
                            filtered_by_date.append(m)
                    except: continue
                elif ts == "now":
                    filtered_by_date.append(m)
            all_history = filtered_by_date

        if not all_history:
            return f"Kriterlere uygun mesaj bulunamadı (Kişi: {contact_name}, Gün: {days_limit})."
            
        return f"Mesaj Geçmişi: {json.dumps(all_history, ensure_ascii=False)}"
    except Exception as e:
        return f"Hata: Geçmiş okunamadı. {str(e)}"

@tool
def get_unread_messages():
    """Gelen ama henüz okunmamış/cevaplanmamış mesajları listeler."""
    try:
        if not os.path.exists("unread_messages.json"):
            return "Okunmamış mesaj yok."
        with open("unread_messages.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return f"Okunmamış Mesajlar: {json.dumps(data, ensure_ascii=False)}"
    except Exception as e:
        return f"Hata: Okunmamış mesajlar okunamadı. {str(e)}"

@tool
def capture_screen():
    """Ekranın o anki görüntüsünü yakalar. Ekranda ne olduğunu anlamak için bunu kullanın."""
    try:
        import pyautogui
        path = "screen.png"
        screenshot = pyautogui.screenshot()
        screenshot.save(path)
        return "EKRAN YAKALANDI. Şimdi 'screen.png' dosyasını analiz ederek kullanıcıya cevap ver."
    except Exception as e:
        return f"HATA OLUŞTU: Ekran yakalanamadı. {str(e)}"

base_tools = [run_terminal_command, list_directory, create_file, send_message, get_message_history, get_unread_messages, capture_screen]


