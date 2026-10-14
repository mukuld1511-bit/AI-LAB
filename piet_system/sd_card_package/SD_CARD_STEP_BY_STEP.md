# 🍓 Raspberry Pi 5 SD Card Pre-Setup Guide (Windows se Setup)

Yeh guide follow karke aap apne Windows PC / Card reader par hi pura SD card pehle se ready kar sakte hain. Jab aap SD card ko Raspberry Pi 5 me lagayenge, to Pi khud router se connect ho jayega!

---

## 🛠️ Step 1: Raspberry Pi Imager Download & Open Karein
1. Agar installed nahi hai to [Raspberry Pi Imager](https://www.raspberrypi.com/software/) download karein.
2. SD Card ko card reader me laga kar PC me insert karein.
3. Imager me select karein:
   - **Device:** `Raspberry Pi 5`
   - **Operating System:** `Raspberry Pi OS (64-bit)` (Recommended)
   - **Storage:** Apna SD Card chunein

---

## ⚙️ Step 2: OS Customization (Sabse Important Step)
Imager aapse poochhega: *"Would you like to apply OS customization settings?"* -> **EDIT SETTINGS** par click karein:

1. **General Tab:**
   - **Set Hostname:** `piet-hub` (Isse bina IP jaane bhi `http://piet-hub.local:8000` chalega!)
   - **Set Username and Password:**
     - Username: `pi`
     - Password: `piet` (ya jo aap chahein)
   - **Configure Wireless LAN:**
     - SSID: Lab ke router ka Wi-Fi naam
     - Password: Lab router ka Wi-Fi password
     - Wireless LAN country: `IN` (India)
   - **Set locale settings:** Timezone `Asia/Kolkata`
2. **Services Tab:**
   - **Enable SSH** par tick karein -> **Use password authentication**
3. **SAVE** dabayein aur **WRITE** par click karke SD card flash hone dein.

---

## 📂 Step 3: Code ko SD Card me Drag & Drop Karein
Flashing complete hone ke baad SD card ko bahar nikal kar dobara USB me lagayein.
Windows me ek drive dikhegi jiska naam hoga **`bootfs`** ya **`boot`** (e.g. `E:\` ya `D:\`).

1. AI-LAB project ke is folder me jayein:
   `c:\Users\serverroom\AI-LAB\piet_system\sd_card_package\COPY_TO_SD_CARD_BOOT\`
2. Is folder ke andar jo files hain:
   - `setup_pi.sh`
   - `piet_hub/` (pura backend, database, static web app)
3. In dono ko copy karke **SD Card ke root folder (`bootfs:\`) me paste kar dein**!
4. SD Card ko safely eject karein.

---

## 🚀 Step 4: Pi 5 me SD Card Lagakar Start Karein
1. SD Card ko Raspberry Pi 5 me lagayein.
2. Router aur Pi 5 ko power on karein. Pi 5 automatically router ke Wi-Fi se connect ho jayega.
3. Apne laptop ya phone se terminal kholein:
   ```bash
   ssh pi@piet-hub.local
   ```
   *(Password wahi dalein jo Step 2 me set kiya tha, e.g. `piet`)*
4. Ek single command run karein:
   ```bash
   sudo bash /boot/firmware/setup_pi.sh
   ```
   *(Purane OS version me: `sudo bash /boot/setup_pi.sh`)*

---

## 🎯 Result
Ye command 60 seconds me:
- Pura `piet_hub` server permanent `/opt/piet_system/raspberry_pi_hub` me deploy kar degi.
- Systemd auto-boot service bana degi.
- Server start ho jayega!

Ab teacher apne phone ya lab laptop par bas ye URL kholegi:
```text
http://piet-hub.local:8000/
```
*(Bina kisi manual terminal ke, router on karte hi lab monitoring active!)*
