import os

desktop = os.path.join(os.environ["USERPROFILE"], "Desktop")
lnk_script = os.path.join(os.environ["TEMP"], "create_lnk.vbs")
target = r"C:\Users\serverroom\AI-LAB\lab_attendance_system\run_desktop_app.bat"
lnk_file = os.path.join(desktop, "AI ML Lab Monitor.lnk")

vbs = f'''Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "{lnk_file}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{target}"
oLink.WorkingDirectory = "C:\\Users\\serverroom\\AI-LAB\\lab_attendance_system"
oLink.Description = "AI ML Lab Desktop Operations App"
oLink.IconLocation = "shell32.dll,13"
oLink.Save
'''

with open(lnk_script, "w", encoding="utf-8") as f:
    f.write(vbs)

os.system(f'cscript //nologo "{lnk_script}"')
if os.path.exists(lnk_file):
    print("[SUCCESS] Desktop Shortcut created:", lnk_file)
