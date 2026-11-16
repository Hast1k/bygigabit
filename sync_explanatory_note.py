import shutil

SRC = r"C:\Users\Lenovo T14\.gemini\antigravity\brain\83716de7-76b3-46d8-a8df-7a176ce3376a\scratch\final_updated_note.docx"
TARGETS = [
    r"C:\ByGigaBit\Шевцов_Пояснювальна_записка – копія.docx",
    r"C:\ByGigaBit\Шевцов_пояснювальна.docx",
    r"C:\ByGigaBit\Шевцов_Пояснювальна_записка_оновлена.docx",
]


def sync():
    for target in TARGETS:
        try:
            shutil.copy2(SRC, target)
            print(f"Successfully copied to: {target}")
        except PermissionError:
            print(f"Cannot overwrite {target}: file is currently open in Microsoft Word. Please close Word and run again.")


if __name__ == "__main__":
    sync()
