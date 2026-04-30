from typing import Annotated, List, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import ToolNode
import os
from dotenv import load_dotenv
from tools import base_tools

load_dotenv()

def get_desktop_path():
    home = os.path.expanduser("~")
    onedrive_desktop = os.path.join(home, "OneDrive", "Desktop")
    standard_desktop = os.path.join(home, "Desktop")
    if os.path.exists(onedrive_desktop): return onedrive_desktop
    return standard_desktop

DESKTOP_PATH = get_desktop_path()

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    intent: str
    steps: int

class SmartAgent:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.model_name = "gemini-flash-latest"
        self.model = ChatGoogleGenerativeAI(
            model=self.model_name,
            temperature=0,
            google_api_key=self.api_key
        ).bind_tools(base_tools)
        
        workflow = StateGraph(AgentState)
        workflow.add_node("router", self.analyze_intent)
        workflow.add_node("agent", self.call_model)
        workflow.add_node("tools", ToolNode(base_tools))
        workflow.add_edge(START, "router")
        workflow.add_conditional_edges("router", lambda x: x["intent"], {"desktop_action": "agent", "chat": "agent"})
        workflow.add_conditional_edges("agent", self.should_continue, {"continue": "tools", "end": END})
        workflow.add_edge("tools", "agent")
        self.app = workflow.compile()

    async def analyze_intent(self, state: AgentState):
        last_msg = state["messages"][-1]
        model = ChatGoogleGenerativeAI(model=self.model_name, google_api_key=self.api_key)
        prompt = f"İşlem mi sohbet mi? Mesaj: '{last_msg.content}'. Sadece 'desktop_action' veya 'chat' döndür."
        response = await model.ainvoke([HumanMessage(content=prompt)])
        intent = "desktop_action" if "desktop_action" in str(response.content).lower() else "chat"
        return {"intent": intent, "steps": 0}

    def should_continue(self, state: AgentState):
        last_message = state['messages'][-1]
        steps = state.get("steps", 0)
        # 5 adımda bitiremiyorsa dur (Sonsuz döngü koruması)
        if steps > 5: 
            print("[AGENT] Adım sınırı. Durduruluyor.")
            return "end"
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "continue"
        return "end"

    async def call_model(self, state: AgentState):
        messages = state['messages']
        intent = state.get("intent", "chat")
        steps = state.get("steps", 0)
        
        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S (%A)")
        
        if intent == "desktop_action":
            sys_instr = f"""SEN BİR OPERATÖRSÜN. 
            GÜNCEL TARİH: {now_str}
            MASAÜSTÜ: '{DESKTOP_PATH}'
            KURALLAR:
            1. Sadece tam yolları kullan.
            2. Eğer mesaj geçmişi veya rehber sorulursa 'get_message_history' ve 'get_unread_messages' araçlarını kullan.
            3. Ekranda ne olduğu sorulursa 'capture_screen' aracını kullan.
            4. İşlem bittiyse kısa bilgi ver ve dur."""
        else:
            sys_instr = f"""Sen nazik ve zeki bir AI asistanısın. 
            GÜNCEL TARİH: {now_str}
            
            Kullanıcı geçmiş mesajlarını, planlarını veya okunmamış mesajlarını sorarsa MUTLAKA 'get_message_history' ve 'get_unread_messages' araçlarını kullanarak kontrol et. 
            'get_message_history' kullanırken, performans için MUTLAKA 'contact_name' veya 'days_limit' filtrelerini kullanmaya çalış. 
            Eğer kullanıcı "Ekranımda ne var?", "Şu an ne yapıyorum?" gibi görsel sorular sorarsa 'capture_screen' aracını kullan.
            Bilgi bulamazsan nazikçe belirt."""
        
        # Multimodal destek için mesajları hazırla
        clean_history = [SystemMessage(content=sys_instr)]
        
        # Eğer en son araç 'capture_screen' ise ve başarılıysa, görüntüyü ekle
        last_msg = messages[-1]
        image_data = None
        if isinstance(last_msg, ToolMessage) and "EKRAN YAKALANDI" in str(last_msg.content):
            if os.path.exists("screen.png"):
                import base64
                with open("screen.png", "rb") as f:
                    image_data = base64.b64encode(f.read()).decode("utf-8")
                # Görüntü eklendikten sonra dosyayı silebiliriz (opsiyonel)
                # os.remove("screen.png")

        for m in messages:
            if not isinstance(m, SystemMessage):
                if not m.content: m.content = "..."
                
                # Eğer bu mesaj bir ToolMessage değilse ve elimizde image_data varsa, 
                # görüntüyü bir sonraki AI çağrısına dahil etmeliyiz.
                # Ancak LangChain ChatGoogleGenerativeAI multimodal yapısı farklıdır.
                # En son HumanMessage'a eklemek en iyisidir.
                clean_history.append(m)

        # Eğer görüntü yakalandıysa, en son mesajın içeriğini multimodal yapalım
        if image_data:
            # En son mesajı (muhtemelen ToolMessage sonrası gelen bir prompt veya önceki HumanMessage)
            # multimodal içeriğe dönüştür.
            prompt = "İşte ekran görüntüsü. Lütfen analiz et."
            multimodal_content = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
            ]
            # Yeni bir HumanMessage olarak ekle ki model görsele baksın
            clean_history.append(HumanMessage(content=multimodal_content))
                
        response = await self.model.ainvoke(clean_history)
        return {"messages": [response], "steps": steps + 1}

    async def run(self, query: str):
        inputs = {"messages": [HumanMessage(content=query)], "steps": 0}
        async for output in self.app.astream(inputs):
            yield output
