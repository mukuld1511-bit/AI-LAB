import os

# 1. Add to Windows Startup folder
startup_folder = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup")
lnk_script = os.path.join(os.environ["TEMP"], "create_startup_lnk.vbs")
target = r"C:\Users\serverroom\AI-LAB\lab_attendance_system\run_desktop_app.bat"
lnk_file = os.path.join(startup_folder, "AI_ML_Lab_Desktop_App.lnk")

vbs = f'''Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "{lnk_file}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{target}"
oLink.WorkingDirectory = "C:\\Users\\serverroom\\AI-LAB\\lab_attendance_system"
oLink.Description = "AI ML Lab Desktop App Auto Startup"
oLink.IconLocation = "shell32.dll,13"
oLink.Save
'''

with open(lnk_script, "w", encoding="utf-8") as f:
    f.write(vbs)

os.system(f'cscript //nologo "{lnk_script}"')

if os.path.exists(lnk_file):
    print("[SUCCESS] Windows Startup Shortcut created at:", lnk_file)
else:
    print("[ERROR] Failed to create startup shortcut.")
