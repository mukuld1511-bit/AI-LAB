# 🖥️ AI LAB Workstation Telemetry & Heartbeat Agent Setup

Ye lightweight agent har lab PC (`PC-1` se `PC-8`) par background me run karega.

## 🚀 Kaam Kaise Karta Hai:
1. **PC ON hote hi:** Startup par agent run hota hai aur backend ko `🟢 ONLINE` signal bhejta hai.
2. **Every 10 seconds:** Real-time **CPU %**, **RAM (Used/Total GB)** aur **GPU (NVIDIA % & VRAM)** backend par stream karta hai.
3. **PC Shutdown / Restart hone par:** Clean `🛑 OFFLINE` packet bhejta hai.
4. **Sudden Power Cut ya Crash:** Agar 45 seconds tak heartbeat na aaye, toh backend **automatically OFFLINE** mark kar deta hai.

---

## 🛠️ Har PC Par Install Karne Ke Steps (Only 1 Minute):

1. Is `client_agent` folder ko kisi bhi USB drive ya shared folder se us PC par copy karein (e.g. `C:\AI_LAB_Agent\`).
2. Folder ke andar `agent_config.json` open karein aur PC ID set karein:
   ```json
   {
       "pc_id": "PC-2",
       "backend_url": "https://labg418pc12.tailc8c1f6.ts.net",
       "heartbeat_interval": 10
   }
   ```
   *(Jisme PC-1, PC-2, PC-3, PC-4, etc. jo bhi PC number ho wo daal dein).*

3. **`install_startup.bat`** par Right Click karke **"Run as administrator"** kar dein!

---

## ✅ Ho gaya!
- Agent chup-chap background me Windows Startup Task ban jayega (`pythonw.exe` me silently run hota hai, koi black window nahi khulti).
- PC jaise hi ON hoga, sabhi portals (**Backend Dashboard**, **Mam's Portal**, aur **Display Portal**) par PC **🟢 ONLINE** dikhega aur live CPU/RAM/GPU usage show karega!
